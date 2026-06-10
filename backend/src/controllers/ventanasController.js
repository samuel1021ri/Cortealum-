const pool = require('../config/db');
const { calcularVentana } = require('../utils/calcEngine');
const { normalizarACm, normalizarDeBD, esMedidaCoherente } = require('../utils/unitConvert');

// ─── Mapa NOMBRE → ID interno del engine ──────────────────────────────────────
// Nombres reales en BD Supabase: XX, OX, XO, XOX, OXXO, OXX, XXX (letra O, no cero)
const DISENO_NOMBRE_MAP = {
  'XX':1, 'OX':2, 'XO':2, 'XOX':3, 'OXXO':4, 'OXX':2, 'XXX':5,
  'X X':1, '0X':2, 'X0':2, 'X0X':3, '0XX0':4, 'X X X':5,
  'XX TRADICIONAL':1,
  'OX TRADICIONAL':2,'XO TRADICIONAL':2,'0X TRADICIONAL':2,'X0 TRADICIONAL':2,
  'XOX TRADICIONAL':3,'X0X TRADICIONAL':3,
  'OXXO TRADICIONAL':4,'0XX0 TRADICIONAL':4,
  'OXX TRADICIONAL':2,
  'XXX TRADICIONAL':5,
  'XX LINEA 90':1,'XX L90':1,
  'OX LINEA 90':2,'0X LINEA 90':2,'XO LINEA 90':2,
  'XOX LINEA 90':3,'X0X LINEA 90':3,
  'OXXO LINEA 90':4,'0XX0 LINEA 90':4,
  'XXX LINEA 90':5,'XXX L90':5,
  'XX HIBRIDA':1,
  'OX HIBRIDA':2,'0X HIBRIDA':2,'XO HIBRIDA':2,
  'XOX HIBRIDA':3,'X0X HIBRIDA':3,
  'OXXO HIBRIDA':4,'0XX0 HIBRIDA':4,
}

/**
 * Dado el nombre del diseño (viene del JOIN con tabla "diseños"),
 * devuelve el id interno del engine (1-5) o null si no se reconoce.
 */
function nombreDisenoToEngineId(nombre) {
  if (!nombre) return null;
  return DISENO_NOMBRE_MAP[nombre.trim().toUpperCase()] || null;
}

// ─── Helpers de permisos ───────────────────────────────────────────────────────
async function puedeEditarProyecto(id_proyecto, id_usuario) {
  const { rows: own } = await pool.query('SELECT id_usuario_creador FROM proyectos WHERE id_proyecto=$1', [id_proyecto]);
  if (!own.length) return false;
  if (own[0].id_usuario_creador == id_usuario) return true;
  try {
    const { rows: acc } = await pool.query(
      'SELECT permiso FROM proyecto_accesos WHERE id_proyecto=$1 AND id_usuario=$2',
      [id_proyecto, id_usuario]
    );
    return acc.length > 0 && acc[0].permiso === 'edicion';
  } catch { return false; }
}

async function verificarPermisoProyecto(id_proyecto, permiso) {
  const { rows } = await pool.query('SELECT estado FROM proyectos WHERE id_proyecto=$1', [id_proyecto]);
  if (!rows.length) return { error: 'Proyecto no encontrado', status: 404 };
  const estado = rows[0].estado;
  const BLOQUEOS = {
    'completado':  { agregarVentanas:false, editarVentanas:false, generarReporte:true  },
    'cancelado':   { agregarVentanas:false, editarVentanas:false, generarReporte:false },
    'en progreso': { agregarVentanas:true,  editarVentanas:true,  generarReporte:true  },
    'en pausa':    { agregarVentanas:false, editarVentanas:false, generarReporte:true  },
  };
  const permisos = BLOQUEOS[estado] || BLOQUEOS['en progreso'];
  if (!permisos[permiso]) {
    const msgs = {
      agregarVentanas: `El proyecto está en estado "${estado}" — no se pueden agregar ventanas.`,
      editarVentanas:  `El proyecto está en estado "${estado}" — no se pueden editar ventanas.`,
      generarReporte:  `El proyecto está en estado "${estado}" — no se pueden generar reportes.`,
    };
    return { error: msgs[permiso] || `Acción bloqueada por estado "${estado}"`, status: 403 };
  }
  return null;
}

