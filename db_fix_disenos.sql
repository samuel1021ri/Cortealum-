-- Fix IDs de diseños para que coincidan con el engine (1=XX 2=0X 3=X0X 4=0XX0 5=XXX)
-- Ejecutar en Supabase si los diseños tienen IDs incorrectos

-- Paso 1: Guardar mapping actual
CREATE TEMP TABLE disenos_backup AS SELECT * FROM "diseños";

-- Paso 2: Temporalmente remover constraint FK
ALTER TABLE ventanas DISABLE TRIGGER ALL;

-- Paso 3: Actualizar IDs por nombre
UPDATE "diseños" SET "id_diseño" = 1 WHERE nombre = 'XX';
UPDATE "diseños" SET "id_diseño" = 2 WHERE nombre = '0X';
UPDATE "diseños" SET "id_diseño" = 3 WHERE nombre = 'X0X';
UPDATE "diseños" SET "id_diseño" = 4 WHERE nombre = '0XX0';
UPDATE "diseños" SET "id_diseño" = 5 WHERE nombre = 'XXX';

-- Paso 4: Actualizar FK en ventanas usando el backup
UPDATE ventanas v
SET "id_diseño" = (
  SELECT CASE b.nombre
    WHEN 'XX'   THEN 1
    WHEN '0X'   THEN 2
    WHEN 'X0X'  THEN 3
    WHEN '0XX0' THEN 4
    WHEN 'XXX'  THEN 5
    ELSE b."id_diseño"
  END
  FROM disenos_backup b WHERE b."id_diseño" = v."id_diseño"
)
WHERE EXISTS (SELECT 1 FROM disenos_backup b WHERE b."id_diseño" = v."id_diseño");

-- Paso 5: Reactivar triggers
ALTER TABLE ventanas ENABLE TRIGGER ALL;

-- Paso 6: Resetear secuencia
SELECT setval(pg_get_serial_sequence('"diseños"','"id_diseño"'), 5);

-- Verificar
SELECT "id_diseño", nombre FROM "diseños" ORDER BY "id_diseño";
