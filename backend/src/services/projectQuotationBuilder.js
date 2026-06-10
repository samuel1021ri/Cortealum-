/**
 * CorteAlum — Project Quotation Builder v3 (Excel-style template compatible)
 * ─────────────────────────────────────────────────────────────────────────────
 * Cambios v3 respecto al builder original del zip:
 *   • Produce TODOS los campos económicos a nivel proyecto que el template
 *     Excel-style espera leer en `totals.*`:
 *       - materialesConRecargo, manoObra, utilidad
 *       - subtotal (= matRecargo + MO + utilidad)
 *       - iva, ivaPct
 *       - totalSinInstalacion (= subtotal + iva)
 *       - totalConInstalacion (= totalSinInstalacion + instalacion)
 *       - totalFinal (= totalConInstalacion)  ← misma definición que el zip
 *       - totalConTransporte (= totalFinal + transportes)
 *       - subtotalMateriales (sin recargo)
 *       - recargoMateriales (valor absoluto, no %)
 *   • Duplica nombres en `globalCosts` con alias del template:
 *       diasManoObra ⇄ diasProyectados
 *       personas ⇄ cantidadPersonas
 *       costoManoObraTotal ⇄ manoObra
 *       utilidad ⇄ utilidadValor
 *       recargoMaterialesPct ⇄ recargoPct
 *   • Recalcula defensivamente: si la BD trae 0 en algún subtotal, lo
 *     reconstruye desde sus componentes. Igual que ya hacía el zip para totalFinal.
 *   • Mantiene `system` / `line` / `design` / `glassType` en cada ventana
 *     (el template ya usa fallback duales con los nombres viejos).
 */

const { buildGlassesFromEngine, sumGlasses } = require('./glassCalculator');

const num = (v) => parseFloat(v || 0) || 0;
const int = (v) => parseInt(v || 0) || 0;

function detectGlassPrice(ventana, fallback) {
  return num(ventana.precio_vidrio_m2 || ventana.precio_m2_vidrio || fallback || 0);
}

function detectGlassType(ventana) {
  return ventana.tipo_vidrio || ventana.referencia_vidrio || 'Vidrio 5mm';
}

