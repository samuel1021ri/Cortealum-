const pool = require('../config/db');

// Helper: verificar si tabla historial_stock existe
async function tablaHistorialStockExiste() {
  try {
    const { rows } = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name='historial_stock' LIMIT 1`
    );
    return rows.length > 0;
  } catch { return false; }
}

const listar = async (req, res) => {
  try {
    // Detectar si la columna created_at existe en `materiales`
    // (algunas instalaciones la tienen, otras no — evita el error 42703)
    let tieneCreatedAt = false;
    try {
      const { rows: cols } = await pool.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_name='materiales' AND column_name='created_at' LIMIT 1`
      );
      tieneCreatedAt = cols.length > 0;
    } catch { /* asumimos que NO la tiene */ }

    const selectCreated = tieneCreatedAt ? ', created_at' : '';
    const { rows } = await pool.query(
      `SELECT id_material, nombre_material, unidad_medida, proveedor,
              COALESCE(stock_disponible,0) AS stock_disponible,
              COALESCE(stock_minimo,0)     AS stock_minimo,
              costo_unitario, estado,
              descripcion, imagen_url${selectCreated}
       FROM materiales WHERE estado='activo' ORDER BY nombre_material`
    );
    res.json(rows);
  } catch (err) {
    console.error('[listar materiales ERROR]', err.message, err.code);
    // Fallback: intentar con SELECT * en caso de que alguna columna no exista
    try {
      const { rows } = await pool.query(`SELECT * FROM materiales WHERE estado='activo' ORDER BY nombre_material`);
      res.json(rows);
    } catch (err2) {
      console.error('[listar materiales FALLBACK ERROR]', err2.message);
      res.status(500).json({ error: 'Error al listar materiales: ' + err2.message });
    }
  }
};

const crear = async (req, res) => {
  const { nombre_material, unidad_medida, proveedor, stock_disponible, costo_unitario, stock_minimo } = req.body;
  if (!nombre_material || !costo_unitario) return res.status(400).json({ error: 'Nombre y costo requeridos' });
  try {
    const { rows: r } = await pool.query(
      `INSERT INTO materiales (nombre_material, unidad_medida, proveedor, stock_disponible, stock_minimo, costo_unitario, descripcion, imagen_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id_material`,
      [nombre_material, unidad_medida || null, proveedor || null, stock_disponible || 0, stock_minimo || 0, costo_unitario, req.body.descripcion || null, req.body.imagen_url || null]
    );
    res.status(201).json({ id_material: r[0].id_material });
  } catch (err) {
    console.error('[crear material ERROR]', err);
    if (err.code === '23505') return res.status(400).json({ error: 'Material ya existe' });
    res.status(500).json({ error: 'Error al crear material' });
  }
};

const actualizar = async (req, res) => {
  const { id } = req.params;
  const { nombre_material, unidad_medida, proveedor, stock_disponible, costo_unitario, estado, stock_minimo, descripcion, imagen_url } = req.body;
  try {
    await pool.query(
      `UPDATE materiales SET nombre_material=$1, unidad_medida=$2, proveedor=$3, stock_disponible=$4, stock_minimo=$5, costo_unitario=$6, estado=$7, descripcion=$8, imagen_url=COALESCE($9, imagen_url) WHERE id_material=$10`,
      [nombre_material, unidad_medida, proveedor, stock_disponible, stock_minimo ?? 0, costo_unitario, estado || 'activo', descripcion ?? null, imagen_url ?? null, id]
    );
    res.json({ message: 'Material actualizado' });
  } catch (err) {
    console.error('[actualizar material ERROR]', err.message);
    res.status(500).json({ error: 'Error al actualizar material' });
  }
};

const eliminar = async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query(`UPDATE materiales SET estado='inactivo' WHERE id_material=$1`, [id]);
    res.json({ message: 'Material desactivado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar material' });
  }
};

