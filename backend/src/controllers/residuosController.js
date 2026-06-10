/**
 * residuosController.js — CorteAlu
 * Módulo de Residuos Reutilizables v1.0
 *
 * Funcionalidades:
 *  - Registrar residuos tras un corte
 *  - Buscar residuos compatibles (Best-Fit)
 *  - Reservar / liberar / usar residuos
 *  - Panel administrativo del banco de residuos
 *  - Métricas e indicadores
 *  - Expiración automática de reservas
 */

const pool = require('../config/db');
const { obtenerReferenciaAln } = require('../utils/catalogoAlumfer');

// ─── Mapeos referencia_perfil (string en BD) → id_perfil (numérico catálogo) ──
// Los residuos guardan `referencia_perfil` como string ("744", "5020", "8025").
// El catálogo Alumfer indexa por id_perfil numérico (1=744, 2=5020, 3=8025).
// Este mapeo permite resolver la referencia ALN sin tocar el schema de BD.
const PERFIL_REF_A_ID = { '744': 1, '5020': 2, '8025': 3 };

// Orden de sistemas a probar al resolver la ALN cuando el residuo NO tiene
// id_sistema guardado. La razón del orden:
//   • Para CABEZAL/SILLAR/JAMBA con perfil 5020 probamos PRIMERO Híbrida (3)
//     porque "el sistema 5020 Híbrida usa el marco del 744" → es el caso
//     usado en este negocio para esas piezas, y comparte ALN con 744 Trad.
//   • Para todo lo demás probamos Tradicional (1), luego Línea90 (2), luego
//     Híbrida (3). El primero que dé match en el catálogo gana.
//
// LIMITACIÓN: si en el futuro se trabaja con 5020 Tradicional Y 5020 Híbrida
// en paralelo, los residuos de CABEZAL del 5020 Tradicional saldrían
// reportados con la ALN de Híbrida (heurística incorrecta para ese caso).
// La solución 100% correcta sería persistir `id_sistema_origen` en residuos,
// pero requiere migración de BD.
function resolverReferenciaAln(ref_perfil_str, ubicacion_pieza) {
  if (!ref_perfil_str || !ubicacion_pieza) return null;
  const id_perfil = PERFIL_REF_A_ID[String(ref_perfil_str).trim()];
  if (!id_perfil) return null;

  const piezasDeMarco = ['CABEZAL', 'SILLAR', 'JAMBA'];
  const sistemasAProbar = (id_perfil === 2 && piezasDeMarco.includes(ubicacion_pieza))
    ? [3, 1, 2]   // 5020 + marco → Híbrida primero
    : [1, 2, 3];  // resto → Tradicional, Línea90, Híbrida

  for (const id_sistema of sistemasAProbar) {
    const ref = obtenerReferenciaAln(ubicacion_pieza, id_perfil, id_sistema);
    if (ref) return ref;
  }
  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getConfig(clave) {
  const { rows } = await pool.query(
    `SELECT valor FROM config_residuos WHERE clave = $1`, [clave]
  );
  return rows.length ? parseFloat(rows[0].valor) : null;
}

async function registrarHistorial(client, { id_residuo, evento, longitud_antes, longitud_despues, id_proyecto, id_ventana, id_usuario, ahorro, notas }) {
  await client.query(
    `INSERT INTO historial_residuos
     (id_residuo, evento, longitud_antes_cm, longitud_despues_cm, id_proyecto, id_ventana, id_usuario, ahorro_estimado_cop, notas)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id_residuo, evento, longitud_antes || null, longitud_despues || null,
     id_proyecto || null, id_ventana || null, id_usuario || null,
     ahorro || 0, notas || null]
  );
}

// ─── 1. Registrar residuo tras un corte ──────────────────────────────────────
/**
 * POST /api/residuos
 * Body: {
 *   id_ventana, id_proyecto_origen, referencia_perfil, color_perfil?,
 *   longitud_cm, longitud_original_cm?, pieza_cortada_cm?, ubicacion_pieza?, notas?
 * }
 */
const registrar = async (req, res) => {
  const {
    id_ventana, id_proyecto_origen, id_material,
    referencia_perfil, color_perfil,
    longitud_cm, longitud_original_cm, pieza_cortada_cm, ubicacion_pieza, notas
  } = req.body;

  if (!referencia_perfil || !longitud_cm || longitud_cm <= 0) {
    return res.status(400).json({ error: 'referencia_perfil y longitud_cm son obligatorios.' });
  }

  const minimo = await getConfig('minimo_reutilizable_cm') || 20;

  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');

    // Determinar si es reutilizable o descartado directamente
    const estado = longitud_cm >= minimo ? 'disponible' : 'descartado';

    const { rows } = await conn.query(
      `INSERT INTO residuos_aluminio
       (id_ventana, id_proyecto_origen, id_material, referencia_perfil, color_perfil,
        longitud_cm, longitud_original_cm, pieza_cortada_cm, ubicacion_pieza, estado,
        creado_por, notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [id_ventana || null, id_proyecto_origen || null, id_material || null,
       referencia_perfil.trim().toUpperCase(), color_perfil || null,
       longitud_cm, longitud_original_cm || null, pieza_cortada_cm || null,
       ubicacion_pieza || null, estado, req.user.id, notas || null]
    );

    const residuo = rows[0];

    await registrarHistorial(conn, {
      id_residuo: residuo.id_residuo,
      evento: 'creado',
      longitud_despues: longitud_cm,
      id_proyecto: id_proyecto_origen,
      id_ventana,
      id_usuario: req.user.id,
      notas: estado === 'disponible'
        ? `Residuo reutilizable de ${longitud_cm} cm registrado`
        : `Residuo descartado (< ${minimo} cm mínimo)`
    });

    await conn.query('COMMIT');

    res.status(201).json({
      ok: true,
      residuo,
      reutilizable: estado === 'disponible',
      minimo_cm: minimo,
      mensaje: estado === 'disponible'
        ? `✅ Residuo reutilizable de ${longitud_cm} cm almacenado en el banco.`
        : `⚠️ Residuo de ${longitud_cm} cm descartado (menor al mínimo de ${minimo} cm).`
    });
  } catch (err) {
    await conn.query('ROLLBACK');
    console.error('[residuos:registrar]', err);
    res.status(500).json({ error: 'Error al registrar residuo: ' + err.message });
  } finally {
    conn.release();
  }
};

// ─── 2. Registrar residuos en lote desde un cálculo de cortes ────────────────
/**
 * POST /api/residuos/batch
 * Body: {
 *   id_ventana, id_proyecto_origen, referencia_perfil, color_perfil?,
 *   cortes: [{ longitud_barra_cm, pieza_cm, ubicacion_pieza }]
 * }
 */
const registrarBatch = async (req, res) => {
  const { id_ventana, id_proyecto_origen, referencia_perfil, color_perfil, cortes } = req.body;

  if (!referencia_perfil || !Array.isArray(cortes) || cortes.length === 0) {
    return res.status(400).json({ error: 'referencia_perfil y cortes[] son obligatorios.' });
  }

  const minimo = await getConfig('minimo_reutilizable_cm') || 20;
  const conn = await pool.connect();
  const resultados = [];

  try {
    await conn.query('BEGIN');

    for (const corte of cortes) {
      const { longitud_barra_cm, pieza_cm, ubicacion_pieza } = corte;
      const sobrante = longitud_barra_cm - pieza_cm;
      if (sobrante <= 0) continue;

      const estado = sobrante >= minimo ? 'disponible' : 'descartado';

      const { rows } = await conn.query(
        `INSERT INTO residuos_aluminio
         (id_ventana, id_proyecto_origen, referencia_perfil, color_perfil,
          longitud_cm, longitud_original_cm, pieza_cortada_cm, ubicacion_pieza, estado, creado_por)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING id_residuo, longitud_cm, estado`,
        [id_ventana || null, id_proyecto_origen || null,
         referencia_perfil.trim().toUpperCase(), color_perfil || null,
         sobrante, longitud_barra_cm, pieza_cm, ubicacion_pieza || null,
         estado, req.user.id]
      );

      const r = rows[0];
      await registrarHistorial(conn, {
        id_residuo: r.id_residuo,
        evento: 'creado',
        longitud_despues: sobrante,
        id_proyecto: id_proyecto_origen,
        id_ventana,
        id_usuario: req.user.id,
        notas: `Batch: sobrante de ${sobrante} cm (${ubicacion_pieza})`
      });

      resultados.push({ ...r, sobrante_cm: sobrante, pieza_cm, ubicacion_pieza });
    }

    await conn.query('COMMIT');

    const reutilizables = resultados.filter(r => r.estado === 'disponible');
    const descartados   = resultados.filter(r => r.estado === 'descartado');

    res.status(201).json({
      ok: true,
      total_procesados: resultados.length,
      reutilizables: reutilizables.length,
      descartados: descartados.length,
      residuos: resultados,
      minimo_cm: minimo
    });
  } catch (err) {
    await conn.query('ROLLBACK');
    console.error('[residuos:batch]', err);
    res.status(500).json({ error: 'Error en batch de residuos: ' + err.message });
  } finally {
    conn.release();
  }
};

// ─── 3. Buscar residuos compatibles (Best-Fit) ───────────────────────────────
/**
 * GET /api/residuos/buscar?perfil=744&longitud=142&color=NATURAL
 * Devuelve la lista ordenada de mejor a peor ajuste (Best Fit).
 */
const buscar = async (req, res) => {
  const { perfil, longitud, color } = req.query;

  if (!perfil || !longitud) {
    return res.status(400).json({ error: 'perfil y longitud son obligatorios.' });
  }

  const longitud_requerida = parseFloat(longitud);
  if (isNaN(longitud_requerida) || longitud_requerida <= 0) {
    return res.status(400).json({ error: 'longitud debe ser un número positivo.' });
  }

  try {
    // Expirar reservas antes de buscar
    await pool.query(`SELECT expirar_reservas_residuos()`);

    let query = `
      SELECT *,
        (longitud_cm - $2) AS sobrante_si_usa,
        ROUND(((longitud_cm - $2) / longitud_cm * 100)::NUMERIC, 1) AS pct_desperdicio
      FROM residuos_aluminio
      WHERE referencia_perfil = $1
        AND estado = 'disponible'
        AND longitud_cm >= $2
    `;
    const params = [perfil.trim().toUpperCase(), longitud_requerida];

    if (color) {
      query += ` AND (color_perfil ILIKE $3 OR color_perfil IS NULL)`;
      params.push(`%${color.trim()}%`);
    }

    // Best Fit: ordenar por sobrante ascendente (el que menos desperdicia primero)
    query += ` ORDER BY sobrante_si_usa ASC LIMIT 10`;

    const { rows } = await pool.query(query, params);

    // Calcular ahorro estimado por reutilizar el mejor
    const mejor = rows[0] || null;
    let ahorro_estimado = null;
    if (mejor) {
      // Estimación: precio promedio de barra de 6m ≈ precio de material si existe
      const { rows: mat } = await pool.query(
        `SELECT costo_unitario FROM materiales
         WHERE nombre_material ILIKE $1 AND estado='activo' LIMIT 1`,
        [`%${perfil}%`]
      );
      if (mat.length > 0) {
        // costo_unitario en $/metro → cuántos metros ahorra respecto a barra nueva (600 cm = 6m)
        const metros_ahorrados = Math.min(mejor.longitud_cm, 600) / 100;
        ahorro_estimado = Math.round(parseFloat(mat[0].costo_unitario) * metros_ahorrados);
      }
    }

    res.json({
      longitud_requerida_cm: longitud_requerida,
      perfil: perfil.trim().toUpperCase(),
      total_encontrados: rows.length,
      mejor_opcion: mejor,
      alternativas: rows.slice(1),
      ahorro_estimado_cop: ahorro_estimado,
      recomendacion: mejor
        ? `💡 Residuo de ${mejor.longitud_cm} cm disponible — genera solo ${mejor.sobrante_si_usa} cm de sobrante.`
        : `⚠️ No se encontraron residuos compatibles. Se necesita barra nueva.`
    });
  } catch (err) {
    console.error('[residuos:buscar]', err);
    res.status(500).json({ error: 'Error al buscar residuos: ' + err.message });
  }
};

// ─── 4. Reservar un residuo ───────────────────────────────────────────────────
/**
 * POST /api/residuos/:id/reservar
 * Body: { id_proyecto, id_ventana? }
 */
const reservar = async (req, res) => {
  const { id } = req.params;
  const { id_proyecto, id_ventana } = req.body;

  const expiracion_min = await getConfig('expiracion_reserva_min') || 30;

  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');

    // Verificar disponibilidad
    const { rows } = await conn.query(
      `SELECT * FROM residuos_aluminio WHERE id_residuo = $1 FOR UPDATE`, [id]
    );
    if (!rows.length) { await conn.query('ROLLBACK'); return res.status(404).json({ error: 'Residuo no encontrado.' }); }
    if (rows[0].estado !== 'disponible') { await conn.query('ROLLBACK'); return res.status(409).json({ error: `Residuo no disponible. Estado actual: ${rows[0].estado}.` }); }

    const reservado_hasta = new Date(Date.now() + expiracion_min * 60 * 1000);

    await conn.query(
      `UPDATE residuos_aluminio
       SET estado = 'reservado', id_proyecto_uso = $1, id_ventana_uso = $2,
           reservado_hasta = $3, actualizado_en = NOW()
       WHERE id_residuo = $4`,
      [id_proyecto || null, id_ventana || null, reservado_hasta, id]
    );

    await registrarHistorial(conn, {
      id_residuo: parseInt(id),
      evento: 'reservado',
      longitud_antes: rows[0].longitud_cm,
      id_proyecto,
      id_ventana,
      id_usuario: req.user.id,
      notas: `Reservado hasta ${reservado_hasta.toISOString()}`
    });

    await conn.query('COMMIT');

    res.json({
      ok: true,
      id_residuo: parseInt(id),
      estado: 'reservado',
      reservado_hasta,
      expira_en_minutos: expiracion_min,
      mensaje: `✅ Residuo reservado hasta ${reservado_hasta.toLocaleString('es-CO')}.`
    });
  } catch (err) {
    await conn.query('ROLLBACK');
    console.error('[residuos:reservar]', err);
    res.status(500).json({ error: 'Error al reservar residuo: ' + err.message });
  } finally {
    conn.release();
  }
};

