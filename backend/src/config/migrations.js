/**
 * CorteAlu — Auto-Migraciones
 * Se ejecuta al arrancar el servidor y agrega columnas faltantes de forma segura.
 * Nunca borra datos ni tablas existentes.
 */
const pool = require('./db');

const migrations = [
  // ── proyectos ────────────────────────────────────────────────────────────
  `ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS fecha_inicio_real TIMESTAMPTZ DEFAULT NULL`,
  `ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS fecha_fin_real    TIMESTAMPTZ DEFAULT NULL`,
  `ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS duracion_dias     INT         DEFAULT NULL`,
  // Unidad de medida preferida del proyecto: 'cm' o 'mm'.
  // Se respeta en PDFs, cotizaciones, fórmulas y cálculos de vidrio.
  `ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS unidad_default    VARCHAR(4)  DEFAULT 'cm'`,

  // ── WORKFLOW DE COTIZACIÓN ─────────────────────────────────────────────
  // Estados: borrador → enviada → aceptada → convertida (a orden de producción)
  //          |       → rechazada
  //          → cancelada (desde cualquier estado no-final)
  // Las transiciones se validan en el backend.
  `ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS estado_workflow VARCHAR(20) DEFAULT 'borrador'`,
  `ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS fecha_enviada    TIMESTAMPTZ DEFAULT NULL`,
  `ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS fecha_aceptada   TIMESTAMPTZ DEFAULT NULL`,
  `ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS fecha_convertida TIMESTAMPTZ DEFAULT NULL`,
  `ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS motivo_estado    TEXT        DEFAULT NULL`,

  // ── AUDIT LOG (tabla genérica) ─────────────────────────────────────────
  // Registra acciones críticas: quién, qué, cuándo, sobre qué entidad, cambios.
  `CREATE TABLE IF NOT EXISTS audit_log (
    id_log        SERIAL PRIMARY KEY,
    id_usuario    INT REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
    nombre_usuario VARCHAR(180),
    accion        VARCHAR(40) NOT NULL,
    entidad       VARCHAR(40) NOT NULL,
    entidad_id    INT,
    descripcion   TEXT,
    cambios       JSONB,
    ip            VARCHAR(45),
    user_agent    TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_audit_log_entidad  ON audit_log (entidad, entidad_id)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_log_usuario  ON audit_log (id_usuario, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_log_created  ON audit_log (created_at DESC)`,

  // ── BÚSQUEDA GLOBAL — índices trigram para LIKE rápido ─────────────────
  // Activamos pg_trgm si no está. Si falla por permisos, el sistema usa LIKE normal.
  `CREATE EXTENSION IF NOT EXISTS pg_trgm`,
  `CREATE INDEX IF NOT EXISTS idx_search_proyecto_nombre  ON proyectos       USING gin (nombre_proyecto gin_trgm_ops)`,
  `CREATE INDEX IF NOT EXISTS idx_search_proyecto_cliente ON proyectos       USING gin (nombre_cliente  gin_trgm_ops)`,
  `CREATE INDEX IF NOT EXISTS idx_search_material_nombre  ON materiales      USING gin (nombre_material  gin_trgm_ops)`,

  // ── usuarios ─────────────────────────────────────────────────────────────
  `ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS estado       VARCHAR(10)  DEFAULT 'activo'`,
  `ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS avatar_color VARCHAR(120) DEFAULT NULL`,
  `ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS avatar_letra VARCHAR(4)   DEFAULT NULL`,
  `ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS avatar_url   TEXT         DEFAULT NULL`,
  `ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefono     VARCHAR(20)  DEFAULT NULL`,

  // ── historial_proyectos ──────────────────────────────────────────────────
  `ALTER TABLE historial_proyectos ADD COLUMN IF NOT EXISTS id_usuario INT DEFAULT NULL`,

  // ── ventanas ─────────────────────────────────────────────────────────────
  `ALTER TABLE ventanas ADD COLUMN IF NOT EXISTS reporte_generado  BOOLEAN      NOT NULL DEFAULT FALSE`,
  `ALTER TABLE ventanas ADD COLUMN IF NOT EXISTS notas             TEXT         DEFAULT NULL`,
  `ALTER TABLE ventanas ADD COLUMN IF NOT EXISTS color_perfil      VARCHAR(60)  DEFAULT NULL`,
  `ALTER TABLE ventanas ADD COLUMN IF NOT EXISTS referencia_vidrio VARCHAR(5)   DEFAULT '5MM'`,

  // ── ventanas: campos de vidrio para cotización m² y nombre de ventana ───
  `ALTER TABLE ventanas ADD COLUMN IF NOT EXISTS precio_vidrio_m2 NUMERIC(12,2) DEFAULT 0`,
  `ALTER TABLE ventanas ADD COLUMN IF NOT EXISTS tipo_vidrio      VARCHAR(120)  DEFAULT NULL`,
  `ALTER TABLE ventanas ADD COLUMN IF NOT EXISTS nombre           VARCHAR(120)  DEFAULT NULL`,

  // ── ventanas: unidad ORIGINAL ingresada por el usuario (cm | mm) ────────
  // El valor en BD siempre se guarda en cm; estas columnas solo recuerdan
  // qué unidad eligió el usuario para reconstruir la UI al editar.
  `ALTER TABLE ventanas ADD COLUMN IF NOT EXISTS ancho_unidad VARCHAR(4) DEFAULT 'cm'`,
  `ALTER TABLE ventanas ADD COLUMN IF NOT EXISTS alto_unidad  VARCHAR(4) DEFAULT 'cm'`,

  // ── catálogos: estado ────────────────────────────────────────────────────
  `ALTER TABLE perfiles           ADD COLUMN IF NOT EXISTS estado VARCHAR(10) DEFAULT 'activo'`,
  `ALTER TABLE "diseños"          ADD COLUMN IF NOT EXISTS estado VARCHAR(10) DEFAULT 'activo'`,
  `ALTER TABLE sistemas_ventaneria ADD COLUMN IF NOT EXISTS estado VARCHAR(10) DEFAULT 'activo'`,

  // ── materiales ───────────────────────────────────────────────────────────
  `ALTER TABLE materiales ADD COLUMN IF NOT EXISTS stock_minimo NUMERIC(10,2) DEFAULT 0`,
  // FIX (clarificado por el usuario "añadir descripción y subir fotos"):
  // Materiales pueden tener descripción larga (texto libre) y una foto de referencia
  // (URL relativa al archivo subido por el usuario en /uploads/materiales/)
  `ALTER TABLE materiales ADD COLUMN IF NOT EXISTS descripcion TEXT DEFAULT NULL`,
  `ALTER TABLE materiales ADD COLUMN IF NOT EXISTS imagen_url  VARCHAR(255) DEFAULT NULL`,

  // ══════════════════════════════════════════════════════════════════════════
  // ── cotizaciones: TODAS las columnas que el backend necesita ─────────────
  // ══════════════════════════════════════════════════════════════════════════
  `ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS version                         INT           DEFAULT 1`,
  `ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS subtotal_materiales             NUMERIC(14,2) DEFAULT 0`,
  `ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS recargo_materiales_pct          NUMERIC(5,2)  DEFAULT 25`,
  `ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS subtotal_materiales_con_recargo NUMERIC(14,2) DEFAULT 0`,
  `ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS valor_diario_mano_obra_oficial  NUMERIC(12,2) DEFAULT 0`,
  `ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS mano_obra_pct_adicional         NUMERIC(5,2)  DEFAULT 50`,
  `ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS valor_diario_mano_obra_aplicado NUMERIC(12,2) DEFAULT 0`,
  `ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS dias_proyectados                INT           DEFAULT 0`,
  `ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS subtotal_mano_obra              NUMERIC(14,2) DEFAULT 0`,
  `ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS utilidad_pct                    NUMERIC(5,2)  DEFAULT 30`,
  `ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS utilidad_valor                  NUMERIC(14,2) DEFAULT 0`,
  `ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS iva_pct                         NUMERIC(5,2)  DEFAULT 19`,
  `ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS iva_valor                       NUMERIC(14,2) DEFAULT 0`,
  `ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS total_final                     NUMERIC(14,2) DEFAULT 0`,
  `ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS notas                           TEXT          DEFAULT NULL`,
  `ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS fecha_cotizacion                TIMESTAMPTZ   DEFAULT NOW()`,
  `ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS es_oficial                      BOOLEAN       DEFAULT FALSE`,
  `ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS transporte_estructuras          NUMERIC(14,2) DEFAULT 0`,
  `ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS transporte_personal             NUMERIC(14,2) DEFAULT 0`,
  `ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS cantidad_personas               INT           DEFAULT 1`,

  // ── cotizacion_detalle_materiales: columnas nuevas ────────────────────────
  `ALTER TABLE cotizacion_detalle_materiales ADD COLUMN IF NOT EXISTS nombre_item              VARCHAR(200)  DEFAULT NULL`,
  `ALTER TABLE cotizacion_detalle_materiales ADD COLUMN IF NOT EXISTS cantidad_total           NUMERIC(12,4) DEFAULT 0`,
  `ALTER TABLE cotizacion_detalle_materiales ADD COLUMN IF NOT EXISTS precio_unitario_snapshot NUMERIC(12,2) DEFAULT 0`,
  `ALTER TABLE cotizacion_detalle_materiales ADD COLUMN IF NOT EXISTS color_perfil             VARCHAR(60)   DEFAULT NULL`,
  `ALTER TABLE cotizacion_detalle_materiales ADD COLUMN IF NOT EXISTS id_ventana               INT           DEFAULT NULL`,
  `ALTER TABLE cotizacion_detalle_materiales ADD COLUMN IF NOT EXISTS tipo_item                VARCHAR(30)   DEFAULT 'perfil'`,
  `ALTER TABLE cotizacion_detalle_materiales ADD COLUMN IF NOT EXISTS id_material              INT           DEFAULT NULL`,
  // ── NUEVO: separar cantidad de piezas (1,2,...) de cantidad_total (cm) ───
  // El usuario insistió: "una cosa es cantidad y otra es cálculo".
  // cantidad_piezas = número físico de piezas en el corte (ej. 2 jambas)
  // cantidad_total  = cm totales consumidos (ej. 38.0 = 2 × 19 cm)
  `ALTER TABLE cotizacion_detalle_materiales ADD COLUMN IF NOT EXISTS cantidad_piezas         INT           DEFAULT NULL`,
  // Asegurar que id_material permite NULL (puede tener NOT NULL en BD original)
  `ALTER TABLE cotizacion_detalle_materiales ALTER COLUMN id_material DROP NOT NULL`,
];

async function runMigrations() {
  const client = await pool.connect();
  let ok = 0;
  let fail = 0;
  try {
    for (const sql of migrations) {
      try {
        await client.query(sql);
        ok++;
      } catch (err) {
        // Ignorar errores de columna ya existente o restricciones duplicadas
        if (!err.message.includes('already exists') && !err.message.includes('ya existe')) {
          console.warn(`⚠️  Migración omitida: ${err.message.slice(0, 80)}`);
          fail++;
        }
      }
    }
    console.log(`✅ Auto-migraciones: ${ok} aplicadas${fail ? `, ${fail} omitidas` : ''}`);
  } finally {
    client.release();
  }
}


module.exports = { runMigrations };
