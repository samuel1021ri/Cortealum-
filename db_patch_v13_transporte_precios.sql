-- ============================================================
--  CorteAlu — Parche v13: SOLO las 3 columnas que faltan
--  Ejecutar en Supabase → SQL Editor
-- ============================================================

ALTER TABLE cotizaciones
  ADD COLUMN IF NOT EXISTS transporte_estructuras  NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transporte_personal     NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cantidad_personas       INT           DEFAULT 1;

-- Columnas para el detalle de materiales
ALTER TABLE cotizacion_detalle_materiales
  ADD COLUMN IF NOT EXISTS nombre_item   VARCHAR(200) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS color_perfil  VARCHAR(50)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS id_ventana    INT          DEFAULT NULL
    REFERENCES ventanas(id_ventana) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tipo_item     VARCHAR(20)  DEFAULT 'perfil'
    CHECK (tipo_item IN ('perfil','accesorio','vidrio','otro'));

-- Color por ventana
ALTER TABLE ventanas
  ADD COLUMN IF NOT EXISTS color_perfil VARCHAR(50) DEFAULT 'Natural';

-- Verificación
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'cotizaciones'
  AND column_name IN ('transporte_estructuras','transporte_personal','cantidad_personas')
ORDER BY column_name;
