const pool = require('../config/db');

// ---- PERFILES ----
const listarPerfiles = async (req, res) => {
  const { rows: rows } = await pool.query(`SELECT * FROM perfiles ORDER BY referencia`);
  res.json(rows);
};
const crearPerfil = async (req, res) => {
  const { referencia, descripcion } = req.body;
  if (!referencia) return res.status(400).json({ error: 'Referencia requerida' });
  try {
    const { rows: r } = await pool.query(`INSERT INTO perfiles (referencia, descripcion) VALUES ($1,$2) RETURNING id_perfil`, [referencia, descripcion||null]);
    res.status(201).json({ id_perfil: r[0].id_perfil });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Perfil ya existe' });
    res.status(500).json({ error: 'Error al crear perfil' });
  }
};
const actualizarPerfil = async (req, res) => {
  const { id } = req.params;
  const { referencia, descripcion, estado } = req.body;
  try {
    await pool.query(`UPDATE perfiles SET referencia=$1, descripcion=$2, estado=$3 WHERE id_perfil=$4`, [referencia, descripcion, estado||'activo', id]);
    res.json({ message: 'Perfil actualizado' });
  } catch { res.status(500).json({ error: 'Error al actualizar' }); }
};
const eliminarPerfil = async (req, res) => {
  await pool.query(`UPDATE perfiles SET estado='inactivo' WHERE id_perfil=$1`, [req.params.id]);
  res.json({ message: 'Desactivado' });
};

// ---- DISEÑOS ----
const listarDisenos = async (req, res) => {
  const { rows: rows } = await pool.query(`SELECT * FROM diseños ORDER BY nombre`);
  res.json(rows);
};
const crearDiseno = async (req, res) => {
  const { nombre, descripcion } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
  try {
    const { rows: r } = await pool.query(`INSERT INTO diseños (nombre, descripcion) VALUES ($1,$2) RETURNING id_diseño`, [nombre, descripcion||null]);
    res.status(201).json({ id_diseño: r[0].id_diseño });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Diseño ya existe' });
    res.status(500).json({ error: 'Error al crear diseño' });
  }
};
const actualizarDiseno = async (req, res) => {
  const { id } = req.params;
  const { nombre, descripcion, estado } = req.body;
  try {
    await pool.query(`UPDATE diseños SET nombre=$1, descripcion=$2, estado=$3 WHERE id_diseño=$4`, [nombre, descripcion, estado||'activo', id]);
    res.json({ message: 'Diseño actualizado' });
  } catch { res.status(500).json({ error: 'Error al actualizar' }); }
};
const eliminarDiseno = async (req, res) => {
  await pool.query(`UPDATE diseños SET estado='inactivo' WHERE id_diseño=$1`, [req.params.id]);
  res.json({ message: 'Desactivado' });
};

// ---- SISTEMAS ----
const listarSistemas = async (req, res) => {
  const { rows: rows } = await pool.query(`SELECT * FROM sistemas_ventaneria ORDER BY nombre`);
  res.json(rows);
};
const crearSistema = async (req, res) => {
  const { nombre, descripcion } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
  try {
    const { rows: r } = await pool.query(`INSERT INTO sistemas_ventaneria (nombre, descripcion) VALUES ($1,$2) RETURNING id_sistema`, [nombre, descripcion||null]);
    res.status(201).json({ id_sistema: r[0].id_sistema });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Sistema ya existe' });
    res.status(500).json({ error: 'Error al crear sistema' });
  }
};
const actualizarSistema = async (req, res) => {
  const { id } = req.params;
  const { nombre, descripcion, estado } = req.body;
  try {
    await pool.query(`UPDATE sistemas_ventaneria SET nombre=$1, descripcion=$2, estado=$3 WHERE id_sistema=$4`, [nombre, descripcion, estado||'activo', id]);
    res.json({ message: 'Sistema actualizado' });
  } catch { res.status(500).json({ error: 'Error al actualizar' }); }
};
const eliminarSistema = async (req, res) => {
  await pool.query(`UPDATE sistemas_ventaneria SET estado='inactivo' WHERE id_sistema=$1`, [req.params.id]);
  res.json({ message: 'Desactivado' });
};

module.exports = {
  listarPerfiles, crearPerfil, actualizarPerfil, eliminarPerfil,
  listarDisenos, crearDiseno, actualizarDiseno, eliminarDiseno,
  listarSistemas, crearSistema, actualizarSistema, eliminarSistema
};
