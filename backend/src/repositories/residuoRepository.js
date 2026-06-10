/**
 * CorteAlum — Repository de Residuos
 * ─────────────────────────────────────────────────────────────────────────────
 * Único punto donde se hace SQL sobre `residuos_aluminio` desde el módulo
 * de optimización. Mantiene la lógica de negocio separada del acceso a datos.
 */

const pool = require('../config/db');

/**
 * Busca residuos disponibles compatibles con un perfil.
 *
 * @param {Object} params
 * @param {string} params.referencia_perfil  ej. "5020"
 * @param {string} [params.color_perfil]     ej. "Natural" (opcional)
 * @param {number} [params.longitud_min_cm]  longitud mínima requerida (filtra)
 * @returns {Promise<Array>} [{ id, longitud_cm, ... }]
 */
/**
 * Busca residuos disponibles compatibles con un perfil.
 *
 * @param {Object} params
 * @param {string} params.referencia_perfil    ej. "5020"
 * @param {string} [params.color_perfil]       ej. "Natural" (opcional)
 * @param {number} [params.longitud_min_cm]    longitud mínima requerida (filtra)
 * @param {number} [params.excluir_id_proyecto] Si se pasa, EXCLUYE los residuos
 *        cuyo `id_proyecto_origen` sea ese id. Esto evita el bug lógico de
 *        "comerse la cola": un proyecto NO debe reutilizar sus propios sobrantes
 *        en una re-optimización, porque físicamente son la mismita pieza que ya
 *        se asumió cortar. Esos residuos van a OTROS proyectos.
 * @param {number} [params.incluir_reservados_para] Si se pasa, ADEMÁS de los
 *        residuos `disponible`, también incluye los `reservado` cuyo
 *        `id_proyecto_uso` coincida con ese id. Caso de uso: el usuario reservó
 *        manualmente un residuo desde el Banco para un proyecto específico, y
 *        cuando el optimizador corre para ese proyecto debe verlo y poder
 *        consumirlo (antes lo ignoraba por filtrar solo por `disponible`).
 * @returns {Promise<Array>} [{ id, longitud_cm, ... }]
 */
async function buscarDisponiblesPorPerfil({
  referencia_perfil, color_perfil, ubicacion, longitud_min_cm,
  excluir_id_proyecto,
  incluir_reservados_para,
}) {
  const params = [referencia_perfil];
  let sql;

  // ── FIX (reserva manual del Banco vinculada al optimizador) ────────────
  // Antes el WHERE solo aceptaba 'disponible'. Esto hacía que cualquier
  // residuo reservado manualmente desde el Banco — incluso si el usuario
  // lo apartó específicamente para ESTE proyecto — quedara invisible al
  // optimizador. Ahora aceptamos:
  //   • estado = 'disponible' (siempre)
  //   • estado = 'reservado' AND id_proyecto_uso = <este proyecto>
  // El cliente del repo decide si quiere esa inclusión pasando el parámetro
  // `incluir_reservados_para`. Si no se pasa, mantenemos el comportamiento
  // viejo (solo 'disponible'), evitando regresiones en otros consumidores.
  if (incluir_reservados_para != null) {
    params.push(incluir_reservados_para);
    const idxReservadoPara = params.length;
    sql = `
      SELECT id_residuo AS id, longitud_cm, referencia_perfil, color_perfil,
             id_proyecto_origen, creado_en, estado, id_proyecto_uso
      FROM residuos_aluminio
      WHERE (
              estado = 'disponible'
              OR (estado = 'reservado' AND id_proyecto_uso = $${idxReservadoPara})
            )
        AND referencia_perfil = $1
    `;
  } else {
    sql = `
      SELECT id_residuo AS id, longitud_cm, referencia_perfil, color_perfil,
             id_proyecto_origen, creado_en
      FROM residuos_aluminio
      WHERE estado = 'disponible'
        AND referencia_perfil = $1
    `;
  }

  if (color_perfil) {
    params.push(color_perfil);
    sql += ` AND (color_perfil = $${params.length} OR color_perfil IS NULL)`;
  }
  // ── FIX (instructor Marcel): filtrar por TIPO DE PIEZA ─────────────────
  // Un residuo solo se puede reutilizar para cortes de su mismo tipo de
  // pieza (sillar → sillar, jamba → jamba, etc.). La igualdad es estricta:
  // residuos legacy con ubicacion_pieza NULL quedan FUERA del reúso
  // automático porque no sabemos qué extrusión física tienen.
  if (ubicacion) {
    params.push(ubicacion);
    sql += ` AND ubicacion_pieza = $${params.length}`;
  }
  if (longitud_min_cm != null) {
    params.push(longitud_min_cm);
    sql += ` AND longitud_cm >= $${params.length}`;
  }
  if (excluir_id_proyecto != null) {
    // El residuo viene de OTRO proyecto (o no tiene origen registrado).
    // Esto preserva la lógica física: cada pieza solo se corta una vez.
    // Excepción: si el residuo es 'reservado' Y fue reservado PARA este
    // proyecto, lo dejamos pasar porque la reserva manual es un acto
    // explícito del usuario que sobre-escribe la regla por defecto.
    params.push(excluir_id_proyecto);
    const idxExcl = params.length;
    if (incluir_reservados_para != null && incluir_reservados_para === excluir_id_proyecto) {
      sql += ` AND (
                  id_proyecto_origen IS NULL
                  OR id_proyecto_origen <> $${idxExcl}
                  OR (estado = 'reservado' AND id_proyecto_uso = $${idxExcl})
                )`;
    } else {
      sql += ` AND (id_proyecto_origen IS NULL OR id_proyecto_origen <> $${idxExcl})`;
    }
  }
  sql += ` ORDER BY longitud_cm ASC`; // Best Fit (más pequeños primero)

  const { rows } = await pool.query(sql, params);
  return rows;
}