function buildWindow(ventana, detallesDeVentana, vidriosEngine, opts = {}) {
  const widthCm  = num(ventana.ancho_vano);
  const heightCm = num(ventana.alto_vano);
  const width  = +(widthCm  / 100).toFixed(4);    // cm → m
  const height = +(heightCm / 100).toFixed(4);
  const perimeter = +(2 * (width + height)).toFixed(3);

  const ventanaUnit = (ventana.ancho_unidad || ventana.alto_unidad || 'cm').toLowerCase();
  const useMm = ventanaUnit === 'mm';

  // ── Perfiles ──
  const profiles = detallesDeVentana
    .filter(d => !d.tipo_item || d.tipo_item === 'perfil')
    .filter(d => !/\((accesorio|vidrio)\)/i.test(d.nombre_item || ''))
    .map(d => {
      const rawName = d.nombre_item || d.nombre_material || d.descripcion || '—';
      const cleanName = rawName.replace(/^\[V\d+\]\s*/i, '').trim();
      const pieces    = (d.cantidad_piezas != null) ? num(d.cantidad_piezas) : null;
      const cmTotal   = num(d.cantidad_total || d.cantidad);
      const pricePerCm = num(d.precio_unitario_snapshot || d.precio_unitario);
      return {
        ref: d.referencia || d.ref || '—',
        name: cleanName || rawName,
        color: d.color_perfil || ventana.color_perfil || 'Natural',
        pieces,
        quantity: useMm ? cmTotal * 10 : cmTotal,
        unit: useMm ? 'mm' : 'cm',
        price:    useMm ? pricePerCm / 10 : pricePerCm,
        subtotal: num(d.subtotal),
      };
    });

  // ── Accesorios ──
  const accessories = detallesDeVentana
    .filter(d => d.tipo_item === 'accesorio'
                 || (!d.tipo_item && /\(accesorio\)/i.test(d.nombre_item || '')))
    .map(d => {
      const rawName = d.nombre_item || d.nombre_material || d.descripcion || '—';
      const cleanName = rawName
        .replace(/^\[V\d+\]\s*/i, '')
        .replace(/\s*\(accesorio\)\s*$/i, '')
        .trim();
      const esLongitud = /felpa|empaque/i.test(cleanName);
      // Felpa y empaque se muestran y cobran SIEMPRE en metro lineal (ml),
      // sin importar la unidad (cm/mm) de la ventana. La cantidad ya viene en
      // ml desde el controller; no se re-convierte. El resto de accesorios
      // conserva su unidad (und/par).
      const finalValue = num(d.cantidad_total || d.cantidad);
      return {
        name: cleanName || rawName,
        quantity: finalValue,
        unit: esLongitud ? 'ml' : (d.unidad_medida || 'und'),
        price: num(d.precio_unitario_snapshot || d.precio_unitario),
        subtotal: num(d.subtotal),
      };
    });

  // ── Vidrios ──
  const vidriosGuardados = detallesDeVentana.filter(d =>
    d.tipo_item === 'vidrio'
    || ((!d.tipo_item || d.tipo_item === 'perfil') && /\(vidrio\)/i.test(d.nombre_item || ''))
  );
  const priceM2 = detectGlassPrice(ventana, opts.priceM2Fallback);
  const tipoVidrio = detectGlassType(ventana);

  let glasses;
  if (vidriosGuardados.length > 0) {
    glasses = vidriosGuardados.map((d, i) => {
      const fromEngine = (vidriosEngine || [])[i] || {};
      const wCm  = parseFloat(fromEngine.ancho || 0);
      const hCm  = parseFloat(fromEngine.alto  || 0);
      const qty  = parseInt(fromEngine.cantidad || 1) || 1;
      const wM   = +(wCm * 0.01).toFixed(4);
      const hM   = +(hCm * 0.01).toFixed(4);
      const areaTotal = num(d.cantidad_total);
      const priceM2D  = num(d.precio_unitario_snapshot || d.precio_unitario);
      const subtotal  = num(d.subtotal) || Math.round(areaTotal * priceM2D);
      return {
        tipo: d.nombre_item || `${tipoVidrio} · ${fromEngine.ubicacion || 'VIDRIO'}`,
        ubicacion: fromEngine.ubicacion || '',
        ref_vidrio: fromEngine.ref_vidrio || ventana.referencia_vidrio || '5MM',
        width: wM, height: hM, quantity: qty,
        priceM2: priceM2D,
        areaUnit: +(wM * hM).toFixed(4),
        areaTotal, subtotal,
        unit: 'm',
      };
    });
  } else {
    glasses = buildGlassesFromEngine(vidriosEngine, {
      priceM2, tipo: tipoVidrio,
      unit: opts.unit || 'cm',
    });
  }

  const subProfiles    = profiles.reduce((s, p) => s + p.subtotal, 0);
  const subGlasses     = sumGlasses(glasses);
  const subAccessories = accessories.reduce((s, a) => s + a.subtotal, 0);
  const total = subProfiles + subGlasses + subAccessories;

  return {
    id: ventana.id_ventana,
    name: ventana.nombre || ventana.notas || `Ventana ${ventana.id_ventana}`,
    system: ventana.sistema || ventana.ventana_sistema || '—',
    line:   ventana.perfil  || ventana.referencia_perfil || ventana.perfil_referencia || '—',
    design: ventana.diseno  || ventana.ventana_diseno  || '—',
    glassType: tipoVidrio,
    colorPerfil: ventana.color_perfil || 'Natural',
    unidad: ventana.ancho_unidad || ventana.alto_unidad || opts.unit || 'cm',
    dimensions: { width, height, perimeter },
    profiles, glasses, accessories,
    labor: {},
    totals: {
      profiles:    Math.round(subProfiles),
      glasses:     Math.round(subGlasses),
      accessories: Math.round(subAccessories),
      total:       Math.round(total),
    },
  };
}

