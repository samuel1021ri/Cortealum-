const pool = require('../config/db');

// ─── Máquina de estados ───────────────────────────────────────────────────────
const TRANSICIONES_VALIDAS = {
  'en progreso': ['completado', 'cancelado', 'en pausa'],
  'en pausa':    ['en progreso', 'cancelado'],
  'completado':  [],   // estado final
  'cancelado':   [],   // estado final
};

// Qué acciones están permitidas según el estado
const ESTADO_BLOQUEOS = {
  'en progreso': { editarProyecto: true,  agregarVentanas: true,  editarVentanas: true,  generarCotizacion: true,  generarReporte: true  },
  'en pausa':    { editarProyecto: true,  agregarVentanas: true,  editarVentanas: true,  generarCotizacion: true,  generarReporte: false },
  'completado':  { editarProyecto: false, agregarVentanas: false, editarVentanas: false, generarCotizacion: true,  generarReporte: true  },
  'cancelado':   { editarProyecto: false, agregarVentanas: false, editarVentanas: false, generarCotizacion: false, generarReporte: false },
};

function getPermisos(estado) {
  return ESTADO_BLOQUEOS[estado] || ESTADO_BLOQUEOS['en progreso'];
}

function validarTransicion(estadoActual, estadoNuevo) {
  if (estadoActual === estadoNuevo) return null;
  const permitidos = TRANSICIONES_VALIDAS[estadoActual];
  if (!permitidos) return `Estado desconocido: ${estadoActual}`;
  if (!permitidos.includes(estadoNuevo)) {
    const lista = permitidos.length ? permitidos.join(', ') : 'ninguno (estado final)';
    return `No se puede cambiar de "${estadoActual}" a "${estadoNuevo}". Transiciones permitidas: ${lista}`;
  }
  return null;
}

// ─── Helpers de compatibilidad ───────────────────────────────────────────────

// Verifica si una columna existe en una tabla
async function columnaExiste(tabla, columna) {
  try {
    const { rows } = await pool.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name=$2 LIMIT 1`,
      [tabla, columna]
    );
    return rows.length > 0;
  } catch { return false; }
}

// Verifica si la tabla proyecto_accesos existe
async function tablaAccesosExiste() {
  try {
    const { rows } = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name='proyecto_accesos' LIMIT 1`
    );
    return rows.length > 0;
  } catch { return false; }
}

// Verificar acceso al proyecto
async function verificarAcceso(id_proyecto, id_usuario) {
  const { rows: own } = await pool.query(
    `SELECT id_usuario_creador FROM proyectos WHERE id_proyecto=$1`, [id_proyecto]
  );
  if (!own.length) return { ok: false, status: 404, error: 'Proyecto no encontrado' };
  if (own[0].id_usuario_creador == id_usuario) return { ok: true, esDueno: true, permiso: 'edicion' };

  const tieneTabla = await tablaAccesosExiste();
  if (tieneTabla) {
    const { rows: acc } = await pool.query(
      `SELECT permiso FROM proyecto_accesos WHERE id_proyecto=$1 AND id_usuario=$2`,
      [id_proyecto, id_usuario]
    );
    if (acc.length) return { ok: true, esDueno: false, permiso: acc[0].permiso };
  }
  return { ok: false, status: 403, error: 'No tienes acceso a este proyecto' };
}

