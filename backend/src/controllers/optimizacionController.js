/**
 * CorteAlum — Controller de Optimización de Cortes
 * ─────────────────────────────────────────────────────────────────────────────
 * Endpoint principal: POST /api/optimizacion/proyecto/:id
 *
 * Toma todas las ventanas del proyecto, ejecuta el motor de cálculo para
 * extraer las piezas de perfil, y las pasa al optimizador con los residuos
 * disponibles en BD. Devuelve el plan de corte.
 *
 * No persiste por defecto. Si el frontend manda `guardar:true`, el plan
 * se guarda en `planes_corte` para historial.
 */

const pool = require('../config/db');
const { calcularVentana } = require('../utils/calcEngine');
const { normalizarDeBD } = require('../utils/unitConvert');
const { optimizarCortes, compararConSinResiduos } = require('../services/cuttingOptimizer');
const residuoRepo = require('../repositories/residuoRepository');
const barraRepo   = require('../repositories/barraRepository');
const { obtenerReferenciaAln } = require('../utils/catalogoAlumfer');
const { KERF_CM, MIN_RESIDUO_CM } = require('../config/constants');

// ─── Mapa NOMBRE diseño → ID engine ───────────────────────────────────────
// El motor calcularVentana() solo acepta IDs 1-5. La BD puede tener IDs
// arbitrarios (7, 15, 23...) si se crearon y borraron diseños. La única
// forma confiable de mapear es por NOMBRE del diseño.
// Este es el mismo mapa usado por ventanasController y cotizacionesController.
const DISENO_NOMBRE_MAP = {
  'XX':1, 'OX':2, 'XO':2, 'XOX':3, 'OXXO':4, 'OXX':2, 'XXX':5,
  'X X':1, '0X':2, 'X0':2, 'X0X':3, '0XX0':4, 'X X X':5,
  'XX TRADICIONAL':1,
  'OX TRADICIONAL':2,'XO TRADICIONAL':2,'0X TRADICIONAL':2,'X0 TRADICIONAL':2,
  'XOX TRADICIONAL':3,'X0X TRADICIONAL':3,
  'OXXO TRADICIONAL':4,'0XX0 TRADICIONAL':4,
  'OXX TRADICIONAL':2,
  'XXX TRADICIONAL':5,
  'XX LINEA 90':1,'XX L90':1,
  'OX LINEA 90':2,'0X LINEA 90':2,'XO LINEA 90':2,
  'XOX LINEA 90':3,'X0X LINEA 90':3,
  'OXXO LINEA 90':4,'0XX0 LINEA 90':4,
  'XXX LINEA 90':5,'XXX L90':5,
  'XX HIBRIDA':1,
  'OX HIBRIDA':2,'0X HIBRIDA':2,'XO HIBRIDA':2,
  'XOX HIBRIDA':3,'X0X HIBRIDA':3,
  'OXXO HIBRIDA':4,'0XX0 HIBRIDA':4,
};

/**
 * Resuelve el ID de diseño a engine_id (1-5) para `calcularVentana`.
 *
 * Prioridad lógica:
 *   1. Mapea por NOMBRE (única forma confiable: BD puede tener IDs arbitrarios)
 *   2. Si el id_diseno de BD ya está en rango 1-5, lo usa como fallback
 *   3. Si nada funciona → null (la ventana se reportará con error explícito)
 *
 * IMPORTANTE: NUNCA devolver 1 por defecto silenciosamente. Devolver null
 * permite que el caller registre la causa real del fallo.
 */
function getIdDiseno(v) {
  const nombre = (v.diseno || v.diseno_nombre || v.nombre_diseno || '').trim().toUpperCase();
  if (nombre && DISENO_NOMBRE_MAP[nombre]) return DISENO_NOMBRE_MAP[nombre];
  const raw = parseInt(v.id_diseno || v['id_diseño'] || 0);
  if (raw >= 1 && raw <= 5) return raw;
  return null;
}

/**
 * Obtiene todos los cortes de perfil de un proyecto, agrupados por perfil+color.
 *
 * Cada corte se enriquece con contexto completo para que el frontend pueda
 * mostrar al usuario EXACTAMENTE de qué ventana, sistema, diseño y pieza
 * viene cada corte (requisito UX: el plan de corte debe ser autodescriptivo).
 *
 * Resultado: Array [{ id_perfil, referencia_perfil, color_perfil, cortes:[...] }]
 *
 * Cada `cortes[i]` contiene:
 *   - longitud_cm        número
 *   - etiqueta           ubicación de la pieza (ej. "MARCO", "NAVE FIJA")
 *   - ubicacion          igual a etiqueta (mantiene retro-compatibilidad)
 *   - id_ventana         ID real en BD
 *   - ventana_label      "V1", "V2"... (orden visual)
 *   - nombre_ventana     nombre dado por el usuario (ej. "Sala", "Cocina") o null
 *   - sistema_nombre     ej. "3500 TRADICIONAL"
 *   - diseno_nombre      ej. "XOX"
 *   - ancho_vano_cm      número
 *   - alto_vano_cm       número
 *
 * Además devuelve `_errores`: array de ventanas que no se pudieron calcular
 * (para diagnóstico — antes esto se silenciaba).
 */

// ═══════════════════════════════════════════════════════════════════════════
//  HELPERS PARA COMPARACIÓN DE PLANES (fix de "residuos duplicados v2")
// ═══════════════════════════════════════════════════════════════════════════
// Permite que confirmarPlan distinga entre 3 casos al recibir una nueva
// confirmación sobre un proyecto que ya tenía un plan confirmado previo:
//
//   1. Sin cambios   → devolver el plan anterior, no tocar nada.
//   2. Solo se agregaron ventanas → procesar SOLO las nuevas (incremental).
//                     Los residuos del plan anterior se mantienen vigentes.
//   3. Se modificó o eliminó alguna ventana → anular el plan anterior y
//                     regenerar todo (comportamiento original).
//
// La comparación se hace por la firma (id_ventana + ancho_vano + alto_vano
// + id_perfil + id_diseno). El snapshot se persiste en `plan_json.ventanas_snapshot`
// del plan confirmado para que la próxima confirmación lo compare.
// ═══════════════════════════════════════════════════════════════════════════

