// CorteAlum — Sistema de unidades para medidas
// ─────────────────────────────────────────────────────────────────────────────
// EL MOTOR INTERNO TRABAJA SIEMPRE EN CM (intocable).
// Esta capa solo CONVIERTE para mostrar y aceptar input del usuario.
//
// La unidad es UNA SOLA por ventana: si el usuario elige MM, TODO se muestra
// en MM (vano, perfiles, vidrios, felpas, empaques). Cuando elige CM, todo en CM.
// El usuario NO debe ver mezcla de unidades nunca.

export const UNITS = ['cm', 'mm'];

/**
 * Convierte un valor desde la unidad declarada A CM (estándar del motor).
 * @param {string|number} value  valor numérico (acepta "43,3" o "43.3")
 * @param {string} unit          'cm' | 'mm'
 * @returns {number}             valor en cm
 */
export function toCm(value, unit = 'cm') {
  const v = parseFloat(String(value).replace(',', '.'));
  if (!Number.isFinite(v)) return 0;
  return unit === 'mm' ? v / 10 : v;
}

/**
 * Convierte de CM a la unidad solicitada (para MOSTRAR al usuario).
 * @param {number} cm
 * @param {string} unit  'cm' | 'mm'
 * @returns {number}
 */
export function fromCm(cm, unit = 'cm') {
  const v = parseFloat(cm) || 0;
  return unit === 'mm' ? v * 10 : v;
}

/**
 * Formatea un valor en CM mostrándolo en la unidad pedida.
 *
 * COMPORTAMIENTO ADAPTATIVO (regla de UX para el taller):
 *   - Si el valor es entero  → 0 decimales       (ej. "54 cm",  "540 mm")
 *   - Si tiene decimales     → hasta `dec` máx.  (ej. "54,5 cm", "54,25 cm")
 *   - NUNCA muestra ceros a la derecha innecesarios.
 *
 * El parámetro `dec` ahora es el TOPE máximo (antes era el valor fijo).
 * Cap por defecto: 2 decimales para cm, 1 para mm. Para vidrios o áreas se
 * puede pasar 4 explícitamente.
 *
 * @param {number} cm    valor en cm (del motor)
 * @param {string} unit  'cm' | 'mm'
 * @param {number} dec   máx. decimales (default: 2 cm, 1 mm)
 * @returns {string}     ej "54 cm", "54,5 cm", "349 mm"
 */
export function fmtMedida(cm, unit = 'cm', dec) {
  const v = fromCm(cm, unit);
  const maxDec = dec != null ? dec : (unit === 'mm' ? 1 : 2);
  const num = new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDec,
  }).format(v);
  return `${num} ${unit}`;
}

/**
 * Formatea SOLO el número en la unidad pedida, sin el sufijo.
 * Mismas reglas adaptativas que fmtMedida.
 */
export function fmtNumMedida(cm, unit = 'cm', dec) {
  const v = fromCm(cm, unit);
  const maxDec = dec != null ? dec : (unit === 'mm' ? 1 : 2);
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDec,
  }).format(v);
}

/**
 * Formatea un valor que YA está en cm (sin conversión a otra unidad).
 * Útil para el módulo de optimización de cortes, que trabaja siempre en cm.
 * Sigue la misma regla adaptativa: sin ceros innecesarios.
 *
 * @param {number} cm     valor en cm
 * @param {number} maxDec máx. decimales permitidos (default: 1)
 * @returns {string}      ej "54", "54,5", "600"
 */
export function fmtCmAdapt(cm, maxDec = 1) {
  const v = parseFloat(cm) || 0;
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDec,
  }).format(v);
}

/**
 * Convierte una fórmula textual de CM a MM (constantes × 10).
 * Espejo del helper backend `convertFormulaCmToMm` en calcEngine.js.
 *
 * Regla: solo convierte CONSTANTES DIMENSIONALES, no multiplicadores ni divisores.
 *
 *   "H - 2,3"     → "H - 23"
 *   "A/2 - 0,1"   → "A/2 - 1"     (el 2 es divisor → no cambia)
 *   "TRASLAPE – 6,6" → "TRASLAPE – 66"
 *   "2*A"         → "2*A"         (el 2 es multiplicador → no cambia)
 *
 * Mantiene compatibilidad con catálogos: la fórmula MASTER siempre se almacena
 * en CM y se convierte SOLO al mostrar/calcular en otra unidad.
 *
 * @param {string} formula fórmula original en CM (ej. "H - 2,3")
 * @returns {string}        fórmula con constantes ×10 (ej. "H - 23")
 */
export function convertFormulaCmToMm(formula) {
  if (formula == null || typeof formula !== 'string') return formula;
  return formula.replace(
    /(?<![A-Za-z/*])(\d+(?:[.,]\d+)?)(?![*/])/g,
    (match) => {
      const decimal = match.includes(',') ? ',' : (match.includes('.') ? '.' : null);
      const normalized = match.replace(',', '.');
      const value = parseFloat(normalized);
      if (isNaN(value)) return match;
      const mm = value * 10;
      if (Number.isInteger(mm)) return String(mm);
      return decimal === ',' ? String(mm).replace('.', ',') : String(mm);
    }
  );
}

/**
 * Convierte una fórmula a la unidad indicada.
 *   convertFormulaToUnit("H - 2,3", "cm") → "H - 2,3"  (sin cambio)
 *   convertFormulaToUnit("H - 2,3", "mm") → "H - 23"
 *
 * Si la unidad no es 'mm', devuelve la fórmula original.
 * Útil para renderizar fórmulas en la UI según la unidad activa del proyecto.
 *
 * @param {string} formula fórmula original (asumida en CM)
 * @param {string} unit    'cm' | 'mm'
 * @returns {string}        fórmula convertida o original
 */
export function convertFormulaToUnit(formula, unit) {
  if (String(unit || 'cm').toLowerCase() === 'mm') {
    return convertFormulaCmToMm(formula);
  }
  return formula;
}

/**
 * Etiqueta del sufijo de unidad ('cm' o 'mm').
 */
export function unitLabel(unit = 'cm') {
  return unit === 'mm' ? 'mm' : 'cm';
}

/**
 * Validación de medida.
 * @param {string|number} value  valor en la unidad declarada
 * @param {string} unit          'cm' | 'mm'
 */
export function validateMedida(value, unit = 'cm') {
  if (value === '' || value == null) {
    return { valid: false, error: 'Campo requerido' };
  }
  const cleaned = String(value).replace(',', '.');
  if (!/^-?\d*\.?\d+$/.test(cleaned)) {
    return { valid: false, error: 'Solo se permiten números' };
  }
  const v = parseFloat(cleaned);
  if (!Number.isFinite(v)) {
    return { valid: false, error: 'Valor inválido' };
  }
  if (v < 0) {
    return { valid: false, error: 'No se permiten valores negativos' };
  }
  if (v === 0) {
    return { valid: false, error: 'El valor debe ser mayor a 0' };
  }
  const cm = unit === 'mm' ? v / 10 : v;
  if (cm < 5)    return { valid: false, error: 'Medida muy pequeña (mín. 5 cm / 50 mm)' };
  if (cm > 600)  return { valid: false, error: 'Medida muy grande (máx. 600 cm / 6000 mm)' };
  return { valid: true, cm };
}