// Registrar en historial con usuario
async function registrarHistorial(conn, id_proyecto, accion, id_usuario) {
  try {
    // Intentar con id_usuario si la columna existe
    const tieneUsuario = await columnaExiste('historial_proyectos', 'id_usuario');
    if (tieneUsuario) {
      await conn.query(
        `INSERT INTO historial_proyectos (id_proyecto, accion, id_usuario) VALUES ($1,$2,$3)`,
        [id_proyecto, accion, id_usuario || null]
      );
    } else {
      await conn.query(
        `INSERT INTO historial_proyectos (id_proyecto, accion) VALUES ($1,$2)`,
        [id_proyecto, accion]
      );
    }
  } catch (err) {
    console.error('[historial]', err.message);
  }
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

const crear = async (req, res) => {
  const { nombre_proyecto, nombre_cliente, fecha_inicio, fecha_fin, observaciones } = req.body;
  if (!nombre_proyecto || !fecha_inicio)
    return res.status(400).json({ error: 'Nombre y fecha de inicio requeridos' });

  try {
    // FIX v43: validación previa por SCOPE del usuario actual ─────────────
    // Antes solo dependíamos del INSERT para detectar duplicados, y si la
    // constraint UNIQUE fallaba se devolvía un mensaje genérico ("Ya existe
    // un proyecto con ese nombre") aunque la BD esté usando una constraint
    // de OTRA columna o un índice cruzado. Eso confunde porque el usuario
    // veía el error sin tener un proyecto con ese nombre en su lista.
    //
    // Ahora chequeamos primero contra los proyectos del usuario actual con
    // un SELECT explícito. Si existe → mensaje claro y específico. Si no
    // existe pero el INSERT igual falla con 23505, el handler de abajo
    // imprime QUÉ constraint falló para diagnóstico.
    const { rows: dupMios } = await pool.query(
      `SELECT id_proyecto FROM proyectos
       WHERE LOWER(TRIM(nombre_proyecto)) = LOWER(TRIM($1))
         AND id_usuario_creador = $2
       LIMIT 1`,
      [nombre_proyecto, req.user.id]
    );
    if (dupMios.length) {
      return res.status(400).json({
        error: `Ya tenés un proyecto llamado "${nombre_proyecto.trim()}". Probá con otro nombre o abrí el existente.`,
      });
    }

    const tieneFechaReal = await columnaExiste('proyectos', 'fecha_inicio_real');
    const tieneObs       = await columnaExiste('proyectos', 'observaciones');

    const campos = `nombre_proyecto, nombre_cliente, fecha_inicio, fecha_fin, id_usuario_creador, estado${tieneFechaReal ? ', fecha_inicio_real' : ''}${tieneObs ? ', observaciones' : ''}`;
    const valores = `$1,$2,$3,$4,$5,'en progreso'${tieneFechaReal ? ', NOW()' : ''}${tieneObs ? ',$6' : ''}`;

    const params = [nombre_proyecto, nombre_cliente || null, fecha_inicio, fecha_fin || null, req.user.id];
    if (tieneObs) params.push(observaciones || null);

    const { rows: result } = await pool.query(
      `INSERT INTO proyectos (${campos}) VALUES (${valores}) RETURNING id_proyecto`,
      params
    );

    await pool.query(
      `INSERT INTO historial_proyectos (id_proyecto, accion, version) VALUES ($1, 'Proyecto creado — estado inicial: en progreso', 1)`,
      [result[0].id_proyecto]
    );
    res.status(201).json({ id_proyecto: result[0].id_proyecto, message: 'Proyecto creado' });
  } catch (err) {
    console.error('[crear proyecto]', { code: err.code, constraint: err.constraint, detail: err.detail, message: err.message });
    if (err.code === '23505') {
      // FIX v43: mensaje específico según la constraint REAL que falló.
      // Antes asumíamos siempre "Ya existe un proyecto con ese nombre", pero
      // PostgreSQL devuelve `err.constraint` con el nombre del índice/constraint
      // violada. Si la BD tiene UNIQUE en `nombre_proyecto` a nivel global
      // (no scoped por usuario), eso significa que OTRO USUARIO ya tiene un
      // proyecto con ese nombre — el usuario actual no puede saber eso por
      // sí mismo, así que se lo explicamos. Esto resuelve la confusión del
      // caso reportado: "no tengo proyecto 'samuel' pero no me deja crearlo".
      const constraint = err.constraint || '';
      if (constraint.toLowerCase().includes('nombre')) {
        return res.status(400).json({
          error: 'Otro usuario del sistema ya tiene un proyecto con ese nombre. ' +
                 'Si necesitás usar exactamente ese nombre, pedile al admin que ajuste la restricción de unicidad. ' +
                 'Mientras tanto, agregale un sufijo (ej. "samuel — Norte" o "samuel 2026").',
        });
      }
      // Constraint distinta (rara, ej. UNIQUE en alguna columna inesperada)
      return res.status(400).json({
        error: `Conflicto al guardar el proyecto (constraint: ${constraint || 'desconocida'}). ` +
               'Probá cambiar el nombre o reportá este mensaje al administrador.',
      });
    }
    res.status(500).json({ error: 'Error al crear proyecto: ' + err.message });
  }
};

const listar = async (req, res) => {
  try {
    const { estado, search, page, limit } = req.query;
    const usePagination = page !== undefined || limit !== undefined;
    const limitNum = parseInt(limit) || 20;
    const pageNum = parseInt(page) || 1;
    const offset = (pageNum - 1) * limitNum;

    const params = [req.user.id];
    let whereClauses = 'WHERE p.id_usuario_creador = $1';

    if (estado && estado !== 'todos') {
      params.push(estado);
      whereClauses += ` AND p.estado = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      whereClauses += ` AND (p.nombre_proyecto ILIKE $${params.length} OR p.nombre_cliente ILIKE $${params.length})`;
    }

    let paginationClause = '';
    if (usePagination) {
      params.push(limitNum);
      const limitIdx = params.length;
      params.push(offset);
      const offsetIdx = params.length;
      paginationClause = `LIMIT $${limitIdx} OFFSET $${offsetIdx}`;
    }

    const { rows: propios } = await pool.query(
      `SELECT p.*, u.nombre_completo as creador,
              COUNT(DISTINCT v.id_ventana) as total_ventanas,
              'dueno' as mi_rol, 'edicion' as mi_permiso
       FROM proyectos p
       JOIN usuarios u ON p.id_usuario_creador = u.id_usuario
       LEFT JOIN ventanas v ON v.id_proyecto = p.id_proyecto
       ${whereClauses}
       GROUP BY p.id_proyecto, u.nombre_completo
       ORDER BY p.fecha_creacion DESC
       ${paginationClause}`,
      params
    );

    let compartidos = [];
    const tieneTabla = await tablaAccesosExiste();
    if (tieneTabla) {
      const { rows } = await pool.query(
        `SELECT p.*, u.nombre_completo as creador,
                COUNT(DISTINCT v.id_ventana) as total_ventanas,
                'invitado' as mi_rol, pa.permiso as mi_permiso,
                pa.fecha_compartido as fecha_compartido_acceso
         FROM proyectos p
         JOIN usuarios u ON p.id_usuario_creador = u.id_usuario
         JOIN proyecto_accesos pa ON pa.id_proyecto = p.id_proyecto
         LEFT JOIN ventanas v ON v.id_proyecto = p.id_proyecto
         WHERE pa.id_usuario = $1
         GROUP BY p.id_proyecto, u.nombre_completo, pa.permiso, pa.fecha_compartido
         ORDER BY pa.fecha_compartido DESC`,
        [req.user.id]
      );
      compartidos = rows;
    }

    const todos = [...propios, ...compartidos].map(p => ({ ...p, permisos: getPermisos(p.estado) }));
    res.json(todos);
  } catch (err) {
    console.error('[listar proyectos]', err);
    res.status(500).json({ error: 'Error al listar proyectos: ' + err.message });
  }
};

const obtener = async (req, res) => {
  const { id } = req.params;
  try {
    const acceso = await verificarAcceso(id, req.user.id);
    if (!acceso.ok) return res.status(acceso.status).json({ error: acceso.error });

    const { rows } = await pool.query(
      `SELECT p.*, u.nombre_completo as creador
       FROM proyectos p JOIN usuarios u ON p.id_usuario_creador = u.id_usuario
       WHERE p.id_proyecto=$1`, [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Proyecto no encontrado' });
    const proyecto = rows[0];
    res.json({
      ...proyecto,
      permisos: getPermisos(proyecto.estado),
      mi_rol: acceso.esDueno ? 'dueno' : 'invitado',
      mi_permiso: acceso.permiso,
    });
  } catch (err) {
    console.error('[obtener proyecto]', err);
    res.status(500).json({ error: 'Error al obtener proyecto' });
  }
};

const actualizar = async (req, res) => {
  const { id } = req.params;
  const { nombre_proyecto, nombre_cliente, fecha_inicio, fecha_fin, estado, observaciones, unidad_default } = req.body;

  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');

    // Verificar acceso
    const acceso = await verificarAcceso(id, req.user.id);
    if (!acceso.ok) { await conn.query('ROLLBACK'); return res.status(acceso.status).json({ error: acceso.error }); }
    if (acceso.permiso !== 'edicion') {
      await conn.query('ROLLBACK');
      return res.status(403).json({ error: 'Solo tienes permiso de lectura en este proyecto. No puedes editarlo.' });
    }

    // Leer estado actual
    const { rows: actual } = await conn.query(`SELECT estado FROM proyectos WHERE id_proyecto=$1`, [id]);
    if (!actual.length) { await conn.query('ROLLBACK'); return res.status(404).json({ error: 'Proyecto no encontrado' }); }
    const estadoActual = actual[0].estado;

    // Verificar que el estado actual permita editar
    const permisos = getPermisos(estadoActual);
    if (!permisos.editarProyecto) {
      await conn.query('ROLLBACK');
      return res.status(403).json({ error: `El proyecto está en estado "${estadoActual}" y no puede ser editado.` });
    }

    // Validar transición de estado
    const nuevoEstado = estado || estadoActual;
    const cambioEstado = nuevoEstado !== estadoActual;
    if (cambioEstado) {
      const errT = validarTransicion(estadoActual, nuevoEstado);
      if (errT) { await conn.query('ROLLBACK'); return res.status(400).json({ error: errT }); }
    }

    // Detectar columnas opcionales
    const tieneFechaReal = await columnaExiste('proyectos', 'fecha_inicio_real');
    const tieneObs       = await columnaExiste('proyectos', 'observaciones');
    const tieneUnidad    = await columnaExiste('proyectos', 'unidad_default');

    // Construir UPDATE dinámico
    let extraFields = '';
    if (cambioEstado && tieneFechaReal) {
      if (nuevoEstado === 'en progreso' && estadoActual !== 'en progreso')
        extraFields = `, fecha_inicio_real = COALESCE(fecha_inicio_real, NOW())`;
      if (nuevoEstado === 'completado')
        extraFields = `, fecha_fin_real = NOW(), duracion_dias = EXTRACT(DAY FROM NOW() - COALESCE(fecha_inicio_real, fecha_creacion))::INT`;
      if (nuevoEstado === 'cancelado')
        extraFields = `, fecha_fin_real = NOW()`;
    }

    const updateParams = [nombre_proyecto, nombre_cliente || null, fecha_inicio, fechaFinFinal(fecha_fin, nuevoEstado), nuevoEstado, id];
    let nextParam = updateParams.length + 1;

    if (tieneObs) {
      extraFields += `, observaciones=$${nextParam}`;
      updateParams.push(observaciones ?? null);
      nextParam++;
    }
    if (tieneUnidad && unidad_default != null) {
      // Solo se acepta 'cm' o 'mm' (defensa contra valores inválidos)
      const u = String(unidad_default).toLowerCase() === 'mm' ? 'mm' : 'cm';
      extraFields += `, unidad_default=$${nextParam}`;
      updateParams.push(u);
      nextParam++;
    }

    await conn.query(
      `UPDATE proyectos SET nombre_proyecto=$1, nombre_cliente=$2, fecha_inicio=$3, fecha_fin=$4, estado=$5${extraFields} WHERE id_proyecto=$6`,
      updateParams
    );

    // Historial detallado
    let accionLog = [];
    if (cambioEstado) accionLog.push(`Estado cambiado: "${estadoActual}" → "${nuevoEstado}"`);
    if (nombre_proyecto) accionLog.push(`Nombre actualizado`);
    if (unidad_default && tieneUnidad) accionLog.push(`Unidad: ${String(unidad_default).toLowerCase() === 'mm' ? 'mm' : 'cm'}`);
    if (!accionLog.length) accionLog.push('Datos del proyecto actualizados');

    await registrarHistorial(conn, id, accionLog.join(' | '), req.user.id);
    await conn.query('COMMIT');
    res.json({ message: 'Proyecto actualizado', estado_nuevo: nuevoEstado });
  } catch (err) {
    await conn.query('ROLLBACK');
    console.error('[actualizar proyecto]', err);
    res.status(500).json({ error: 'Error al actualizar proyecto: ' + err.message });
  } finally { conn.release(); }
};

// Helper: calcula la fecha de fin final basado en el estado
function fechaFinFinal(fecha_fin, nuevoEstado) {
  // FIX: si se completa sin fecha estimada, se pone HOY en hora de Colombia.
  // Antes usaba toISOString() (UTC) y el servidor de Render está en UTC, así
  // que de noche ponía el día siguiente. 'en-CA' devuelve formato YYYY-MM-DD.
  return (nuevoEstado === 'completado' && !fecha_fin)
    ? new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    : (fecha_fin || null);
}

// ── Duplicar ──────────────────────────────────────────────────────────────────
const duplicar = async (req, res) => {
  const { id } = req.params;
  const { nombre_nuevo } = req.body;

  if (!nombre_nuevo || !nombre_nuevo.trim())
    return res.status(400).json({ error: 'Se requiere un nombre para el proyecto duplicado' });

  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');

    // Leer proyecto original
    const { rows: orig } = await conn.query(`SELECT * FROM proyectos WHERE id_proyecto=$1`, [id]);
    if (!orig.length) { await conn.query('ROLLBACK'); return res.status(404).json({ error: 'Proyecto no encontrado' }); }
    const p = orig[0];

    // Verificar acceso (dueño o invitado)
    if (p.id_usuario_creador != req.user.id) {
      const tieneTabla = await tablaAccesosExiste();
      if (tieneTabla) {
        const { rows: acc } = await conn.query(
          `SELECT permiso FROM proyecto_accesos WHERE id_proyecto=$1 AND id_usuario=$2`, [id, req.user.id]
        );
        if (!acc.length) { await conn.query('ROLLBACK'); return res.status(403).json({ error: 'No tienes acceso a este proyecto' }); }
      } else {
        await conn.query('ROLLBACK');
        return res.status(403).json({ error: 'No tienes acceso a este proyecto' });
      }
    }

    // INSERT adaptado según columnas que existan
    const tieneFechaReal = await columnaExiste('proyectos', 'fecha_inicio_real');

    let insertSQL, insertParams;
    if (tieneFechaReal) {
      insertSQL = `INSERT INTO proyectos (nombre_proyecto, nombre_cliente, fecha_inicio, fecha_fin, id_usuario_creador, estado, fecha_inicio_real)
                   VALUES ($1,$2,$3,$4,$5,'en progreso', NOW()) RETURNING id_proyecto`;
    } else {
      insertSQL = `INSERT INTO proyectos (nombre_proyecto, nombre_cliente, fecha_inicio, fecha_fin, id_usuario_creador, estado)
                   VALUES ($1,$2,$3,$4,$5,'en progreso') RETURNING id_proyecto`;
    }
    insertParams = [nombre_nuevo.trim(), p.nombre_cliente, p.fecha_inicio, p.fecha_fin, req.user.id];

    const { rows: nuevo } = await conn.query(insertSQL, insertParams);
    const nuevoId = nuevo[0].id_proyecto;

    // Copiar ventanas
    const { rows: ventanas } = await conn.query(`SELECT * FROM ventanas WHERE id_proyecto=$1`, [id]);
    for (const v of ventanas) {
      const idDiseno = v['id_diseño'] || v['id_diseno'] || v.id_diseno;
      await conn.query(
        `INSERT INTO ventanas (id_proyecto, id_sistema, id_perfil, "id_diseño", ancho_vano, alto_vano, reporte_generado)
         VALUES ($1,$2,$3,$4,$5,$6,false)`,
        [nuevoId, v.id_sistema, v.id_perfil, idDiseno, v.ancho_vano, v.alto_vano]
      );
    }

    await registrarHistorial(
      conn, nuevoId,
      `Duplicado desde proyecto #${id} "${p.nombre_proyecto}" — ${ventanas.length} ventana(s) copiada(s)`,
      req.user.id
    );

    await conn.query('COMMIT');
    res.status(201).json({
      id_proyecto: nuevoId,
      nombre_proyecto: nombre_nuevo.trim(),
      ventanas_copiadas: ventanas.length,
      message: `Proyecto duplicado con ${ventanas.length} ventana(s)`,
    });
  } catch (err) {
    await conn.query('ROLLBACK');
    console.error('[duplicar proyecto]', err);
    if (err.code === '23505') return res.status(400).json({ error: 'Ya existe un proyecto con ese nombre' });
    res.status(500).json({ error: 'Error al duplicar: ' + err.message });
  } finally { conn.release(); }
};

const eliminar = async (req, res) => {
  const { id } = req.params;
  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');
    const { rows: own } = await conn.query(`SELECT id_usuario_creador FROM proyectos WHERE id_proyecto=$1`, [id]);
    if (!own.length) { await conn.query('ROLLBACK'); return res.status(404).json({ error: 'Proyecto no encontrado' }); }

    const esAdmin = req.user.rol === 'Administrador';
    if (!esAdmin && own[0].id_usuario_creador != req.user.id) {
      await conn.query('ROLLBACK');
      return res.status(403).json({ error: 'Solo el dueño puede eliminar este proyecto' });
    }

    const { rows: vents } = await conn.query(`SELECT id_ventana FROM ventanas WHERE id_proyecto=$1`, [id]);
    const vids = vents.map(v => v.id_ventana);
    if (vids.length) await conn.query(`DELETE FROM materiales_usados WHERE id_ventana = ANY($1)`, [vids]);
    await conn.query(`DELETE FROM ventanas WHERE id_proyecto=$1`, [id]);

    const { rows: cots } = await conn.query(`SELECT id_cotizacion FROM cotizaciones WHERE id_proyecto=$1`, [id]);
    const cids = cots.map(c => c.id_cotizacion);
    if (cids.length) {
      await conn.query(`DELETE FROM cotizacion_detalle_materiales WHERE id_cotizacion = ANY($1)`, [cids]);
      await conn.query(`DELETE FROM cotizacion_parametros_mano_obra WHERE id_cotizacion = ANY($1)`, [cids]);
    }
    await conn.query(`DELETE FROM cotizaciones WHERE id_proyecto=$1`, [id]);

    const tieneTabla = await tablaAccesosExiste();
    if (tieneTabla) await conn.query(`DELETE FROM proyecto_accesos WHERE id_proyecto=$1`, [id]);

    await conn.query(`DELETE FROM historial_proyectos WHERE id_proyecto=$1`, [id]);
    await conn.query(`DELETE FROM proyectos WHERE id_proyecto=$1`, [id]);
    await conn.query('COMMIT');
    res.json({ message: 'Proyecto eliminado' });
  } catch (err) {
    await conn.query('ROLLBACK');
    console.error('[eliminar proyecto]', err);
    res.status(500).json({ error: 'Error al eliminar: ' + err.message });
  } finally { conn.release(); }
};

