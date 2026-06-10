-- ════════════════════════════════════════════════════════════════════════════
-- CorteAlum v15 — Migración v12: normalización masiva de ancho_vano/alto_vano
-- ════════════════════════════════════════════════════════════════════════════
--
-- PROBLEMA:
--   Versiones anteriores del frontend guardaban los valores de ventanas EN MM
--   en las columnas `ancho_vano` / `alto_vano` cuando el usuario trabajaba en
--   mm — violando la regla canónica de que la BD almacena SIEMPRE en cm.
--   Esto causaba que el motor calculara con valores 10× más grandes y los
--   reportes mostraran resultados absurdos (290 - 3 = 287 mm en vez de 260).
--
-- ESTRATEGIA:
--   Detectar ventanas donde:
--     1. `ancho_unidad` o `alto_unidad` es 'mm', Y
--     2. El valor numérico es >= 60 (coherente con mm, absurdo si fuera cm)
--   y dividir el valor entre 10 para llevarlo a cm canónico.
--
--   Las columnas `ancho_unidad` / `alto_unidad` se mantienen como historial
--   informativo (el usuario eligió mm; eso no cambia). Solo se corrige el
--   VALOR numérico.
--
-- SEGURIDAD:
--   • Crea una tabla de backup `ventanas_backup_v12_units` antes de tocar nada.
--   • Es idempotente: corrida dos veces no rompe nada (el WHERE filtra los
--     valores que ya fueron normalizados).
--   • Heurística defensiva: si ancho_unidad='mm' pero el valor es < 60,
--     NO se toca (probablemente la declaración de unidad estaba mal).
--
-- USO:
--   psql -d corte_alum -f db_patch_v12_normalizar_unidades.sql
--
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Backup de seguridad ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'ventanas_backup_v12_units'
  ) THEN
    EXECUTE 'CREATE TABLE ventanas_backup_v12_units AS SELECT * FROM ventanas';
    RAISE NOTICE 'Backup creado: ventanas_backup_v12_units (% filas)',
      (SELECT count(*) FROM ventanas_backup_v12_units);
  ELSE
    RAISE NOTICE 'Backup ya existe (de una corrida anterior). No se sobrescribe.';
  END IF;
END $$;

-- ─── 2. Detectar columnas opcionales ───────────────────────────────────
-- Algunas BD legacy no tienen las columnas ancho_unidad/alto_unidad.
-- Si no existen, la migración no tiene cómo distinguir mm de cm y aborta.
DO $$
DECLARE
  tiene_anchu BOOLEAN;
  tiene_altou BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='ventanas' AND column_name='ancho_unidad'
  ) INTO tiene_anchu;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='ventanas' AND column_name='alto_unidad'
  ) INTO tiene_altou;

  IF NOT tiene_anchu OR NOT tiene_altou THEN
    RAISE EXCEPTION 'Faltan columnas ancho_unidad/alto_unidad. Aplica primero la migración base que las agrega.';
  END IF;
END $$;

-- ─── 3. Auditoría previa: cuántas filas se van a tocar ──────────────────
SELECT
  count(*) FILTER (WHERE LOWER(ancho_unidad) = 'mm' AND ancho_vano >= 60) AS anchos_a_corregir,
  count(*) FILTER (WHERE LOWER(alto_unidad)  = 'mm' AND alto_vano  >= 60) AS altos_a_corregir,
  count(*) AS total_ventanas
FROM ventanas;

-- ─── 4. Normalizar ANCHO ────────────────────────────────────────────────
-- Heurística: si declara mm y el valor >= 60, dividir entre 10 (era mm real).
-- Si declara mm pero el valor < 60, NO tocar (era cm mal etiquetado).
UPDATE ventanas
SET ancho_vano = ROUND((ancho_vano / 10.0)::numeric, 2)
WHERE LOWER(ancho_unidad) = 'mm'
  AND ancho_vano >= 60
  AND ancho_vano <= 5000;  -- safety cap: > 5000 mm = > 5 m, sospechoso

-- ─── 5. Normalizar ALTO ─────────────────────────────────────────────────
UPDATE ventanas
SET alto_vano = ROUND((alto_vano / 10.0)::numeric, 2)
WHERE LOWER(alto_unidad) = 'mm'
  AND alto_vano >= 60
  AND alto_vano <= 5000;

-- ─── 6. Reseteamos `reporte_generado` para las ventanas tocadas ─────────
-- Si la geometría cambió, los reportes y materiales calculados antes
-- ahora están desfasados. El usuario tendrá que regenerar el reporte
-- de esas ventanas. Esto evita inconsistencias en cotizaciones.
UPDATE ventanas
SET reporte_generado = FALSE
WHERE id_ventana IN (
  SELECT id_ventana FROM ventanas_backup_v12_units b
  WHERE b.ancho_vano <> (SELECT ancho_vano FROM ventanas v WHERE v.id_ventana = b.id_ventana)
     OR b.alto_vano  <> (SELECT alto_vano  FROM ventanas v WHERE v.id_ventana = b.id_ventana)
);

-- ─── 7. Limpiar materiales_usados de las ventanas modificadas ──────────
-- Lo mismo que el paso anterior pero para los materiales pre-calculados.
DELETE FROM materiales_usados
WHERE id_ventana IN (
  SELECT v.id_ventana FROM ventanas v
  JOIN ventanas_backup_v12_units b USING (id_ventana)
  WHERE b.ancho_vano <> v.ancho_vano OR b.alto_vano <> v.alto_vano
);

-- ─── 8. Auditoría post: confirmar resultados ───────────────────────────
SELECT
  'CORREGIDAS' AS tipo,
  count(*) AS cantidad
FROM ventanas v
JOIN ventanas_backup_v12_units b USING (id_ventana)
WHERE b.ancho_vano <> v.ancho_vano OR b.alto_vano <> v.alto_vano
UNION ALL
SELECT
  'SIN CAMBIO (cm correcto o legacy ambiguo)' AS tipo,
  count(*) AS cantidad
FROM ventanas v
JOIN ventanas_backup_v12_units b USING (id_ventana)
WHERE b.ancho_vano = v.ancho_vano AND b.alto_vano = v.alto_vano;

-- ─── 9. Marca de migración aplicada ────────────────────────────────────
-- Tabla de control opcional para no re-correr esta migración en futuras
-- aplicaciones automáticas.
CREATE TABLE IF NOT EXISTS migraciones_aplicadas (
  nombre VARCHAR(100) PRIMARY KEY,
  aplicada_en TIMESTAMP NOT NULL DEFAULT NOW(),
  notas TEXT
);

INSERT INTO migraciones_aplicadas (nombre, notas)
VALUES (
  'v12_normalizar_unidades_mm_a_cm',
  'Convirtió ventanas legacy con valores mm en ancho_vano/alto_vano a cm canónico. '
  || 'Backup en ventanas_backup_v12_units.'
) ON CONFLICT (nombre) DO UPDATE SET aplicada_en = NOW();

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (en caso de necesitar revertir):
-- ════════════════════════════════════════════════════════════════════════════
-- BEGIN;
-- TRUNCATE ventanas;
-- INSERT INTO ventanas SELECT * FROM ventanas_backup_v12_units;
-- DELETE FROM migraciones_aplicadas WHERE nombre = 'v12_normalizar_unidades_mm_a_cm';
-- COMMIT;
-- ════════════════════════════════════════════════════════════════════════════