function buildProjectQuotation(payload, opts = {}) {
  const cot = payload || {};
  const detalles = cot.detalles || [];
  const ventanas = cot.ventanas || [];
  const vpv = cot.vidrios_por_ventana || [];

  const detallesPorVentana = {};
  for (const d of detalles) {
    const k = d.id_ventana || 'sin_ventana';
    if (!detallesPorVentana[k]) detallesPorVentana[k] = [];
    detallesPorVentana[k].push(d);
  }

  const vidriosPorVentana = {};
  for (const v of vpv) vidriosPorVentana[v.id_ventana] = v.vidrios || [];

  const windows = ventanas.map(v => buildWindow(
    v,
    detallesPorVentana[v.id_ventana] || [],
    vidriosPorVentana[v.id_ventana] || [],
    opts
  ));

  const detallesProyecto = detallesPorVentana['sin_ventana'] || [];
  const totalPerfiles = windows.reduce((s, w) => s + w.totals.profiles, 0)
                     + detallesProyecto
                         .filter(d => !d.tipo_item || d.tipo_item === 'perfil')
                         .reduce((s, d) => s + num(d.subtotal), 0);
  const totalVidrios = windows.reduce((s, w) => s + w.totals.glasses, 0);
  const totalAccesorios = windows.reduce((s, w) => s + w.totals.accessories, 0)
                       + detallesProyecto
                           .filter(d => d.tipo_item === 'accesorio')
                           .reduce((s, d) => s + num(d.subtotal), 0);

  // ── Costos económicos del proyecto ──────────────────────────────────────
  // Política: la BD es la fuente de verdad cuando trae datos; recalculamos
  // defensivamente solo cuando un campo vino 0/null/undefined.
  const subtotalMateriales = num(cot.subtotal_materiales) || (totalPerfiles + totalAccesorios);
  const recargoPct         = num(cot.recargo_materiales_pct);
  const subtotalMateriales_ConRecargo = num(cot.subtotal_materiales_con_recargo)
                                         || +(subtotalMateriales * (1 + recargoPct / 100)).toFixed(2);
  const recargoMaterialesValor = +(subtotalMateriales_ConRecargo - subtotalMateriales).toFixed(2);

  const manoObra      = num(cot.subtotal_mano_obra);
  const utilidadPct   = num(cot.utilidad_pct);
  const utilidadValor = num(cot.utilidad_valor) || +(manoObra * utilidadPct / 100).toFixed(2);
  const ivaPct        = num(cot.iva_pct);
  const ivaValorBD    = num(cot.iva_valor);

  // Subtotal antes de IVA: materiales con recargo + mano de obra + utilidad
  const subtotalAntesIva = +(subtotalMateriales_ConRecargo + manoObra + utilidadValor).toFixed(2);
  const ivaValor         = ivaValorBD || +(subtotalAntesIva * ivaPct / 100).toFixed(2);

  // Recalcular cascada de totales defensivamente
  const totalSinInstalacionBD = num(cot.total_sin_instalacion);
  const totalSinInstalacion   = totalSinInstalacionBD || +(subtotalAntesIva + ivaValor).toFixed(2);

  const instalacion = num(cot.instalacion);
  const transpEst   = num(cot.transporte_estructuras);
  const transpPers  = num(cot.transporte_personal);
  const subTransp   = transpEst + transpPers;

  // totalConInstalacion = totalSinInstalacion + instalacion  (definición fija)
  // SIEMPRE se recalcula desde componentes. Ignoramos cot.total_con_instalacion
  // si viene de BD porque históricamente la semántica de ese campo es ambigua
  // y puede llegar inconsistente con la cascada del PDF.
  const totalConInstalacion = +(totalSinInstalacion + instalacion).toFixed(2);

  // totalFinal ≡ totalConInstalacion (lo que el cliente paga con instalación incluida,
  // sin transportes). IGNORAMOS cot.total_final de BD porque históricamente ese
  // campo significaba "sin instalación" en algunas cotizaciones y "con instalación"
  // en otras — bug recurrente que producía "Total Proyecto" inconsistente con
  // "Total Final + Transportes" en el PDF.
  const totalFinal = totalConInstalacion;

  // totalConTransporte ≡ "Total Proyecto" = lo que paga el cliente CON todo
  // (instalación + transportes). DEBE cumplir la identidad visual del PDF:
  //   Total Final (con instal., sin transp.) + Transportes = Total Proyecto
  const totalConTransporte = +(totalFinal + subTransp).toFixed(2);

  const cotNum = String(cot.id_cotizacion || '0').padStart(4, '0');
  const cotRef = `COT-${new Date(cot.fecha_cotizacion || Date.now()).getFullYear()}-${cotNum}`;

  const empresaDefault = {
    nombre: 'CorteAlum', razon_social: 'CorteAlum S.A.S',
    nit: 'NIT —', direccion: '—', telefono: '—', email: '—',
    web: '—', logo_url: null,
  };
  const empresa = { ...empresaDefault, ...(opts.empresa || {}) };

  const sistemasUnicos = [...new Set(windows.map(w => w.system).filter(Boolean))];
  const coloresUnicos  = [...new Set(windows.map(w => w.colorPerfil).filter(Boolean))];

  return {
    projectInfo: {
      id: cot.id_proyecto,
      nombre: cot.nombre_proyecto || '—',
      direccion: cot.direccion_proyecto || '—',
      ciudad: cot.ciudad_proyecto || '—',
      sistemasUnicos, coloresUnicos,
      cantidadVentanas: windows.length,
    },
    customer: {
      nombre: cot.nombre_cliente || '—',
      identificacion: cot.identificacion_cliente || '—',
      telefono: cot.telefono_cliente || '—',
      email: cot.email_cliente || '—',
      direccion: cot.direccion_cliente || '—',
    },
    quotationInfo: {
      id: cot.id_cotizacion,
      version: cot.version || 1,
      numero: cotRef,
      fecha: cot.fecha_cotizacion || new Date().toISOString(),
      validez_dias: cot.validez_dias || 15,
      es_oficial: !!cot.es_oficial,
      notas: cot.notas || '',
      empresa,
    },
    windows,
    globalCosts: {
      // Materiales
      totalPerfiles:    Math.round(totalPerfiles),
      totalVidrios:     Math.round(totalVidrios),
      totalAccesorios:  Math.round(totalAccesorios),
      subtotalMateriales:        Math.round(subtotalMateriales),
      subtotalMaterialesRecargo: Math.round(subtotalMateriales_ConRecargo),
      recargoPct,
      recargoMaterialesPct: recargoPct,             // alias para el template
      recargoMaterialesValor: Math.round(recargoMaterialesValor),

      // Mano de obra (nombres + alias)
      manoObra:           Math.round(manoObra),
      costoManoObraTotal: Math.round(manoObra),     // alias para el template
      diasProyectados:    int(cot.dias_proyectados),
      diasManoObra:       int(cot.dias_proyectados),// alias para el template
      cantidadPersonas:   int(cot.cantidad_personas) || 1,
      personas:           int(cot.cantidad_personas) || 1, // alias para el template

      // Utilidad
      utilidadPct,
      utilidadValor: Math.round(utilidadValor),
      utilidad:      Math.round(utilidadValor),     // alias para el template

      // Transportes / instalación
      transporteEstructuras: Math.round(transpEst),
      transportePersonal:    Math.round(transpPers),
      instalacion:           Math.round(instalacion),

      // IVA
      ivaPct,
      ivaValor: Math.round(ivaValor),

      // Total Final (alias económico para el template)
      totalFinal: Math.round(totalFinal),
    },
    totals: {
      // Materiales
      subtotalMateriales:   Math.round(subtotalMateriales),
      recargoMateriales:    Math.round(recargoMaterialesValor),
      materialesConRecargo: Math.round(subtotalMateriales_ConRecargo),

      // Cascada económica
      manoObra:             Math.round(manoObra),
      utilidad:             Math.round(utilidadValor),
      subtotal:             Math.round(subtotalAntesIva),
      iva:                  Math.round(ivaValor),
      ivaPct,

      // Totales finales
      totalSinInstalacion:  Math.round(totalSinInstalacion),
      totalConInstalacion:  Math.round(totalConInstalacion),
      totalFinal:           Math.round(totalFinal),
      totalConTransporte:   Math.round(totalConTransporte),

      moneda: 'COP',
    },
  };
}

module.exports = { buildProjectQuotation };