// ─── 5. Liberar reserva ───────────────────────────────────────────────────────
/**
 * POST /api/residuos/:id/liberar
 */
const liberar = async (req, res) => {
  const { id } = req.params;
  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');
    const { rows } = await conn.query(
      `UPDATE residuos_aluminio
       SET estado = 'disponible', id_proyecto_uso = NULL, id_ventana_uso = NULL,
           reservado_hasta = NULL, actualizado_en = NOW()
       WHERE id_residuo = $1 AND estado = 'reservado'
       RETURNING *`, [id]
    );
    if (!rows.length) {
      await conn.query('ROLLBACK');
      return res.status(409).json({ error: 'El residuo no está en estado reservado.' });
    }
    await registrarHistorial(conn, {
      id_residuo: parseInt(id), evento: 'liberado',
      id_usuario: req.user.id, notas: 'Reserva liberada manualmente'
    });
    await conn.query('COMMIT');
    res.json({ ok: true, mensaje: '✅ Reserva liberada. Residuo disponible nuevamente.' });
  } catch (err) {
    await conn.query('ROLLBACK');
    res.status(500).json({ error: 'Error al liberar reserva: ' + err.message });
  } finally { conn.release(); }
};

// ─── 6. Confirmar uso de un residuo ──────────────────────────────────────────
/**
 * POST /api/residuos/:id/usar
 * Body: { longitud_usada_cm, id_proyecto, id_ventana? }
 * Si hay sobrante nuevo, se registra automáticamente.
 */
