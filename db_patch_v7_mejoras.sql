-- ============================================================
-- PARCHE: Mejoras CorteAlu v7 → v8
-- Ejecutar una sola vez en Supabase SQL Editor
-- ============================================================

-- 1. Observaciones por proyecto
ALTER TABLE proyectos
  ADD COLUMN IF NOT EXISTS observaciones TEXT;

-- 2. Notas por ventana
ALTER TABLE ventanas
  ADD COLUMN IF NOT EXISTS notas TEXT;

-- 3. Cotización oficial
ALTER TABLE cotizaciones
  ADD COLUMN IF NOT EXISTS es_oficial BOOLEAN DEFAULT FALSE;

-- 4. Historial de movimientos de stock
CREATE TABLE IF NOT EXISTS historial_stock (
  id_movimiento   SERIAL PRIMARY KEY,
  id_material     INT NOT NULL REFERENCES materiales(id_material) ON DELETE CASCADE,
  tipo            VARCHAR(30) NOT NULL DEFAULT 'ajuste_manual',
  -- tipo puede ser: 'ajuste_manual', 'descuento_reporte', 'ingreso'
  cantidad        NUMERIC(10,2) NOT NULL,
  stock_anterior  NUMERIC(10,2) NOT NULL,
  stock_nuevo     NUMERIC(10,2) NOT NULL,
  motivo          TEXT,
  id_proyecto     INT REFERENCES proyectos(id_proyecto) ON DELETE SET NULL,
  id_usuario      INT REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
  fecha           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_historial_stock_material ON historial_stock(id_material);
CREATE INDEX IF NOT EXISTS idx_historial_stock_fecha    ON historial_stock(fecha DESC);

-- 5. Confirmar
SELECT 'Parche aplicado correctamente' AS resultado;
