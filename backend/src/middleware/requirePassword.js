/**
 * Middleware: exige que el usuario reenvíe su contraseña antes de operaciones
 * destructivas (DELETE de proyectos, cotizaciones, ventanas, etc).
 *
 * Cómo se usa:
 *   router.delete('/x/:id', authMiddleware, requirePassword, controller.eliminar);
 *
 * Cómo lo manda el frontend:
 *   axios.delete(`/x/${id}`, {
 *     data: { password: 'su_clave' },   // ← en body
 *     // o headers: { 'x-confirm-password': 'su_clave' }
 *   });
 *
 * Lógica:
 *   1. Lee la contraseña de req.body.password o del header 'x-confirm-password'
 *   2. Trae el hash bcrypt del usuario actual (req.user.id)
 *   3. Compara con bcrypt.compare
 *   4. Si coincide → next()
 *   5. Si no → 401 con mensaje claro
 */
const bcrypt = require('bcryptjs');
const pool   = require('../config/db');

async function requirePassword(req, res, next) {
  try {
    const password =
      (req.body && req.body.password) ||
      req.headers['x-confirm-password'] ||
      null;

    if (!password) {
      return res.status(400).json({
        error: 'Confirmación requerida',
        code:  'PASSWORD_REQUIRED',
        detalle: 'Esta acción es destructiva. Reenvía tu contraseña en el campo "password" del body o en el header "x-confirm-password".',
      });
    }

    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Sesión inválida' });
    }

    // ── BUG FIX CRÍTICO ────────────────────────────────────────────────
    // La columna de la BD se llama `contraseña` (con eñe), igual que en
    // authController, registro, login y cambio de password. La versión
    // anterior de este middleware usaba `contrasena` (sin eñe) y por eso
    // SIEMPRE explotaba con error PG `42703: column "contrasena" does
    // not exist`, devolviendo 500 al cliente — sin importar si la
    // contraseña era correcta. Esto invalidaba todo el flujo de
    // eliminación protegida del sistema.
    //
    // Detectamos defensivamente cuál columna existe en la BD instalada
    // para tolerar tanto esquemas con eñe como sin eñe (algunos entornos
    // PostgreSQL viejos no permiten caracteres no-ASCII en nombres de
    // columna sin entrecomillado consistente).
    let columnaPwd = 'contraseña';
    try {
      const { rows: cols } = await pool.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name='usuarios'
           AND column_name IN ('contraseña','contrasena','password')
         ORDER BY CASE column_name
           WHEN 'contraseña' THEN 1
           WHEN 'contrasena' THEN 2
           WHEN 'password'   THEN 3
         END
         LIMIT 1`
      );
      if (cols.length) columnaPwd = cols[0].column_name;
    } catch (e) {
      console.error('[requirePassword] no se pudo detectar columna pwd:', e.message);
    }

    const { rows } = await pool.query(
      `SELECT "${columnaPwd}" AS hash FROM usuarios WHERE id_usuario = $1`,
      [req.user.id]
    );
    if (!rows.length) {
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }

    const hash = rows[0].hash;
    if (!hash) {
      return res.status(401).json({
        error: 'Usuario sin contraseña configurada',
        code:  'PASSWORD_MISMATCH',
      });
    }

    // Compatibilidad: la BD puede tener bcrypt ($2...) o texto plano legacy
    let ok = false;
    if (typeof hash === 'string' && hash.startsWith('$2')) {
      ok = await bcrypt.compare(String(password), String(hash));
    } else {
      ok = String(password) === String(hash);
    }
    if (!ok) {
      return res.status(401).json({
        error: 'Contraseña incorrecta',
        code:  'PASSWORD_MISMATCH',
      });
    }

    // Limpieza: nunca dejar la contraseña expuesta más allá de este middleware
    if (req.body && req.body.password) delete req.body.password;
    if (req.headers['x-confirm-password']) delete req.headers['x-confirm-password'];

    return next();
  } catch (err) {
    console.error('[requirePassword ERROR]', { code: err.code, message: err.message });
    return res.status(500).json({ error: 'Error al verificar contraseña: ' + err.message });
  }
}

module.exports = requirePassword;
