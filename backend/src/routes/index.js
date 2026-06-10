const express = require('express');
const router = express.Router();
const { authMiddleware, adminOnly } = require('../middleware/auth');
const requirePassword = require('../middleware/requirePassword');
const authCtrl = require('../controllers/authController');
const proyectosCtrl = require('../controllers/proyectosController');
const ventanasCtrl = require('../controllers/ventanasController');
const cotizacionesCtrl = require('../controllers/cotizacionesController');
const materialesCtrl = require('../controllers/materialesController');
const usuariosCtrl = require('../controllers/usuariosController');
const catalogosCtrl   = require('../controllers/catalogosController');
const residuosCtrl    = require('../controllers/residuosController');
const optimizacionCtrl = require('../controllers/optimizacionController');
const searchCtrl    = require('../controllers/searchController');
const auditLogCtrl  = require('../controllers/auditLogController');
const reportesCtrl  = require('../controllers/reportesController');

// Roles (needed for Usuarios page)
const pool = require('../config/db');
router.get('/roles', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM roles ORDER BY id_rol');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Error al listar roles' }); }
});

// Auth
router.post('/auth/login', authCtrl.login);
router.get('/auth/profile', authMiddleware, authCtrl.getProfile);
router.put('/auth/profile', authMiddleware, authCtrl.updateProfile);
router.get('/auth/perfil', authMiddleware, authCtrl.getProfile);
router.put('/auth/perfil', authMiddleware, authCtrl.updateProfile);
router.post('/auth/cambiar-password', authMiddleware, authCtrl.cambiarPassword);

// Catálogos
router.get('/sistemas', authMiddleware, catalogosCtrl.listarSistemas);
router.get('/perfiles', authMiddleware, catalogosCtrl.listarPerfiles);
router.get('/disenos', authMiddleware, catalogosCtrl.listarDisenos);
router.post('/sistemas', authMiddleware, adminOnly, catalogosCtrl.crearSistema);
router.put('/sistemas/:id', authMiddleware, adminOnly, catalogosCtrl.actualizarSistema);
router.delete('/sistemas/:id', authMiddleware, adminOnly, requirePassword, catalogosCtrl.eliminarSistema);
router.post('/perfiles', authMiddleware, adminOnly, catalogosCtrl.crearPerfil);
router.put('/perfiles/:id', authMiddleware, adminOnly, catalogosCtrl.actualizarPerfil);
router.delete('/perfiles/:id', authMiddleware, adminOnly, requirePassword, catalogosCtrl.eliminarPerfil);
router.post('/disenos', authMiddleware, adminOnly, catalogosCtrl.crearDiseno);
router.put('/disenos/:id', authMiddleware, adminOnly, catalogosCtrl.actualizarDiseno);
router.delete('/disenos/:id', authMiddleware, adminOnly, requirePassword, catalogosCtrl.eliminarDiseno);

// Proyectos
router.post('/proyectos', authMiddleware, proyectosCtrl.crear);
router.get('/proyectos', authMiddleware, proyectosCtrl.listar);
router.get('/proyectos/metricas', authMiddleware, proyectosCtrl.metricas);
router.get('/proyectos/:id', authMiddleware, proyectosCtrl.obtener);
router.put('/proyectos/:id', authMiddleware, proyectosCtrl.actualizar);
router.post('/proyectos/:id/duplicar', authMiddleware, proyectosCtrl.duplicar);
router.delete('/proyectos/:id', authMiddleware, requirePassword, proyectosCtrl.eliminar);
router.get('/proyectos/:id/historial', authMiddleware, proyectosCtrl.historial);

// Compartir proyectos
router.get('/proyectos/:id/accesos', authMiddleware, proyectosCtrl.listarAccesos);
router.post('/proyectos/:id/compartir', authMiddleware, proyectosCtrl.compartir);
router.delete('/proyectos/:id/accesos/:id_usuario', authMiddleware, proyectosCtrl.quitarAcceso);
router.get('/proyectos/:id/usuarios-disponibles', authMiddleware, proyectosCtrl.usuariosDisponibles);

// Resumen de ventanas sin reporte por proyecto
router.get('/ventanas/pendientes', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.id_proyecto, p.nombre_proyecto, p.estado,
              COUNT(*) FILTER (WHERE v.reporte_generado = FALSE) as sin_reporte,
              COUNT(*) as total
       FROM proyectos p
       JOIN ventanas v ON v.id_proyecto = p.id_proyecto
       WHERE p.id_usuario_creador = $1
       GROUP BY p.id_proyecto, p.nombre_proyecto, p.estado
       HAVING COUNT(*) FILTER (WHERE v.reporte_generado = FALSE) > 0
       ORDER BY p.fecha_creacion DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Error' }); }
});

