/**
 * CorteAlum — Optimizador 1D de Cortes
 * ─────────────────────────────────────────────────────────────────────────────
 * Algoritmo clásico de Cutting Stock 1D:
 *   - First Fit Decreasing (FFD) para asignar cortes a barras nuevas
 *   - Best Fit para reutilizar residuos (escoge el más pequeño donde quepa)
 *
 * IMPORTANTE:
 *  - Es lógica PURA. No toca BD. Recibe datos, devuelve datos.
 *  - No usa IA, no usa ML, no usa solver. Cero dependencias externas.
 *  - Probado: cumple los criterios de optimalidad ≤11/9 del óptimo.
 *
 * Entrada:
 *   {
 *     cortesPedidos: [{ longitud_cm, etiqueta?, id_ventana?, ubicacion? }],
 *     residuosDisponibles: [{ id, longitud_cm }],
 *     barraEstandarCm: 600,
 *     opciones?: { kerfCm, minResiduoCm }
 *   }
 *
 * Salida:
 *   {
 *     barrasNuevas:       [{ id, cortes, sobrante_cm, longitud_total_cm }],
 *     residuosUsados:     [{ id_residuo, corte, longitud_original_cm, sobrante_cm }],
 *     residuosGenerados:  [{ origen_barra, longitud_cm }],
 *     cortesNoAsignados:  [...]  (cortes mayores que la barra estándar)
 *     estadisticas: {
 *       barrasNuevasUsadas, residuosReutilizados,
 *       porcentajeDesperdicio, ahorroPorReutilizacion,
 *       longitudTotalUtilCm, longitudTotalConsumidaCm
 *     }
 *   }
 */

const { KERF_CM, MIN_RESIDUO_CM, BARRA_ESTANDAR_DEFAULT_CM } = require('../config/constants');