const usar = async (req, res) => {
  const { id } = req.params;
  const { longitud_usada_cm, id_proyecto, id_ventana } = req.body;

  if (!longitud_usada_cm || longitud_usada_cm <= 0) {
    return res.status(400).json({ error: 'longitud_usada_cm es obligatorio.' });
  }

  const minimo   = await getConfig('minimo_reutilizable_cm') || 20;
  const conn = await pool.connect();

  try {
    await conn.query('BEGIN');

    const { rows } = await conn.query(
      `SELECT * FROM residuos_aluminio WHERE id_residuo = $1 FOR UPDATE`, [id]
    );
    if (!rows.length) { await conn.query('ROLLBACK'); return res.status(404).json({ error: 'Residuo no encontrado.' }); }
    if (!['disponible','reservado'].includes(rows[0].estado)) {
      await conn.query('ROLLBACK');
      return res.status(409).json({ error: `No se puede usar. Estado: ${rows[0].estado}.` });
    }
    if (longitud_usada_cm > rows[0].longitud_cm) {
      await conn.query('ROLLBACK');
      return res.status(400).json({ error: `Longitud usada (${longitud_usada_cm}) supera el residuo disponible (${rows[0].longitud_cm}).` });
    }

    // Marcar como usado
    await conn.query(
      `UPDATE residuos_aluminio
       SET estado = 'usado', id_proyecto_uso = $1, id_ventana_uso = $2,
           reservado_hasta = NULL, actualizado_en = NOW()
       WHERE id_residuo = $3`,
      [id_proyecto || null, id_ventana || null, id]
    );

    await registrarHistorial(conn, {
      id_residuo: parseInt(id), evento: 'usado',
      longitud_antes: rows[0].longitud_cm, longitud_despues: longitud_usada_cm,
      id_proyecto, id_ventana, id_usuario: req.user.id,
      notas: `Usado ${longitud_usada_cm} cm de ${rows[0].longitud_cm} cm disponibles`
    });

    // Si hay nuevo sobrante, registrarlo
    const nuevo_sobrante = rows[0].longitud_cm - longitud_usada_cm;
    let nuevo_residuo = null;
    if (nuevo_sobrante > 0) {
      const nuevo_estado = nuevo_sobrante >= minimo ? 'disponible' : 'descartado';
      const { rows: nr } = await conn.query(
        `INSERT INTO residuos_aluminio
         (id_proyecto_origen, referencia_perfil, color_perfil, longitud_cm,
          longitud_original_cm, estado, creado_por, notas)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING *`,
        [id_proyecto || null, rows[0].referencia_perfil, rows[0].color_perfil,
         nuevo_sobrante, rows[0].longitud_cm, nuevo_estado,
         req.user.id, `Generado al usar residuo #${id}`]
      );
      nuevo_residuo = nr[0];
      await registrarHistorial(conn, {
        id_residuo: nuevo_residuo.id_residuo, evento: 'creado',
        longitud_despues: nuevo_sobrante, id_proyecto,
        id_usuario: req.user.id,
        notas: `Sobrante de residuo #${id} usado`
      });
    }

    await conn.query('COMMIT');

    res.json({
      ok: true,
      longitud_usada_cm,
      sobrante_generado_cm: nuevo_sobrante > 0 ? nuevo_sobrante : 0,
      nuevo_residuo,
      mensaje: nuevo_sobrante >= minimo
        ? `✅ Residuo usado. Nuevo sobrante de ${nuevo_sobrante} cm almacenado.`
        : `✅ Residuo usado. Sobrante de ${nuevo_sobrante} cm descartado (< ${minimo} cm).`
    });
  } catch (err) {
    await conn.query('ROLLBACK');
    console.error('[residuos:usar]', err);
    res.status(500).json({ error: 'Error al usar residuo: ' + err.message });
  } finally {
    conn.release();
  }
};

