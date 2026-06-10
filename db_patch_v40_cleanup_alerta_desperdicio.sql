-- ═══════════════════════════════════════════════════════════════════════════
--  CorteAlum — FIX v40 — Eliminar alerta_desperdicio_pct de config_residuos
-- ═══════════════════════════════════════════════════════════════════════════
--
--  Por qué se elimina:
--    El parámetro alerta_desperdicio_pct apareció en una versión vieja para
--    disparar una "alerta de IA" si el % de desperdicio post-optimización
--    superaba cierto umbral. En la práctica nunca se llegó a implementar la
--    alerta (la lectura en residuosController.recomendaciones era código
--    muerto: se leía a una variable y nunca se usaba).
--
--    El parámetro ni siquiera tiene sentido conceptualmente en este sistema:
--    el optimizador usa First Fit Decreasing + Best Fit, así que ya escoge
--    el mejor plan posible. Si el desperdicio queda alto post-optimización
--    no es porque el plan sea malo, es porque no había más residuos
--    disponibles en el banco para reducirlo. Alertar sobre eso no aporta.
--
--  Qué hace este script:
--    1. Borra el registro de la tabla config_residuos.
--    2. Loguea un NOTICE indicando si había o no el registro.
--
--  Cómo correrlo:
--    psql -h <host> -U <user> -d <db> -f db_patch_v40_cleanup_alerta_desperdicio.sql
--
--    O simplemente reinicia el backend — la migración (migrationsResiduos.js)
--    también incluye el DELETE en este mismo fix, así que se ejecuta solo.
--
--  Idempotente: corre cuantas veces quieras, no hace nada después de la
--  primera ejecución.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  v_existia BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM config_residuos WHERE clave = 'alerta_desperdicio_pct'
  ) INTO v_existia;

  DELETE FROM config_residuos WHERE clave = 'alerta_desperdicio_pct';

  IF v_existia THEN
    RAISE NOTICE '[v40] OK — Se eliminó alerta_desperdicio_pct de config_residuos.';
  ELSE
    RAISE NOTICE '[v40] OK — alerta_desperdicio_pct no estaba presente (limpieza ya aplicada o instalación nueva).';
  END IF;
END $$;

COMMIT;