/**
 * Marca un residuo como reservado (con expiración).
 */
async function reservar({ id_residuo, id_proyecto, id_ventana, id_usuario, minutos = 30 }) {
  const { rows } = await pool.query(
    `UPDATE residuos_aluminio
     SET estado='reservado',
         id_proyecto_uso=$2, id_ventana_uso=$3,
         reservado_hasta=NOW() + ($4 || ' minutes')::INTERVAL,
         actualizado_en=NOW()
     WHERE id_residuo=$1 AND estado='disponible'
     RETURNING *`,
    [id_residuo, id_proyecto || null, id_ventana || null, minutos]
  );
  if (rows.length) {
    await pool.query(
      `INSERT INTO historial_residuos
        (id_residuo, evento, longitud_antes_cm, id_proyecto, id_ventana, id_usuario, notas)
       VALUES ($1,'reservado',$2,$3,$4,$5,$6)`,
      [id_residuo, rows[0].longitud_cm, id_proyecto, id_ventana, id_usuario,
       `Reserva por optimización (${minutos} min)`]
    );
  }
  return rows[0] || null;
}

/**
 * Marca como usado y actualiza longitud restante (si quedó sobrante reutilizable).
 */
/**
 * Consume un residuo (resta longitud, lo marca como usado si no queda útil).
 *
 * @param {Object} params
 * @param {Object} [params.client]  Cliente de transacción externa (opcional).
 *                                  Si se pasa, NO abre/cierra transacción propia
 *                                  — todo se hace dentro de la transacción del
 *                                  caller. Si no se pasa, gestiona su propia
 *                                  transacción interna (comportamiento original).
 *
 * Esto evita el bug de "FK violation": cuando el caller crea un plan dentro
 * de su propia transacción y luego invoca este repo, sin un cliente compartido
 * la conexión del pool no ve el plan recién creado (aún sin COMMIT).
 */