// Ajuste manual de stock
const ajustarStock = async (req, res) => {
  const { id } = req.params;
  const { cantidad, motivo } = req.body;
  if (cantidad === undefined || cantidad === null)
    return res.status(400).json({ error: 'Se requiere cantidad' });
  if (!motivo || !motivo.trim())
    return res.status(400).json({ error: 'Se requiere motivo del ajuste' });

  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');

    const { rows: mat } = await conn.query(
      `SELECT stock_disponible FROM materiales WHERE id_material=$1`, [id]
    );
    if (!mat.length) { await conn.query('ROLLBACK'); return res.status(404).json({ error: 'Material no encontrado' }); }

    const stockAnterior = parseFloat(mat[0].stock_disponible);
    const cantidadNum   = parseFloat(cantidad);
    const stockNuevo    = stockAnterior + cantidadNum;

    if (stockNuevo < 0) { await conn.query('ROLLBACK'); return res.status(400).json({ error: 'El ajuste dejaría el stock en negativo' }); }

    await conn.query(
      `UPDATE materiales SET stock_disponible=$1 WHERE id_material=$2`,
      [stockNuevo, id]
    );

    // Registrar en historial_stock si la tabla existe
    const tieneHistorial = await tablaHistorialStockExiste();
    if (tieneHistorial) {
      await conn.query(
        `INSERT INTO historial_stock (id_material, tipo, cantidad, stock_anterior, stock_nuevo, motivo, id_usuario)
         VALUES ($1,'ajuste_manual',$2,$3,$4,$5,$6)`,
        [id, cantidadNum, stockAnterior, stockNuevo, motivo.trim(), req.user.id]
      );
    }

    await conn.query('COMMIT');
    res.json({
      message: 'Stock ajustado',
      stock_anterior: stockAnterior,
      stock_nuevo: stockNuevo,
      diferencia: cantidadNum,
    });
  } catch (err) {
    await conn.query('ROLLBACK');
    console.error('[ajustar stock]', err);
    res.status(500).json({ error: 'Error al ajustar stock: ' + err.message });
  } finally { conn.release(); }
};

// Historial de movimientos de stock
const historialStock = async (req, res) => {
  const { id } = req.params;
  const tieneHistorial = await tablaHistorialStockExiste();
  if (!tieneHistorial) return res.json([]);
  try {
    const { rows } = await pool.query(
      `SELECT hs.*, u.nombre_completo as nombre_usuario, m.nombre_material
       FROM historial_stock hs
       LEFT JOIN usuarios u ON u.id_usuario = hs.id_usuario
       LEFT JOIN materiales m ON m.id_material = hs.id_material
       WHERE hs.id_material = $1
       ORDER BY hs.fecha DESC
       LIMIT 100`,
      [id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener historial: ' + err.message });
  }
};

// SUBIR IMAGEN DE MATERIAL — guarda en /uploads/materiales/ y retorna URL
// FIX (clarificado por el usuario "que puedan subir fotos"):
// multer en memoria, validamos tipo, escribimos al disco con nombre seguro.
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

const uploadDir = path.join(__dirname, '../../uploads/materiales');
fs.mkdirSync(uploadDir, { recursive: true });

const uploadImagenMw = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },   // 5 MB
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|jpg|png|webp|gif)$/i.test(file.mimetype);
    cb(ok ? null : new Error('Solo se aceptan imágenes JPG/PNG/WebP/GIF'), ok);
  },
}).single('imagen');

const subirImagen = (req, res) => {
  uploadImagenMw(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No se recibió imagen' });
    const { id } = req.params;
    const ext = (req.file.mimetype.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const filename = `mat_${id}_${Date.now()}.${ext}`;
    const fullPath = path.join(uploadDir, filename);
    try {
      fs.writeFileSync(fullPath, req.file.buffer);
      const urlPublica = `/uploads/materiales/${filename}`;
      await pool.query(
        `UPDATE materiales SET imagen_url=$1 WHERE id_material=$2`,
        [urlPublica, id]
      );
      res.json({ ok: true, imagen_url: urlPublica });
    } catch (e) {
      console.error('[material:subirImagen]', e);
      res.status(500).json({ error: 'Error al guardar la imagen' });
    }
  });
};

module.exports = { listar, crear, actualizar, eliminar, ajustarStock, historialStock, subirImagen };

