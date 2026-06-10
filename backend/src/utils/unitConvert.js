/**
 * unitConvert.js — CorteAlum
 * ──────────────────────────────────────────────────────────────────────────
 * HELPER ÚNICO DE CONVERSIÓN DE UNIDADES.
 *
 * El sistema almacena CANÓNICAMENTE en centímetros (cm). Cualquier valor
 * que entre o salga de la base de datos pasa por este helper para asegurar
 * que el resto del sistema NUNCA tenga que adivinar la unidad.
 *
 * Política:
 *   • BD            → cm (canónico)
 *   • Motor de cálculo → cm (siempre)
 *   • Frontend visual  → cm o mm según preferencia del usuario
 *   • Conversión       → SOLO en los bordes (entrada al backend, salida al cliente)
 *
 * Funciones:
 *   normalizarACm(valor, unidad)
 *     Cualquier valor + unidad declarada → cm canónico.
 *
 *   normalizarDeBD(valor, unidadDeclarada)
 *     Detecta valores legacy guardados en mm por bug anterior y los corrige.
 *     Usa heurística: si la unidad declara mm Y el número es coherente con mm
 *     (>= 60), trata el valor como mm. Si declara mm pero el valor es chico
 *     (típico de cm), ignora la declaración (estaba mal en la BD).
 *
 *   desdeCm(valorCm, unidad)
 *     Convierte cm → unidad mostrada (cm o mm) para presentación al cliente.
 *
 *   esMedidaCoherente(valorCm)
 *     Valida que un valor en cm sea físicamente razonable para una ventana
 *     (rango 10–500 cm). Útil para rechazar inputs sospechosos.
 *
 * Filosofía:
 *   Un único lugar para preguntas sobre unidades. Si en algún punto del
 *   sistema surge la duda "¿esto está en cm o mm?", la respuesta es:
 *   "está en cm si pasó por normalizarACm, mostradlo con desdeCm".
 */

const MIN_VANO_CM = 10;
const MAX_VANO_CM = 500;
// UMBRAL para detectar datos LEGACY (valores guardados como mm en bruto).
// Política actual: frontend SIEMPRE envía cm. La columna ancho_unidad/alto_unidad
// es solo HISTÓRICA (para mostrar al usuario en su unidad).
// El umbral DEBE ser > MAX_VANO_CM porque cualquier valor en cm sería ≤ 500.
// Si vemos 600+ con unidad='mm', SÍ es legacy y dividimos. Si vemos 80 con
// unidad='mm', es 80 cm correcto (el usuario lo creó en 800mm = 80cm).
// Antes era 60 y rompía ventanas válidas (V-155 de 80cm la dividía a 8cm).
const UMBRAL_MM   = 600;

const _esMmReal = (numero) => Number.isFinite(numero) && numero >= UMBRAL_MM;

/**
 * Convierte un valor de cualquier unidad a cm canónico.
 *
 * @param {number|string} valor - El valor numérico (string o number)
 * @param {string} unidad       - 'cm' | 'mm' (case-insensitive, default 'cm')
 * @returns {number|null}        cm canónico, o null si el input no es numérico
 */
function normalizarACm(valor, unidad) {
  if (valor === null || valor === undefined || valor === '') return null;
  const num = parseFloat(String(valor).replace(',', '.'));
  if (!Number.isFinite(num)) return null;
  const u = String(unidad || 'cm').toLowerCase() === 'mm' ? 'mm' : 'cm';
  return u === 'mm' ? num / 10 : num;
}

/**
 * Convierte cm canónico → unidad de presentación.
 *
 * @param {number} valorCm
 * @param {string} unidad   - 'cm' | 'mm'
 * @returns {number}
 */
function desdeCm(valorCm, unidad) {
  if (!Number.isFinite(valorCm)) return 0;
  const u = String(unidad || 'cm').toLowerCase() === 'mm' ? 'mm' : 'cm';
  return u === 'mm' ? valorCm * 10 : valorCm;
}

/**
 * Lee un valor que viene de la BD (ancho_vano, alto_vano) y lo devuelve en
 * cm canónico, incluso si por bugs anteriores se guardó en mm.
 *
 * REGLA CANÓNICA: la BD debería tener cm siempre. Pero hay datos legacy
 * que tienen mm en la columna (por versiones bug-gy del frontend). Esta
 * función detecta esos casos y los normaliza.
 *
 * Heurística:
 *   1. Si la columna `unidad` declara 'mm' y el valor numérico es >= 60,
 *      tratar como mm (un vano de 60 mm es 6 cm, lo mínimo razonable;
 *      un vano de 60 cm sin declaración es claramente cm).
 *   2. En cualquier otro caso, asumir cm.
 *
 * @param {number|string} valorBD   - lo que está en la columna ancho_vano / alto_vano
 * @param {string} unidadDeclarada  - lo que está en la columna ancho_unidad / alto_unidad (puede ser null/undefined)
 * @returns {number|null}            valor en cm canónico
 */
function normalizarDeBD(valorBD, unidadDeclarada) {
  if (valorBD === null || valorBD === undefined || valorBD === '') return null;
  const num = parseFloat(String(valorBD).replace(',', '.'));
  if (!Number.isFinite(num)) return null;

  const declarada = String(unidadDeclarada || '').toLowerCase();
  // Heurística: declaración mm + valor "coherente con mm" → tratar como mm
  if (declarada === 'mm' && _esMmReal(num)) {
    return num / 10;
  }
  // Por defecto cm
  return num;
}

/**
 * Valida que un valor en cm sea físicamente razonable para un vano de ventana.
 *
 * @param {number} valorCm
 * @returns {{valido: boolean, razon: string|null}}
 */
function esMedidaCoherente(valorCm) {
  if (!Number.isFinite(valorCm)) {
    return { valido: false, razon: 'No es un número' };
  }
  if (valorCm < MIN_VANO_CM) {
    return { valido: false, razon: `Demasiado pequeño (${valorCm} cm). Mínimo: ${MIN_VANO_CM} cm.` };
  }
  if (valorCm > MAX_VANO_CM) {
    return { valido: false, razon: `Demasiado grande (${valorCm} cm). Máximo: ${MAX_VANO_CM} cm. ¿Quizás enviaste mm sin convertir?` };
  }
  return { valido: true, razon: null };
}

/**
 * Aplica normalización a todo un objeto ventana (lee de BD y devuelve los
 * campos `ancho_cm` y `alto_cm` ya canónicos). Útil al cargar datos del
 * controller para pasárselos al motor.
 *
 * @param {object} ventanaBD - fila tal como sale de la BD
 * @returns {{ ancho_cm: number, alto_cm: number, ancho_unidad_origen: string, alto_unidad_origen: string }}
 */
function leerVentana(ventanaBD) {
  return {
    ancho_cm: normalizarDeBD(ventanaBD.ancho_vano, ventanaBD.ancho_unidad),
    alto_cm:  normalizarDeBD(ventanaBD.alto_vano,  ventanaBD.alto_unidad),
    ancho_unidad_origen: String(ventanaBD.ancho_unidad || 'cm').toLowerCase(),
    alto_unidad_origen:  String(ventanaBD.alto_unidad  || 'cm').toLowerCase(),
  };
}

module.exports = {
  normalizarACm,
  desdeCm,
  normalizarDeBD,
  esMedidaCoherente,
  leerVentana,
  // Constantes públicas
  MIN_VANO_CM,
  MAX_VANO_CM,
};
