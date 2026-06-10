/**
 * CorteAlum — Búsqueda global (Ctrl+K)
 * ─────────────────────────────────────────────────────────────────────────────
 * Endpoint: GET /api/search?q=...&limit=N
 *
 * Busca simultáneamente en:
 *   - proyectos    (nombre_proyecto, nombre_cliente)
 *   - cotizaciones (id, nombre_proyecto, nombre_cliente del padre)
 *   - ventanas     (notas, dimensiones del padre)
 *   - materiales   (nombre_material, referencia/proveedor)
 *   - usuarios     (solo si el usuario actual es admin)
 *
 * Retorna agrupado por tipo, con un máximo configurable.
 * Respeta permisos: cada usuario solo ve sus propios proyectos (y los que le compartieron).
 */

const pool = require('../config/db');

const buscar = async (req, res) => {
  const q = String(req.query.q || '').trim();
  const limit = Math.min(parseInt(req.query.limit) || 5, 20);

  // Mínimo 2 caracteres para evitar resultados masivos
  if (q.length < 2) return res.json({ proyectos: [], cotizaciones: [], ventanas: [], materiales: [], usuarios: [] });

  const userId  = req.user.id;
  const esAdmin = req.user.rol === 'Administrador';
  const like    = `%${q}%`;

  // Detectar si existe proyecto_accesos (para incluir shared)
  let tieneAccesos = false;
  try {
    const r = await pool.query(`SELECT 1 FROM information_schema.tables WHERE table_name='proyecto_accesos' LIMIT 1`);
    tieneAccesos = r.rows.length > 0;
  } catch { /* ignore */ }

  // Cláusulas de permiso por tipo
  // Admin ve todo; user normal ve solo lo suyo + lo compartido
  const proyectoWhere = esAdmin
    ? `WHERE (nombre_proyecto ILIKE $1 OR nombre_cliente ILIKE $1)`
    : `WHERE (nombre_proyecto ILIKE $1 OR nombre_cliente ILIKE $1)
       AND (id_usuario_creador = $2
            ${tieneAccesos ? `OR id_proyecto IN (SELECT id_proyecto FROM proyecto_accesos WHERE id_usuario = $2)` : ''})`;

  const params = esAdmin ? [like, limit] : [like, userId, limit];
  const paramIdx = esAdmin ? 2 : 3;

  // EJECUTAR TODAS LAS QUERIES EN PARALELO
  // Cada try/catch protege contra columna inexistente — devuelve [] si falla.
  const safeQuery = (sql, params) =>
    pool.query(sql, params).then(r => r.rows).catch(err => {
      console.warn('[search]', err.message);
      return [];
    });

  const [proyectos, cotizaciones, ventanas, materiales, usuarios] = await Promise.all([
    // ── PROYECTOS ─────────────────────────────────────────────────────────
    safeQuery(
      `SELECT id_proyecto AS id,
              nombre_proyecto,
              nombre_cliente,
              estado,
              CONCAT(nombre_proyecto, ' · ', COALESCE(nombre_cliente,'sin cliente')) AS label
       FROM proyectos
       ${proyectoWhere}
       ORDER BY fecha_creacion DESC NULLS LAST
       LIMIT $${paramIdx}`,
      params
    ),

    // ── COTIZACIONES (solo si el usuario tiene acceso al proyecto padre) ─
    safeQuery(
      esAdmin
        ? `SELECT c.id_cotizacion AS id,
                  c.id_proyecto,
                  p.nombre_proyecto,
                  p.nombre_cliente,
                  COALESCE(c.total_final, c.total, 0) AS total,
                  CONCAT('Cotización #', c.id_cotizacion, ' · ', p.nombre_proyecto) AS label
           FROM cotizaciones c
           JOIN proyectos p ON c.id_proyecto = p.id_proyecto
           WHERE CAST(c.id_cotizacion AS TEXT) ILIKE $1
              OR p.nombre_proyecto ILIKE $1
              OR p.nombre_cliente  ILIKE $1
           ORDER BY c.id_cotizacion DESC
           LIMIT $2`
        : `SELECT c.id_cotizacion AS id,
                  c.id_proyecto,
                  p.nombre_proyecto,
                  p.nombre_cliente,
                  COALESCE(c.total_final, c.total, 0) AS total,
                  CONCAT('Cotización #', c.id_cotizacion, ' · ', p.nombre_proyecto) AS label
           FROM cotizaciones c
           JOIN proyectos p ON c.id_proyecto = p.id_proyecto
           WHERE (CAST(c.id_cotizacion AS TEXT) ILIKE $1
                  OR p.nombre_proyecto ILIKE $1
                  OR p.nombre_cliente  ILIKE $1)
             AND p.id_usuario_creador = $2
           ORDER BY c.id_cotizacion DESC
           LIMIT $3`,
      params
    ),

    // ── VENTANAS ─────────────────────────────────────────────────────────
    safeQuery(
      esAdmin
        ? `SELECT v.id_ventana AS id,
                  v.id_proyecto,
                  p.nombre_proyecto,
                  v.ancho_vano,
                  v.alto_vano,
                  CONCAT('Ventana V', v.id_ventana, ' · ', p.nombre_proyecto,
                         ' (', v.ancho_vano, '×', v.alto_vano, ')') AS label
           FROM ventanas v
           JOIN proyectos p ON v.id_proyecto = p.id_proyecto
           WHERE COALESCE(v.notas,'') ILIKE $1
              OR p.nombre_proyecto ILIKE $1
           ORDER BY v.id_ventana DESC
           LIMIT $2`
        : `SELECT v.id_ventana AS id,
                  v.id_proyecto,
                  p.nombre_proyecto,
                  v.ancho_vano,
                  v.alto_vano,
                  CONCAT('Ventana V', v.id_ventana, ' · ', p.nombre_proyecto,
                         ' (', v.ancho_vano, '×', v.alto_vano, ')') AS label
           FROM ventanas v
           JOIN proyectos p ON v.id_proyecto = p.id_proyecto
           WHERE (COALESCE(v.notas,'') ILIKE $1
                  OR p.nombre_proyecto ILIKE $1)
             AND p.id_usuario_creador = $2
           ORDER BY v.id_ventana DESC
           LIMIT $3`,
      params
    ),

    // ── MATERIALES (todos los usuarios pueden buscar — son catálogo) ────
    safeQuery(
      `SELECT id_material AS id,
              nombre_material,
              unidad_medida,
              COALESCE(costo_unitario, 0) AS costo,
              CONCAT(nombre_material, ' · ', unidad_medida) AS label
       FROM materiales
       WHERE estado='activo'
         AND nombre_material ILIKE $1
       ORDER BY nombre_material
       LIMIT $${esAdmin ? 2 : 3}`,
      esAdmin ? [like, limit] : [like, userId, limit]
    ),

    // ── USUARIOS (solo admin puede buscar usuarios) ──────────────────────
    esAdmin
      ? safeQuery(
          `SELECT id_usuario AS id,
                  nombre_completo,
                  email,
                  rol,
                  CONCAT(nombre_completo, ' · ', email) AS label
           FROM usuarios
           WHERE COALESCE(estado,'activo')='activo'
             AND (nombre_completo ILIKE $1 OR email ILIKE $1)
           ORDER BY nombre_completo
           LIMIT $2`,
          [like, limit]
        )
      : Promise.resolve([]),
  ]);

  res.json({ proyectos, cotizaciones, ventanas, materiales, usuarios });
};

module.exports = { buscar };