const historial = async (req, res) => {
  const { id } = req.params;
  try {
    // Intentar traer nombre del usuario si la columna existe
    const tieneUsuario = await columnaExiste('historial_proyectos', 'id_usuario');
    let query;
    if (tieneUsuario) {
      query = `SELECT h.*, u.nombre_completo as nombre_usuario
               FROM historial_proyectos h
               LEFT JOIN usuarios u ON u.id_usuario = h.id_usuario
               WHERE h.id_proyecto=$1 ORDER BY h.fecha DESC`;
    } else {
      query = `SELECT * FROM historial_proyectos WHERE id_proyecto=$1 ORDER BY fecha DESC`;
    }
    const { rows } = await pool.query(query, [id]);
    res.json(rows);
  } catch (err) {
    console.error('[historial]', err);
    res.status(500).json({ error: 'Error al obtener historial' });
  }
};

const metricas = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE estado='completado')  as total_completados,
         COUNT(*) FILTER (WHERE estado='en progreso') as total_en_progreso,
         COUNT(*) FILTER (WHERE estado='cancelado')   as total_cancelados,
         COUNT(*) FILTER (WHERE estado='en pausa')    as total_en_pausa,
         ROUND(AVG(duracion_dias) FILTER (WHERE estado='completado'), 1) as duracion_promedio_dias,
         COUNT(DISTINCT v.id_ventana) FILTER (WHERE p.estado='completado') as ventanas_producidas
       FROM proyectos p
       LEFT JOIN ventanas v ON v.id_proyecto = p.id_proyecto
       WHERE p.id_usuario_creador = $1`,
      [req.user.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener métricas' });
  }
};

// ─── COMPARTIR ────────────────────────────────────────────────────────────────

const listarAccesos = async (req, res) => {
  const { id } = req.params;
  try {
    const tieneTabla = await tablaAccesosExiste();
    if (!tieneTabla) return res.json([]);

    const { rows: own } = await pool.query(`SELECT id_usuario_creador FROM proyectos WHERE id_proyecto=$1`, [id]);
    if (!own.length) return res.status(404).json({ error: 'Proyecto no encontrado' });
    if (own[0].id_usuario_creador != req.user.id && req.user.rol !== 'Administrador')
      return res.status(403).json({ error: 'Solo el dueño puede gestionar accesos' });

    const { rows } = await pool.query(
      `SELECT pa.id_acceso, pa.id_usuario, pa.permiso, pa.fecha_compartido,
              u.nombre_completo, u.nombre_usuario, u.correo_electronico,
              u.avatar_color, u.avatar_letra
       FROM proyecto_accesos pa
       JOIN usuarios u ON u.id_usuario = pa.id_usuario
       WHERE pa.id_proyecto=$1 ORDER BY pa.fecha_compartido DESC`,
      [id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al listar accesos' });
  }
};

const compartir = async (req, res) => {
  const { id } = req.params;
  const { id_usuario, permiso } = req.body;

  if (!id_usuario || !permiso) return res.status(400).json({ error: 'Se requiere id_usuario y permiso' });
  if (!['lectura', 'edicion'].includes(permiso)) return res.status(400).json({ error: 'Permiso inválido' });

  const tieneTabla = await tablaAccesosExiste();
  if (!tieneTabla) return res.status(503).json({ error: 'Ejecuta db_patch_compartir.sql primero.' });

  try {
    const { rows: own } = await pool.query(`SELECT id_usuario_creador FROM proyectos WHERE id_proyecto=$1`, [id]);
    if (!own.length) return res.status(404).json({ error: 'Proyecto no encontrado' });
    if (own[0].id_usuario_creador != req.user.id) return res.status(403).json({ error: 'Solo el dueño puede compartir' });
    if (own[0].id_usuario_creador == id_usuario) return res.status(400).json({ error: 'No puedes compartirte el proyecto a ti mismo' });

    // Obtener nombre del usuario para el historial
    const { rows: usr } = await pool.query(`SELECT nombre_completo FROM usuarios WHERE id_usuario=$1`, [id_usuario]);
    const nombreUsr = usr[0]?.nombre_completo || `#${id_usuario}`;

    await pool.query(
      `INSERT INTO proyecto_accesos (id_proyecto, id_usuario, permiso)
       VALUES ($1,$2,$3)
       ON CONFLICT (id_proyecto, id_usuario) DO UPDATE SET permiso=EXCLUDED.permiso, fecha_compartido=NOW()`,
      [id, id_usuario, permiso]
    );

    const conn = await pool.connect();
    try {
      await registrarHistorial(conn, id, `Proyecto compartido con ${nombreUsr} — permiso: ${permiso}`, req.user.id);
    } finally { conn.release(); }

    res.json({ message: 'Acceso compartido correctamente' });
  } catch (err) {
    res.status(500).json({ error: 'Error al compartir: ' + err.message });
  }
};

