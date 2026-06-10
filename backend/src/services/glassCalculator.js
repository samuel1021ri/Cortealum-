/**
 * CorteAlum — Glass Calculator
 * ─────────────────────────────────────────────────────────────────────────────
 * Lógica CENTRALIZADA y ÚNICA para el cálculo de vidrios por m².
 *
 * Regla de negocio: EL VIDRIO NO SE COBRA POR PIEZA, SE COBRA POR m².
 *
 *   areaUnit  = ancho * alto
 *   areaTotal = areaUnit * cantidad
 *   subtotal  = areaTotal * precioM2
 *
 * NOTA IMPORTANTE de unidades:
 *   - El motor de cálculo (calcEngine.js) devuelve ancho/alto en CENTÍMETROS.
 *   - Aquí TODO se convierte a METROS para que el resultado sea m² real.
 *   - El precio (priceM2) viene en pesos por m².
 *
 * Esta función es la ÚNICA fuente de verdad. La consume:
 *   - cotizacionesController (generación y guardado)
 *   - projectQuotationBuilder (consolidación)
 *   - pdfTemplate (render PDF)
 */

const PRECIO_M2_DEFAULT = parseFloat(process.env.VIDRIO_PRECIO_M2_DEFAULT || '0');

/**
 * Calcula áreas y subtotal para una pieza de vidrio.
 *
 * @param {Object} glass
 * @param {number} glass.width      Ancho en METROS (o cm/mm si se indica `unit`)
 * @param {number} glass.height     Alto  en METROS (o cm/mm si se indica `unit`)
 * @param {number} glass.quantity   Número de piezas
 * @param {number} glass.priceM2    Precio por m² (COP)
 * @param {string} [glass.unit]     'm' (default) | 'cm' | 'mm'
 *                                   El factor aplicado lleva todo a metros:
 *                                     m  → 1
 *                                     cm → 0.01      (100 cm = 1 m)
 *                                     mm → 0.001     (1000 mm = 1 m)
 *
 * El área resultante SIEMPRE está en m² (regla de negocio: el vidrio se cobra por m²).
 *
 * @returns {Object} { ...glass, width, height, areaUnit, areaTotal, subtotal }
 *                   width/height vienen normalizados a metros.
 */
function calculateGlass(glass) {
  const unit = String(glass.unit || 'm').toLowerCase();
  // Factor para llevar la unidad de entrada a METROS
  let factor;
  if      (unit === 'cm') factor = 0.01;
  else if (unit === 'mm') factor = 0.001;
  else                    factor = 1;     // 'm' o cualquier otro → asume metros

  const widthRaw  = +(parseFloat(glass.width  || 0) * factor).toFixed(4);
  const heightRaw = +(parseFloat(glass.height || 0) * factor).toFixed(4);
  const quantity  = parseInt(glass.quantity || 0) || 0;
  const priceM2   = parseFloat(glass.priceM2 || 0) || 0;

  // ⚠️ Vidrio con dimensiones <= 0 significa que la ventana es físicamente
  // demasiado pequeña para esos perfiles (las fórmulas de descuento dan
  // resultado negativo). En lugar de calcular áreas negativas, marcamos
  // como inválido y devolvemos 0 para que el cliente vea el problema.
  const dimensionInvalid = widthRaw <= 0 || heightRaw <= 0;
  const width  = dimensionInvalid ? 0 : widthRaw;
  const height = dimensionInvalid ? 0 : heightRaw;

  const areaUnit  = dimensionInvalid ? 0 : +(width * height).toFixed(4);
  const areaTotal = +(areaUnit * quantity).toFixed(4);
  const subtotal  = Math.round(areaTotal * priceM2); // pesos enteros

  return {
    ...glass,
    width,
    height,
    quantity,
    priceM2,
    areaUnit,
    areaTotal,
    subtotal,
    unit: 'm',
    dimensionInvalid,
    // Guarda los valores crudos negativos para mostrar advertencia en el PDF
    _rawWidth:  widthRaw,
    _rawHeight: heightRaw,
  };
}

/**
 * Convierte la salida del motor (calcEngine — piezas con es_vidrio:true en cm)
 * en piezas listas para cotizar (en metros, con priceM2 aplicado).
 *
 * @param {Array} piezasVidrio  Array de piezas con { ubicacion, ancho, alto, cantidad } en cm
 * @param {Object} opts
 * @param {number} opts.priceM2          Precio por m² a aplicar
 * @param {string} [opts.tipo]           Etiqueta de tipo de vidrio (ej. "Vidrio 5mm Claro")
 * @returns {Array} vidrios calculados
 */
function buildGlassesFromEngine(piezasVidrio, opts = {}) {
  const priceM2 = parseFloat(opts.priceM2 || PRECIO_M2_DEFAULT);
  const tipoBase = opts.tipo || 'Vidrio';
  // unit del input (default 'cm' por retro-compatibilidad — el motor histórico
  // devuelve cm; si calcularVentana fue invocado en modo mm, pasar 'mm' aquí)
  const inputUnit = String(opts.unit || 'cm').toLowerCase();
  return (piezasVidrio || []).map(p => calculateGlass({
    tipo: `${tipoBase}${p.ubicacion ? ' · ' + p.ubicacion : ''}`,
    ubicacion: p.ubicacion,
    ref_vidrio: p.ref_vidrio,
    formula_ancho: p.formula_ancho || '',
    formula_alto:  p.formula_alto  || '',
    width:  p.ancho,
    height: p.alto,
    quantity: p.cantidad,
    priceM2,
    unit: inputUnit,   // ← propagar la unidad activa al calculador
  }));
}

/**
 * Total de un array de vidrios ya calculados.
 */
function sumGlasses(glasses) {
  return (glasses || []).reduce((s, g) => s + (parseFloat(g.subtotal) || 0), 0);
}

module.exports = {
  calculateGlass,
  buildGlassesFromEngine,
  sumGlasses,
  PRECIO_M2_DEFAULT,
};
