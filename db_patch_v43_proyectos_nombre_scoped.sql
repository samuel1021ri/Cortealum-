-- ═══════════════════════════════════════════════════════════════════════════
--  CorteAlum — FIX v43 (OPCIONAL) — Constraint UNIQUE de nombre_proyecto
--                                    pasa de GLOBAL a SCOPE-POR-USUARIO
-- ═══════════════════════════════════════════════════════════════════════════
--
--  Cuándo correrlo:
--    Tu BD actualmente tiene una constraint UNIQUE en `proyectos.nombre_proyecto`
--    que es GLOBAL — eso significa que si un usuario A crea un proyecto
--    "samuel", el usuario B no puede crear OTRO proyecto "samuel". Esto es
--    raramente lo que se quiere a nivel de negocio: distintos usuarios deberían
--    poder tener proyectos con el mismo nombre dentro de su propio scope.
--
--    Este script cambia la constraint a UNIQUE compuesta
--    (nombre_proyecto, id_usuario_creador), lo cual permite:
--      • Usuario A: proyecto "samuel" ✓
--      • Usuario B: proyecto "samuel" ✓ (otro distinto, en su scope)
--      • Usuario A: segundo proyecto "samuel" ✗ (todavía bloqueado en su scope)
--
--    Si preferís mantener la unicidad global, NO corras este script — el
--    fix v43 del backend ya muestra un mensaje claro al usuario explicando
--    que otro usuario del sistema ya tiene ese nombre.
--
--  Cómo correrlo:
--    psql -h <host> -U <user> -d <db> -f db_patch_v43_proyectos_nombre_scoped.sql
--
--  Es idempotente: si ya corriste el script y la constraint nueva existe,
--  no hace nada.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  v_constraint_name TEXT;
  v_nueva_existe BOOLEAN;
BEGIN
  -- Buscar la constraint UNIQUE global actual sobre nombre_proyecto
  -- (puede llamarse 'proyectos_nombre_proyecto_key', 'unique_nombre_proyecto', etc.)
  SELECT con.conname INTO v_constraint_name
  FROM pg_constraint con
  JOIN pg_class cl ON cl.oid = con.conrelid
  JOIN pg_attribute att ON att.attrelid = cl.oid AND att.attnum = ANY(con.conkey)
  WHERE cl.relname = 'proyectos'
    AND con.contype = 'u'
    AND att.attname = 'nombre_proyecto'
    AND array_length(con.conkey, 1) = 1   -- solo el constraint con UNA columna
  LIMIT 1;

  -- ¿Ya existe la constraint compuesta nueva?
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class cl ON cl.oid = con.conrelid
    WHERE cl.relname = 'proyectos'
      AND con.contype = 'u'
      AND con.conname = 'proyectos_nombre_usuario_uk'
  ) INTO v_nueva_existe;

  IF v_nueva_existe THEN
    RAISE NOTICE '[v43] La constraint compuesta proyectos_nombre_usuario_uk ya existe. Nada que hacer.';
    RETURN;
  END IF;

  IF v_constraint_name IS NOT NULL THEN
    RAISE NOTICE '[v43] Eliminando constraint global: %', v_constraint_name;
    EXECUTE format('ALTER TABLE proyectos DROP CONSTRAINT %I', v_constraint_name);
  ELSE
    RAISE NOTICE '[v43] No se encontró constraint UNIQUE global sobre nombre_proyecto (puede que nunca haya existido).';
  END IF;

  -- Crear la constraint compuesta (nombre_proyecto, id_usuario_creador)
  -- Validar antes que no haya datos que ya violen la nueva constraint
  IF EXISTS (
    SELECT 1 FROM proyectos
    GROUP BY LOWER(TRIM(nombre_proyecto)), id_usuario_creador
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION '[v43] Hay duplicados existentes (mismo nombre + mismo usuario_creador). Resolvélos manualmente antes de aplicar este patch.';
  END IF;

  ALTER TABLE proyectos
    ADD CONSTRAINT proyectos_nombre_usuario_uk
    UNIQUE (nombre_proyecto, id_usuario_creador);

  RAISE NOTICE '[v43] OK — constraint nueva creada: proyectos_nombre_usuario_uk (nombre_proyecto, id_usuario_creador).';
END $$;

COMMIT;
