/**
 * CorteAlum — Repository de Barras Estándar
 */

const pool = require('../config/db');
const { BARRA_ESTANDAR_DEFAULT_CM } = require('../config/constants');

/**
 * Obtiene la longitud de barra estándar para un perfil.
 */
async function getLongitudPorPerfil(id_perfil) {
  if (!id_perfil) return BARRA_ESTANDAR_DEFAULT_CM;
  try {
    const { rows } = await pool.query(
      `SELECT longitud_cm FROM barras_estandar
       WHERE id_perfil=$1 AND activo=TRUE
       ORDER BY es_default DESC, id_barra ASC
       LIMIT 1`,
      [id_perfil]
    );
    return rows.length ? parseFloat(rows[0].longitud_cm) : BARRA_ESTANDAR_DEFAULT_CM;
  } catch {
    return BARRA_ESTANDAR_DEFAULT_CM;
  }
}

/**
 * Lista barras de un perfil.
 */
async function listarPorPerfil(id_perfil) {
  const { rows } = await pool.query(
    `SELECT * FROM barras_estandar
     WHERE id_perfil=$1
     ORDER BY es_default DESC, longitud_cm DESC`,
    [id_perfil]
  );
  return rows;
}

async function listar() {
  const { rows } = await pool.query(
    `SELECT b.*, p.referencia AS perfil_ref, p.descripcion AS perfil_desc
     FROM barras_estandar b
     LEFT JOIN perfiles p ON p.id_perfil = b.id_perfil
     ORDER BY b.id_perfil, b.es_default DESC, b.longitud_cm DESC`
  );
  return rows;
}

async function crear({ id_perfil, longitud_cm, es_default, notas }) {
  if (es_default) {
    // Desactivar otras default del perfil
    await pool.query(
      `UPDATE barras_estandar SET es_default=FALSE WHERE id_perfil=$1`,
      [id_perfil]
    );
  }
  const { rows } = await pool.query(
    `INSERT INTO barras_estandar (id_perfil, longitud_cm, es_default, notas)
     VALUES ($1,$2,$3,$4) RETURNING id_barra`,
    [id_perfil, longitud_cm, !!es_default, notas || null]
  );
  return rows[0].id_barra;
}

async function actualizar(id_barra, { longitud_cm, es_default, activo, notas }) {
  const sets = [], vals = [];
  if (longitud_cm != null) { vals.push(longitud_cm); sets.push(`longitud_cm=$${vals.length}`); }
  if (es_default  != null) { vals.push(!!es_default); sets.push(`es_default=$${vals.length}`); }
  if (activo      != null) { vals.push(!!activo); sets.push(`activo=$${vals.length}`); }
  if (notas       != null) { vals.push(notas); sets.push(`notas=$${vals.length}`); }
  if (!sets.length) return;
  vals.push(id_barra);
  await pool.query(
    `UPDATE barras_estandar SET ${sets.join(', ')} WHERE id_barra=$${vals.length}`,
    vals
  );
}

async function eliminar(id_barra) {
  await pool.query(`DELETE FROM barras_estandar WHERE id_barra=$1`, [id_barra]);
}

module.exports = { getLongitudPorPerfil, listarPorPerfil, listar, crear, actualizar, eliminar };