// ─── 7. Descartar un residuo ──────────────────────────────────────────────────
/**
 * DELETE /api/residuos/:id
 */
const descartar = async (req, res) => {
  const { id } = req.params;
  const idNum = parseInt(id);
  if (!Number.isFinite(idNum)) {
    return res.status(400).json({ error: 'ID de residuo inválido' });
  }

  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');

    // ── Validar permisos: dueño del proyecto origen O admin ──
    const { rows: own } = await conn.query(
      `SELECT r.id_proyecto_origen, r.estado AS estado_actual, p.id_usuario_creador
       FROM residuos_aluminio r
       LEFT JOIN proyectos p ON r.id_proyecto_origen = p.id_proyecto
       WHERE r.id_residuo = $1`,
      [idNum]
    );
    if (!own.length) {
      await conn.query('ROLLBACK');
      return res.status(404).json({ error: 'Residuo no encontrado' });
    }

    const esAdmin = req.user.rol === 'Administrador';
    const dueno = own[0].id_usuario_creador;
    const estadoActual = own[0].estado_actual;

    // Si no hay proyecto origen (residuo huérfano), solo admin puede tocarlo
    if (!esAdmin && (dueno == null || dueno != req.user.id)) {
      await conn.query('ROLLBACK');
      return res.status(403).json({
        error: 'Solo el dueño del proyecto origen o un administrador pueden descartar este residuo'
      });
    }

    // Estado válido para descartar
    if (!['disponible', 'reservado'].includes(estadoActual)) {
      await conn.query('ROLLBACK');
      return res.status(409).json({
        error: `No se puede descartar un residuo en estado "${estadoActual}"`
      });
    }

    const { rows } = await conn.query(
      `UPDATE residuos_aluminio SET estado='descartado', actualizado_en=NOW()
       WHERE id_residuo=$1 AND estado IN ('disponible','reservado')
       RETURNING *`,
      [idNum]
    );
    if (!rows.length) {
      await conn.query('ROLLBACK');
      return res.status(409).json({ error: 'No se pudo descartar (estado cambió mientras tanto).' });
    }

    await registrarHistorial(conn, {
      id_residuo: idNum, evento: 'descartado',
      id_usuario: req.user.id, notas: 'Descartado manualmente'
    });

    await conn.query('COMMIT');
    res.json({ ok: true, id_residuo: idNum, mensaje: '✅ Residuo descartado del banco.' });
  } catch (err) {
    try { await conn.query('ROLLBACK'); } catch {}
    console.error('[residuos.descartar] ERROR', { code: err.code, message: err.message });
    res.status(500).json({ error: 'Error al descartar: ' + err.message });
  } finally { conn.release(); }
};

