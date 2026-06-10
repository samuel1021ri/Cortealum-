-- ═══════════════════════════════════════════════════════════════════════════
--  CorteAlum — FIX v44 — La vista del Banco expone el USUARIO que dejó el residuo
-- ═══════════════════════════════════════════════════════════════════════════
--
--  Qué hace:
--    Recrea `vista_residuos_banco` agregando un LEFT JOIN con `usuarios` para
--    exponer la columna `creado_por_nombre` (nombre de la persona que dejó el
--    residuo). Antes la vista solo tenía `creado_por` (id numérico) y los
--    nombres de proyecto, pero no el nombre del usuario, así que el Banco solo
--    podía mostrar el proyecto — no quién físicamente cortó y dejó la pieza.
--
--    Complementa al fix v43, que ya hacía que `creado_por` se actualizara al
--    usuario que procesó el residuo por última vez. Ahora ese dato se puede
--    mostrar en pantalla.
--
--  Cómo correrlo:
--    psql -h <host> -U <user> -d <db> -f db_patch_v44_vista_creado_por.sql
--
--    O simplemente reiniciá el backend — la migración (migrationsResiduos.js)
--    recrea la vista al arrancar con esta misma definición.
--
--  Idempotente: usa DROP ... CASCADE + CREATE, se puede correr cuantas veces
--  quieras.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DROP VIEW IF EXISTS vista_residuos_banco CASCADE;

CREATE VIEW vista_residuos_banco AS
SELECT r.*,
  po.nombre_proyecto AS proyecto_origen, po.nombre_cliente AS cliente_origen,
  pu.nombre_proyecto AS proyecto_uso,    pu.nombre_cliente AS cliente_uso,
  uc.nombre_completo AS creado_por_nombre,
  v.ancho_vano, v.alto_vano,
  ROUND(r.longitud_cm / 60, 1) AS compatibilidad_estimada,
  CASE WHEN r.estado='reservado' AND r.reservado_hasta IS NOT NULL
    THEN EXTRACT(EPOCH FROM (r.reservado_hasta - NOW())) / 60
    ELSE NULL END AS minutos_reserva_restantes
FROM residuos_aluminio r
LEFT JOIN proyectos po ON r.id_proyecto_origen = po.id_proyecto
LEFT JOIN proyectos pu ON r.id_proyecto_uso    = pu.id_proyecto
LEFT JOIN usuarios  uc ON r.creado_por         = uc.id_usuario
LEFT JOIN ventanas  v  ON r.id_ventana         = v.id_ventana;

DO $$ BEGIN
  RAISE NOTICE '[v44] OK — vista_residuos_banco recreada con creado_por_nombre.';
END $$;

COMMIT;
