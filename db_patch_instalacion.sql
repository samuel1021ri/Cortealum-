-- CorteAlu — Patch: columna instalacion en cotizaciones
-- Ejecutar en Supabase SQL Editor
-- Agrega el campo instalacion de forma segura (IF NOT EXISTS)

-- ── Agregar columna instalacion a cotizaciones ────────────────────────────────
ALTER TABLE cotizaciones
  ADD COLUMN IF NOT EXISTS instalacion NUMERIC(12,2) DEFAULT 0;

-- Actualizar registros existentes (valor 0 por defecto)
UPDATE cotizaciones
  SET instalacion = 0
  WHERE instalacion IS NULL;

-- ── Verificación ──────────────────────────────────────────────────────────────
SELECT
  column_name,
  data_type,
  column_default
FROM information_schema.columns
WHERE table_name = 'cotizaciones'
  AND column_name = 'instalacion';
