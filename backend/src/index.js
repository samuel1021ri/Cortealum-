require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const routes = require('./routes');
const { runMigrations }        = require('./config/migrations');
const { runMigrationsResiduos } = require('./config/migrationsResiduos');
const { runMigrationsOptimizacion } = require('./config/migrationsOptimizacion');

const app = express();
const PORT = process.env.PORT || 5000;

// ── Seguridad ──────────────────────────────────────────────────────────────
app.set('trust proxy', 1); // Confiar en el primer proxy (necesario para rate-limit detrás de Supabase/nginx)
// crossOriginResourcePolicy: 'cross-origin' → permite que las imágenes de
// /uploads se vean desde el frontend en Vercel (helmet por defecto las bloquea
// con CORP same-origin cuando front y back están en dominios distintos).
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,       // 1 minuto
  max: 5,                     // máx 5 intentos por IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de login. Espera 1 minuto.' },
});

// FRONTEND_URL admite varias URLs separadas por coma (ej: producción Vercel + localhost)
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Aplicar rate limit solo al endpoint de login
app.use('/api/auth/login', loginLimiter);

// FIX (clarificado por el usuario "subir fotos a materiales"):
// servir las imágenes subidas a /uploads/materiales/ como archivos estáticos.
// Path absoluto desde backend/src/ → ../../uploads/
const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/api', routes);

app.get('/', (req, res) => res.json({ message: 'CorteAlu API v1.0' }));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// Ejecutar migraciones automáticas al arrancar
(async () => {
  await runMigrations().catch(err => console.error('❌ Error en migraciones:', err.message));
  await runMigrationsResiduos().catch(err => console.error('❌ Error en migraciones residuos:', err.message));
  await runMigrationsOptimizacion().catch(err => console.error('❌ Error en migraciones optimización:', err.message));
})();

app.listen(PORT, () => {
  console.log(`🚀 CorteAlu Backend corriendo en http://localhost:${PORT}`);
});