const quitarAcceso = async (req, res) => {
  const { id, id_usuario } = req.params;
  const tieneTabla = await tablaAccesosExiste();
  if (!tieneTabla) return res.status(503).json({ error: 'Ejecuta db_patch_compartir.sql primero.' });

  try {
    const { rows: own } = await pool.query(`SELECT id_usuario_creador FROM proyectos WHERE id_proyecto=$1`, [id]);
    if (!own.length) return res.status(404).json({ error: 'Proyecto no encontrado' });
    if (own[0].id_usuario_creador != req.user.id) return res.status(403).json({ error: 'Solo el dueño puede quitar accesos' });

    const { rows: usr } = await pool.query(`SELECT nombre_completo FROM usuarios WHERE id_usuario=$1`, [id_usuario]);
    const nombreUsr = usr[0]?.nombre_completo || `#${id_usuario}`;

    await pool.query(`DELETE FROM proyecto_accesos WHERE id_proyecto=$1 AND id_usuario=$2`, [id, id_usuario]);

    const conn = await pool.connect();
    try {
      await registrarHistorial(conn, id, `Acceso revocado para ${nombreUsr}`, req.user.id);
    } finally { conn.release(); }

    res.json({ message: 'Acceso eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al quitar acceso: ' + err.message });
  }
};