// ─── SIMULAR ──────────────────────────────────────────────────────────────────
// Siempre resuelve el diseño a través del nombre en la BD, nunca confía en el
// id numérico crudo que puede no coincidir con el engine (1-5).
const simular = async (req, res) => {
  const { id_perfil, id_sistema, id_diseno, ancho_vano, alto_vano, id_ventana, referencia_vidrio } = req.body;

  try {
    let perfil, sistema, ancho, alto, refVid, engineId;

    if (id_ventana) {
      // Caso 1: viene id_ventana → leer todo de la BD con JOIN al nombre del diseño.
      // IMPORTANTE: aplicar normalizarDeBD para corregir datos legacy donde
      // ancho_vano/alto_vano se guardaron en mm por bugs anteriores.
      const { rows } = await pool.query(
        `SELECT v.id_perfil, v.id_sistema, v.ancho_vano, v.alto_vano,
                COALESCE(v.ancho_unidad,'cm') AS ancho_unidad,
                COALESCE(v.alto_unidad, 'cm') AS alto_unidad,
                COALESCE(v.referencia_vidrio,'5MM') AS referencia_vidrio,
                d.nombre AS nombre_diseno
         FROM ventanas v
         JOIN "diseños" d ON v."id_diseño" = d."id_diseño"
         WHERE v.id_ventana = $1`,
        [id_ventana]
      );
      if (!rows.length) return res.status(404).json({ error: 'Ventana no encontrada' });
      const v = rows[0];
      perfil   = parseInt(v.id_perfil);
      sistema  = parseInt(v.id_sistema);
      ancho    = normalizarDeBD(v.ancho_vano, v.ancho_unidad);   // ← siempre cm
      alto     = normalizarDeBD(v.alto_vano,  v.alto_unidad);    // ← siempre cm
      refVid   = v.referencia_vidrio || referencia_vidrio || '5MM';
      engineId = nombreDisenoToEngineId(v.nombre_diseno);
      if (!engineId) return res.status(400).json({ error: `Diseño desconocido: "${v.nombre_diseno}"` });

    } else {
      // Caso 2: viene id_diseno + ancho/alto desde el cliente.
      // El cliente DEBE enviar valores en cm canónico (validateMedida del frontend).
      // Si llegan valores anómalos (típico de envío en mm sin conversión), rechazar.
      if (!id_perfil || !id_sistema || !id_diseno || !ancho_vano || !alto_vano)
        return res.status(400).json({ error: 'Todos los campos son requeridos' });

      perfil  = parseInt(id_perfil);
      sistema = parseInt(id_sistema);
      // Si el cliente envió `unidad`, normalizar; si no, asumir cm (regla canónica).
      const unidadEnvio = req.body.unidad || 'cm';
      ancho   = normalizarACm(ancho_vano, unidadEnvio);
      alto    = normalizarACm(alto_vano,  unidadEnvio);
      refVid  = referencia_vidrio || '5MM';

      // Intentar resolver por nombre desde la BD (fuente de verdad)
      try {
        const { rows: dr } = await pool.query(
          'SELECT nombre FROM "diseños" WHERE "id_diseño"=$1', [id_diseno]
        );
        if (dr.length) {
          engineId = nombreDisenoToEngineId(dr[0].nombre);
        }
      } catch (_) { /* ignorar error de BD, intentar fallback */ }

      // Fallback: si id_diseno ya está en rango 1-5, usarlo directo
      if (!engineId) {
        const raw = parseInt(id_diseno);
        if (raw >= 1 && raw <= 5) engineId = raw;
      }

      if (!engineId) return res.status(400).json({ error: `No se pudo resolver el diseño id=${id_diseno}` });
    }

    // ── Validación final de coherencia ─────────────────────────────────────
    // En este punto ancho/alto DEBEN estar en cm canónico. Si el cliente envió
    // valores absurdos (ej. 2900 cm = 29 metros), rechazar con mensaje útil.
    const valAncho = esMedidaCoherente(ancho);
    const valAlto  = esMedidaCoherente(alto);
    if (!valAncho.valido) return res.status(400).json({ error: 'Ancho inválido: ' + valAncho.razon });
    if (!valAlto.valido)  return res.status(400).json({ error: 'Alto inválido: '  + valAlto.razon  });

    // El motor SIEMPRE recibe cm. No se pasa el parámetro `unit` — se asume default 'cm'.
    const resultado = calcularVentana(perfil, sistema, engineId, ancho, alto, refVid);
    if (resultado.error) return res.status(400).json({ error: resultado.error });
    return res.json(resultado);

  } catch (e) {
    console.error('[simular]', e);
    return res.status(500).json({ error: 'Error al simular: ' + e.message });
  }
};

