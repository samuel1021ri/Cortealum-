/**
 * CorteAlum — Constantes centralizadas
 * ─────────────────────────────────────────────────────────────────────────────
 * Único punto donde se definen valores numéricos del negocio.
 * Si necesitas cambiar el kerf (espesor del disco de corte), la longitud
 * mínima de un residuo o el tamaño de las barras estándar, es aquí.
 *
 * Todas las constantes son sobrescribibles por variables de entorno
 * (útil para diferentes talleres / instructores SENA).
 */

const num = (envKey, def) => {
  const v = parseFloat(process.env[envKey]);
  return Number.isFinite(v) ? v : def;
};

module.exports = {
  // ── Optimización de cortes ───────────────────────────────────────────────
  /**
   * KERF: espesor de la sierra (en cm).
   * Cuando cortas una barra, el disco "se come" material.
   * Por defecto 0.3 cm (3 mm) — disco de aluminio estándar.
   */
  KERF_CM: num('KERF_CM', 0.3),

  /**
   * Longitud mínima para considerar un sobrante como "residuo reutilizable".
   * Sobrantes menores se descartan automáticamente (no entran al banco).
   * Por defecto 20 cm (alineado con config_residuos.minimo_reutilizable_cm).
   */
  MIN_RESIDUO_CM: num('MIN_RESIDUO_CM', 20),

  /**
   * Longitud por defecto de barra estándar de aluminio (cm).
   * Si un perfil no tiene barras en la tabla `barras_estandar`,
   * se usa este valor.
   */
  BARRA_ESTANDAR_DEFAULT_CM: num('BARRA_ESTANDAR_DEFAULT_CM', 600),

  /**
   * MARGEN DE PÉRDIDA OPERATIVA (cm).
   *
   * AJUSTE (estandarización con los Excel de cálculo y la guía Homecenter):
   * antes valía 20, lo que hacía que el precio por cm se calculara sobre una
   * longitud útil de 580 cm en vez de los 600 cm nominales de fábrica:
   *
   *   $/cm = precio_barra ÷ (600 - 20) = precio_barra / 580   ← ~3.4% oculto
   *
   * Ese ~3.4% era un recargo por desperdicio que NO existe en los Excel de
   * cálculo (la fuente de verdad) y además duplicaba el desperdicio que ya
   * cubre el recargo de materiales (25%) visible en el Resumen Económico.
   *
   * Ahora vale 0 → el precio se calcula sobre los 600 cm completos:
   *
   *   $/cm = precio_barra ÷ 600
   *
   * Todo el desperdicio se cobra UNA sola vez, vía el recargo del 25%.
   * Si algún día quieres volver a cobrar una merma fija por barra, sube este
   * valor (en cm) o usa la variable de entorno MARGEN_PERDIDA_CM.
   */
  MARGEN_PERDIDA_CM: num('MARGEN_PERDIDA_CM', 0),

  // ── Banco de residuos ────────────────────────────────────────────────────
  /**
   * Minutos antes de que una reserva expire automáticamente.
   */
  EXPIRACION_RESERVA_MIN: num('EXPIRACION_RESERVA_MIN', 30),

  /**
   * Días para considerar un residuo "antiguo" (alerta en dashboard).
   */
  RESIDUO_ANTIGUO_DIAS: num('RESIDUO_ANTIGUO_DIAS', 90),

  // ── Vidrios ──────────────────────────────────────────────────────────────
  /**
   * Precio fallback de m² de vidrio si no hay precio configurado.
   * 0 = el usuario debe ingresarlo (recomendado).
   */
  VIDRIO_PRECIO_M2_DEFAULT: num('VIDRIO_PRECIO_M2_DEFAULT', 0),

  // ── Cálculo de ventana ───────────────────────────────────────────────────
  /**
   * Descuento que se aplica al ANCHO y ALTO del vano antes de calcular
   * piezas de perfil. Representa la holgura física entre el marco de la
   * ventana y la abertura del muro.
   *
   *   ancho_calculado = ancho_vano - DESCUENTO_VANO_CM
   *   alto_calculado  = alto_vano  - DESCUENTO_VANO_CM
   *
   * Valor en CM. Por defecto: 0.3 cm (= 3 mm), valor estándar de los
   * Excel oficiales. NO cambiar sin actualizar también los Excel.
   * Se puede sobrescribir con variable de entorno DESCUENTO_VANO_CM.
   */
  DESCUENTO_VANO_CM: num('DESCUENTO_VANO_CM', 0.3),

  // ── PDF ──────────────────────────────────────────────────────────────────
  PDF_FONT_TIMEOUT_MS: num('PDF_FONT_TIMEOUT_MS', 3000),

  // ── Etiquetas ────────────────────────────────────────────────────────────
  /**
   * Categorías de residuo según longitud (para clasificación automática).
   */
  CATEGORIA_RESIDUO: {
    PEQUENO: { max: 30,  label: 'Pequeño', color: '#ef4444' },
    MEDIO:   { max: 100, label: 'Medio',   color: '#f59e0b' },
    GRANDE:  { max: Infinity, label: 'Grande', color: '#10b981' },
  },
};