// ─── 8. Listar banco de residuos ─────────────────────────────────────────────
/**
 * GET /api/residuos?estado=disponible&perfil=744&page=1&limit=20
 *
 * Query params:
 *   estado, perfil, color, page, limit  → filtros estándar
 *   incluir_anulados=true               → incluye descartados de planes anulados
 *                                         (default: false, ver lógica abajo)
 *
 * FIX v29 — Descartados de planes anulados ocultos por defecto
 * ─────────────────────────────────────────────────────────────
 * Cuando el usuario re-confirma el plan de corte de un proyecto, los sobrantes
 * del plan PREVIO se marcan estado='descartado' en BD (para auditoría/historia).
 * Pero físicamente esos sobrantes nunca existieron — son "fantasmas" del plan
 * que nunca se cortó.
 *
 * Si la vista del banco mostraba TODOS los descartados, el usuario veía:
 *   Residuo #57 → descartado  (fantasma del plan A anulado)
 *   Residuo #62 → disponible  (real del plan B vigente)
 * con misma longitud, mismo perfil, mismo proyecto → confusión total.
 *
 * Heurística para detectar fantasmas:
 *   estado = 'descartado'
 *   AND id_plan_corte IS NOT NULL                  (vino de un plan)
 *   AND ese plan tiene plan_json.estado='anulado'  (el plan fue anulado)
 *
 * Por defecto los excluimos de la vista. Si el usuario quiere verlos
 * (auditoría), manda `?incluir_anulados=true`.
 *
 * Cobertura:
 *   ✓ Descartados por longitud<20 (crear manual / consumirParcial): id_plan_corte=NULL → no afecta
 *   ✓ Descartados manualmente desde UI: típicamente plan_json.estado='confirmado' → no afecta
 *   ✓ Descartados fantasma de planes anulados: SÍ se filtran
 */