// ─── CREAR ────────────────────────────────────────────────────────────────────
const crear = async (req, res) => {
  const { id_proyecto, id_sistema, id_perfil, id_diseno, ancho_vano, alto_vano, notas, referencia_vidrio, ancho_unidad, alto_unidad } = req.body;
  if (!id_proyecto || !id_sistema || !id_perfil || !id_diseno || !ancho_vano || !alto_vano)
    return res.status(400).json({ error: 'Todos los campos son requeridos' });

  // ── Validación de coherencia ─────────────────────────────────────────────
  // POLÍTICA CANÓNICA: el frontend SIEMPRE envía ancho_vano/alto_vano en CM
  // (ya pasados por validateMedida que convierte mm→cm). El campo
  // `ancho_unidad` / `alto_unidad` que llega del frontend es solo HISTÓRICO:
  // indica la unidad visual que el usuario usaba al crear, NO la unidad del
  // valor numérico que llega aquí.
  //
  // ⚠️ BUG ANTERIOR (v12): el backend hacía normalizarACm(ancho_vano, ancho_unidad)
  // y dividía entre 10 cuando ancho_unidad='mm', resultando en valores como
  // "Ancho inválido: Demasiado pequeño (3.9 cm)" para usuarios trabajando en MM.
  // Ahora simplemente se valida que el valor (ya en cm) sea coherente.
  const anchoCm = parseFloat(ancho_vano);
  const altoCm  = parseFloat(alto_vano);
  const valA = esMedidaCoherente(anchoCm);
  const valH = esMedidaCoherente(altoCm);
  if (!valA.valido) return res.status(400).json({ error: 'Ancho inválido: ' + valA.razon });
  if (!valH.valido) return res.status(400).json({ error: 'Alto inválido: '  + valH.razon });

  const bloqueo = await verificarPermisoProyecto(id_proyecto, 'agregarVentanas');
  if (bloqueo) return res.status(bloqueo.status).json({ error: bloqueo.error });

  const puedeCrear = await puedeEditarProyecto(id_proyecto, req.user.id);
  if (!puedeCrear) return res.status(403).json({ error: 'No tienes permiso para agregar ventanas a este proyecto' });

  try {
    // Detectar columnas opcionales disponibles (defensivo: si la migración aún no corrió, no falla)
    const colCheck = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name='ventanas' AND column_name IN ('notas','referencia_vidrio','ancho_unidad','alto_unidad')`
    );
    const available = new Set(colCheck.rows.map(r => r.column_name));

    // Construir lista de columnas opcionales según disponibilidad.
    // ancho_unidad/alto_unidad guardan la unidad EN QUE EL USUARIO ingresó,
    // útil solo para mostrar; los valores numéricos siempre van en cm.
    const extraColsArr = [];
    const extraValsArr = [];
    if (available.has('notas'))             { extraColsArr.push('notas');             extraValsArr.push(notas || null); }
    if (available.has('referencia_vidrio')) { extraColsArr.push('referencia_vidrio'); extraValsArr.push(referencia_vidrio || '5MM'); }
    if (available.has('ancho_unidad'))      { extraColsArr.push('ancho_unidad');      extraValsArr.push(ancho_unidad || 'cm'); }
    if (available.has('alto_unidad'))       { extraColsArr.push('alto_unidad');       extraValsArr.push(alto_unidad  || 'cm'); }

    const extraCols   = extraColsArr.length ? ', ' + extraColsArr.join(', ') : '';
    const extraParams = extraColsArr.map((_, i) => `, $${7 + i}`).join('');

    const { rows: result } = await pool.query(
      `INSERT INTO ventanas (id_proyecto, id_sistema, id_perfil, "id_diseño", ancho_vano, alto_vano${extraCols})
       VALUES ($1,$2,$3,$4,$5,$6${extraParams}) RETURNING id_ventana`,
      [id_proyecto, id_sistema, id_perfil, id_diseno, anchoCm, altoCm, ...extraValsArr]
    );
    const { rows: sys } = await pool.query('SELECT nombre FROM sistemas_ventaneria WHERE id_sistema=$1', [id_sistema]);
    const { rows: prf } = await pool.query('SELECT referencia FROM perfiles WHERE id_perfil=$1', [id_perfil]);
    const { rows: dis } = await pool.query('SELECT nombre FROM "diseños" WHERE "id_diseño"=$1', [id_diseno]);
    const desc = `${sys[0]?.nombre||''} ${prf[0]?.referencia||''} ${dis[0]?.nombre||''} ${anchoCm}×${altoCm}cm`;
    await pool.query(
      `INSERT INTO historial_proyectos (id_proyecto, accion) VALUES ($1, $2)`,
      [id_proyecto, `Ventana creada — ${desc}`]
    );
    res.status(201).json({ id_ventana: result[0].id_ventana, message: 'Ventana creada' });
  } catch (err) {
    console.error('[ventanas.crear]', err);
    res.status(500).json({ error: 'Error al crear ventana: ' + err.message });
  }
};

// ─── ACTUALIZAR ───────────────────────────────────────────────────────────────
const actualizar = async (req, res) => {
  const { id } = req.params;
  const { id_sistema, id_perfil, id_diseno, ancho_vano, alto_vano, notas, referencia_vidrio, ancho_unidad, alto_unidad } = req.body;
  const id_usuario = req.user?.id || null;
  if (!id_sistema || !id_perfil || !id_diseno || !ancho_vano || !alto_vano)
    return res.status(400).json({ error: 'Todos los campos son requeridos' });

  // ── Validación de coherencia ──────────────────────────────────────────
  // Igual que en crear: el frontend envía SIEMPRE en cm. `ancho_unidad` es
  // solo histórico de la preferencia visual del usuario, NO unidad del valor.
  const anchoCm = parseFloat(ancho_vano);
  const altoCm  = parseFloat(alto_vano);
  const valA = esMedidaCoherente(anchoCm);
  const valH = esMedidaCoherente(altoCm);
  if (!valA.valido) return res.status(400).json({ error: 'Ancho inválido: ' + valA.razon });
  if (!valH.valido) return res.status(400).json({ error: 'Alto inválido: '  + valH.razon });

  try {
    const { rows: v } = await pool.query('SELECT id_proyecto FROM ventanas WHERE id_ventana=$1', [id]);
    if (v.length) {
      const bloqueo = await verificarPermisoProyecto(v[0].id_proyecto, 'editarVentanas');
      if (bloqueo) return res.status(bloqueo.status).json({ error: bloqueo.error });
      const puedeEditar = await puedeEditarProyecto(v[0].id_proyecto, req.user.id);
      if (!puedeEditar) return res.status(403).json({ error: 'No tienes permiso para editar ventanas en este proyecto' });
    }

    // Detectar columnas opcionales (defensivo)
    const colCheckUpd = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name='ventanas' AND column_name IN ('notas','ancho_unidad','alto_unidad')`
    );
    const availableUpd = new Set(colCheckUpd.rows.map(r => r.column_name));

    // Construir SET dinámico. Importante: usar anchoCm/altoCm (ya normalizados
    // arriba), NO los valores crudos del body, para mantener la regla canónica
    // de que la BD solo contiene centímetros.
    const setParts = [
      'id_sistema=$1', 'id_perfil=$2', '"id_diseño"=$3',
      'ancho_vano=$4', 'alto_vano=$5', 'reporte_generado=FALSE',
    ];
    const values = [id_sistema, id_perfil, id_diseno, anchoCm, altoCm];
    let idx = 6;
    if (availableUpd.has('notas'))        { setParts.push(`notas=$${idx++}`);        values.push(notas ?? null); }
    if (availableUpd.has('ancho_unidad')) { setParts.push(`ancho_unidad=$${idx++}`); values.push(ancho_unidad || 'cm'); }
    if (availableUpd.has('alto_unidad'))  { setParts.push(`alto_unidad=$${idx++}`);  values.push(alto_unidad  || 'cm'); }
    values.push(id);

    await pool.query(
      `UPDATE ventanas SET ${setParts.join(', ')} WHERE id_ventana=$${idx}`,
      values
    );

    await pool.query('DELETE FROM materiales_usados WHERE id_ventana=$1', [id]);
    if (v[0]) {
      const tieneUsuCol = await pool.query(`SELECT 1 FROM information_schema.columns WHERE table_name='historial_proyectos' AND column_name='id_usuario' LIMIT 1`);
      if (tieneUsuCol.rows.length) {
        await pool.query(`INSERT INTO historial_proyectos (id_proyecto, accion, id_usuario) VALUES ($1,$2,$3)`, [v[0].id_proyecto, `Ventana #${id} editada — reporte pendiente`, id_usuario]);
      } else {
        await pool.query(`INSERT INTO historial_proyectos (id_proyecto, accion) VALUES ($1,$2)`, [v[0].id_proyecto, `Ventana #${id} editada — reporte pendiente`]);
      }
    }
    res.json({ message: 'Ventana actualizada' });
  } catch (err) {
    console.error('[ventanas.actualizar]', err);
    res.status(500).json({ error: 'Error al actualizar ventana: ' + err.message });
  }
};

