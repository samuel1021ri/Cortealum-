-- ═══════════════════════════════════════════════════════════════════════════
-- CorteAlum — Script de Limpieza del Banco de Residuos
-- ═══════════════════════════════════════════════════════════════════════════
--
-- PROBLEMA QUE CORRIGE:
--   Hasta esta versión, cada vez que se generaba el reporte de UNA ventana,
--   se creaban residuos por separado en BD. Esto producía:
--   - Múltiples residuos pequeños "fantasma" por proyecto
--   - Pérdida de trazabilidad (no se sabe de qué optimización vienen)
--   - Reflejo incorrecto del taller real
--
-- SOLUCIÓN:
--   A partir de esta versión, los residuos SOLO se generan al confirmar el
--   plan de corte del proyecto COMPLETO ("Optimizar cortes" del proyecto).
--
-- ESTE SCRIPT:
--   1. Hace backup de los residuos actuales (por si acaso)
--   2. Borra todos los residuos generados por ventana (los "fantasma")
--   3. Limpia el historial relacionado
--   4. Conserva residuos registrados MANUALMENTE por el usuario
--
-- ─── EJECUCIÓN ─────────────────────────────────────────────────────────────
-- Ejecutar manualmente desde psql o pgAdmin:
--    psql -U <usuario> -d <db_cortealum> -f db_clean_residuos_fantasma.sql
--
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. BACKUP defensivo ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS residuos_aluminio_backup_pre_clean AS
SELECT *, NOW() AS fecha_backup
FROM residuos_aluminio;

CREATE TABLE IF NOT EXISTS historial_residuos_backup_pre_clean AS
SELECT *, NOW() AS fecha_backup
FROM historial_residuos;

-- ─── 2. Identificar residuos FANTASMA (los creados por ventana) ───────────
-- Criterio: las notas contenían "Auto-generado al reportar Ventana #" o
-- tenían id_ventana NOT NULL (la creación nueva no usa id_ventana).
CREATE TEMP TABLE residuos_a_borrar AS
SELECT id_residuo
FROM residuos_aluminio
WHERE
  -- Notas explícitas del bloque viejo
  notas LIKE 'Auto-generado al reportar Ventana #%'
  OR notas LIKE 'Sobrante automático%'
  -- O cualquier residuo con id_ventana sin id_plan_corte (creación vieja)
  OR (id_ventana IS NOT NULL AND
      (id_plan_corte IS NULL OR id_plan_corte = 0));

-- ─── 3. Mostrar cuántos van a borrarse (para confirmar) ───────────────────
SELECT
  (SELECT COUNT(*) FROM residuos_aluminio_backup_pre_clean) AS total_antes,
  (SELECT COUNT(*) FROM residuos_a_borrar)                  AS van_a_borrarse,
  (SELECT COUNT(*) FROM residuos_aluminio_backup_pre_clean)
    - (SELECT COUNT(*) FROM residuos_a_borrar)              AS quedan;

-- ─── 4. Borrar historial relacionado ──────────────────────────────────────
DELETE FROM historial_residuos
WHERE id_residuo IN (SELECT id_residuo FROM residuos_a_borrar);

-- ─── 5. Borrar los residuos fantasma ──────────────────────────────────────
DELETE FROM residuos_aluminio
WHERE id_residuo IN (SELECT id_residuo FROM residuos_a_borrar);

-- ─── 6. Resetear secuencia (opcional, para que IDs nuevos sean limpios) ──
-- SELECT setval('residuos_aluminio_id_residuo_seq',
--   COALESCE((SELECT MAX(id_residuo) FROM residuos_aluminio), 1));

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- POST-EJECUCIÓN: si todo se ve bien, después de unos días puedes borrar:
--   DROP TABLE residuos_aluminio_backup_pre_clean;
--   DROP TABLE historial_residuos_backup_pre_clean;
-- ═══════════════════════════════════════════════════════════════════════════