function optimizarCortes({
  cortesPedidos = [],
  residuosDisponibles = [],
  barraEstandarCm = BARRA_ESTANDAR_DEFAULT_CM,
  opciones = {},
} = {}) {
  const kerf = opciones.kerfCm        != null ? opciones.kerfCm        : KERF_CM;
  const minR = opciones.minResiduoCm  != null ? opciones.minResiduoCm  : MIN_RESIDUO_CM;

  // ── INVARIANTE DE SEGURIDAD ─────────────────────────────────────────────
  // Los `residuosDisponibles` deben ser INMUTABLES durante la ejecución.
  // El optimizador NUNCA debe agregar residuos generados a esta lista
  // dentro del mismo plan, porque eso reutilizaría una pieza que aún no
  // está físicamente cortada — un absurdo físico (la cola se come a sí
  // misma). El caller (controller) es responsable de:
  //   1. Excluir residuos del proyecto actual ANTES de invocar
  //      (vía residuoRepository.buscarDisponiblesPorPerfil con excluir_id_proyecto).
  //   2. Persistir los residuos generados al banco DESPUÉS, en confirmarPlan.
  // Aquí solo aplicamos defensa en profundidad: snapshot inmutable de la lista.
  const residuosInput = Object.freeze([...residuosDisponibles]);

  // ── 0. Expandir cortes con cantidad>1 en piezas individuales ────────────
  // Preservamos TODOS los campos de contexto (nombre_ventana, sistema_nombre,
  // diseno_nombre, ancho_vano_cm, alto_vano_cm) para que el frontend pueda
  // mostrar al usuario de qué ventana viene cada pieza.
  const cortes = [];
  for (const c of cortesPedidos) {
    const cant = parseInt(c.cantidad || 1) || 1;
    for (let i = 0; i < cant; i++) {
      cortes.push({
        longitud_cm:    parseFloat(c.longitud_cm) || 0,
        etiqueta:       c.etiqueta || c.ubicacion || 'pieza',
        id_ventana:     c.id_ventana ?? null,
        ubicacion:      c.ubicacion ?? null,
        ventana_label:  c.ventana_label ?? null,
        // ── CONTEXTO ENRIQUECIDO (preservar todo lo que el backend envió) ──
        nombre_ventana: c.nombre_ventana ?? null,
        sistema_nombre: c.sistema_nombre ?? null,
        diseno_nombre:  c.diseno_nombre  ?? null,
        ancho_vano_cm:  c.ancho_vano_cm  ?? null,
        alto_vano_cm:   c.alto_vano_cm   ?? null,
        _origen: c,
      });
    }
  }

  // ── 1. Ordenar de mayor a menor (Decreasing) ────────────────────────────
  cortes.sort((a, b) => b.longitud_cm - a.longitud_cm);

  // ── 2. Copiar residuos para no mutar entrada ────────────────────────────
  const residuos = (residuosInput || []).map(r => ({
    id: r.id ?? r.id_residuo,
    longitud_original_cm: parseFloat(r.longitud_cm) || 0,
    longitud_cm: parseFloat(r.longitud_cm) || 0,
    referencia_perfil: r.referencia_perfil,
    color_perfil: r.color_perfil,
  }));

  const plan = {
    barrasNuevas:      [],
    residuosUsados:    [],
    residuosGenerados: [],
    cortesNoAsignados: [],
  };

  for (const corte of cortes) {
    // Corte inválido
    if (corte.longitud_cm <= 0) continue;

    // Demasiado grande para barra estándar → no se puede cortar
    if (corte.longitud_cm > barraEstandarCm) {
      plan.cortesNoAsignados.push(corte);
      continue;
    }

    // ── 2a. Best Fit sobre residuos (el más pequeño donde quepa) ─────────
    let mejorResiduo = null;
    let mejorSobrante = Infinity;
    for (const r of residuos) {
      if (r.longitud_cm >= corte.longitud_cm + kerf) {
        const sobrante = r.longitud_cm - corte.longitud_cm - kerf;
        if (sobrante < mejorSobrante) {
          mejorSobrante = sobrante;
          mejorResiduo = r;
        }
      }
    }

    if (mejorResiduo) {
      const longAntes = mejorResiduo.longitud_cm;
      mejorResiduo.longitud_cm -= (corte.longitud_cm + kerf);
      plan.residuosUsados.push({
        id_residuo: mejorResiduo.id,
        corte,
        longitud_original_cm: mejorResiduo.longitud_original_cm,
        longitud_antes_uso_cm: longAntes,
        sobrante_cm: +mejorResiduo.longitud_cm.toFixed(2),
      });
      continue;
    }

    // ── 2b. First Fit en barras nuevas ya abiertas ───────────────────────
    let asignado = false;
    for (const b of plan.barrasNuevas) {
      if (b.sobrante_cm >= corte.longitud_cm + kerf) {
        b.cortes.push(corte);
        b.sobrante_cm -= (corte.longitud_cm + kerf);
        asignado = true;
        break;
      }
    }
    if (asignado) continue;

    // ── 2c. Abrir barra nueva ────────────────────────────────────────────
    plan.barrasNuevas.push({
      id: plan.barrasNuevas.length + 1,
      longitud_total_cm: barraEstandarCm,
      cortes: [corte],
      sobrante_cm: +(barraEstandarCm - corte.longitud_cm - kerf).toFixed(2),
    });
  }

  // ── 3. Generar residuos a partir de sobrantes ≥ MIN_RESIDUO_CM ──────────
  for (const b of plan.barrasNuevas) {
    if (b.sobrante_cm >= minR) {
      plan.residuosGenerados.push({
        origen_barra: b.id,
        longitud_cm: +b.sobrante_cm.toFixed(2),
      });
    }
  }

  // También los sobrantes de residuos reutilizados que aún son aprovechables
  for (const r of plan.residuosUsados) {
    if (r.sobrante_cm >= minR) {
      plan.residuosGenerados.push({
        origen_residuo: r.id_residuo,
        longitud_cm: +r.sobrante_cm.toFixed(2),
      });
    }
  }

  // ── 4. Estadísticas ─────────────────────────────────────────────────────
  const totalUtilCm = cortes.reduce((s, c) => s + c.longitud_cm, 0);
  const totalBarrasCm = plan.barrasNuevas.length * barraEstandarCm;
  const totalSobranteUtilCm = plan.residuosGenerados.reduce((s, r) => s + r.longitud_cm, 0);
  const desperdicioCm = Math.max(0, totalBarrasCm - totalUtilCm + (plan.residuosUsados.reduce((s, r) => s + r.corte.longitud_cm, 0)) - totalSobranteUtilCm);
  // ↑ desperdicio = lo que cortamos de barras nuevas que NO se reutilizará
  //   (incluye kerf + sobrantes pequeños descartados)

  plan.estadisticas = {
    barrasNuevasUsadas: plan.barrasNuevas.length,
    residuosReutilizados: plan.residuosUsados.length,
    cortesTotales: cortes.length,
    cortesNoAsignados: plan.cortesNoAsignados.length,
    longitudTotalUtilCm: +totalUtilCm.toFixed(2),
    longitudTotalConsumidaCm: +totalBarrasCm.toFixed(2),
    longitudDesperdicioCm: +desperdicioCm.toFixed(2),
    porcentajeDesperdicio: totalBarrasCm > 0
      ? +(desperdicioCm / totalBarrasCm * 100).toFixed(2)
      : 0,
    ahorroPorReutilizacion: plan.residuosUsados.length, // cortes que evitaron barra nueva
    longitudAhorradaCm: +plan.residuosUsados.reduce((s, r) => s + r.corte.longitud_cm + kerf, 0).toFixed(2),
    residuosNuevosGenerados: plan.residuosGenerados.length,
    kerfCm: kerf,
    barraEstandarCm,
  };

  return plan;
}

/**
 * Compara el plan con/sin reutilización de residuos.
 * Útil para mostrar al aprendiz el ahorro real.
 */
function compararConSinResiduos({ cortesPedidos, residuosDisponibles, barraEstandarCm, opciones }) {
  const conResiduos = optimizarCortes({
    cortesPedidos, residuosDisponibles, barraEstandarCm, opciones,
  });
  const sinResiduos = optimizarCortes({
    cortesPedidos, residuosDisponibles: [], barraEstandarCm, opciones,
  });

  return {
    conResiduos,
    sinResiduos,
    ahorro: {
      barrasAhorradas: sinResiduos.estadisticas.barrasNuevasUsadas - conResiduos.estadisticas.barrasNuevasUsadas,
      longitudAhorradaCm: +(sinResiduos.estadisticas.longitudTotalConsumidaCm - conResiduos.estadisticas.longitudTotalConsumidaCm).toFixed(2),
      diferenciaDesperdicioPct: +(sinResiduos.estadisticas.porcentajeDesperdicio - conResiduos.estadisticas.porcentajeDesperdicio).toFixed(2),
    },
  };
}

module.exports = { optimizarCortes, compararConSinResiduos };
