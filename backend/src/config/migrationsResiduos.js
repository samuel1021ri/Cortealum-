/**
 * migrationsResiduos.js — CorteAlu
 * Migraciones automáticas del módulo de Residuos Reutilizables v1.0
 * Se ejecuta al arrancar el servidor (llamado desde index.js)
 */
const pool = require('./db');

const migrationsResiduos = [
  // ── Configuración global ────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS config_residuos (
    id             SERIAL PRIMARY KEY,
    clave          VARCHAR(80)  NOT NULL UNIQUE,
    valor          TEXT         NOT NULL,
    descripcion    TEXT,
    actualizado_en TIMESTAMPTZ  DEFAULT NOW()
  )`,

  `INSERT INTO config_residuos (clave, valor, descripcion) VALUES
    ('minimo_reutilizable_cm', '20',  'Longitud mínima en cm para considerar un residuo reutilizable'),
    ('expiracion_reserva_min', '30',  'Minutos antes de que una reserva temporal expire automáticamente')
   ON CONFLICT (clave) DO NOTHING`,

  // FIX v40: limpieza del parámetro 'alerta_desperdicio_pct' que existía en
  // versiones previas. Era código muerto: se leía en residuosController pero
  // nunca se usaba para generar alertas. El optimizador (First Fit Decreasing
  // + Best Fit) ya escoge el mejor plan posible, así que un % de desperdicio
  // alto post-optimización no es un mal plan — es que no había más residuos
  // disponibles. Si la BD viene de una instalación vieja, este DELETE lo saca.
  `DELETE FROM config_residuos WHERE clave = 'alerta_desperdicio_pct'`,

  // ── Tabla principal de residuos ─────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS residuos_aluminio (
    id_residuo           SERIAL PRIMARY KEY,
    id_ventana           INT           REFERENCES ventanas(id_ventana)   ON DELETE SET NULL,
    id_proyecto_origen   INT           REFERENCES proyectos(id_proyecto)  ON DELETE SET NULL,
    id_material          INT           REFERENCES materiales(id_material) ON DELETE SET NULL,
    referencia_perfil    VARCHAR(20)   NOT NULL,
    color_perfil         VARCHAR(60),
    longitud_cm          NUMERIC(10,2) NOT NULL CHECK (longitud_cm > 0),
    longitud_original_cm NUMERIC(10,2),
    pieza_cortada_cm     NUMERIC(10,2),
    ubicacion_pieza      VARCHAR(80),
    estado               VARCHAR(20)   NOT NULL DEFAULT 'disponible'
                         CHECK (estado IN ('disponible','reservado','usado','expirado','descartado')),
    id_proyecto_uso      INT           REFERENCES proyectos(id_proyecto) ON DELETE SET NULL,
    id_ventana_uso       INT           REFERENCES ventanas(id_ventana)   ON DELETE SET NULL,
    reservado_hasta      TIMESTAMPTZ,
    creado_por           INT           REFERENCES usuarios(id_usuario)   ON DELETE SET NULL,
    creado_en            TIMESTAMPTZ   DEFAULT NOW(),
    actualizado_en       TIMESTAMPTZ   DEFAULT NOW(),
    notas                TEXT
  )`,

  // ── Historial de operaciones ────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS historial_residuos (
    id_historial        SERIAL PRIMARY KEY,
    id_residuo          INT           NOT NULL REFERENCES residuos_aluminio(id_residuo) ON DELETE CASCADE,
    evento              VARCHAR(40)   NOT NULL,
    longitud_antes_cm   NUMERIC(10,2),
    longitud_despues_cm NUMERIC(10,2),
    id_proyecto         INT           REFERENCES proyectos(id_proyecto) ON DELETE SET NULL,
    id_ventana          INT           REFERENCES ventanas(id_ventana)   ON DELETE SET NULL,
    id_usuario          INT           REFERENCES usuarios(id_usuario)   ON DELETE SET NULL,
    ahorro_estimado_cop NUMERIC(14,2) DEFAULT 0,
    notas               TEXT,
    creado_en           TIMESTAMPTZ   DEFAULT NOW()
  )`,

  // ── Índices ─────────────────────────────────────────────────────────────
  `CREATE INDEX IF NOT EXISTS idx_residuos_estado  ON residuos_aluminio(estado)`,
  `CREATE INDEX IF NOT EXISTS idx_residuos_perfil  ON residuos_aluminio(referencia_perfil)`,
  `CREATE INDEX IF NOT EXISTS idx_residuos_long    ON residuos_aluminio(longitud_cm)`,
  `CREATE INDEX IF NOT EXISTS idx_histres_residuo  ON historial_residuos(id_residuo)`,

  // ── FIX (instructor Marcel): para BDs existentes, agregar columna y índice
  //    de ubicacion_pieza. CREATE TABLE IF NOT EXISTS no agrega columnas a
  //    tablas ya creadas, así que necesitamos ALTER TABLE explícito.
  //    Sin esta columna, los residuos no pueden filtrarse por tipo de pieza
  //    (sillar, jamba, traslape...) y un residuo de sillar terminaría
  //    ofreciéndose a cortes de jamba — físicamente imposible.
  `ALTER TABLE residuos_aluminio ADD COLUMN IF NOT EXISTS ubicacion_pieza VARCHAR(80)`,
  `CREATE INDEX IF NOT EXISTS idx_residuos_ubicacion ON residuos_aluminio(ubicacion_pieza)`,

  // ── Función expiración automática ───────────────────────────────────────
  `CREATE OR REPLACE FUNCTION expirar_reservas_residuos() RETURNS INTEGER AS $$
   DECLARE n INTEGER;
   BEGIN
     UPDATE residuos_aluminio
     SET estado='disponible', id_proyecto_uso=NULL, id_ventana_uso=NULL,
         reservado_hasta=NULL, actualizado_en=NOW()
     WHERE estado='reservado' AND reservado_hasta IS NOT NULL AND reservado_hasta < NOW();
     GET DIAGNOSTICS n = ROW_COUNT;
     RETURN n;
   END; $$ LANGUAGE plpgsql`,

  // ── Vistas ──────────────────────────────────────────────────────────────
  // FIX clave (causa de "los residuos no aparecen en el banco"):
  // cuando una vista usa SELECT r.*, Postgres EXPANDE el * al MOMENTO DE
  // CREAR la vista. Si después se hace ALTER TABLE para agregar columnas
  // (como id_plan_corte, numero_barra, ubicacion_pieza), la vista NO las
  // refleja automáticamente — aunque CREATE OR REPLACE no falle.
  // Resultado: el endpoint /residuos hace "WHERE id_plan_corte IS NOT NULL"
  // contra la vista → error 42703 → toda la lista del banco devuelve 500.
  // Por eso pensabas que los residuos no se estaban guardando: SÍ se guardaban
  // en la tabla, pero el listar estaba roto.
  // Solución: DROP forzado antes de recrear, para que SELECT r.* re-expanda
  // con las columnas actuales de la tabla.
  `DROP VIEW IF EXISTS vista_residuos_banco CASCADE`,
  `CREATE VIEW vista_residuos_banco AS
   SELECT r.*,
     po.nombre_proyecto AS proyecto_origen, po.nombre_cliente AS cliente_origen,
     pu.nombre_proyecto AS proyecto_uso,    pu.nombre_cliente AS cliente_uso,
     uc.nombre_completo AS creado_por_nombre,
     v.ancho_vano, v.alto_vano,
     ROUND(r.longitud_cm / 60, 1) AS compatibilidad_estimada,
     CASE WHEN r.estado='reservado' AND r.reservado_hasta IS NOT NULL
       THEN EXTRACT(EPOCH FROM (r.reservado_hasta - NOW())) / 60
       ELSE NULL END AS minutos_reserva_restantes
   FROM residuos_aluminio r
   LEFT JOIN proyectos po ON r.id_proyecto_origen = po.id_proyecto
   LEFT JOIN proyectos pu ON r.id_proyecto_uso    = pu.id_proyecto
   LEFT JOIN usuarios  uc ON r.creado_por         = uc.id_usuario
   LEFT JOIN ventanas  v  ON r.id_ventana         = v.id_ventana`,

  `CREATE OR REPLACE VIEW vista_metricas_residuos AS
   SELECT
     COUNT(*)                                                AS total_residuos,
     COUNT(*) FILTER (WHERE estado='disponible')            AS disponibles,
     COUNT(*) FILTER (WHERE estado='reservado')             AS reservados,
     COUNT(*) FILTER (WHERE estado='usado')                 AS usados,
     COUNT(*) FILTER (WHERE estado='descartado')            AS descartados,
     COALESCE(SUM(longitud_cm) FILTER (WHERE estado='disponible'), 0) AS metros_disponibles_cm,
     COALESCE(SUM(longitud_cm) FILTER (WHERE estado='usado'),      0) AS metros_reutilizados_cm,
     COUNT(DISTINCT referencia_perfil)                      AS perfiles_distintos,
     CASE WHEN COUNT(*)>0
       THEN ROUND(COUNT(*) FILTER (WHERE estado IN ('usado','disponible','reservado'))::NUMERIC / COUNT(*)*100, 1)
       ELSE 0 END AS tasa_reutilizacion_pct
   FROM residuos_aluminio`,
];

async function runMigrationsResiduos() {
  const client = await pool.connect();
  let ok = 0, fail = 0;
  try {
    for (const sql of migrationsResiduos) {
      try {
        await client.query(sql);
        ok++;
      } catch (err) {
        if (!err.message.includes('already exists') && !err.message.includes('ya existe')) {
          console.warn(`⚠️  [Residuos] Migración omitida: ${err.message.slice(0, 100)}`);
          fail++;
        }
      }
    }
    console.log(`♻️  Migraciones Residuos: ${ok} aplicadas${fail ? `, ${fail} omitidas` : ''}`);
  } finally {
    client.release();
  }
}

module.exports = { runMigrationsResiduos };