const listar = async (req, res) => {
  // Expirar reservas primero
  await pool.query(`SELECT expirar_reservas_residuos()`).catch(() => {});

  const { estado, perfil, color, page = 1, limit = 20, incluir_anulados } = req.query;
  const verAnulados = String(incluir_anulados || '').toLowerCase() === 'true';
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let where = [];
  let params = [];
  let idx = 1;

  if (estado)  { where.push(`estado = $${idx++}`);                     params.push(estado); }
  if (perfil)  { where.push(`referencia_perfil = $${idx++}`);          params.push(perfil.toUpperCase()); }
  if (color)   { where.push(`color_perfil ILIKE $${idx++}`);           params.push(`%${color}%`); }

  // Excluir descartados de planes anulados (a menos que se pidan explícitamente).
  // FIX (causa de "los residuos no se guardan en el banco"): antes verificábamos
  // que la COLUMNA id_plan_corte existiera en la TABLA residuos_aluminio. Pero
  // el SELECT usa la VISTA vista_residuos_banco. Postgres NO propaga columnas
  // nuevas a vistas que usan SELECT * — la vista las "congela" al momento de
  // crearse. Si solo verificamos la tabla y la vista no las tiene → error 42703
  // → listar retorna 500 → el banco aparece vacío al usuario.
  // Solución: verificar que la columna exista TANTO en la tabla COMO en la vista.
  if (!verAnulados) {
    try {
      const { rows: hasInfra } = await pool.query(`
        SELECT
          (EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='residuos_aluminio' AND column_name='id_plan_corte')) AS has_col_tabla,
          (EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='vista_residuos_banco' AND column_name='id_plan_corte')) AS has_col_vista,
          (EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_name='planes_corte')) AS has_tbl
      `);
      // Ambos deben existir para aplicar el filtro
      if (hasInfra[0]?.has_col_tabla && hasInfra[0]?.has_col_vista && hasInfra[0]?.has_tbl) {
        where.push(`NOT (
          estado = 'descartado'
          AND id_plan_corte IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM planes_corte p
            WHERE p.id_plan = vista_residuos_banco.id_plan_corte
              AND p.plan_json::text LIKE '%"estado":"anulado"%'
          )
        )`);
      } else if (hasInfra[0]?.has_col_tabla && !hasInfra[0]?.has_col_vista) {
        // La vista está desincronizada → avisamos en el log para que el admin
        // sepa que las migraciones deben correr de nuevo.
        console.warn('[residuos:listar] ⚠️  Vista vista_residuos_banco está DESINCRONIZADA: la columna id_plan_corte existe en la tabla pero no en la vista. Reinicia el backend para recrearla.');
      }
    } catch (e) {
      console.warn('[residuos:listar] no se pudo verificar esquema trazabilidad:', e.message);
    }
  }

  const whereStr = where.length ? `WHERE ${where.join(' AND ')}` : '';

  try {
    const [{ rows }, { rows: total }] = await Promise.all([
      pool.query(
        `SELECT * FROM vista_residuos_banco ${whereStr}
         ORDER BY
           CASE estado WHEN 'disponible' THEN 0 WHEN 'reservado' THEN 1 ELSE 2 END,
           creado_en DESC
         LIMIT $${idx} OFFSET $${idx+1}`,
        [...params, parseInt(limit), offset]
      ),
      pool.query(`SELECT COUNT(*) FROM vista_residuos_banco ${whereStr}`, params)
    ]);

    // ── FIX (v39): enriquecer cada row con `referencia_aln` calculada ────
    // El frontend (BancoResiduos.jsx) ahora muestra columnas "Pieza" y
    // "Ref. ALN". `ubicacion_pieza` ya viene de la vista (si la migración
    // está aplicada); `referencia_aln` se calcula vía catálogo Alumfer
    // porque la tabla `residuos_aluminio` no tiene id_sistema guardado.
    // Si el row ya tuviera `referencia_aln` (futura migración), respetamos
    // el valor de BD por encima del cálculo heurístico.
    const dataEnriquecida = rows.map(r => ({
      ...r,
      ubicacion_pieza: r.ubicacion_pieza || null,
      referencia_aln: r.referencia_aln
        || resolverReferenciaAln(r.referencia_perfil, r.ubicacion_pieza),
    }));

    res.json({
      data: dataEnriquecida,
      pagination: {
        total: parseInt(total[0].count),
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total[0].count / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('[residuos:listar]', err);
    res.status(500).json({ error: 'Error al listar residuos: ' + err.message });
  }
};

// ─── 9. Métricas del banco ────────────────────────────────────────────────────
/**
 * GET /api/residuos/metricas
 */
const metricas = async (req, res) => {
  try {
    await pool.query(`SELECT expirar_reservas_residuos()`).catch(() => {});

    const [{ rows: global }, { rows: porPerfil }, { rows: recientes }] = await Promise.all([
      pool.query(`SELECT * FROM vista_metricas_residuos`),
      pool.query(`
        SELECT referencia_perfil,
               COUNT(*) FILTER (WHERE estado='disponible') AS disponibles,
               COUNT(*) FILTER (WHERE estado='usado')      AS usados,
               SUM(longitud_cm) FILTER (WHERE estado='disponible') AS metros_disponibles_cm,
               SUM(longitud_cm) FILTER (WHERE estado='usado')      AS metros_usados_cm
        FROM residuos_aluminio
        GROUP BY referencia_perfil
        ORDER BY disponibles DESC
      `),
      pool.query(`
        SELECT * FROM historial_residuos
        ORDER BY creado_en DESC LIMIT 10
      `)
    ]);

    // Ahorro estimado total
    const { rows: ahorroRows } = await pool.query(`
      SELECT COALESCE(SUM(ahorro_estimado_cop), 0) AS ahorro_total
      FROM historial_residuos WHERE evento = 'usado'
    `);

    res.json({
      global: global[0],
      por_perfil: porPerfil,
      actividad_reciente: recientes,
      ahorro_estimado_total_cop: parseFloat(ahorroRows[0].ahorro_total),
    });
  } catch (err) {
    console.error('[residuos:metricas]', err);
    res.status(500).json({ error: 'Error al obtener métricas: ' + err.message });
  }
};

// ─── 10. Configuración ───────────────────────────────────────────────────────
/**
 * GET  /api/residuos/config
 * PUT  /api/residuos/config (admin only)
 */
const getConfigAll = async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM config_residuos ORDER BY clave`);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const updateConfig = async (req, res) => {
  const { clave, valor } = req.body;
  if (!clave || valor === undefined) return res.status(400).json({ error: 'clave y valor requeridos.' });
  try {
    await pool.query(
      `UPDATE config_residuos SET valor=$1, actualizado_en=NOW() WHERE clave=$2`,
      [String(valor), clave]
    );
    res.json({ ok: true, mensaje: `Configuración "${clave}" actualizada a "${valor}".` });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── 11. Recomendaciones IA ──────────────────────────────────────────────────
/**
 * GET /api/residuos/recomendaciones?id_proyecto=5
 */
const recomendaciones = async (req, res) => {
  const { id_proyecto } = req.query;
  const alertas = [];

  try {
    const minimo = await getConfig('minimo_reutilizable_cm') || 20;
    // FIX v40: se eliminó la lectura de 'alerta_desperdicio_pct' — era código
    // muerto. El parámetro no aportaba valor en este sistema porque el
    // optimizador ya escoge el mejor plan posible (First Fit Decreasing +
    // Best Fit). Un % de desperdicio alto post-optimización no indica un mal
    // plan, solo refleja que no había residuos suficientes en el banco.

    // ① ¿Hay residuos próximos a expirar?
    const { rows: proximos } = await pool.query(`
      SELECT * FROM residuos_aluminio
      WHERE estado = 'reservado'
        AND reservado_hasta IS NOT NULL
        AND reservado_hasta < NOW() + INTERVAL '10 minutes'
      ORDER BY reservado_hasta ASC
    `);
    if (proximos.length) {
      alertas.push({
        tipo: 'alerta',
        icono: '⏰',
        mensaje: `${proximos.length} reserva(s) de residuos expiran en menos de 10 minutos.`,
        residuos: proximos
      });
    }

    // ② ¿Hay residuos sin usar hace más de 30 días?
    const { rows: antiguos } = await pool.query(`
      SELECT * FROM residuos_aluminio
      WHERE estado = 'disponible'
        AND creado_en < NOW() - INTERVAL '30 days'
      ORDER BY creado_en ASC LIMIT 5
    `);
    if (antiguos.length) {
      alertas.push({
        tipo: 'sugerencia',
        icono: '📦',
        mensaje: `${antiguos.length} residuo(s) llevan más de 30 días en el banco sin usarse.`,
        residuos: antiguos
      });
    }

    // ③ ¿Hay muchos residuos pequeños acumulados del mismo perfil?
    const { rows: fragmentados } = await pool.query(`
      SELECT referencia_perfil, COUNT(*) AS cantidad,
             AVG(longitud_cm) AS promedio_cm
      FROM residuos_aluminio
      WHERE estado = 'disponible' AND longitud_cm < 50
      GROUP BY referencia_perfil
      HAVING COUNT(*) >= 3
    `);
    if (fragmentados.length) {
      fragmentados.forEach(f => {
        alertas.push({
          tipo: 'info',
          icono: '🔧',
          mensaje: `Perfil ${f.referencia_perfil}: ${f.cantidad} residuos pequeños (prom. ${Math.round(f.promedio_cm)} cm). Considera combinarlos o descartarlos.`
        });
      });
    }

    // ④ Tasa de reutilización general
    //
    // FIX v41: solo disparar la alerta cuando exista actividad real (al menos
    // un residuo registrado en el sistema). Antes, con la tabla vacía la
    // vista devolvía tasa = 0% (correcto matemáticamente, pero engañoso) y
    // se generaba un mensaje rojo "Tasa de reutilización: 0%. Por debajo del
    // 60% recomendado." sobre un sistema que ni siquiera había arrancado.
    // Cero residuos no es mal desempeño, es ausencia de datos.
    const { rows: tasa } = await pool.query(`SELECT * FROM vista_metricas_residuos`);
    if (tasa.length
        && Number(tasa[0].total_residuos) > 0
        && tasa[0].tasa_reutilizacion_pct < 60) {
      alertas.push({
        tipo: 'alerta',
        icono: '📉',
        mensaje: `Tasa de reutilización: ${tasa[0].tasa_reutilizacion_pct}%. Por debajo del 60% recomendado.`
      });
    }

    // ⑤ Si se pasa un proyecto, buscar residuos compatibles con sus ventanas pendientes
    if (id_proyecto) {
      const { rows: ventanas } = await pool.query(`
        SELECT v.id_ventana, v.ancho_vano, v.alto_vano, pf.referencia AS perfil
        FROM ventanas v
        JOIN perfiles pf ON v.id_perfil = pf.id_perfil
        WHERE v.id_proyecto = $1 AND v.reporte_generado = FALSE
        LIMIT 5
      `, [id_proyecto]);

      for (const v of ventanas) {
        const piezaMayor = Math.max(parseFloat(v.ancho_vano), parseFloat(v.alto_vano)) * 100;
        const { rows: compat } = await pool.query(`
          SELECT id_residuo, longitud_cm, (longitud_cm - $1) AS sobrante
          FROM residuos_aluminio
          WHERE referencia_perfil = $2 AND estado = 'disponible' AND longitud_cm >= $1
          ORDER BY sobrante ASC LIMIT 1
        `, [piezaMayor, v.perfil]);

        if (compat.length) {
          alertas.push({
            tipo: 'ahorro',
            icono: '💰',
            mensaje: `Ventana ${v.id_ventana} (${v.ancho_vano}×${v.alto_vano}m): hay un residuo de ${compat[0].longitud_cm} cm que puede usarse en lugar de una barra nueva.`,
            id_residuo: compat[0].id_residuo
          });
        }
      }
    }

    res.json({ alertas, total: alertas.length });
  } catch (err) {
    console.error('[residuos:recomendaciones]', err.message);
    // Devolver array vacío en lugar de 500 para no romper el frontend
    res.json({ alertas: [], total: 0 });
  }
};

/**
 * GET /residuos/:id/detalle
 * Devuelve el residuo completo (desde la vista) + su historial de eventos
 * con nombres de usuario y proyecto resueltos, ordenado del más antiguo al
 * más reciente. Alimenta el modal de detalle del Banco.
 */
const obtenerDetalle = async (req, res) => {
  const { id } = req.params;
  try {
    // 1. Datos del residuo (desde la vista, que ya trae nombres de proyecto/usuario)
    const { rows: resid } = await pool.query(
      `SELECT * FROM vista_residuos_banco WHERE id_residuo = $1 LIMIT 1`,
      [id]
    );
    if (!resid.length) {
      return res.status(404).json({ error: 'Residuo no encontrado' });
    }
    const residuo = {
      ...resid[0],
      ubicacion_pieza: resid[0].ubicacion_pieza || null,
      referencia_aln: resid[0].referencia_aln
        || resolverReferenciaAln(resid[0].referencia_perfil, resid[0].ubicacion_pieza),
    };

    // 2. Historial de eventos, con nombres resueltos
    const { rows: historial } = await pool.query(
      `SELECT h.id_historial, h.evento,
              h.longitud_antes_cm, h.longitud_despues_cm,
              h.ahorro_estimado_cop, h.notas, h.creado_en,
              h.id_proyecto, p.nombre_proyecto,
              h.id_usuario,  u.nombre_completo AS usuario_nombre,
              h.id_ventana
       FROM historial_residuos h
       LEFT JOIN proyectos p ON h.id_proyecto = p.id_proyecto
       LEFT JOIN usuarios  u ON h.id_usuario  = u.id_usuario
       WHERE h.id_residuo = $1
       ORDER BY h.creado_en ASC, h.id_historial ASC`,
      [id]
    );

    res.json({ residuo, historial });
  } catch (err) {
    console.error('[residuos:detalle]', err);
    res.status(500).json({ error: 'Error al obtener el detalle del residuo: ' + err.message });
  }
};

module.exports = {
  registrar,
  registrarBatch,
  buscar,
  reservar,
  liberar,
  usar,
  descartar,
  listar,
  obtenerDetalle,
  metricas,
  getConfigAll,
  updateConfig,
  recomendaciones,
};