// Ventanas
router.post('/ventanas/simular', authMiddleware, ventanasCtrl.simular);
router.get('/ventanas/reportes', authMiddleware, ventanasCtrl.listarReportes);
router.post('/ventanas', authMiddleware, ventanasCtrl.crear);
router.get('/ventanas/proyecto/:id_proyecto', authMiddleware, ventanasCtrl.listarPorProyecto);
router.put('/ventanas/:id', authMiddleware, ventanasCtrl.actualizar);
router.delete('/ventanas/:id', authMiddleware, requirePassword, ventanasCtrl.eliminar);
router.post('/ventanas/:id/reporte', authMiddleware, ventanasCtrl.generarReporte);
router.delete('/ventanas/:id/reporte', authMiddleware, ventanasCtrl.eliminarReporte);
router.get('/ventanas/:id/materiales', authMiddleware, ventanasCtrl.getMaterialesUsados);

// Cotizaciones
router.get('/cotizaciones/preview/:id_proyecto', authMiddleware, cotizacionesCtrl.previewMateriales);
router.post('/cotizaciones/proyecto/:id_proyecto', authMiddleware, cotizacionesCtrl.generarCotizacion);
router.get('/cotizaciones', authMiddleware, cotizacionesCtrl.listar);
router.get('/cotizaciones/:id', authMiddleware, cotizacionesCtrl.obtener);
router.delete('/cotizaciones/:id', authMiddleware, requirePassword, cotizacionesCtrl.eliminar);
router.patch('/cotizaciones/:id/oficial', authMiddleware, cotizacionesCtrl.marcarOficial);

// PDF profesional
router.get('/cotizaciones/:id/pdf',     authMiddleware, cotizacionesCtrl.generarPDF);
router.get('/cotizaciones/:id/preview', authMiddleware, cotizacionesCtrl.previewProjectQuotation);

// Reportes técnicos (consolidado / por ventana): HTML armado en el front → PDF real
router.post('/reportes/pdf',            authMiddleware, reportesCtrl.renderPDF);

// Stock bajo (usa stock_minimo del material, no valor hardcodeado)
router.get('/materiales/stock-bajo', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id_material, nombre_material,
              COALESCE(stock_disponible,0) AS stock_actual,
              COALESCE(stock_minimo,0)     AS stock_minimo,
              unidad_medida
       FROM materiales
       WHERE estado='activo'
         AND COALESCE(stock_disponible,0) < GREATEST(COALESCE(stock_minimo,0), 1)
       ORDER BY (COALESCE(stock_disponible,0) - COALESCE(stock_minimo,0)) ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error('[stock-bajo]', err.message);
    res.json([]); // nunca romper el frontend con 500
  }
});

// Materiales
router.get('/materiales', authMiddleware, materialesCtrl.listar);
router.post('/materiales', authMiddleware, adminOnly, materialesCtrl.crear);
router.put('/materiales/:id', authMiddleware, adminOnly, materialesCtrl.actualizar);
router.delete('/materiales/:id', authMiddleware, adminOnly, requirePassword, materialesCtrl.eliminar);
router.post('/materiales/:id/ajustar-stock', authMiddleware, adminOnly, materialesCtrl.ajustarStock);
router.get('/materiales/:id/historial-stock', authMiddleware, materialesCtrl.historialStock);
// FIX (clarificado por el usuario "subir fotos a materiales"):
router.post('/materiales/:id/imagen', authMiddleware, adminOnly, materialesCtrl.subirImagen);

// Auth extra
// Marcar primer_ingreso=false cuando el usuario elige "Continuar con contraseña actual"
router.put('/usuarios/:id/omitir-primer-ingreso', authMiddleware, async (req, res) => {
  const { id } = req.params;
  if (parseInt(id) !== req.user.id)
    return res.status(403).json({ error: 'No autorizado' });
  const pool = require('../config/db');
  try {
    await pool.query(
      'UPDATE usuarios SET primer_ingreso=FALSE, fecha_edicion=NOW() WHERE id_usuario=$1',
      [id]
    );
    res.json({ ok: true });
  } catch(err) { res.status(500).json({ error: 'Error al actualizar' }); }
});

router.put('/usuarios/:id/cambiar-password-primer-ingreso', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { contraseña } = req.body;
  if (!contraseña || contraseña.length < 8)
    return res.status(400).json({ error: 'La contraseña debe tener mínimo 8 caracteres' });
  // Solo el propio usuario puede cambiar su contraseña de primer ingreso
  if (parseInt(id) !== req.user.id)
    return res.status(403).json({ error: 'No autorizado' });
  const pool = require('../config/db');
  const bcrypt = require('bcryptjs');
  try {
    const hash = await bcrypt.hash(contraseña, 10);
    await pool.query(
      'UPDATE usuarios SET contraseña=$1, primer_ingreso=FALSE, fecha_edicion=NOW() WHERE id_usuario=$2',
      [hash, id]
    );
    res.json({ ok: true, message: 'Contraseña actualizada' });
  } catch(err) { res.status(500).json({ error: 'Error al actualizar contraseña' }); }
});