async function consumir({
  id_residuo, longitud_usada_cm, kerf_cm,
  id_proyecto, id_ventana, id_usuario,
  min_reutilizable_cm = 20,
  client: extClient,   // ← NUEVO: cliente de transacción externa
}) {
  const useExternal = !!extClient;
  const client = extClient || await pool.connect();
  const ownsTx = !useExternal;   // solo abre/cierra tx si es propio
  try {
    if (ownsTx) await client.query('BEGIN');

    const { rows: prev } = await client.query(
      `SELECT longitud_cm FROM residuos_aluminio WHERE id_residuo=$1 FOR UPDATE`,
      [id_residuo]
    );
    if (!prev.length) {
      if (ownsTx) await client.query('ROLLBACK');
      return null;
    }
    const longAntes = parseFloat(prev[0].longitud_cm);
    const longDespues = +(longAntes - longitud_usada_cm - kerf_cm).toFixed(2);

    if (longDespues >= min_reutilizable_cm) {
      // Queda un sobrante útil: actualiza longitud, sigue disponible.
      //
      // FIX v43: TRAZA DE QUIÉN DEJÓ EL RESIDUO ACTUAL ────────────────────
      // Antes, este UPDATE NO tocaba `creado_por` ni `id_proyecto_origen`,
      // así que el residuo seguía mostrando al usuario y proyecto ORIGINALES
      // (los del primer corte) aunque físicamente ya hubiera sido procesado
      // por otra persona en otro proyecto. Eso es engañoso: la pieza física
      // que quedó como sobrante fue cortada por el último que la procesó,
      // y si tiene un defecto de corte la responsabilidad es de él.
      //
      // Ahora actualizamos AMBOS campos al usuario/proyecto actual. La
      // trazabilidad histórica completa se preserva en `historial_residuos`
      // (cada evento "consumido" guarda quién lo procesó y en qué proyecto).
      //
      // Bonus: actualizar `id_proyecto_origen` también es necesario para que
      // la lógica de `excluir_id_proyecto` ("no comerse la propia cola") siga
      // siendo coherente — si Ana usa un residuo en el Proyecto P2, el
      // sobrante de eso no debería volver a usarse en P2 en una re-optimización.
      await client.query(
        `UPDATE residuos_aluminio
         SET longitud_cm=$2, estado='disponible',
             id_proyecto_uso=NULL, id_ventana_uso=NULL, reservado_hasta=NULL,
             creado_por = COALESCE($3, creado_por),
             id_proyecto_origen = COALESCE($4, id_proyecto_origen),
             actualizado_en=NOW()
         WHERE id_residuo=$1`,
        [id_residuo, longDespues, id_usuario, id_proyecto]
      );
    } else {
      // No queda sobrante útil: marca como usado
      await client.query(
        `UPDATE residuos_aluminio
         SET longitud_cm=$2, estado='usado',
             id_proyecto_uso=COALESCE($3, id_proyecto_uso),
             id_ventana_uso=COALESCE($4, id_ventana_uso),
             actualizado_en=NOW()
         WHERE id_residuo=$1`,
        [id_residuo, Math.max(0, longDespues), id_proyecto, id_ventana]
      );
    }

    await client.query(
      `INSERT INTO historial_residuos
        (id_residuo, evento, longitud_antes_cm, longitud_despues_cm, id_proyecto, id_ventana, id_usuario, notas)
       VALUES ($1,'consumido',$2,$3,$4,$5,$6,$7)`,
      [id_residuo, longAntes, longDespues, id_proyecto, id_ventana, id_usuario,
       `Consumo ${longitud_usada_cm}cm + kerf ${kerf_cm}cm`]
    );
    if (ownsTx) await client.query('COMMIT');
    return { longitud_antes: longAntes, longitud_despues: longDespues };
  } catch (err) {
    if (ownsTx) {
      try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    }
    throw err;
  } finally {
    if (ownsTx) client.release();
  }
}

/**
 * Crea un nuevo residuo en el banco con trazabilidad completa.
 *
 * Trazabilidad incluida (cuándo se genera por optimización):
 *  - id_proyecto_origen: de qué proyecto viene
 *  - id_plan_corte: de qué ejecución de optimización viene
 *  - numero_barra: qué barra del plan lo generó (Barra #1, #2, etc)
 *  - notas: descripción legible
 */