/** Trae las ventanas del proyecto con su firma para comparación. */
async function obtenerSnapshotVentanas(db, id_proyecto) {
  const { rows } = await db.query(
    `SELECT v.id_ventana,
            v.ancho_vano,
            v.alto_vano,
            v.id_perfil,
            v."id_diseño" AS id_diseno
     FROM ventanas v
     WHERE v.id_proyecto = $1
     ORDER BY v.id_ventana`,
    [id_proyecto]
  );
  return rows.map(v => ({
    id_ventana: v.id_ventana,
    ancho_vano: parseFloat(v.ancho_vano),
    alto_vano:  parseFloat(v.alto_vano),
    id_perfil:  v.id_perfil,
    id_diseno:  v.id_diseno,
  }));
}

/** Firma canónica de una ventana para comparar identidad estructural. */
function firmaVentana(v) {
  return [
    v.id_ventana,
    Number(v.ancho_vano).toFixed(2),
    Number(v.alto_vano).toFixed(2),
    v.id_perfil,
    v.id_diseno,
  ].join('|');
}

/**
 * Compara dos snapshots y clasifica las diferencias.
 * @returns {{
 *   agregadas: Array,    // en actual pero no en prev (id_ventana nuevo)
 *   eliminadas: Array,   // en prev pero no en actual
 *   modificadas: Array,  // mismo id_ventana, firma distinta
 *   sinCambios: boolean,
 *   soloAgregadas: boolean
 * }}
 */
function compararSnapshots(prev, actual) {
  const prevById = new Map((prev || []).map(v => [v.id_ventana, v]));
  const actById  = new Map((actual || []).map(v => [v.id_ventana, v]));

  const agregadas   = [];
  const eliminadas  = [];
  const modificadas = [];

  for (const v of actual || []) {
    if (!prevById.has(v.id_ventana)) {
      agregadas.push(v);
    } else if (firmaVentana(prevById.get(v.id_ventana)) !== firmaVentana(v)) {
      modificadas.push(v);
    }
  }
  for (const v of prev || []) {
    if (!actById.has(v.id_ventana)) {
      eliminadas.push(v);
    }
  }

  const sinCambios = agregadas.length === 0 && eliminadas.length === 0 && modificadas.length === 0;
  const soloAgregadas = agregadas.length > 0 && eliminadas.length === 0 && modificadas.length === 0;
  return { agregadas, eliminadas, modificadas, sinCambios, soloAgregadas };
}

/**
 * Trae el último plan confirmado NO anulado del proyecto, con su plan_json
 * parseado a objeto. Devuelve null si no hay.
 */
async function obtenerUltimoPlanConfirmado(db, id_proyecto) {
  const { rows } = await db.query(
    `SELECT id_plan, plan_json
     FROM planes_corte
     WHERE id_proyecto = $1
       AND plan_json::text LIKE '%"estado":"confirmado"%'
       AND plan_json::text NOT LIKE '%"estado":"anulado"%'
     ORDER BY id_plan DESC
     LIMIT 1`,
    [id_proyecto]
  );
  if (!rows.length) return null;
  let plan_json;
  try {
    plan_json = typeof rows[0].plan_json === 'string'
      ? JSON.parse(rows[0].plan_json)
      : (rows[0].plan_json || {});
  } catch {
    plan_json = {};
  }
  return { id_plan: rows[0].id_plan, plan_json };
}

