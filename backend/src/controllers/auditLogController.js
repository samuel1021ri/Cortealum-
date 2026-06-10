/**
 * CorteAlum — Audit Log Controller
 * ─────────────────────────────────────────────────────────────────────────────
 * Endpoint: GET /api/audit-log (solo admin)
 *
 * Query params soportados:
 *   - limit, offset      → paginación (default 50, max 200)
 *   - entidad            → filtrar por tipo (proyecto, cotizacion, ventana, etc.)
 *   - entidad_id         → filtrar por entidad concreta
 *   - id_usuario         → quién hizo la acción
 *   - accion             → tipo de acción (crear, actualizar, eliminar, cambiar_estado, etc.)
 *   - desde, hasta       → rango de fechas (ISO 8601)
 */

const audit = require('../services/auditLog');

const listar = async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    const result = await audit.listar({
      limit, offset,
      entidad:    req.query.entidad,
      entidad_id: req.query.entidad_id,
      id_usuario: req.query.id_usuario,
      accion:     req.query.accion,
      desde:      req.query.desde,
      hasta:      req.query.hasta,
    });

    res.json({
      total:   result.total,
      limit,
      offset,
      entries: result.rows,
    });
  } catch (err) {
    console.error('[audit-log listar]', err);
    res.status(500).json({ error: 'Error al listar audit log', detalle: err.message });
  }
};

module.exports = { listar };