// Usuarios — rutas estáticas ANTES de las rutas con :id (evita conflictos Express)
router.get('/usuarios',                       authMiddleware, adminOnly, usuariosCtrl.listar);
router.post('/usuarios',                      authMiddleware, adminOnly, usuariosCtrl.crear);
router.post('/usuarios/bulk-action',          authMiddleware, adminOnly, usuariosCtrl.accionMasiva);
router.post('/usuarios/importar',             authMiddleware, adminOnly, usuariosCtrl.upload.single('archivo'), usuariosCtrl.importar);
router.get('/usuarios/plantilla',             authMiddleware, adminOnly, usuariosCtrl.descargarPlantilla);
router.get('/usuarios/auditoria',             authMiddleware, adminOnly, usuariosCtrl.getAuditoria);
router.put('/usuarios/:id',                   authMiddleware, adminOnly, usuariosCtrl.actualizar);
router.delete('/usuarios/:id',                authMiddleware, adminOnly, requirePassword, usuariosCtrl.eliminar);
router.patch('/usuarios/:id/toggle',          authMiddleware, adminOnly, usuariosCtrl.toggleEstado);
router.patch('/usuarios/:id/estado',          authMiddleware, adminOnly, usuariosCtrl.cambiarEstado);

// ─── Residuos Reutilizables ────────────────────────────────────────────────────
router.get('/residuos/metricas',          authMiddleware, residuosCtrl.metricas);
router.get('/residuos/buscar',            authMiddleware, residuosCtrl.buscar);
router.get('/residuos/recomendaciones',   authMiddleware, residuosCtrl.recomendaciones);
router.get('/residuos/config',            authMiddleware, residuosCtrl.getConfigAll);
router.put('/residuos/config',            authMiddleware, adminOnly, residuosCtrl.updateConfig);
router.get('/residuos',                   authMiddleware, residuosCtrl.listar);
router.get('/residuos/:id/detalle',       authMiddleware, residuosCtrl.obtenerDetalle);
router.post('/residuos',                  authMiddleware, residuosCtrl.registrar);
router.post('/residuos/batch',            authMiddleware, residuosCtrl.registrarBatch);
router.post('/residuos/:id/reservar',     authMiddleware, residuosCtrl.reservar);
router.post('/residuos/:id/liberar',      authMiddleware, residuosCtrl.liberar);
router.post('/residuos/:id/usar',         authMiddleware, residuosCtrl.usar);
router.delete('/residuos/:id',            authMiddleware, requirePassword, residuosCtrl.descartar);

// ─── Optimización de Cortes ─────────────────────────────────────────────────
router.post('/optimizacion/proyecto/:id',           authMiddleware, optimizacionCtrl.optimizarProyecto);
router.post('/optimizacion/proyecto/:id/confirmar', authMiddleware, optimizacionCtrl.confirmarPlan);
router.get('/optimizacion/proyecto/:id/planes',     authMiddleware, optimizacionCtrl.listarPlanes);
router.get('/optimizacion/proyecto/:id/plan-pdf',   authMiddleware, optimizacionCtrl.generarPDFPlan);
router.get('/optimizacion/plan/:id',              authMiddleware, optimizacionCtrl.obtenerPlan);

// Barras estándar (configuración)
router.get('/barras-estandar',                authMiddleware, optimizacionCtrl.listarBarras);
router.post('/barras-estandar',               authMiddleware, adminOnly, optimizacionCtrl.crearBarra);
router.put('/barras-estandar/:id',            authMiddleware, adminOnly, optimizacionCtrl.actualizarBarra);
router.delete('/barras-estandar/:id',         authMiddleware, adminOnly, requirePassword, optimizacionCtrl.eliminarBarra);

// ─── TIER S: Workflow + Audit + Búsqueda global ─────────────────────────────
// Cambiar estado de cotización (workflow): borrador → enviada → aceptada → ...
router.patch('/cotizaciones/:id/estado',      authMiddleware, cotizacionesCtrl.cambiarEstado);

// Búsqueda global (Ctrl+K) — todos los usuarios autenticados
router.get('/search',                         authMiddleware, searchCtrl.buscar);

// Audit log — solo admin
router.get('/audit-log',                      authMiddleware, adminOnly, auditLogCtrl.listar);

module.exports = router;