async function obtenerCortesPorPerfil(id_proyecto) {
  // Detectar columnas opcionales en `ventanas` (algunas pueden faltar en BD viejas)
  const { rows: cols } = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='ventanas'`
  );
  const ventCols = new Set(cols.map(r => r.column_name));
  const selNombre = ventCols.has('nombre') ? 'v.nombre' : `NULL::text AS nombre`;
  const selColor = ventCols.has('color_perfil')
    ? `COALESCE(v.color_perfil, 'Natural') AS color_perfil`
    : `'Natural'::text AS color_perfil`;
  const selRefVidrio = ventCols.has('referencia_vidrio')
    ? `v.referencia_vidrio`
    : `'5MM'::text AS referencia_vidrio`;
  const selAnchoU = ventCols.has('ancho_unidad')
    ? `COALESCE(v.ancho_unidad, 'cm') AS ancho_unidad`
    : `'cm'::text AS ancho_unidad`;
  const selAltoU = ventCols.has('alto_unidad')
    ? `COALESCE(v.alto_unidad, 'cm') AS alto_unidad`
    : `'cm'::text AS alto_unidad`;

  const { rows: ventanas } = await pool.query(
    `SELECT v.id_ventana, v.ancho_vano, v.alto_vano,
            v.id_sistema, v.id_perfil, v."id_diseño" AS id_diseno,
            ${selColor},
            ${selRefVidrio},
            ${selNombre},
            ${selAnchoU},
            ${selAltoU},
            p.referencia AS perfil_ref,
            s.nombre     AS sistema_nombre,
            d.nombre     AS diseno_nombre
     FROM ventanas v
     JOIN perfiles p             ON v.id_perfil  = p.id_perfil
     JOIN sistemas_ventaneria s  ON v.id_sistema = s.id_sistema
     JOIN "diseños" d            ON v."id_diseño" = d."id_diseño"
     WHERE v.id_proyecto = $1
     ORDER BY v.id_ventana`,
    [id_proyecto]
  );

  // Map: "id_perfil|color" → datos del perfil + cortes
  const grupos = {};
  const errores = [];

  ventanas.forEach((v, idx) => {
    const engineId = getIdDiseno(v);
    if (!engineId) {
      errores.push({
        id_ventana: v.id_ventana,
        ventana_label: `V${idx + 1}`,
        nombre_ventana: v.nombre,
        razon: `Diseño "${v.diseno_nombre}" no reconocido por el motor`,
      });
      return;
    }

    const anchoCmOpt = normalizarDeBD(v.ancho_vano, v.ancho_unidad);
    const altoCmOpt  = normalizarDeBD(v.alto_vano,  v.alto_unidad);
    const calc = calcularVentana(
      v.id_perfil, v.id_sistema, engineId,
      anchoCmOpt, altoCmOpt,
      v.referencia_vidrio || '5MM'
    );
    if (calc.error) {
      errores.push({
        id_ventana: v.id_ventana,
        ventana_label: `V${idx + 1}`,
        nombre_ventana: v.nombre,
        razon: calc.error,
      });
      return;
    }

    // Solo perfiles (no vidrios ni accesorios)
    const piezas = (calc.piezas || []).filter(p =>
      !p.es_vidrio && !p.es_accesorio && p.resultado != null && p.resultado > 0
    );

    // ── FIX FINAL (instructor Marcel + observación del usuario): la clave
    // física de una barra es su REFERENCIA ALN (ej. ALNA 392), no el
    // `id_perfil`. Dos sistemas distintos pueden compartir la misma ALN
    // → físicamente es la misma extrusión, debe agruparse junta.
    //
    // Ejemplo real:
    //   • CABEZAL en sistema 744 Tradicional      → ALNA 392
    //   • CABEZAL en sistema Híbrida 5020         → ALNA 392 (¡misma barra!)
    //   Si un proyecto mezcla ventanas de ambos sistemas, los cabezales
    //   COMPARTEN barras y residuos del banco.
    //
    // Clave: `${ALN}|${color}` (sin id_perfil — la ALN ya implica todo).
    // Fallback si no hay ALN en el catálogo: `${id_perfil}|${ubicacion}|${color}`.
    for (const p of piezas) {
      const alnRef = obtenerReferenciaAln(p.ubicacion, v.id_perfil, v.id_sistema);
      const key = alnRef
        ? `${alnRef}|${v.color_perfil}`
        : `${v.id_perfil}|${p.ubicacion}|${v.color_perfil}`;

      if (!grupos[key]) {
        grupos[key] = {
          id_perfil: v.id_perfil,
          referencia_perfil: v.perfil_ref,          // ej. "5020" o "744"
          referencia_aln:    alnRef || null,        // ← NUEVO: ALN física (ej. "ALNA 392")
          color_perfil:      v.color_perfil,
          ubicacion:         p.ubicacion,           // tipo de pieza descriptivo
          cortes: [],
        };
      }

      // Expandir cantidad (ej. "2 piezas de JAMBA" → 2 cortes individuales)
      const cant = parseInt(p.cantidad || 1) || 1;
      for (let i = 0; i < cant; i++) {
        grupos[key].cortes.push({
          longitud_cm:    parseFloat(p.resultado),
          etiqueta:       p.ubicacion,
          ubicacion:      p.ubicacion,
          id_ventana:     v.id_ventana,
          ventana_label:  `V${idx + 1}`,
          nombre_ventana: v.nombre || null,
          sistema_nombre: v.sistema_nombre,
          diseno_nombre:  v.diseno_nombre,
          ancho_vano_cm:  parseFloat(v.ancho_vano),
          alto_vano_cm:   parseFloat(v.alto_vano),
        });
      }
    }
  });

  const resultado = Object.values(grupos);
  // Adjuntar errores a la respuesta (no romper la lógica existente)
  resultado._errores = errores;
  return resultado;
}

// ═══ POST /api/optimizacion/proyecto/:id ═════════════════════════════════════
const optimizarProyecto = async (req, res) => {
  const { id } = req.params;
  const guardar = !!req.body?.guardar;
  const comparar = req.body?.comparar !== false; // por defecto sí comparar
  try {
    // 1. Verificar proyecto
    const { rows: pry } = await pool.query(
      `SELECT id_proyecto, nombre_proyecto, id_usuario_creador
       FROM proyectos WHERE id_proyecto=$1`,
      [id]
    );
    if (!pry.length) return res.status(404).json({ error: 'Proyecto no encontrado' });

    // 2. Obtener cortes agrupados por perfil
    const grupos = await obtenerCortesPorPerfil(id);
    const erroresVentanas = grupos._errores || [];
    if (!grupos.length) {
      // Si hay ventanas pero ninguna pudo calcularse, devolver el detalle real.
      const { rows: cnt } = await pool.query(
        'SELECT COUNT(*)::int AS total FROM ventanas WHERE id_proyecto = $1',
        [id]
      );
      const totalVentanas = cnt[0]?.total || 0;
      let mensaje;
      if (totalVentanas === 0) {
        mensaje = 'El proyecto no tiene ventanas. Agrégalas antes de optimizar.';
      } else if (erroresVentanas.length > 0) {
        mensaje = `${totalVentanas} ventana(s) en el proyecto pero ninguna pudo calcularse. Revisa el detalle.`;
      } else {
        mensaje = 'Las ventanas no generaron cortes de perfil (todas pueden ser solo vidrio/accesorios).';
      }
      return res.json({
        ok: true,
        mensaje,
        grupos: [],
        errores: erroresVentanas,
        total_ventanas: totalVentanas,
      });
    }

    // 3. Para cada grupo (perfil + color), correr el optimizador
    const resultados = [];
    let kpiBarrasTotal = 0;
    let kpiResiduosTotal = 0;
    let kpiDesperdicioTotal = 0;
    let kpiResiduosNuevos = 0;

    for (const g of grupos) {
      // Barra estándar de este perfil
      const barraEstandar = await barraRepo.getLongitudPorPerfil(g.id_perfil);

      // ── FIX (instructor Marcel): filtrar residuos por TIPO DE PIEZA ─────
      // Un residuo sobrante de una barra de SILLAR físicamente solo puede
      // producir cortes de SILLAR (tiene esa extrusión específica). No se
      // puede usar para cortar una JAMBA o un TRASLAPE.
      //
      // El filtro por `ubicacion` garantiza que cada grupo solo vea los
      // residuos compatibles. Residuos legacy (sin ubicacion en BD) quedan
      // fuera del reúso automático — el usuario puede clasificarlos a mano.
      const residuos = await residuoRepo.buscarDisponiblesPorPerfil({
        referencia_perfil: g.referencia_perfil,
        color_perfil: g.color_perfil,
        referencia_aln: g.referencia_aln,         // ← NUEVO: ALN física (fix instructor)
        ubicacion: g.ubicacion,                  // ← NUEVO (fix instructor)
        excluir_id_proyecto: parseInt(id),
        incluir_reservados_para: parseInt(id),   // ← FIX v39: ver reservas manuales del Banco
      });

      // OPTIMIZACIÓN: si el caller pide comparación, calculamos UNA sola vez
      // (la versión anterior llamaba a `compararConSinResiduos` dos veces, lo
      // que duplica el costo del optimizador para cada grupo).
      let plan, comparacion = null;
      if (comparar) {
        const comp = compararConSinResiduos({
          cortesPedidos: g.cortes,
          residuosDisponibles: residuos,
          barraEstandarCm: barraEstandar,
          opciones: { kerfCm: KERF_CM, minResiduoCm: MIN_RESIDUO_CM },
        });
        plan = comp.conResiduos;
        comparacion = comp.ahorro;
      } else {
        plan = optimizarCortes({
          cortesPedidos: g.cortes,
          residuosDisponibles: residuos,
          barraEstandarCm: barraEstandar,
          opciones: { kerfCm: KERF_CM, minResiduoCm: MIN_RESIDUO_CM },
        });
      }

      resultados.push({
        id_perfil: g.id_perfil,
        referencia_perfil: g.referencia_perfil,
        color_perfil: g.color_perfil,
        referencia_aln: g.referencia_aln,         // ← NUEVO: ALN física (fix instructor)
        ubicacion: g.ubicacion,                  // ← NUEVO (fix instructor)
        barraEstandarCm: barraEstandar,
        residuosDisponiblesAlInicio: residuos.length,
        plan,
        comparacion,
      });

      kpiBarrasTotal     += plan.estadisticas.barrasNuevasUsadas;
      kpiResiduosTotal   += plan.estadisticas.residuosReutilizados;
      kpiResiduosNuevos  += plan.estadisticas.residuosNuevosGenerados;
      kpiDesperdicioTotal += plan.estadisticas.longitudDesperdicioCm;
    }

    // 4. KPIs globales
    const longTotalConsumida = resultados.reduce(
      (s, r) => s + r.plan.estadisticas.longitudTotalConsumidaCm, 0);
    const kpisGlobales = {
      gruposOptimizados: resultados.length,
      barrasNuevasTotales: kpiBarrasTotal,
      residuosReutilizadosTotales: kpiResiduosTotal,
      residuosNuevosGenerados: kpiResiduosNuevos,
      desperdicioTotalCm: +kpiDesperdicioTotal.toFixed(2),
      porcentajeDesperdicioGlobal: longTotalConsumida > 0
        ? +(kpiDesperdicioTotal / longTotalConsumida * 100).toFixed(2)
        : 0,
    };

    // 5. Guardar plan (opcional)
    let id_plan = null;
    if (guardar) {
      const { rows } = await pool.query(
        `INSERT INTO planes_corte
           (id_proyecto, id_usuario, plan_json, barras_nuevas, residuos_usados, desperdicio_pct)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING id_plan`,
        [id, req.user?.id || null, JSON.stringify({ resultados, kpisGlobales }),
         kpiBarrasTotal, kpiResiduosTotal, kpisGlobales.porcentajeDesperdicioGlobal]
      );
      id_plan = rows[0].id_plan;
    }

    res.json({
      ok: true,
      id_plan,
      proyecto: pry[0].nombre_proyecto,
      grupos: resultados,
      kpisGlobales,
      configuracion: {
        kerfCm: KERF_CM,
        minResiduoCm: MIN_RESIDUO_CM,
      },
    });
  } catch (err) {
    console.error('[optimizarProyecto]', err);
    res.status(500).json({ error: 'Error al optimizar: ' + err.message });
  }
};

// ═══ POST /api/optimizacion/proyecto/:id/confirmar ═══════════════════════════
// Ejecuta el plan: consume residuos del banco + guarda sobrantes nuevos.
// Es una transacción atómica: o se aplica todo, o no se aplica nada.
const confirmarPlan = async (req, res) => {
  const { id } = req.params;
  const id_usuario = req.user?.id || null;

  try {
    // ── 1. LECTURA (fuera de transacción) ────────────────────────────────
    // Recalcular el plan (no fiarse del frontend para evitar manipulación)
    const grupos = await obtenerCortesPorPerfil(id);
    if (!grupos.length) {
      return res.status(400).json({ error: 'El proyecto no tiene ventanas con cortes' });
    }

    // Snapshot del estado actual del proyecto y plan previo
    const snapshotActual = await obtenerSnapshotVentanas(pool, id);
    const ultimoPlan = await obtenerUltimoPlanConfirmado(pool, id);

    // ── 2. DECIDIR EL MODO ───────────────────────────────────────────────
    // Tres casos posibles:
    //   • 'completo'    → no hay plan previo (primer plan del proyecto)
    //   • 'incremental' → hay plan previo y SOLO se agregaron ventanas nuevas
    //   • 'regenerar'   → hay plan previo y se modificó/eliminó alguna ventana
    //
    // Si el plan previo NO tiene snapshot guardado (planes generados antes
    // de este fix), no podemos comparar → tratar como 'regenerar' por seguridad.
    let modo = 'completo';
    let cambios = null;
    let idsAProcesar = null;

    if (ultimoPlan) {
      const snapshotPrevio = ultimoPlan.plan_json?.ventanas_snapshot;

      if (Array.isArray(snapshotPrevio)) {
        cambios = compararSnapshots(snapshotPrevio, snapshotActual);

        if (cambios.sinCambios) {
          // ── CASO 1: NADA CAMBIÓ ──
          // Ni siquiera abrimos transacción. Devolvemos el plan anterior.
          return res.json({
            ok: true,
            id_plan: ultimoPlan.id_plan,
            modo: 'sin_cambios',
            sinCambios: true,
            barrasNuevasTotales: 0,
            residuosConsumidos: 0,
            residuosNuevos: 0,
            detalles: [],
            mensaje: `El plan #${ultimoPlan.id_plan} ya está confirmado y no hubo cambios en las ventanas del proyecto. No se generaron residuos nuevos.`,
          });
        }

        if (cambios.soloAgregadas) {
          // ── CASO 2: SOLO SE AGREGARON VENTANAS NUEVAS ──
          modo = 'incremental';
          idsAProcesar = new Set(cambios.agregadas.map(v => v.id_ventana));
        } else {
          // ── CASO 3: SE MODIFICÓ O ELIMINÓ UNA VENTANA ──
          modo = 'regenerar';
        }
      } else {
        // Plan previo sin snapshot (legacy) → regenerar por seguridad
        modo = 'regenerar';
      }
    }

    // ── 3. FILTRAR GRUPOS SEGÚN EL MODO ──────────────────────────────────
    // En modo 'incremental' solo procesamos los cortes de las ventanas nuevas;
    // en 'completo' y 'regenerar' se procesa todo.
    let gruposAProcesar = grupos;
    if (modo === 'incremental' && idsAProcesar) {
      gruposAProcesar = grupos
        .map(g => ({
          ...g,
          cortes: g.cortes.filter(c => idsAProcesar.has(c.id_ventana)),
        }))
        .filter(g => g.cortes.length > 0);

      if (gruposAProcesar.length === 0) {
        // Las ventanas nuevas no produjeron cortes (caso defensivo: por ej.
        // ventanas con un diseño que el motor no reconoce). El plan anterior
        // sigue vigente, pero igual actualizamos su snapshot para que la
        // próxima vez no detectemos como "agregadas" estas mismas ventanas.
        await pool.query(
          `UPDATE planes_corte
           SET plan_json = COALESCE(plan_json, '{}'::jsonb) ||
                           jsonb_build_object('ventanas_snapshot', $1::jsonb)
           WHERE id_plan = $2`,
          [JSON.stringify(snapshotActual), ultimoPlan.id_plan]
        );
        return res.json({
          ok: true,
          id_plan: ultimoPlan.id_plan,
          modo: 'sin_cortes_nuevos',
          sinCambios: true,
          mensaje: `El plan #${ultimoPlan.id_plan} sigue vigente. Las ${cambios.agregadas.length} ventana(s) nueva(s) no generaron cortes adicionales.`,
        });
      }
    }

    // ── 4. EJECUCIÓN (dentro de transacción) ─────────────────────────────
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 4a. CASO 3 (regenerar): anular planes previos y descartar sus residuos
      //     disponibles. Los residuos YA CONSUMIDOS no se tocan (historial real).
      //     CASO 2 (incremental): NO se anula nada. Los residuos del plan
      //     anterior siguen vivos y disponibles para que este plan los reuse.
      //     CASO 'completo' (primer plan): tampoco hay nada que anular.
      let planesPrevios = [];
      let residuosDescartados = 0;
      if (modo === 'regenerar') {
        try {
          const { rows: prev } = await client.query(
            `SELECT id_plan FROM planes_corte
             WHERE id_proyecto = $1
               AND (plan_json::text NOT LIKE '%"estado":"anulado"%' OR plan_json IS NULL)`,
            [id]
          );
          planesPrevios = prev.map(p => p.id_plan);

          if (planesPrevios.length) {
            await client.query(
              `UPDATE planes_corte
               SET plan_json = COALESCE(plan_json, '{}'::jsonb) ||
                               jsonb_build_object(
                                 'estado', 'anulado',
                                 'anulado_en', NOW()::text,
                                 'anulado_por_plan_pendiente', true
                               )
               WHERE id_plan = ANY($1::int[])`,
              [planesPrevios]
            );

            const { rows: descRes } = await client.query(
              `UPDATE residuos_aluminio
               SET estado = 'descartado',
                   actualizado_en = NOW()
               WHERE id_plan_corte = ANY($1::int[])
                 AND estado = 'disponible'
               RETURNING id_residuo`,
              [planesPrevios]
            );
            residuosDescartados = descRes.length;
          }
        } catch (errPrev) {
          // Si la tabla planes_corte no existe o id_plan_corte no está en residuos,
          // seguimos sin anular (esquema viejo).
          console.warn('[confirmarPlan] anulación previa omitida:', errPrev.message);
        }
      }

      // 4b. Crear registro del plan nuevo
      const { rows: planRows } = await client.query(
        `INSERT INTO planes_corte
           (id_proyecto, id_usuario, plan_json, barras_nuevas, residuos_usados, desperdicio_pct)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id_plan`,
        [id, id_usuario,
         JSON.stringify({
           estado: 'procesando',
           fecha_inicio: new Date(),
           modo,
           plan_base: modo === 'incremental' ? ultimoPlan.id_plan : null,
           ventanas_nuevas_procesadas: modo === 'incremental'
             ? Array.from(idsAProcesar)
             : null,
           planes_anulados: planesPrevios,
           residuos_descartados: residuosDescartados,
         }),
         0, 0, 0]
      );
      const id_plan = planRows[0].id_plan;

      let residuosConsumidos = 0;
      let residuosNuevos = 0;
      let barrasNuevasTotales = 0;
      const detalles = [];

      // 4c. Ejecutar plan por cada grupo (perfil + ubicacion + color)
      for (const g of gruposAProcesar) {
        const barraEstandar = await barraRepo.getLongitudPorPerfil(g.id_perfil);
        // En modo INCREMENTAL permitimos consumir residuos del MISMO proyecto:
        // son residuos del plan anterior, que ya están en BD desde antes y son
        // legítimos. (En modo 'completo' o 'regenerar' los excluimos porque
        // o no existen, o serían los que acabamos de descartar.)
        const residuosBanco = await residuoRepo.buscarDisponiblesPorPerfil({
          referencia_perfil: g.referencia_perfil,
          color_perfil: g.color_perfil,
          referencia_aln: g.referencia_aln,
          ubicacion: g.ubicacion,
          excluir_id_proyecto: modo === 'incremental' ? null : parseInt(id),
          incluir_reservados_para: parseInt(id),   // ← FIX v39: ver reservas manuales del Banco
        });

        const plan = optimizarCortes({
          cortesPedidos: g.cortes,
          residuosDisponibles: residuosBanco,
          barraEstandarCm: barraEstandar,
          opciones: { kerfCm: KERF_CM, minResiduoCm: MIN_RESIDUO_CM },
        });

        // Consumir residuos usados del banco (DENTRO de la transacción)
        for (const r of plan.residuosUsados) {
          await residuoRepo.consumir({
            id_residuo: r.id_residuo,
            longitud_usada_cm: r.corte.longitud_cm,
            kerf_cm: KERF_CM,
            id_proyecto: parseInt(id),
            id_ventana: r.corte.id_ventana,
            id_usuario,
            min_reutilizable_cm: MIN_RESIDUO_CM,
            client,
          });
          residuosConsumidos++;
        }

        // Crear residuos nuevos (sobrantes de barras nuevas ≥ MIN_RESIDUO_CM)
        let savepointCounter = 0;
        for (const sob of plan.residuosGenerados) {
          if (sob.origen_barra && sob.longitud_cm >= MIN_RESIDUO_CM) {
            const sp = `sp_res_${++savepointCounter}`;
            await client.query(`SAVEPOINT ${sp}`);
            try {
              await residuoRepo.crear({
                referencia_perfil: g.referencia_perfil,
                color_perfil: g.color_perfil,
                ubicacion: g.ubicacion,
                longitud_cm: sob.longitud_cm,
                id_proyecto_origen: parseInt(id),
                id_usuario,
                id_plan_corte: id_plan,
                numero_barra: sob.origen_barra,
                client,
              });
              await client.query(`RELEASE SAVEPOINT ${sp}`);
              residuosNuevos++;
            } catch (errCrear) {
              await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
              console.error(`[confirmarPlan] residuo NO guardado (perfil=${g.referencia_perfil}, ubicacion=${g.ubicacion}, sobrante=${sob.longitud_cm}cm, barra#${sob.origen_barra}):`, errCrear.code, errCrear.message);
              detalles.push({ tipo: 'residuo_fallido', perfil: g.referencia_perfil, error: errCrear.message });
            }
          }
        }

        barrasNuevasTotales += plan.estadisticas.barrasNuevasUsadas;
        detalles.push({
          perfil: g.referencia_perfil,
          color: g.color_perfil,
          barrasNuevas: plan.estadisticas.barrasNuevasUsadas,
          residuosUsados: plan.residuosUsados.length,
          sobrantesGuardados: plan.residuosGenerados.filter(r => r.origen_barra && r.longitud_cm >= MIN_RESIDUO_CM).length,
          desperdicioPct: plan.estadisticas.porcentajeDesperdicio,
        });
      }

      // 4d. UPDATE plan con resultado final + snapshot del estado COMPLETO.
      //
      //   IMPORTANTE: el `ventanas_snapshot` que se guarda es el snapshot
      //   ACTUAL DEL PROYECTO ENTERO (no solo lo procesado en este plan).
      //   Esto es esencial para que la SIGUIENTE confirmación compare contra
      //   la realidad del proyecto y no contra un subconjunto.
      //
      //   Se usa `||` (jsonb merge) para preservar los metadatos del INSERT
      //   inicial (modo, plan_base, planes_anulados, etc.). La clave `estado`
      //   del derecho gana, así pasa de 'procesando' a 'confirmado'.
      await client.query(
        `UPDATE planes_corte
         SET plan_json = COALESCE(plan_json, '{}'::jsonb) || $1::jsonb,
             barras_nuevas=$2, residuos_usados=$3, desperdicio_pct=$4
         WHERE id_plan=$5`,
        [JSON.stringify({
           detalles,
           estado: 'confirmado',
           fecha: new Date(),
           ventanas_snapshot: snapshotActual,
           modo,
         }),
         barrasNuevasTotales, residuosConsumidos,
         detalles.length ? +(detalles.reduce((s, d) => s + d.desperdicioPct, 0) / detalles.length).toFixed(2) : 0,
         id_plan]
      );

      await client.query('COMMIT');

      // 5. Registro en historial del proyecto (fuera de la transacción)
      try {
        const partes = [];
        if (modo === 'incremental') {
          partes.push(`INCREMENTAL sobre plan #${ultimoPlan.id_plan} — ${cambios.agregadas.length} ventana(s) nueva(s)`);
        }
        partes.push(`${barrasNuevasTotales} barras nuevas`);
        partes.push(`${residuosConsumidos} residuos consumidos del banco`);
        partes.push(`${residuosNuevos} sobrantes guardados`);
        if (residuosDescartados > 0) {
          partes.push(`${residuosDescartados} sobrantes de planes previos marcados como descartados (auditoría)`);
        }
        await pool.query(
          `INSERT INTO historial_proyectos (id_proyecto, accion)
           VALUES ($1, $2)`,
          [id, `Plan de Corte #${id_plan} confirmado — ${partes.join(', ')}`]
        );
      } catch { /* tabla puede no existir, no crítico */ }

      // 6. Respuesta con mensaje adaptado al modo
      const mensaje = modo === 'incremental'
        ? `Plan #${id_plan} INCREMENTAL sobre plan #${ultimoPlan.id_plan}. Procesadas ${cambios.agregadas.length} ventana(s) nueva(s): +${residuosNuevos} sobrantes, -${residuosConsumidos} consumidos del banco. Los residuos del plan anterior se mantienen vigentes.`
        : modo === 'regenerar'
          ? `Plan #${id_plan} REGENERADO (cambios en ${cambios.modificadas.length} y/o eliminadas ${cambios.eliminadas.length} ventana(s) existente(s)). Plan(es) anterior(es) anulado(s). Banco: +${residuosNuevos} nuevos, -${residuosConsumidos} consumidos, ${residuosDescartados} descartados.`
          : `Plan #${id_plan} ejecutado. Banco actualizado: +${residuosNuevos} nuevos, -${residuosConsumidos} consumidos.`;

      res.json({
        ok: true,
        id_plan,
        modo,
        sinCambios: false,
        ventanasNuevasProcesadas: modo === 'incremental' ? cambios.agregadas.length : null,
        planBaseId: modo === 'incremental' ? ultimoPlan.id_plan : null,
        residuosConsumidos,
        residuosNuevos,
        residuosDescartados,
        barrasNuevasTotales,
        detalles,
        mensaje,
      });
    } catch (errInner) {
      await client.query('ROLLBACK').catch(() => {});
      throw errInner;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[confirmarPlan]', err);
    res.status(500).json({ error: 'Error al confirmar plan: ' + err.message });
  }
};