const usuariosDisponibles = async (req, res) => {
  const { id } = req.params;
  const tieneTabla = await tablaAccesosExiste();
  if (!tieneTabla) return res.json([]);

  try {
    const { rows: own } = await pool.query(`SELECT id_usuario_creador FROM proyectos WHERE id_proyecto=$1`, [id]);
    if (!own.length) return res.status(404).json({ error: 'Proyecto no encontrado' });
    if (own[0].id_usuario_creador != req.user.id) return res.status(403).json({ error: 'Solo el dueño puede gestionar accesos' });

    // Compatibilidad: filtrar por estado solo si la columna existe
    const tieneEstado = await columnaExiste('usuarios', 'estado');
    const filtroEstado = tieneEstado ? `AND u.estado = 'activo'` : '';

    const { rows } = await pool.query(
      `SELECT u.id_usuario, u.nombre_completo, u.nombre_usuario, u.correo_electronico,
              u.avatar_color, u.avatar_letra
       FROM usuarios u
       WHERE u.id_usuario != $1
         ${filtroEstado}
         AND u.id_usuario NOT IN (
           SELECT id_usuario FROM proyecto_accesos WHERE id_proyecto = $2
         )
       ORDER BY u.nombre_completo`,
      [own[0].id_usuario_creador, id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener usuarios: ' + err.message });
  }
};

module.exports = {
  crear, listar, obtener, actualizar, eliminar, historial, duplicar, metricas,
  listarAccesos, compartir, quitarAcceso, usuariosDisponibles,
};
