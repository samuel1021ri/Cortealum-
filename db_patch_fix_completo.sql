-- CorteAlu — Patch Fix Completo
-- Ejecutar en Supabase SQL Editor
-- Agrega TODAS las columnas que el backend necesita, de forma segura (IF NOT EXISTS)

-- ── proyectos: columnas de máquina de estados ─────────────────────────────────
ALTER TABLE proyectos
  ADD COLUMN IF NOT EXISTS fecha_inicio_real TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS fecha_fin_real    TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS duracion_dias     INT         DEFAULT NULL;

-- Constraint de estados válidos
ALTER TABLE proyectos DROP CONSTRAINT IF EXISTS proyectos_estado_check;
ALTER TABLE proyectos ADD CONSTRAINT proyectos_estado_check
  CHECK (estado IN ('en progreso','completado','cancelado','en pausa'));

-- Llenar fecha_inicio_real para proyectos existentes
UPDATE proyectos
  SET fecha_inicio_real = COALESCE(fecha_inicio::timestamptz, fecha_creacion)
  WHERE fecha_inicio_real IS NULL;

-- ── usuarios: estado y avatar ─────────────────────────────────────────────────
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS estado       VARCHAR(10) DEFAULT 'activo' CHECK (estado IN ('activo','inactivo')),
  ADD COLUMN IF NOT EXISTS avatar_color VARCHAR(120) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS avatar_letra VARCHAR(4)   DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS avatar_url   TEXT         DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS telefono     VARCHAR(20)  DEFAULT NULL;

UPDATE usuarios SET estado = 'activo' WHERE estado IS NULL;

-- ── historial_proyectos: columna id_usuario para saber quién hizo qué ─────────
ALTER TABLE historial_proyectos
  ADD COLUMN IF NOT EXISTS id_usuario INT DEFAULT NULL REFERENCES usuarios(id_usuario) ON DELETE SET NULL;

-- ── ventanas: reporte_generado ────────────────────────────────────────────────
ALTER TABLE ventanas
  ADD COLUMN IF NOT EXISTS reporte_generado BOOLEAN NOT NULL DEFAULT FALSE;

-- ── catálogos: estado activo/inactivo ─────────────────────────────────────────
ALTER TABLE perfiles
  ADD COLUMN IF NOT EXISTS estado VARCHAR(10) DEFAULT 'activo' CHECK (estado IN ('activo','inactivo'));
ALTER TABLE "diseños"
  ADD COLUMN IF NOT EXISTS estado VARCHAR(10) DEFAULT 'activo' CHECK (estado IN ('activo','inactivo'));
ALTER TABLE sistemas_ventaneria
  ADD COLUMN IF NOT EXISTS estado VARCHAR(10) DEFAULT 'activo' CHECK (estado IN ('activo','inactivo'));

UPDATE perfiles SET estado='activo' WHERE estado IS NULL;
UPDATE "diseños" SET estado='activo' WHERE estado IS NULL;
UPDATE sistemas_ventaneria SET estado='activo' WHERE estado IS NULL;

-- ── tabla proyecto_accesos (compartir) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proyecto_accesos (
  id_acceso        SERIAL PRIMARY KEY,
  id_proyecto      INT         NOT NULL REFERENCES proyectos(id_proyecto) ON DELETE CASCADE,
  id_usuario       INT         NOT NULL REFERENCES usuarios(id_usuario)   ON DELETE CASCADE,
  permiso          VARCHAR(10) NOT NULL DEFAULT 'lectura' CHECK (permiso IN ('lectura','edicion')),
  fecha_compartido TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (id_proyecto, id_usuario)
);

CREATE INDEX IF NOT EXISTS idx_accesos_proyecto ON proyecto_accesos(id_proyecto);
CREATE INDEX IF NOT EXISTS idx_accesos_usuario  ON proyecto_accesos(id_usuario);

-- ── RLS en proyecto_accesos ───────────────────────────────────────────────────
ALTER TABLE proyecto_accesos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_full_proyecto_accesos" ON proyecto_accesos;
DROP POLICY IF EXISTS "block_anon_proyecto_accesos"   ON proyecto_accesos;

CREATE POLICY "service_full_proyecto_accesos"
  ON proyecto_accesos FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "block_anon_proyecto_accesos"
  ON proyecto_accesos FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- ── Verificación final ────────────────────────────────────────────────────────
SELECT 'proyectos' as tabla, column_name FROM information_schema.columns
  WHERE table_name='proyectos' AND column_name IN ('fecha_inicio_real','fecha_fin_real','duracion_dias')
UNION ALL
SELECT 'usuarios', column_name FROM information_schema.columns
  WHERE table_name='usuarios' AND column_name IN ('estado','avatar_color','telefono')
UNION ALL
SELECT 'historial_proyectos', column_name FROM information_schema.columns
  WHERE table_name='historial_proyectos' AND column_name = 'id_usuario'
ORDER BY tabla, column_name;

-- ── materiales: agregar stock_minimo si no existe ────────────────────────────
ALTER TABLE materiales ADD COLUMN IF NOT EXISTS stock_minimo NUMERIC(10,2) DEFAULT 0;
UPDATE materiales SET stock_minimo = 0 WHERE stock_minimo IS NULL;
