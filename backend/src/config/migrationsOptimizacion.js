/**
 * CorteAlum — Migraciones para optimización de cortes
 * ─────────────────────────────────────────────────────────────────────────────
 * Tabla `barras_estandar`: catálogo de longitudes de barras por perfil.
 * Esto le dice al optimizador qué barras puede asumir al cortar.
 *
 * Ejemplo: perfil 5020 viene en barras de 600 cm.
 *          perfil 8025 viene en barras de 700 cm.
 *
 * Si un perfil no tiene barras configuradas, el optimizador usa la barra
 * estándar por defecto (BARRA_ESTANDAR_DEFAULT_CM en constants.js).
 */

const pool = require('./db');

const migrationsOptimizacion = [
  `CREATE TABLE IF NOT EXISTS barras_estandar (
    id_barra        SERIAL PRIMARY KEY,
    id_perfil       INT REFERENCES perfiles(id_perfil) ON DELETE CASCADE,
    longitud_cm     NUMERIC(10,2) NOT NULL CHECK (longitud_cm > 0),
    es_default      BOOLEAN DEFAULT FALSE,
    activo          BOOLEAN DEFAULT TRUE,
    notas           TEXT,
    creado_en       TIMESTAMPTZ DEFAULT NOW()
  )`,

  // Una barra default por perfil
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_barras_default_por_perfil
    ON barras_estandar(id_perfil)
    WHERE es_default = TRUE`,

  `CREATE INDEX IF NOT EXISTS idx_barras_perfil_activo
    ON barras_estandar(id_perfil, activo)`,

  // Seed: si no hay barras, crear una de 600cm por defecto para cada perfil
  `INSERT INTO barras_estandar (id_perfil, longitud_cm, es_default, notas)
   SELECT p.id_perfil, 600, TRUE, 'Barra estándar de 6 metros (auto-creada)'
   FROM perfiles p
   WHERE NOT EXISTS (
     SELECT 1 FROM barras_estandar b WHERE b.id_perfil = p.id_perfil
   )`,

  // Tabla de planes de corte guardados (historial pedagógico)
  `CREATE TABLE IF NOT EXISTS planes_corte (
    id_plan          SERIAL PRIMARY KEY,
    id_proyecto      INT REFERENCES proyectos(id_proyecto) ON DELETE CASCADE,
    id_usuario       INT REFERENCES usuarios(id_usuario)   ON DELETE SET NULL,
    plan_json        JSONB NOT NULL,
    barras_nuevas    INT NOT NULL DEFAULT 0,
    residuos_usados  INT NOT NULL DEFAULT 0,
    desperdicio_pct  NUMERIC(5,2),
    creado_en        TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE INDEX IF NOT EXISTS idx_planes_corte_proyecto
    ON planes_corte(id_proyecto, creado_en DESC)`,

  // ── Trazabilidad: vincular residuos al plan que los generó ──────────────
  // Esto permite responder: "este residuo ¿de qué plan/barra/proyecto viene?"
  `ALTER TABLE residuos_aluminio
     ADD COLUMN IF NOT EXISTS id_plan_corte INT REFERENCES planes_corte(id_plan) ON DELETE SET NULL`,

  `ALTER TABLE residuos_aluminio
     ADD COLUMN IF NOT EXISTS numero_barra INT`,

  `CREATE INDEX IF NOT EXISTS idx_residuos_plan
    ON residuos_aluminio(id_plan_corte)`,
];

async function runMigrationsOptimizacion() {
  const client = await pool.connect();
  let ok = 0, fail = 0;
  try {
    for (const sql of migrationsOptimizacion) {
      try {
        await client.query(sql);
        ok++;
      } catch (err) {
        if (!err.message.includes('already exists') && !err.message.includes('ya existe')) {
          console.warn(`⚠️  [Optimización] Migración omitida: ${err.message.slice(0, 100)}`);
          fail++;
        }
      }
    }
    console.log(`✂️  Migraciones Optimización: ${ok} aplicadas${fail ? `, ${fail} omitidas` : ''}`);
  } finally {
    client.release();
  }
}

module.exports = { runMigrationsOptimizacion };
