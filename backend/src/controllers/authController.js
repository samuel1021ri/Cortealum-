const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const login = async (req, res) => {
  const { nombre_usuario, contraseña } = req.body;
  if (!nombre_usuario || !contraseña)
    return res.status(400).json({ error: 'Identificador y contraseña requeridos' });
  try {
    // Accept: username, email, or phone
    const { rows: rows } = await pool.query(
      `SELECT u.*, r.nombre as rol FROM usuarios u
       JOIN roles r ON u.id_rol = r.id_rol
       WHERE (u.nombre_usuario = $1 OR u.correo_electronico = $2 OR u.telefono = $3)
         AND (u.estado IS NULL OR u.estado != 'inactivo')
       LIMIT 1`,
      [nombre_usuario, nombre_usuario, nombre_usuario]
    );
    if (!rows.length) return res.status(401).json({ error: 'Credenciales incorrectas' });
    const user = rows[0];
    let valid = false;
    if (user.contraseña && user.contraseña.startsWith('$2')) {
      valid = await bcrypt.compare(contraseña, user.contraseña);
    } else {
      valid = contraseña === user.contraseña;
    }
    if (!valid) return res.status(401).json({ error: 'Credenciales incorrectas' });

    const token = jwt.sign(
      { id: user.id_usuario, nombre: user.nombre_completo, rol: user.rol, usuario: user.nombre_usuario },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );
    res.json({
      token,
      user: {
        id: user.id_usuario,
        nombre: user.nombre_completo,
        usuario: user.nombre_usuario,
        correo: user.correo_electronico,
        telefono: user.telefono,
        rol: user.rol,
        avatar_color:   user.avatar_color   || null,
        avatar_letra:   user.avatar_letra   || null,
        avatar_url:     user.avatar_url     || null,
        primer_ingreso: user.primer_ingreso ?? false,
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

// Get own profile
const getProfile = async (req, res) => {
  try {
    const { rows: rows } = await pool.query(
      `SELECT u.id_usuario, u.nombre_completo, u.nombre_usuario, u.correo_electronico,
              u.telefono, u.fecha_creacion, u.avatar_color, u.avatar_letra, u.avatar_url,
              r.nombre as rol
       FROM usuarios u JOIN roles r ON u.id_rol=r.id_rol
       WHERE u.id_usuario=$1`, [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener perfil' });
  }
};

// Update own profile (name, email, phone, password, avatar)
const updateProfile = async (req, res) => {
  const { nombre_completo, correo_electronico, telefono, contraseña, avatar_color, avatar_letra, avatar_url } = req.body;
  try {
    if (contraseña && contraseña.trim()) {
      const hash = await bcrypt.hash(contraseña, 10);
      await pool.query(
        `UPDATE usuarios SET nombre_completo=$1, correo_electronico=$2, telefono=$3, contraseña=$4,
         avatar_color=$5, avatar_letra=$6, avatar_url=$7 WHERE id_usuario=$8`,
        [nombre_completo, correo_electronico, telefono, hash, avatar_color||null, avatar_letra||null, avatar_url||null, req.user.id]
      );
    } else {
      await pool.query(
        `UPDATE usuarios SET nombre_completo=$1, correo_electronico=$2, telefono=$3,
         avatar_color=$4, avatar_letra=$5, avatar_url=$6 WHERE id_usuario=$7`,
        [nombre_completo, correo_electronico, telefono, avatar_color||null, avatar_letra||null, avatar_url||null, req.user.id]
      );
    }
    // Return updated data
    const { rows: rows } = await pool.query(
      `SELECT u.id_usuario, u.nombre_completo, u.nombre_usuario, u.correo_electronico,
              u.telefono, u.avatar_color, u.avatar_letra, u.avatar_url, r.nombre as rol
       FROM usuarios u JOIN roles r ON u.id_rol=r.id_rol WHERE u.id_usuario=$1`, [req.user.id]
    );
    res.json({ message: 'Perfil actualizado', user: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar perfil' });
  }
};

// Public self-registration (creates Usuario role, not admin)
const registro = async (req, res) => {
  const { nombre_completo, nombre_usuario, correo_electronico, telefono, contraseña } = req.body;
  if (!nombre_completo || !nombre_usuario || !correo_electronico || !contraseña)
    return res.status(400).json({ error: 'Nombre, usuario, correo y contraseña son requeridos' });
  if (contraseña.length < 6)
    return res.status(400).json({ error: 'La contraseña debe tener mínimo 6 caracteres' });
  try {
    const hash = await bcrypt.hash(contraseña, 10);
    // id_rol=2 = Usuario (no admin)
    const { rows: r } = await pool.query(
      `INSERT INTO usuarios (nombre_completo, nombre_usuario, correo_electronico, telefono, contraseña, id_rol, estado)
       VALUES ($1,$2,$3,$4,$5,2,'activo') RETURNING id_usuario`,
      [nombre_completo, nombre_usuario.toLowerCase().trim(), correo_electronico.toLowerCase().trim(), telefono||null, hash]
    );
    res.status(201).json({ ok: true, message: 'Usuario registrado exitosamente', id_usuario: r[0].id_usuario });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'El usuario o correo ya está registrado' });
    console.error(err);
    res.status(500).json({ error: 'Error al registrar usuario' });
  }
};

// Cambiar contraseña validando la actual
const cambiarPassword = async (req, res) => {
  const { contrasena_actual, contrasena_nueva } = req.body;
  if (!contrasena_actual || !contrasena_nueva)
    return res.status(400).json({ error: 'Se requieren contraseña actual y nueva' });
  if (contrasena_nueva.length < 6)
    return res.status(400).json({ error: 'La nueva contraseña debe tener mínimo 6 caracteres' });
  try {
    const { rows } = await pool.query(
      `SELECT contraseña FROM usuarios WHERE id_usuario=$1`, [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    const actual = rows[0].contraseña;
    let valida = false;
    if (actual && actual.startsWith('$2')) {
      valida = await bcrypt.compare(contrasena_actual, actual);
    } else {
      valida = contrasena_actual === actual;
    }
    if (!valida) return res.status(401).json({ error: 'La contraseña actual es incorrecta' });

    const hash = await bcrypt.hash(contrasena_nueva, 10);
    await pool.query(`UPDATE usuarios SET contraseña=$1 WHERE id_usuario=$2`, [hash, req.user.id]);
    res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al cambiar contraseña' });
  }
};

module.exports = { login, getProfile, updateProfile, cambiarPassword, registro };