// ═══ GET /api/optimizacion/proyecto/:id/planes ═══════════════════════════════
const listarPlanes = async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT id_plan, barras_nuevas, residuos_usados, desperdicio_pct, creado_en
       FROM planes_corte
       WHERE id_proyecto=$1
       ORDER BY creado_en DESC
       LIMIT 20`,
      [id]
    );
    res.json({ ok: true, planes: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ═══ GET /api/optimizacion/plan/:id ══════════════════════════════════════════
const obtenerPlan = async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT * FROM planes_corte WHERE id_plan=$1`, [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Plan no encontrado' });
    res.json({ ok: true, plan: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ═══ Barras estándar ═════════════════════════════════════════════════════════
const listarBarras = async (req, res) => {
  try { res.json({ ok: true, barras: await barraRepo.listar() }); }
  catch (err) { res.status(500).json({ error: err.message }); }
};

const crearBarra = async (req, res) => {
  try {
    const id = await barraRepo.crear(req.body);
    res.status(201).json({ ok: true, id_barra: id });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const actualizarBarra = async (req, res) => {
  try {
    await barraRepo.actualizar(req.params.id, req.body);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const eliminarBarra = async (req, res) => {
  try {
    await barraRepo.eliminar(req.params.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ═══ GET /api/optimizacion/proyecto/:id/plan-pdf ═════════════════════════════
// Genera el PDF del plan de corte (descargable). NO escribe en BD: es la
// misma optimización borrador que ve el modal, pero como documento.
// Estructura interna idéntica a `optimizarProyecto` para mantener consistencia.
const generarPDFPlan = async (req, res) => {
  const { id } = req.params;
  try {
    // 1. Validar acceso al proyecto
    const { rows: proy } = await pool.query(
      `SELECT p.id_proyecto AS id,
              p.nombre_proyecto AS nombre,
              p.nombre_cliente  AS cliente
       FROM proyectos p WHERE p.id_proyecto = $1`,
      [id]
    );
    if (!proy.length) return res.status(404).json({ error: 'Proyecto no encontrado' });
    const proyecto = proy[0];

    // 2. Recalcular plan (misma lógica de optimizarProyecto, no escribe BD)
    const grupos = await obtenerCortesPorPerfil(id);
    const erroresVent = grupos._errores || [];
    if (!grupos.length) {
      return res.status(400).json({
        error: 'El proyecto no tiene cortes calculables para generar el plan.',
        ventanas_con_error: erroresVent,
      });
    }

    const planPorGrupo = [];
    let totalLongitudUsada = 0;
    let totalLongitudDisponible = 0;
    let barrasNuevasTotales = 0;
    let residuosReutilizadosTotales = 0;
    let residuosNuevosGenerados = 0;

    for (const g of grupos) {
      const barraEstandarCm = await barraRepo.getLongitudPorPerfil(g.id_perfil);
      const residuosBanco = await residuoRepo.buscarDisponiblesPorPerfil({
        referencia_perfil: g.referencia_perfil,
        color_perfil: g.color_perfil,
        referencia_aln: g.referencia_aln,         // ← NUEVO: ALN física (fix instructor)
        ubicacion: g.ubicacion,                  // ← NUEVO (fix instructor)
        excluir_id_proyecto: parseInt(id),
        incluir_reservados_para: parseInt(id),   // ← FIX v39: ver reservas manuales del Banco
      });

      // Optimización: una sola pasada con compararConSinResiduos.
      const comp = compararConSinResiduos({
        cortesPedidos: g.cortes,
        residuosDisponibles: residuosBanco.map(r => ({
          id_residuo: r.id,
          longitud_cm: parseFloat(r.longitud_cm),
        })),
        barraEstandarCm,
        opciones: { kerfCm: KERF_CM, minResiduoCm: MIN_RESIDUO_CM },
      });
      const plan = comp.conResiduos;

      planPorGrupo.push({
        id_perfil: g.id_perfil,
        referencia_perfil: g.referencia_perfil,
        color_perfil: g.color_perfil,
        referencia_aln: g.referencia_aln,         // ← NUEVO: ALN física (fix instructor)
        ubicacion: g.ubicacion,                  // ← NUEVO (fix instructor)
        barraEstandarCm,
        plan,
        comparacion: comp.ahorro,
      });

      const est = plan?.estadisticas || {};
      totalLongitudUsada      += est.longitudCortadaTotal    || est.longitudTotalUtilCm     || 0;
      totalLongitudDisponible += est.longitudDisponibleTotal || est.longitudTotalConsumidaCm|| 0;
      barrasNuevasTotales     += est.barrasNuevasUsadas      || 0;
      residuosReutilizadosTotales += est.residuosReutilizados || 0;
      residuosNuevosGenerados += (plan?.residuosGenerados || [])
        .filter(r => r.origen_barra && r.longitud_cm >= MIN_RESIDUO_CM).length;
    }

    const kpisGlobales = {
      barrasNuevasTotales,
      residuosReutilizadosTotales,
      residuosNuevosGenerados,
      porcentajeDesperdicioGlobal: totalLongitudDisponible > 0
        ? +((1 - totalLongitudUsada / totalLongitudDisponible) * 100).toFixed(2)
        : 0,
    };

    // 3. Validación previa: ¿hay datos suficientes para un PDF útil?
    //    USAR kpisGlobales (que YA se calcularon arriba leyendo de
    //    plan.estadisticas, fuente única de verdad del optimizer) en lugar
    //    de re-contar arrays. Evita bugs por nombres de propiedad cambiados.
    const totalGrupos = planPorGrupo.length;
    const totalBarras = (kpisGlobales.barrasNuevasTotales || 0)
                      + (kpisGlobales.residuosReutilizadosTotales || 0);
    // Cortes: contar directamente del plan para tener números reales del PDF
    const totalCortes = planPorGrupo.reduce((s, g) => {
      const enBarras = (g.plan?.barrasNuevas || [])
        .reduce((a, b) => a + ((b?.cortes || []).length), 0);
      const enResiduos = (g.plan?.residuosUsados || []).filter(r => r?.corte).length;
      return s + enBarras + enResiduos;
    }, 0);

    console.log(`[generarPDFPlan id=${id}] datos del plan:`, {
      proyecto: proyecto.nombre,
      grupos: totalGrupos,
      barrasNuevas: kpisGlobales.barrasNuevasTotales || 0,
      residuosUsados: kpisGlobales.residuosReutilizadosTotales || 0,
      cortes: totalCortes,
      kpis: kpisGlobales,
    });

    // Rechazar SOLO si el plan está REALMENTE vacío.
    // Tolerancia: si hay barras Y/O residuos usados, hay algo que mostrar.
    if (totalGrupos === 0 || totalBarras === 0) {
      console.warn(`[generarPDFPlan id=${id}] datos insuficientes → 400 (grupos=${totalGrupos}, barras=${totalBarras})`);
      return res.status(400).json({
        error: 'No hay datos suficientes para generar el PDF de optimización. '
             + 'El proyecto debe tener al menos una ventana con cortes calculables.',
      });
    }

    // 4. Renderizar PDF (require diferido + try/catch que distingue tipos de error)
    let buildCutPlanHTML, htmlToPDF;
    try {
      ({ buildCutPlanHTML } = require('../services/pdfCutPlanTemplate'));
      ({ htmlToPDF } = require('../services/pdfRenderer'));
    } catch (errRequire) {
      console.error('[generarPDFPlan] no se pudieron cargar servicios PDF:', errRequire.message);
      return res.status(500).json({
        error: 'Servicios de generación PDF no disponibles. Verifica que puppeteer esté instalado en el backend.',
      });
    }

    let html;
    try {
      html = buildCutPlanHTML({
        proyecto,
        planData: {
          grupos: planPorGrupo,
          kpisGlobales,
          configuracion: { kerfCm: KERF_CM, minResiduoCm: MIN_RESIDUO_CM },
        },
        generadoEn: new Date(),
      });
    } catch (errTpl) {
      console.error('[generarPDFPlan] error al construir HTML:', errTpl);
      return res.status(500).json({
        error: 'Error al construir el HTML del plan: ' + errTpl.message,
      });
    }

    // Validación del HTML antes de pasarlo a Puppeteer
    if (!html || typeof html !== 'string' || html.length < 100) {
      console.error(`[generarPDFPlan id=${id}] HTML inválido tras construir template (len=${html?.length || 0})`);
      return res.status(500).json({
        error: 'El template produjo un HTML vacío o demasiado corto.',
      });
    }
    if (!html.includes('<html') || !html.includes('<body')) {
      console.error(`[generarPDFPlan id=${id}] HTML sin estructura <html>/<body>`);
      return res.status(500).json({
        error: 'El template produjo un HTML sin estructura válida.',
      });
    }
    console.log(`[generarPDFPlan id=${id}] HTML construido: ${html.length} chars`);

    let pdfBuffer;
    try {
      pdfBuffer = await htmlToPDF(html, { format: 'A4' });
    } catch (errRender) {
      console.error('[generarPDFPlan] error en Puppeteer:', errRender.message);
      return res.status(500).json({
        error: 'No se pudo renderizar el PDF. ' + errRender.message
             + ' Si el problema persiste, verifica que Chromium esté instalado en el servidor o configura PUPPETEER_EXECUTABLE_PATH.',
      });
    }

    // Sanity check final antes de enviarlo al navegador
    if (!pdfBuffer || pdfBuffer.length < 100) {
      return res.status(500).json({
        error: 'El PDF se generó vacío (Puppeteer retornó buffer inválido).',
      });
    }

    const filename = `Plan_Corte_${(proyecto.nombre || 'proyecto').replace(/[^a-z0-9_-]/gi, '_')}.pdf`;
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Content-Length': pdfBuffer.length,
    });
    return res.send(pdfBuffer);
  } catch (err) {
    console.error('[generarPDFPlan UNCAUGHT]', err);
    res.status(500).json({ error: 'Error al generar el PDF del plan: ' + err.message });
  }
};

module.exports = {
  optimizarProyecto,
  confirmarPlan,
  listarPlanes,
  obtenerPlan,
  listarBarras,
  crearBarra,
  actualizarBarra,
  eliminarBarra,
  generarPDFPlan,
};