async function crear({
  referencia_perfil, color_perfil, ubicacion, longitud_cm,
  id_proyecto_origen, id_ventana, id_usuario, notas,
  id_plan_corte, numero_barra,   // NUEVO: trazabilidad de plan
  client: extClient,             // ← NUEVO: cliente de transacción externa
}) {
  // Si el caller está dentro de una transacción y referencia un id_plan_corte
  // que se creó ahí, DEBEMOS usar su cliente; el plan aún no está COMMIT-eado
  // y otra conexión del pool no lo vería → FK violation 23503.
  const q = extClient || pool;

  // Construir nota descriptiva si vino de optimización
  let notaFinal = notas;
  if (id_plan_corte && numero_barra && !notas) {
    notaFinal = `Sobrante de Barra #${numero_barra} en Plan de Corte #${id_plan_corte}`;
  }

  // Detectar si las columnas de trazabilidad existen
  // (para no romper si la migración aún no corrió)
  let usaTrazabilidad = false;
  let usaUbicacion = false;
  try {
    const { rows: cols } = await q.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name='residuos_aluminio'
         AND column_name IN ('id_plan_corte','numero_barra','ubicacion_pieza')`
    );
    const names = cols.map(c => c.column_name);
    usaTrazabilidad = names.includes('id_plan_corte') && names.includes('numero_barra');
    usaUbicacion    = names.includes('ubicacion_pieza');
  } catch { /* ignorar */ }

  let rows;
  if (usaTrazabilidad && id_plan_corte && usaUbicacion) {
    // Con trazabilidad completa + ubicacion_pieza (regla del instructor)
    const result = await q.query(
      `INSERT INTO residuos_aluminio
         (referencia_perfil, color_perfil, ubicacion_pieza, longitud_cm, longitud_original_cm,
          id_proyecto_origen, id_ventana, creado_por, notas, estado,
          id_plan_corte, numero_barra)
       VALUES ($1,$2,$3,$4,$4,$5,$6,$7,$8,'disponible',$9,$10)
       RETURNING id_residuo`,
      [referencia_perfil, color_perfil, ubicacion || null, longitud_cm,
       id_proyecto_origen, id_ventana, id_usuario,
       notaFinal || 'Generado por optimización',
       id_plan_corte, numero_barra || null]
    );
    rows = result.rows;
  } else if (usaTrazabilidad && id_plan_corte) {
    // Con trazabilidad completa (sin ubicacion_pieza: muy raro)
    const result = await q.query(
      `INSERT INTO residuos_aluminio
         (referencia_perfil, color_perfil, longitud_cm, longitud_original_cm,
          id_proyecto_origen, id_ventana, creado_por, notas, estado,
          id_plan_corte, numero_barra)
       VALUES ($1,$2,$3,$3,$4,$5,$6,$7,'disponible',$8,$9)
       RETURNING id_residuo`,
      [referencia_perfil, color_perfil, longitud_cm, id_proyecto_origen,
       id_ventana, id_usuario, notaFinal || 'Generado por optimización',
       id_plan_corte, numero_barra || null]
    );
    rows = result.rows;
  } else if (usaUbicacion) {
    // Sin trazabilidad pero con ubicacion_pieza
    const result = await q.query(
      `INSERT INTO residuos_aluminio
         (referencia_perfil, color_perfil, ubicacion_pieza, longitud_cm, longitud_original_cm,
          id_proyecto_origen, id_ventana, creado_por, notas, estado)
       VALUES ($1,$2,$3,$4,$4,$5,$6,$7,$8,'disponible')
       RETURNING id_residuo`,
      [referencia_perfil, color_perfil, ubicacion || null, longitud_cm,
       id_proyecto_origen, id_ventana, id_usuario,
       notaFinal || 'Generado por optimización']
    );
    rows = result.rows;
  } else {
    // Sin trazabilidad ni ubicacion_pieza (compatibilidad total)
    const result = await q.query(
      `INSERT INTO residuos_aluminio
         (referencia_perfil, color_perfil, longitud_cm, longitud_original_cm,
          id_proyecto_origen, id_ventana, creado_por, notas, estado)
       VALUES ($1,$2,$3,$3,$4,$5,$6,$7,'disponible')
       RETURNING id_residuo`,
      [referencia_perfil, color_perfil, longitud_cm, id_proyecto_origen,
       id_ventana, id_usuario, notaFinal || 'Generado por optimización']
    );
    rows = result.rows;
  }

  const id = rows[0].id_residuo;

  // Historial con info de trazabilidad
  const notasHist = id_plan_corte
    ? `Generado por Plan #${id_plan_corte}, Barra #${numero_barra || '?'}`
    : 'Sobrante de optimización';

  await q.query(
    `INSERT INTO historial_residuos
      (id_residuo, evento, longitud_despues_cm, id_proyecto, id_ventana, id_usuario, notas)
     VALUES ($1,'creado',$2,$3,$4,$5,$6)`,
    [id, longitud_cm, id_proyecto_origen, id_ventana, id_usuario, notasHist]
  );
  return id;
}

/**
 * Cancela una reserva (vuelve a disponible).
 */
async function liberarReserva({ id_residuo, id_usuario, motivo }) {
  await pool.query(
    `UPDATE residuos_aluminio
     SET estado='disponible', id_proyecto_uso=NULL, id_ventana_uso=NULL,
         reservado_hasta=NULL, actualizado_en=NOW()
     WHERE id_residuo=$1 AND estado='reservado'`,
    [id_residuo]
  );
  await pool.query(
    `INSERT INTO historial_residuos (id_residuo, evento, id_usuario, notas)
     VALUES ($1,'desbloqueado',$2,$3)`,
    [id_residuo, id_usuario, motivo || 'Reserva liberada manualmente']
  );
}

/**
 * Expira reservas vencidas (delega al SP `expirar_reservas_residuos`).
 */
async function expirarReservasVencidas() {
  const { rows } = await pool.query(`SELECT expirar_reservas_residuos() AS n`);
  return rows[0]?.n || 0;
}

module.exports = {
  buscarDisponiblesPorPerfil,
  reservar,
  consumir,
  crear,
  liberarReserva,
  expirarReservasVencidas,
};