// ─── LISTAR POR PROYECTO ──────────────────────────────────────────────────────
// IMPORTANTE: devuelve `engine_diseno_id` (1-5) además del id crudo de la BD.
// El frontend debe usar engine_diseno_id para llamar a /simular sin id_ventana.
const listarPorProyecto = async (req, res) => {
  const { id_proyecto } = req.params;
  try {
    const colCheck = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name='ventanas' AND column_name IN ('notas','referencia_vidrio','ancho_unidad','alto_unidad')`
    );
    const cols      = colCheck.rows.map(r => r.column_name);
    const colNotas  = cols.includes('notas')             ? 'v.notas'             : 'NULL as notas';
    const colRefVid = cols.includes('referencia_vidrio') ? 'v.referencia_vidrio' : 'NULL as referencia_vidrio';
    const colAnchoU = cols.includes('ancho_unidad')      ? 'v.ancho_unidad'      : `'cm'::varchar as ancho_unidad`;
    const colAltoU  = cols.includes('alto_unidad')       ? 'v.alto_unidad'       : `'cm'::varchar as alto_unidad`;

    const { rows } = await pool.query(
      `SELECT v.id_ventana, v.id_proyecto, v.id_sistema, v.id_perfil,
              v."id_diseño"            AS id_diseno_bd,
              d.nombre                 AS diseno,
              v.ancho_vano, v.alto_vano, v.reporte_generado, v.fecha_creacion,
              ${colNotas},
              ${colRefVid},
              ${colAnchoU},
              ${colAltoU},
              s.nombre AS sistema, pf.referencia AS perfil
       FROM ventanas v
       JOIN sistemas_ventaneria s ON v.id_sistema  = s.id_sistema
       JOIN perfiles pf            ON v.id_perfil   = pf.id_perfil
       JOIN "diseños" d            ON v."id_diseño" = d."id_diseño"
       WHERE v.id_proyecto = $1
       ORDER BY v.fecha_creacion`,
      [id_proyecto]
    );

    // Enriquecer cada fila con el engine_diseno_id resuelto por nombre
    const enriched = rows.map(r => ({
      ...r,
      id_diseno: nombreDisenoToEngineId(r.diseno) ?? r.id_diseno_bd,
    }));

    res.json(enriched);
  } catch (err) {
    console.error('[listarPorProyecto]', err.message);
    res.status(500).json({ error: 'Error al listar ventanas: ' + err.message });
  }
};

// ─── ELIMINAR ─────────────────────────────────────────────────────────────────
// LIMPIEZA DEFENSIVA DE FKs: la BD tiene varias tablas que referencian ventana.
// Algunas tienen ON DELETE SET NULL (residuos_aluminio.id_ventana, etc.) pero
// otras pueden NO tenerlo si el esquema original no las definió así (ej.
// cotizacion_detalle_materiales.id_ventana fue agregada vía migración como
// INT NULL sin FK, pero un parche SQL externo puede haberle puesto FK estricta).
//
// Para evitar 500 por FK violation, hacemos limpieza explícita ANTES del DELETE:
//   - materiales_usados        → DELETE (depende de la ventana)
//   - residuos_aluminio.*      → SET NULL (preservar histórico del banco)
//   - cotizacion_detalle...    → SET NULL (preservar histórico de cotización)
//   - historial_residuos       → SET NULL
//   - planes_corte plan_json   → no se toca (JSON, sin FK estricta)
//
// Si una tabla no existe en el esquema o no tiene esa columna, se ignora.
const eliminar = async (req, res) => {
  const { id } = req.params;
  const idNum = parseInt(id);
  if (!Number.isFinite(idNum)) return res.status(400).json({ error: 'ID de ventana inválido' });

  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');

    // ── 1. Validar existencia + permisos ─────────────────────────────────
    const { rows: ownRows } = await conn.query(
      `SELECT p.id_usuario_creador, p.estado, v.id_proyecto
       FROM ventanas v
       JOIN proyectos p ON v.id_proyecto = p.id_proyecto
       WHERE v.id_ventana = $1`,
      [idNum]
    );
    if (!ownRows.length) {
      await conn.query('ROLLBACK');
      return res.status(404).json({ error: 'Ventana no encontrada' });
    }
    const esAdmin = req.user.rol === 'Administrador';
    if (!esAdmin && ownRows[0].id_usuario_creador != req.user.id) {
      await conn.query('ROLLBACK');
      return res.status(403).json({ error: 'Solo el dueño del proyecto o un administrador pueden eliminar esta ventana' });
    }

    // Bloquear si proyecto está en estado terminal (excepto admin)
    const estadoProyecto = ownRows[0].estado;
    if (!esAdmin && ['completado', 'cancelado', 'en pausa'].includes(estadoProyecto)) {
      await conn.query('ROLLBACK');
      return res.status(403).json({
        error: `No se puede eliminar la ventana: el proyecto está en estado "${estadoProyecto}"`
      });
    }

    // ── 2. Limpieza defensiva de FKs (cada UPDATE/DELETE protegido) ──────
    // FIX: en Postgres, cuando una query falla dentro de un BEGIN/COMMIT
    // toda la transacción queda envenenada (error 25P02). Para "ignorar"
    // errores esperados (tabla/columna no existe en BDs viejas) hay que
    // usar SAVEPOINTs y hacer ROLLBACK TO SAVEPOINT cuando falla, así la
    // transacción principal sigue viva.
    let savepointCounter = 0;
    const safeRun = async (sql, params, etiqueta) => {
      const sp = `sp_${++savepointCounter}`;
      await conn.query(`SAVEPOINT ${sp}`);
      try {
        const r = await conn.query(sql, params);
        await conn.query(`RELEASE SAVEPOINT ${sp}`);
        if (r.rowCount > 0) console.log(`[ventanas.eliminar] ${etiqueta}: ${r.rowCount} fila(s)`);
      } catch (err) {
        // Restaurar al savepoint para que la transacción siga viva
        await conn.query(`ROLLBACK TO SAVEPOINT ${sp}`);
        // Códigos 42P01 = undefined_table, 42703 = undefined_column
        if (['42P01', '42703'].includes(err.code)) {
          console.log(`[ventanas.eliminar] ${etiqueta}: tabla/columna no existe (ok)`);
        } else {
          throw err;
        }
      }
    };

    await safeRun('DELETE FROM materiales_usados WHERE id_ventana=$1', [idNum], 'materiales_usados');
    await safeRun('UPDATE residuos_aluminio   SET id_ventana=NULL     WHERE id_ventana=$1', [idNum], 'residuos.id_ventana');
    await safeRun('UPDATE residuos_aluminio   SET id_ventana_uso=NULL WHERE id_ventana_uso=$1', [idNum], 'residuos.id_ventana_uso');
    await safeRun('UPDATE historial_residuos  SET id_ventana=NULL     WHERE id_ventana=$1', [idNum], 'historial_residuos');
    await safeRun('UPDATE cotizacion_detalle_materiales SET id_ventana=NULL WHERE id_ventana=$1', [idNum], 'cotizacion_detalle');
    await safeRun('UPDATE historial_proyectos SET id_ventana=NULL     WHERE id_ventana=$1', [idNum], 'historial_proyectos');

    // ── 3. DELETE final ──────────────────────────────────────────────────
    const del = await conn.query('DELETE FROM ventanas WHERE id_ventana=$1', [idNum]);
    if (del.rowCount === 0) {
      await conn.query('ROLLBACK');
      return res.status(404).json({ error: 'Ventana no encontrada al eliminar (concurrencia)' });
    }

    // Registrar en historial del proyecto (protegido con savepoint también)
    await conn.query(`SAVEPOINT sp_hist`);
    try {
      await conn.query(
        `INSERT INTO historial_proyectos (id_proyecto, accion)
         VALUES ($1, $2)`,
        [ownRows[0].id_proyecto, `Ventana #${idNum} eliminada`]
      );
      await conn.query(`RELEASE SAVEPOINT sp_hist`);
    } catch {
      await conn.query(`ROLLBACK TO SAVEPOINT sp_hist`);
      /* tabla puede no existir o no aceptar el formato — no crítico */
    }

    await conn.query('COMMIT');
    res.json({ message: 'Ventana eliminada', id_ventana: idNum });
  } catch (err) {
    try { await conn.query('ROLLBACK'); } catch {}
    console.error('[ventanas.eliminar] ERROR', { code: err.code, message: err.message, detail: err.detail });
    // FK violation: dar mensaje útil en lugar de 500 genérico
    if (err.code === '23503') {
      return res.status(409).json({
        error: 'No se puede eliminar: la ventana está referenciada por otros registros (cotizaciones, residuos, etc.). Detalle: ' + (err.detail || err.message)
      });
    }
    res.status(500).json({ error: 'Error al eliminar ventana: ' + err.message });
  } finally { conn.release(); }
};

