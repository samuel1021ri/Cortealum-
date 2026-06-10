// CorteAlum — Cálculo de vidrios (cliente)
// ─────────────────────────────────────────────────────────────────────────────
// Lógica ÚNICA y CENTRALIZADA para el cálculo de vidrios en el wizard de
// cotización. Espejo del módulo backend `services/glassCalculator.js`.
//
// REGLAS DE NEGOCIO (carpintería metálica):
//   - Las medidas vienen en CM o MM (según unidad activa del proyecto).
//   - El vidrio se COBRA por m², así que el área se convierte:
//
//     Si unidad = cm:    area_m2 = (ancho_cm * alto_cm) / 10.000
//     Si unidad = mm:    area_m2 = (ancho_mm * alto_mm) / 1.000.000
//
//     área_total       = área_m2 * cantidad
//     subtotal         = área_total * precio_m2
//
// Matemáticamente equivalente — solo cambia el divisor según unidad.
// El motor (calcEngine.js) devuelve ancho/alto en la unidad pedida.

/**
 * Calcula todos los valores derivados de una pieza de vidrio.
 *
 * @param {Object} v
 * @param {number} v.ancho      cm o mm (según `unit`)
 * @param {number} v.alto       cm o mm (según `unit`)
 * @param {number} v.cantidad   piezas
 * @param {number} v.precio     COP por m²
 * @param {string} [unit]       'cm' (default) | 'mm'
 * @returns {Object} valores con redondeo profesional
 */
export function calcGlass(v, unit = 'cm') {
  const u = String(unit || 'cm').toLowerCase();
  // Divisor para convertir el área a m²
  //   cm² → m²: /10.000     (porque 1 m² = 10.000 cm²)
  //   mm² → m²: /1.000.000  (porque 1 m² = 1.000.000 mm²)
  const divisorArea = u === 'mm' ? 1000000 : 10000;

  const ancho     = parseFloat(v.ancho)    || 0;
  const alto      = parseFloat(v.alto)     || 0;
  const cantidad  = parseInt(v.cantidad)   || 0;
  const precio_m2 = parseFloat(v.precio)   || 0;

  // Área en la unidad cuadrada (cm² o mm²)
  const area_raw = ancho * alto;

  // Conversión a m² (la única unidad universal de cobro)
  const area_m2_unit  = area_raw / divisorArea;
  const area_m2_total = area_m2_unit * cantidad;

  const subtotal = area_m2_total * precio_m2;

  // Para retrocompatibilidad seguimos exponiendo `ancho_cm` y `alto_cm`
  // pero ahora son simplemente "ancho_input" en la unidad activa.
  return {
    ancho_cm:       +ancho.toFixed(2),    // ojo: SI unit='mm', este valor está en mm
    alto_cm:        +alto.toFixed(2),     // (el nombre se mantiene por retrocompatibilidad)
    ancho:          +ancho.toFixed(2),
    alto:           +alto.toFixed(2),
    unidad:         u,
    area_raw:       +area_raw.toFixed(2),
    area_cm2:       +area_raw.toFixed(2), // alias retro-compat
    area_m2_unit:   +area_m2_unit.toFixed(4),   // 4 decimales para precisión
    area_m2_total:  +area_m2_total.toFixed(4),
    cantidad,
    precio_m2,
    subtotal:       Math.round(subtotal),       // COP redondeado a enteros
  };
}

/**
 * Suma del subtotal de un array de vidrios.
 */
export function sumGlasses(vidrios, unit = 'cm') {
  return (vidrios || []).reduce((s, v) => s + calcGlass(v, unit).subtotal, 0);
}

/**
 * Validación profesional de una pieza de vidrio.
 *
 * @param {Object} v
 * @returns {{valid:boolean, errors:string[]}}
 */
export function validateGlass(v) {
  const errors = [];
  const ancho   = parseFloat(v.ancho);
  const alto    = parseFloat(v.alto);
  const cant    = parseInt(v.cantidad);
  const precio  = parseFloat(v.precio);

  if (!Number.isFinite(ancho) || ancho <= 0) errors.push('Ancho debe ser mayor a 0');
  if (!Number.isFinite(alto)  || alto  <= 0) errors.push('Alto debe ser mayor a 0');
  if (!Number.isFinite(cant)  || cant  <= 0) errors.push('Cantidad debe ser mayor a 0');
  if (Number.isFinite(precio) && precio < 0)  errors.push('Precio no puede ser negativo');

  // Validación de "descuento mayor al vano": si la fórmula dio resultado ≤0
  // (no debería pasar con el motor actual, pero por seguridad)
  if (ancho < 0 || alto < 0) errors.push('Descuento de fórmula mayor al vano');

  return { valid: errors.length === 0, errors };
}

/**
 * Formatea pesos colombianos.
 */
export function fmtCOP(n) {
  return '$ ' + new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 })
    .format(Math.round(parseFloat(n) || 0));
}

/**
 * Formatea número con N decimales.
 */
export function fmtNum(n, dec = 2) {
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  }).format(parseFloat(n) || 0);
}
