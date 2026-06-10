/**
 * CorteAlum — Audit Log Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Helper genérico para registrar acciones críticas en `audit_log`.
 *
 * Uso típico desde un controller:
 *
 *   const audit = require('../services/auditLog');
 *
 *   await audit.registrar({
 *     req,
 *     accion: 'eliminar',
 *     entidad: 'proyecto',
 *     entidad_id: id,
 *     descripcion: `Proyecto eliminado: ${nombre}`,
 *     cambios: { antes: {...}, despues: null },
 *   });
 *
 * Diseño:
 *   - Si falla la inserción NO lanza error (no debe romper la operación principal)
 *   - Detecta IP y user-agent automáticamente
 *   - Acepta `client` opcional para participar en transacciones del caller
 *
 * Estructura del JSONB `cambios` (libre, sugerido):
 *   - { antes: {...}, despues: {...} }
 *   - { campo: 'estado', de: 'borrador', a: 'enviada' }
 */

const pool = require('../config/db');

/**
 * Registra una acción en el audit log.
 *
 * @param {Object} params
 * @param {Object} params.req         Request de Express (para sacar user/ip/UA)
 * @param {string} params.accion      'crear' | 'actualizar' | 'eliminar' | 'cambio_estado' | etc.
 * @param {string} params.entidad     'proyecto' | 'cotizacion' | 'ventana' | ...
 * @param {number} [params.entidad_id]
 * @param {string} [params.descripcion] Texto legible
 * @param {Object} [params.cambios]   JSON con detalles del cambio
 * @param {Object} [params.client]    Cliente de transacción externa (opcional)
 * @returns {Promise<void>} Nunca rechaza
 */
async function registrar({ req, accion, entidad, entidad_id, descripcion, cambios, client }) {
  try {
    const id_usuario     = req?.user?.id || null;
    const nombre_usuario = req?.user?.nombre_completo || req?.user?.email || null;
    // IP detectada de cabeceras comunes de proxy reverso
    const ip = (req?.headers?.['x-forwarded-for'] || req?.connection?.remoteAddress || '')
      .toString().split(',')[0].trim().slice(0, 45) || null;
    const user_agent = (req?.headers?.['user-agent'] || '').toString().slice(0, 500) || null;

    const q = client || pool;
    await q.query(
      `INSERT INTO audit_log
       (id_usuario, nombre_usuario, accion, entidad, entidad_id, descripcion, cambios, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`,
      [
        id_usuario,
        nombre_usuario,
        accion,
        entidad,
        entidad_id || null,
        descripcion || null,
        cambios ? JSON.stringify(cambios) : null,
        ip,
        user_agent,
      ]
    );
  } catch (err) {
    // Defensive: nunca romper la operación principal por un fallo de auditoría.
    // Solo logueamos a consola para debugging.
    console.warn('[auditLog ERROR — ignorado]', err.message);
  }
}

/**
 * Lista entradas del audit log con paginación + filtros opcionales.
 * Diseñado para la página admin de auditoría.
 */
async function listar({ limit = 50, offset = 0, entidad, accion, id_usuario, desde, hasta } = {}) {
  const conditions = [];
  const params = [];
  let i = 1;

  if (entidad)    { conditions.push(`entidad = $${i++}`);    params.push(entidad); }
  if (accion)     { conditions.push(`accion = $${i++}`);     params.push(accion); }
  if (id_usuario) { conditions.push(`id_usuario = $${i++}`); params.push(id_usuario); }
  if (desde)      { conditions.push(`created_at >= $${i++}`); params.push(desde); }
  if (hasta)      { conditions.push(`created_at <= $${i++}`); params.push(hasta); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limitStr = `LIMIT $${i++} OFFSET $${i++}`;
  params.push(limit, offset);

  const { rows } = await pool.query(
    `SELECT id_log, id_usuario, nombre_usuario, accion, entidad, entidad_id,
            descripcion, cambios, ip, created_at
     FROM audit_log
     ${where}
     ORDER BY created_at DESC
     ${limitStr}`,
    params
  );

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*) AS total FROM audit_log ${where}`,
    params.slice(0, params.length - 2)
  );

  return { entries: rows, total: parseInt(countRows[0].total, 10) };
}

module.exports = { registrar, listar };