// ─── GENERAR REPORTE ──────────────────────────────────────────────────────────
const parseBool = (val) => !(val === false || val === 'false' || val === 0 || val === '0');

const generarReporte = async (req, res) => {
  const { id } = req.params;
  const descontar_stock = parseBool(req.body?.descontar_stock);
  console.log(`[Reporte] ventana=${id} descontar_stock=${descontar_stock}`);

  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');

    // Leer ventana con nombre del diseño (JOIN)
    const { rows } = await conn.query(
      `SELECT v.*, d.nombre AS nombre_diseno
       FROM ventanas v
       JOIN "diseños" d ON v."id_diseño" = d."id_diseño"
       WHERE v.id_ventana = $1`,
      [id]
    );
    if (!rows.length) { await conn.query('ROLLBACK'); return res.status(404).json({ error: 'Ventana no encontrada' }); }
    const v = rows[0];

    const engineId = nombreDisenoToEngineId(v.nombre_diseno);
    if (!engineId) { await conn.query('ROLLBACK'); return res.status(400).json({ error: `Diseño desconocido: "${v.nombre_diseno}"` }); }

    // Normalizar a cm canónico (corrige ventanas legacy con valores en mm en la BD).
    const anchoCmRep = normalizarDeBD(v.ancho_vano, v.ancho_unidad);
    const altoCmRep  = normalizarDeBD(v.alto_vano,  v.alto_unidad);
    const calc = calcularVentana(parseInt(v.id_perfil), parseInt(v.id_sistema), engineId, anchoCmRep, altoCmRep, v.referencia_vidrio || '5MM');
    if (calc.error) { await conn.query('ROLLBACK'); return res.status(400).json({ error: calc.error }); }

    await conn.query('DELETE FROM materiales_usados WHERE id_ventana=$1', [id]);

    let materialesCount = 0;
    for (const pieza of calc.piezas) {
      if (pieza.resultado === null || pieza.resultado === undefined || pieza.es_vidrio) continue;
      const consumo_cm = pieza.cantidad * pieza.resultado;
      const consumo_m  = parseFloat((consumo_cm / 100).toFixed(4));
      const { rows: mats } = await conn.query(
        `SELECT id_material, nombre_material, costo_unitario FROM materiales WHERE nombre_material LIKE $1 AND estado='activo' LIMIT 1`,
        [`%${pieza.ubicacion.split(' ')[0]}%`]
      );
      if (mats.length > 0) {
        const mat = mats[0];
        const costo = parseFloat((consumo_m * parseFloat(mat.costo_unitario)).toFixed(2));
        await conn.query(
          `INSERT INTO materiales_usados (id_ventana, id_material, cantidad_usada, costo_total) VALUES ($1,$2,$3,$4)`,
          [id, mat.id_material, consumo_m, costo]
        );
        materialesCount++;
        if (descontar_stock) {
          await conn.query(
            `UPDATE materiales SET stock_disponible = GREATEST(0, stock_disponible - $1) WHERE id_material=$2`,
            [consumo_m, mat.id_material]
          );
        }
      }
    }

    await conn.query('UPDATE ventanas SET reporte_generado=TRUE WHERE id_ventana=$1', [id]);
    const accion = descontar_stock
      ? `Reporte técnico generado (stock descontado) — Ventana #${id}`
      : `Reporte técnico generado SIN descontar stock — Ventana #${id}`;
    await conn.query(`INSERT INTO historial_proyectos (id_proyecto, accion) VALUES ($1, $2)`, [v.id_proyecto, accion]);

    await conn.query('COMMIT');

    // ════════════════════════════════════════════════════════════════════════
    // 🚫 NO se generan residuos aquí.
    //
    // ¿POR QUÉ? Generar residuos por ventana es INCORRECTO industrialmente:
    //
    //   ❌ Mal (lo que hacíamos antes):
    //      Ventana1 corta sola → genera residuos
    //      Ventana2 corta sola → genera residuos
    //      Ventana3 corta sola → genera residuos
    //      → Banco recibe 3 residuos pequeños "fantasmas"
    //      → No refleja la realidad del taller
    //      → Pierde oportunidades de compartir barra entre ventanas
    //
    //   ✅ Bien (lo que hacemos ahora):
    //      El usuario abre "Optimizar cortes" del PROYECTO completo
    //      → Optimiza TODAS las ventanas a la vez (FFD + Best Fit)
    //      → Reutiliza residuos del banco compatibles
    //      → Al confirmar el plan: UNA transacción genera los residuos
    //         reales con trazabilidad: "Plan #X, Barra #2, Proyecto Y"
    //
    // El reporte por ventana sigue siendo útil para llevar al taller
    // (lista de cortes, accesorios, plano), pero NO crea residuos.
    //
    // Punto único de creación de residuos por optimización:
    //   POST /api/optimizacion/proyecto/:id/confirmar
    // ════════════════════════════════════════════════════════════════════════

    res.json({
      ok: true,
      message: descontar_stock
        ? 'Reporte generado y stock descontado'
        : 'Reporte generado (sin descontar stock)',
      descontar_stock,
      materiales_guardados: materialesCount,
      calculo: calc,
      nota: 'Para generar residuos del banco, usa "Optimizar cortes" del proyecto completo',
    });
  } catch (err) {
    await conn.query('ROLLBACK');
    console.error('[generarReporte] error:', err);
    res.status(500).json({ error: 'Error al generar reporte: ' + err.message });
  } finally {
    conn.release();
  }
};

// ─── OTROS ────────────────────────────────────────────────────────────────────
const getMaterialesUsados = async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT mu.*, m.nombre_material, m.unidad_medida, m.costo_unitario
       FROM materiales_usados mu JOIN materiales m ON mu.id_material = m.id_material
       WHERE mu.id_ventana = $1`, [id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener materiales' });
  }
};

const listarReportes = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT v.id_ventana, v.ancho_vano, v.alto_vano, v.reporte_generado,
              p.id_proyecto, p.nombre_proyecto, p.nombre_cliente, p.estado as estado_proyecto,
              s.nombre as sistema, pf.referencia as perfil, d.nombre as diseno,
              (SELECT SUM(mu.costo_total) FROM materiales_usados mu WHERE mu.id_ventana=v.id_ventana) as costo_total_materiales,
              (SELECT COUNT(*) FROM materiales_usados mu WHERE mu.id_ventana=v.id_ventana) as num_materiales
       FROM ventanas v
       JOIN proyectos p ON v.id_proyecto = p.id_proyecto
       JOIN sistemas_ventaneria s ON v.id_sistema = s.id_sistema
       JOIN perfiles pf ON v.id_perfil = pf.id_perfil
       JOIN "diseños" d ON v."id_diseño" = d."id_diseño"
       WHERE v.reporte_generado = TRUE AND p.id_usuario_creador = $1
       ORDER BY v.id_ventana DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('[listarReportes]', err);
    res.status(500).json({ error: 'Error al listar reportes' });
  }
};

const eliminarReporte = async (req, res) => {
  const { id } = req.params;
  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');
    const { rows } = await conn.query(
      `SELECT v.id_ventana, p.id_usuario_creador, p.estado as estado_proyecto
       FROM ventanas v JOIN proyectos p ON v.id_proyecto=p.id_proyecto WHERE v.id_ventana=$1`, [id]
    );
    if (!rows.length) { await conn.query('ROLLBACK'); return res.status(404).json({ error: 'Ventana no encontrada' }); }
    const esAdmin = req.user.rol === 'Administrador';
    if (!esAdmin && rows[0].id_usuario_creador != req.user.id) { await conn.query('ROLLBACK'); return res.status(403).json({ error: 'Sin permiso' }); }
    if (rows[0].estado_proyecto !== 'en progreso') { await conn.query('ROLLBACK'); return res.status(403).json({ error: `No se puede eliminar el reporte: el proyecto está "${rows[0].estado_proyecto}"` }); }
    await conn.query('DELETE FROM materiales_usados WHERE id_ventana=$1', [id]);
    await conn.query('UPDATE ventanas SET reporte_generado=FALSE WHERE id_ventana=$1', [id]);
    await conn.query('COMMIT');
    res.json({ message: 'Reporte eliminado' });
  } catch (err) {
    await conn.query('ROLLBACK');
    res.status(500).json({ error: 'Error al eliminar reporte: ' + err.message });
  } finally { conn.release(); }
};

module.exports = { simular, crear, actualizar, listarPorProyecto, eliminar, generarReporte, getMaterialesUsados, listarReportes, eliminarReporte };