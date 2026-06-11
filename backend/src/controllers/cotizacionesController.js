const pool = require('../config/db');
const { calcularVentana } = require('../utils/calcEngine');
const { normalizarDeBD } = require('../utils/unitConvert');
const { buildProjectQuotation } = require('../services/projectQuotationBuilder');
const { renderHTML }            = require('../services/pdfTemplate');
const { htmlToPDF }             = require('../services/pdfRenderer');
const { optimizarCortes }       = require('../services/cuttingOptimizer');
const { MARGEN_PERDIDA_CM, BARRA_ESTANDAR_DEFAULT_CM } = require('../config/constants');

// Mapa nombre diseño → id engine.
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

function getIdDiseno(v) {
  const nombre = (v.diseno || v.nombre_diseno || '').trim().toUpperCase();
  if (nombre && DISENO_NOMBRE_MAP[nombre]) return DISENO_NOMBRE_MAP[nombre];
  const raw = parseInt(v.id_diseno || 0);
  if (raw >= 1 && raw <= 5) return raw;
  return null;
}

// ─── Preview materiales ───────────────────────────────────────────────────────
// Las medidas en BD siempre se guardan en CM. `calcularVentana` también trabaja
// en CM por defecto. La UNIDAD del proyecto (cm | mm) solo afecta presentación,
// no el cálculo de cantidades que aquí siempre se hace en metros (cm → m).
const previewMateriales = async (req, res) => {
  const { id_proyecto } = req.params;
  try {
    const { rows: ventanas } = await pool.query(
      `SELECT v.*, s.nombre as sistema, p.referencia as perfil, d.nombre as diseno
       FROM ventanas v
       JOIN sistemas_ventaneria s ON v.id_sistema=s.id_sistema
       JOIN perfiles p ON v.id_perfil=p.id_perfil
       JOIN "diseños" d ON v."id_diseño"=d."id_diseño"
       WHERE v.id_proyecto=$1`, [id_proyecto]
    );
    if (!ventanas.length) return res.status(400).json({ error: 'El proyecto no tiene ventanas' });

    const materialesMap = {};
    for (const v of ventanas) {
      // Normalizar a cm canónico (corrige datos legacy en mm).
      const ancho = normalizarDeBD(v.ancho_vano, v.ancho_unidad);
      const alto  = normalizarDeBD(v.alto_vano,  v.alto_unidad);
      if (!Number.isFinite(ancho) || !Number.isFinite(alto) || ancho <= 0 || alto <= 0) continue;
      const calc = calcularVentana(v.id_perfil, v.id_sistema, getIdDiseno(v), ancho, alto);
      if (calc.error) continue;
      for (const pieza of calc.piezas) {
        if (pieza.resultado === null || pieza.resultado === undefined || pieza.es_vidrio || pieza.es_accesorio) continue;
        // ── FIX (instructor Marcel): agrupar por (perfil + ubicacion + color)
        //   porque cada tipo de pieza es una barra física independiente.
        const key = `${v.id_perfil}|${pieza.ubicacion}|${v.color_perfil || ''}`;
        if (!materialesMap[key]) {
          materialesMap[key] = {
            id_perfil: v.id_perfil,
            referencia_perfil: v.perfil,
            ubicacion: pieza.ubicacion,
            color_perfil: v.color_perfil || null,
            ref: pieza.ref,
            cortes: [],          // ← lista individual de cortes (para optimizar)
            cantidad_cm: 0,      // ← total lineal informativo
          };
        }
        const cant = parseInt(pieza.cantidad || 1) || 1;
        for (let i = 0; i < cant; i++) {
          materialesMap[key].cortes.push(parseFloat(pieza.resultado));
        }
        materialesMap[key].cantidad_cm += cant * parseFloat(pieza.resultado);
      }
    }

    // ─── OPTIMIZACIÓN: 1 SOLA query a `materiales` ────────────────────────────
    const { rows: todos } = await pool.query(
      `SELECT id_material, nombre_material, costo_unitario, unidad_medida, stock_disponible
       FROM materiales
       WHERE estado='activo'`
    );
    const matsIdx = todos.map(m => ({ ...m, _lower: (m.nombre_material || '').toLowerCase() }));

    // ── Barras estándar por perfil (cm) ─────────────────────────────────────
    const { rows: barrasFila } = await pool.query(
      `SELECT id_perfil, longitud_cm FROM barras_estandar`
    ).catch(() => ({ rows: [] }));
    const barraPorPerfil = {};
    for (const b of barrasFila) barraPorPerfil[b.id_perfil] = parseFloat(b.longitud_cm);
    const BARRA_DEFAULT = 600;

    const items = [];
    for (const key of Object.keys(materialesMap)) {
      const item = materialesMap[key];
      const cantidad_m = parseFloat((item.cantidad_cm / 100).toFixed(4));

      // ── Match por palabra clave de la ubicación ─────────────────────────
      const keyword = (item.ubicacion.split(' ')[0] || '').toLowerCase();
      const mat = keyword ? matsIdx.find(m => m._lower.includes(keyword)) : null;
      const precioBarra = mat ? parseFloat(mat.costo_unitario) : 0;

      const barraCm = barraPorPerfil[item.id_perfil] || BARRA_ESTANDAR_DEFAULT_CM;

      // ── MODELO DE COBRO POR CM CONSUMIDO ────────────────────────────────
      // El cliente paga por los cm reales de aluminio que SUS ventanas
      // consumen, NO por barras enteras. Esto es:
      //   1. Justo entre clientes (uno no subsidia a otro)
      //   2. Trazable (cada peso se justifica con "X cm × $Y/cm")
      //   3. Refleja el costo real de aluminio que va a la obra
      //
      // El precio por cm se calcula sobre la longitud ÚTIL de la barra
      // (descontando el margen de pérdida operativa: kerf + cabos + residuo
      // mínimo no aprovechable). Esto garantiza que, cuando varios proyectos
      // consumen la barra completa, se recupera el 100% del costo de Alumfer.
      //
      //   $/cm = precio_barra ÷ (longitud_barra − MARGEN_PERDIDA_CM)
      //
      // Ej: barra de 600 cm a $81.000, margen 20 cm → $/cm = 81000/580 = $139,66
      const cmUtil      = Math.max(1, barraCm - MARGEN_PERDIDA_CM);
      const precioPorCm = precioBarra > 0 ? precioBarra / cmUtil : 0;
      const subtotal    = parseFloat((item.cantidad_cm * precioPorCm).toFixed(2));

      // El optimizador NO afecta el cobro al cliente, pero sí informamos las
      // barras necesarias (para visibilidad interna del dueño y para decidir
      // qué comprar). El cliente paga lo mismo independiente del banco.
      const cortesPedidos = item.cortes.map(longitud_cm => ({ longitud_cm, cantidad: 1 }));
      let barrasNecesarias = 0;
      let desperdicioCm = 0;
      try {
        const plan = optimizarCortes({
          cortesPedidos,
          residuosDisponibles: [],
          barraEstandarCm: barraCm,
        });
        barrasNecesarias = (plan?.estadisticas?.barrasNuevasUsadas) || 0;
        desperdicioCm    = (plan?.estadisticas?.desperdicioTotalCm) || 0;
      } catch (e) {
        barrasNecesarias = Math.ceil(item.cantidad_cm / barraCm) || 1;
      }

      items.push({
        ref: item.ref,
        ubicacion: item.ubicacion,
        color_perfil: item.color_perfil,
        cantidad_m,
        cm_consumido:      parseFloat(item.cantidad_cm.toFixed(2)),  // ← NUEVO: cm reales
        precio_por_cm:     parseFloat(precioPorCm.toFixed(4)),       // ← NUEVO: tarifa
        barra_estandar_cm: barraCm,
        cm_util_barra:     cmUtil,                                    // ← NUEVO: cm útiles aprovechables
        barras_necesarias: barrasNecesarias,                          // info interna
        desperdicio_cm:    parseFloat(desperdicioCm.toFixed(2)),
        id_material:       mat?.id_material || null,
        nombre_material:   mat?.nombre_material || item.ubicacion,
        costo_unitario:    precioBarra,
        unidad_medida:     mat?.unidad_medida || 'barra',
        stock_disponible:  mat?.stock_disponible || 0,
        subtotal,
      });
    }
    res.json({ ventanas: ventanas.length, items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al previsualizar materiales' });
  }
};

// ─── Generar cotización ───────────────────────────────────────────────────────
const generarCotizacion = async (req, res) => {
  const { id_proyecto } = req.params;
  const {
    recargo_materiales_pct    = 25,
    valor_diario_mano_obra_oficial,
    mano_obra_pct_adicional   = 50,
    dias_proyectados          = 0,
    cantidad_personas         = 1,
    utilidad_pct              = 30,
    iva_pct                   = 19,
    notas                     = '',
    transporte_estructuras    = 0,
    transporte_personal       = 0,
    instalacion               = 0,       // ← NUEVO: valor instalación ingresado manualmente
    materiales_override       = null,
  } = req.body;

  if (!valor_diario_mano_obra_oficial)
    return res.status(400).json({ error: 'El valor diario de mano de obra es requerido' });

  // ── Verificar acceso ──────────────────────────────────────────────────────
  const { rows: proy } = await pool.query(
    'SELECT p.estado, p.id_usuario_creador FROM proyectos p WHERE p.id_proyecto=$1', [id_proyecto]
  );
  if (!proy.length) return res.status(404).json({ error: 'Proyecto no encontrado' });

  const esDueno = proy[0].id_usuario_creador == req.user.id;
  if (!esDueno) {
    try {
      const { rows: acc } = await pool.query(
        `SELECT permiso FROM proyecto_accesos WHERE id_proyecto=$1 AND id_usuario=$2`,
        [id_proyecto, req.user.id]
      );
      if (!acc.length || acc[0].permiso !== 'edicion') {
        return res.status(403).json({ error: 'No tienes permiso para generar cotizaciones en este proyecto' });
      }
    } catch {
      return res.status(403).json({ error: 'No tienes acceso a este proyecto' });
    }
  }

  // ── Bloqueo por estado ────────────────────────────────────────────────────
  const estadoProy = proy[0].estado;
  if (estadoProy === 'cancelado')
    return res.status(403).json({ error: 'No se puede generar cotización: el proyecto está cancelado.' });
  if (estadoProy === 'en pausa')
    return res.status(403).json({ error: 'El proyecto está en pausa. Reactívalo antes de generar una cotización.' });

  // ── Advertencia cotización existente ─────────────────────────────────────
  const { rows: cotExistentes } = await pool.query(
    'SELECT COUNT(*) as total FROM cotizaciones WHERE id_proyecto=$1', [id_proyecto]
  );
  const cotizacionesExistentes = parseInt(cotExistentes[0].total);

  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');

    // Traer ventanas con sistema/perfil/diseño
    const { rows: ventanas } = await conn.query(
      `SELECT v.*, s.nombre as sistema, pf.referencia as perfil, d.nombre as diseno
       FROM ventanas v
       JOIN sistemas_ventaneria s  ON v.id_sistema  = s.id_sistema
       JOIN perfiles pf            ON v.id_perfil   = pf.id_perfil
       JOIN "diseños" d            ON v."id_diseño"  = d."id_diseño"
       WHERE v.id_proyecto=$1
       ORDER BY v.id_ventana`, [id_proyecto]
    );
    if (!ventanas.length) {
      await conn.query('ROLLBACK');
      return res.status(400).json({ error: 'El proyecto no tiene ventanas' });
    }

    // ── Calcular subtotal materiales ──────────────────────────────────────
    let subtotal_materiales = 0;
    const detalles = [];

    // ─── PASO 1: calcular piezas de TODAS las ventanas con el motor ─────────
    // Los cm consumidos son realidad física de cada ventana, no se overridean.
    // Solo el PRECIO se puede sobrescribir desde el modal del frontend.
    //
    // IMPORTANTE: calcEngine devuelve el MISMO tipo de pieza VARIAS VECES con
    // tamaños levemente distintos (ej. para OX devuelve TRASLAPE × 4 entries
    // separadas en lugar de una sola con cantidad=4). Si las trato como filas
    // separadas en el PDF, salen DUPLICADAS. Hay que agrupar por ubicación
    // sumando los cm y contando las piezas físicas.
    const piezasPorVentana = {};   // { idx: [{ubicacion, total_cm, total_pieces, ref}] }
    for (let idx = 0; idx < ventanas.length; idx++) {
      const v = ventanas[idx];
      const calc = calcularVentana(
        v.id_perfil, v.id_sistema, getIdDiseno(v),
        normalizarDeBD(v.ancho_vano, v.ancho_unidad),
        normalizarDeBD(v.alto_vano,  v.alto_unidad)
      );
      if (calc.error) continue;

      const grouped = {};
      for (const pieza of calc.piezas) {
        if (pieza.resultado == null || pieza.es_vidrio || pieza.es_accesorio) continue;
        const ubi  = pieza.ubicacion;
        const cant = parseInt(pieza.cantidad || 1) || 1;
        const cm   = parseFloat(pieza.resultado);
        if (!grouped[ubi]) {
          grouped[ubi] = { ubicacion: ubi, total_cm: 0, total_pieces: 0, ref: pieza.ref || null };
        }
        grouped[ubi].total_cm     += cm * cant;
        grouped[ubi].total_pieces += cant;
      }
      piezasPorVentana[idx] = Object.values(grouped);
    }

    // ─── PASO 2: cargar materiales (precios Alumfer) y barras estándar ─────
    const { rows: todosMatRows } = await conn.query(
      `SELECT id_material, costo_unitario, nombre_material
       FROM materiales WHERE estado='activo'`
    );
    const matsIdx = todosMatRows.map(m => ({
      ...m, _lower: (m.nombre_material || '').toLowerCase(),
    }));

    const { rows: barrasFila } = await conn.query(
      `SELECT id_perfil, longitud_cm FROM barras_estandar`
    ).catch(() => ({ rows: [] }));
    const barraPorPerfil = {};
    for (const b of barrasFila) barraPorPerfil[b.id_perfil] = parseFloat(b.longitud_cm);

    // ─── PASO 3: indexar los overrides del frontend ─────────────────────────
    // El modal envía: { tipo_item, nombre, id_ventana_idx, precio_unitario,
    //                   color_perfil, cantidad_m, id_material }
    // IMPORTANTE: el frontend prepende "[V##] " al nombre, ej. "[V1] CABEZAL".
    // Hay que limpiarlo antes de armar la llave del índice.
    const overrideIndexPerfil = {};   // { 'idx|UBICACION': override }
    const otrosOverrides = [];        // vidrios, accesorios, custom items
    const overridesArr = Array.isArray(materiales_override) ? materiales_override : [];
    const stripPrefix = s => (s || '').toString().replace(/^\s*\[V\d+\]\s*/i, '').trim();
    for (const item of overridesArr) {
      const tipo = item.tipo_item || 'perfil';
      if (tipo === 'perfil') {
        const ubi = stripPrefix(item.nombre).toUpperCase();
        const idx = item.id_ventana_idx != null ? parseInt(item.id_ventana_idx) : null;
        if (idx == null || !ubi) continue;
        overrideIndexPerfil[`${idx}|${ubi}`] = item;
      } else {
        otrosOverrides.push(item);
      }
    }

    // ─── PASO 4: procesar cada (ventana, ubicación) con FÓRMULA cm × $/cm ──
    for (let idx = 0; idx < ventanas.length; idx++) {
      const v = ventanas[idx];
      const piezas = piezasPorVentana[idx] || [];

      for (const pieza of piezas) {
        const lookupKey = `${idx}|${pieza.ubicacion.toUpperCase()}`;
        const override  = overrideIndexPerfil[lookupKey];

        // ── Determinar PRECIO POR BARRA ───────────────────────────────────
        // Prioridad: 1) override del frontend (catálogo Alumfer) → siempre tiene precio
        //            2) materiales table como fallback
        let precioBarra = 0;
        let id_material = null;
        if (override && parseFloat(override.precio_unitario) >= 0) {
          // Aceptamos override incluso si precio=0 (el usuario lo puso así explícitamente)
          precioBarra = parseFloat(override.precio_unitario) || 0;
          id_material = override.id_material || null;
        }
        if (!precioBarra) {
          // Fallback: match en materiales — primero por ubicación COMPLETA,
          // si no, por la primera palabra. Así HORIZONTAL SUP no se confunde
          // con HORIZONTAL INF (ambas contienen "horizontal").
          const ubiLower    = pieza.ubicacion.toLowerCase();
          const firstWord   = (pieza.ubicacion.split(' ')[0] || '').toLowerCase();
          const matExact    = matsIdx.find(m => m._lower.includes(ubiLower));
          const matFallback = !matExact && firstWord ? matsIdx.find(m => m._lower.includes(firstWord)) : null;
          const mat = matExact || matFallback;
          if (mat) {
            precioBarra = parseFloat(mat.costo_unitario);
            id_material = mat.id_material;
          }
        }

        // ── COLOR: override > color de la ventana ─────────────────────────
        const color_perfil = (override && override.color_perfil) || v.color_perfil || null;

        // ── FÓRMULA cm × $/cm ─────────────────────────────────────────────
        const barraCm     = barraPorPerfil[v.id_perfil] || BARRA_ESTANDAR_DEFAULT_CM;
        const cmUtil      = Math.max(1, barraCm - MARGEN_PERDIDA_CM);
        const cmConsumido = pieza.total_cm;
        const numPiezas   = pieza.total_pieces;
        const precioPorCm = precioBarra > 0 ? precioBarra / cmUtil : 0;
        const subtotal    = parseFloat((cmConsumido * precioPorCm).toFixed(2));

        subtotal_materiales += subtotal;

        detalles.push({
          id_material,
          nombre_item:              pieza.ubicacion,
          cantidad_total:           parseFloat(cmConsumido.toFixed(2)),   // ← CM totales consumidos
          cantidad_piezas:          numPiezas,                            // ← NUM de piezas (1, 2, 4...)
          precio_unitario_snapshot: parseFloat(precioPorCm.toFixed(4)),   // ← $/cm
          subtotal,
          color_perfil,
          id_ventana_idx:           idx,
          tipo_item:                'perfil',
        });
      }
    }

    // ─── PASO 5: vidrios y accesorios (qty × price) ───────────────────────
    // Regla de cobro: FELPA y EMPAQUE se cobran por METRO LINEAL (ml), no por cm.
    // El motor entrega su longitud en cm (cantidad_m llega en cm para estos ítems);
    // para el cobro se convierte a ml (÷100) y el precio se entiende por metro
    // lineal. El resto de accesorios (cerradura, rodamiento, etc.) y los vidrios
    // conservan su lógica original (qty × price), independiente de la unidad cm/mm
    // de la ventana, que NO se altera.
    for (const item of otrosOverrides) {
      const price  = parseFloat(item.precio_unitario) || 0;
      const rawQty = parseFloat(item.cantidad_m)      || 0;

      const esLongitud = /felpa|empaque/i.test(item.nombre || '');
      const qty = esLongitud ? parseFloat((rawQty / 100).toFixed(4)) : rawQty;

      const subtotal = parseFloat((qty * price).toFixed(2));
      subtotal_materiales += subtotal;

      detalles.push({
        id_material:              item.id_material || null,
        nombre_item:              item.nombre      || null,
        cantidad_total:           qty,          // ml para felpa/empaque; unidades/m² para el resto
        precio_unitario_snapshot: price,        // por metro lineal para felpa/empaque
        subtotal,
        color_perfil:             item.color_perfil || null,
        id_ventana_idx:           item.id_ventana_idx != null ? parseInt(item.id_ventana_idx) : null,
        tipo_item:                item.tipo_item || 'accesorio',
      });
    }

    // ── Cálculos financieros ─────────────────────────────────────────────
    const rm_pct   = parseFloat(recargo_materiales_pct);
    const subtotal_materiales_con_recargo = parseFloat((subtotal_materiales * (1 + rm_pct / 100)).toFixed(2));

    const vo       = parseFloat(valor_diario_mano_obra_oficial);
    const mo_pct   = parseFloat(mano_obra_pct_adicional);
    const personas = Math.max(1, parseInt(cantidad_personas) || 1);
    const valor_diario_mano_obra_aplicado = parseFloat((vo * (1 + mo_pct / 100)).toFixed(2));
    const dias     = parseInt(dias_proyectados);
    // Mano de obra × días × número de personas
    const subtotal_mano_obra = parseFloat((valor_diario_mano_obra_aplicado * dias * personas).toFixed(2));

    const transp_est  = parseFloat(transporte_estructuras || 0);
    const transp_pers = parseFloat(transporte_personal    || 0);
    const instalacion_valor = parseFloat(instalacion      || 0);

    // ── Metodología plantilla / guía Homecenter ───────────────────────────
    // Utilidad = % SOLO sobre la mano de obra ("UTILIDAD 30% MO").
    //   NO se calcula sobre materiales ni sobre transportes.
    const ut_pct         = parseFloat(utilidad_pct);
    const utilidad_valor = parseFloat((subtotal_mano_obra * ut_pct / 100).toFixed(2));

    // Subtotal gravable = materiales c/recargo + mano de obra + utilidad.
    //   Los transportes (estructuras + personal) NO entran aquí: van APARTE al
    //   final, sin marcarse con utilidad ni IVA (así no se "cobra dos veces").
    const subtotal_antes_iva = parseFloat(
      (subtotal_materiales_con_recargo + subtotal_mano_obra + utilidad_valor).toFixed(2)
    );

    const iva_p     = parseFloat(iva_pct);
    const iva_valor = parseFloat((subtotal_antes_iva * iva_p / 100).toFixed(2));

    // Cascada de totales (idéntica a la del PDF builder y a la plantilla):
    //   total sin instalación = subtotal gravable + IVA
    //   total final           = total sin instalación + instalación
    //   (los transportes se suman aparte en la presentación, fuera del total_final)
    const total_sin_instalacion = parseFloat((subtotal_antes_iva + iva_valor).toFixed(2));
    const total_final           = parseFloat((total_sin_instalacion + instalacion_valor).toFixed(2));

    // ── Versión ──────────────────────────────────────────────────────────
    let version = 1;
    try {
      const { rows: versions } = await conn.query(
        `SELECT COALESCE(MAX(version),0)+1 as next_v FROM cotizaciones WHERE id_proyecto=$1`, [id_proyecto]
      );
      version = versions[0].next_v;
    } catch(_) { /* columna version aún no existe — usar 1 por defecto */ }

    // ── INSERT cotizaciones (defensivo: detecta qué columnas existen) ─────────
    const { rows: cotCols } = await conn.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name='cotizaciones'
         AND column_name='subtotal_materiales'`
    );
    const tieneNuevas = cotCols.length > 0;

    let id_cotizacion;
    if (tieneNuevas) {
      // Schema v14 con patch aplicado
      const { rows: cotResult } = await conn.query(
        `INSERT INTO cotizaciones
         (id_proyecto, version,
          subtotal_materiales, recargo_materiales_pct, subtotal_materiales_con_recargo,
          valor_diario_mano_obra_oficial, mano_obra_pct_adicional, valor_diario_mano_obra_aplicado,
          dias_proyectados, subtotal_mano_obra,
          utilidad_pct, utilidad_valor, iva_pct, iva_valor, total_final,
          notas, fecha_cotizacion)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())
         RETURNING id_cotizacion`,
        [
          id_proyecto, version,
          subtotal_materiales, rm_pct, subtotal_materiales_con_recargo,
          vo, mo_pct, valor_diario_mano_obra_aplicado,
          dias, subtotal_mano_obra,
          ut_pct, utilidad_valor, iva_p, iva_valor, total_final,
          notas
        ]
      );
      id_cotizacion = cotResult[0].id_cotizacion;
    } else {
      // Schema base sin patch — insertar columnas originales como fallback
      const { rows: cotResult } = await conn.query(
        `INSERT INTO cotizaciones
         (id_proyecto, subtotal, iva, total, porcentaje_iva, porcentaje_utilidad, mano_obra_total)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id_cotizacion`,
        [
          id_proyecto,
          subtotal_materiales_con_recargo,
          iva_valor,
          total_final,
          iva_p,
          ut_pct,
          subtotal_mano_obra,
        ]
      );
      id_cotizacion = cotResult[0].id_cotizacion;
    }

    // Guardar columnas nuevas (transporte, personas) de forma segura
    try {
      await conn.query(
        `UPDATE cotizaciones SET
           transporte_estructuras = $1,
           transporte_personal    = $2,
           cantidad_personas      = $3,
           instalacion            = $4
         WHERE id_cotizacion = $5`,
        [transp_est, transp_pers, personas, instalacion_valor, id_cotizacion]
      );
    } catch(_) { /* columnas aún no existen — ignorar hasta aplicar parche */ }

    // OPTIMIZACIÓN: cachear materiales activos UNA vez para resolver nombres en JS.
    // Antes: 1 query por cada detalle sin id_material. Ahora: 1 query total.
    let _matsCache = null;
    const _getMatsCache = async () => {
      if (_matsCache) return _matsCache;
      const { rows } = await conn.query(
        `SELECT id_material, nombre_material FROM materiales WHERE estado='activo'`
      );
      _matsCache = rows.map(m => ({ ...m, _lower: (m.nombre_material || '').toLowerCase() }));
      return _matsCache;
    };

    // OPTIMIZACIÓN: detectar la presencia de `tipo_item` UNA SOLA VEZ antes
    // del loop de inserts. Antes la detección corría por cada detalle (N+1).
    let _tieneTipoItem = false;
    if (!tieneNuevas) {
      try {
        const { rows: c } = await conn.query(
          `SELECT 1 FROM information_schema.columns
           WHERE table_name='cotizacion_detalle_materiales'
             AND column_name='tipo_item' LIMIT 1`
        );
        _tieneTipoItem = c.length > 0;
      } catch { /* ignore */ }
    }

    // ── INSERT detalles ───────────────────────────────────────────────────
    for (const d of detalles) {
      // Resolver id real de ventana desde índice
      let id_ventana_real = null;
      if (d.id_ventana_idx !== null && ventanas[d.id_ventana_idx]) {
        id_ventana_real = ventanas[d.id_ventana_idx].id_ventana;
      }

      // Insertar detalle de forma defensiva según columnas disponibles
      if (tieneNuevas) {
        // Si id_material viene null, intentar resolverlo en memoria (NO query)
        let resolvedIdMaterial = d.id_material || null;
        if (!resolvedIdMaterial && d.nombre_item) {
          const keyword = d.nombre_item.replace(/^\[V\d+\]\s*/,'').split(' ')[0].toLowerCase();
          if (keyword) {
            const cache = await _getMatsCache();
            const found = cache.find(m => m._lower.includes(keyword));
            if (found) resolvedIdMaterial = found.id_material;
          }
        }

        await conn.query(
          `INSERT INTO cotizacion_detalle_materiales
           (id_cotizacion, id_material, nombre_item, cantidad_total, cantidad_piezas,
            precio_unitario_snapshot, subtotal, color_perfil, id_ventana, tipo_item)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            id_cotizacion,
            resolvedIdMaterial,
            d.nombre_item,
            d.cantidad_total,
            d.cantidad_piezas || null,
            d.precio_unitario_snapshot,
            d.subtotal,
            d.color_perfil,
            id_ventana_real,
            d.tipo_item || 'perfil',
          ]
        );
      } else {
        // Schema base: usar el flag _tieneTipoItem ya calculado fuera del loop.
        if (_tieneTipoItem) {
          await conn.query(
            `INSERT INTO cotizacion_detalle_materiales
             (id_cotizacion, referencia, descripcion, cantidad, precio_unitario, subtotal, tipo_item)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [
              id_cotizacion,
              d.ref || null,
              d.nombre_item,
              d.cantidad_total,
              d.precio_unitario_snapshot,
              d.subtotal,
              d.tipo_item || 'perfil',
            ]
          );
        } else {
          await conn.query(
            `INSERT INTO cotizacion_detalle_materiales
             (id_cotizacion, referencia, descripcion, cantidad, precio_unitario, subtotal)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [
              id_cotizacion,
              d.ref || null,
              d.nombre_item,
              d.cantidad_total,
              d.precio_unitario_snapshot,
              d.subtotal,
            ]
          );
        }
      }
    }

    // ── Historial ─────────────────────────────────────────────────────────
    await pool.query(
      `INSERT INTO historial_proyectos (id_proyecto, accion, version, id_usuario)
       VALUES ($1, $2, $3, $4)`,
      [id_proyecto, `Cotización v${version} generada — Total: $${total_final.toLocaleString('es-CO')}`, version, req.user.id]
    );

    await conn.query('COMMIT');

    // ── Vidrios por ventana para PDF ──────────────────────────────────────
    const vidrios_por_ventana = ventanas.map(v => {
      const calc = calcularVentana(
        v.id_perfil, v.id_sistema, getIdDiseno(v),
        normalizarDeBD(v.ancho_vano, v.ancho_unidad),
        normalizarDeBD(v.alto_vano,  v.alto_unidad)
      );
      const vidrios = calc.error ? [] : calc.piezas.filter(p => p.es_vidrio);
      return {
        id_ventana: v.id_ventana,
        ancho_vano: v.ancho_vano,
        alto_vano: v.alto_vano,
        sistema: v.sistema,
        perfil: v.perfil,
        diseno: v.diseno,
        vidrios,
      };
    });

    res.json({
      id_cotizacion,
      version,
      advertencia_duplicado: cotizacionesExistentes > 0
        ? `Este proyecto ya tenía ${cotizacionesExistentes} cotización(es) previa(s)`
        : null,
      subtotal_materiales,
      recargo_materiales_pct:          rm_pct,
      subtotal_materiales_con_recargo,
      valor_diario_mano_obra_oficial:  vo,
      mano_obra_pct_adicional:         mo_pct,
      valor_diario_mano_obra_aplicado,
      dias_proyectados:                dias,
      cantidad_personas:               personas,
      subtotal_mano_obra,
      transporte_estructuras:          transp_est,
      transporte_personal:             transp_pers,
      instalacion:                     instalacion_valor,
      utilidad_pct:                    ut_pct,
      utilidad_valor,
      iva_pct:                         iva_p,
      iva_valor,
      total_final,
      detalles,
      vidrios_por_ventana,
    });
  } catch (err) {
    await conn.query('ROLLBACK');
    console.error('[generarCotizacion ERROR]', err);
    res.status(500).json({
      error: 'Error al generar cotización',
      detalle: err.message,
      hint: err.hint || null,
      codigo: err.code || null,
    });
  } finally {
    conn.release();
  }
};

// ─── Listar cotizaciones ──────────────────────────────────────────────────────
const listar = async (req, res) => {
  try {
    // 1+2 EN PARALELO: detectar columnas Y tabla de accesos simultáneamente
    // (antes era secuencial → 2 round-trips innecesarios)
    const [colInfoRes, tInfoRes] = await Promise.all([
      pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='cotizaciones'`),
      pool.query(`SELECT table_name FROM information_schema.tables WHERE table_name='proyecto_accesos'`),
    ]);
    const cols = new Set(colInfoRes.rows.map(r => r.column_name));
    const tieneAccesos = tInfoRes.rows.length > 0;

    const selectTotal     = cols.has('total_final')          ? 'COALESCE(c.total_final, 0)'         : 'COALESCE(c.total, 0)';
    const selectSubtotal  = cols.has('subtotal_materiales')  ? 'COALESCE(c.subtotal_materiales, 0)' : 'COALESCE(c.subtotal, 0)';
    const selectIva       = cols.has('iva_valor')            ? 'COALESCE(c.iva_valor, 0)'           : 'COALESCE(c.iva, 0)';
    const selectVersion   = cols.has('version')              ? 'COALESCE(c.version, 1)'             : '1';
    const selectOficial   = cols.has('es_oficial')           ? 'COALESCE(c.es_oficial, FALSE)'      : 'FALSE';
    const selectNotas     = cols.has('notas')                ? "COALESCE(c.notas, '')"            : "''";
    const selectEstado    = cols.has('estado_workflow')      ? "COALESCE(c.estado_workflow, 'borrador')" : "'borrador'";

    const selectFecha     = cols.has('fecha_cotizacion')     ? 'c.fecha_cotizacion'
                            : cols.has('fecha_creacion')      ? 'c.fecha_creacion'
                            : 'NOW()';

    const accesoClause = tieneAccesos
      ? `OR EXISTS (SELECT 1 FROM proyecto_accesos pa WHERE pa.id_proyecto = p.id_proyecto AND pa.id_usuario = $1)`
      : '';

    const { rows } = await pool.query(
      `SELECT c.id_cotizacion,
              c.id_proyecto,
              ${selectTotal}    AS total_final,
              ${selectSubtotal} AS subtotal_materiales,
              ${selectIva}      AS iva_valor,
              ${selectVersion}  AS version,
              ${selectOficial}  AS es_oficial,
              ${selectNotas}    AS notas,
              ${selectFecha}    AS fecha_cotizacion,
              ${selectEstado}   AS estado_workflow,
              p.nombre_proyecto,
              p.nombre_cliente,
              p.estado          AS estado_proyecto
       FROM cotizaciones c
       JOIN proyectos p ON c.id_proyecto = p.id_proyecto
       WHERE p.id_usuario_creador = $1
          ${accesoClause}
       ORDER BY c.id_cotizacion DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('[listar cotizaciones ERROR]', err.message);
    res.status(500).json({ error: 'Error al listar cotizaciones', detalle: err.message });
  }
};

// ─── Obtener cotización con detalle completo ──────────────────────────────────
const obtener = async (req, res) => {
  const { id } = req.params;
  try {
    // QUERY 1 + QUERY 2 EN PARALELO: cot necesita JOIN con proyectos para
    // sacar id_proyecto, pero detalles solo necesita id_cotizacion (URL).
    // Se pueden correr simultáneamente.
    const [cotRes, detallesRes] = await Promise.all([
      pool.query(
        `SELECT c.*, p.nombre_proyecto, p.nombre_cliente, p.id_proyecto
         FROM cotizaciones c
         JOIN proyectos p ON c.id_proyecto = p.id_proyecto
         WHERE c.id_cotizacion=$1`, [id]
      ),
      pool.query(
        `SELECT
           cd.*,
           COALESCE(m.nombre_material, cd.nombre_item) AS nombre_material,
           COALESCE(m.unidad_medida, 'und')            AS unidad_medida,
           v.ancho_vano, v.alto_vano,
           s.nombre  AS ventana_sistema,
           pf.referencia AS ventana_perfil,
           d.nombre  AS ventana_diseno
         FROM cotizacion_detalle_materiales cd
         LEFT JOIN materiales m          ON cd.id_material = m.id_material
         LEFT JOIN ventanas v            ON cd.id_ventana  = v.id_ventana
         LEFT JOIN sistemas_ventaneria s ON v.id_sistema   = s.id_sistema
         LEFT JOIN perfiles pf           ON v.id_perfil    = pf.id_perfil
         LEFT JOIN "diseños" d           ON v."id_diseño"  = d."id_diseño"
         WHERE cd.id_cotizacion=$1
         ORDER BY cd.id_ventana NULLS LAST, cd.id_cotizacion`, [id]
      ),
    ]);
    if (!cotRes.rows.length) return res.status(404).json({ error: 'Cotización no encontrada' });
    const cot = cotRes.rows[0];
    const detalles = detallesRes.rows;

    // Query 3: ventanas (necesita id_proyecto de la cotización)
    const { rows: ventanas } = await pool.query(
      `SELECT v.id_ventana, v.ancho_vano, v.alto_vano, v.id_sistema, v.id_perfil,
              v."id_diseño" as id_diseno,
              COALESCE(v.color_perfil,'Natural') as color_perfil,
              COALESCE(v.ancho_unidad,'cm') as ancho_unidad,
              COALESCE(v.alto_unidad, 'cm') as alto_unidad,
              s.nombre  as sistema,
              pf.referencia as perfil,
              d.nombre  as diseno,
              v.reporte_generado, v.notas
       FROM ventanas v
       JOIN sistemas_ventaneria s ON v.id_sistema = s.id_sistema
       JOIN perfiles pf           ON v.id_perfil  = pf.id_perfil
       JOIN "diseños" d           ON v."id_diseño" = d."id_diseño"
       WHERE v.id_proyecto = $1
       ORDER BY v.id_ventana`, [cot.id_proyecto]
    );

    // Recalcular vidrios por ventana para PDF (CPU work, sin queries)
    const vidrios_por_ventana = ventanas.map(v => {
      const calc = calcularVentana(
        v.id_perfil, v.id_sistema, getIdDiseno(v),
        normalizarDeBD(v.ancho_vano, v.ancho_unidad),
        normalizarDeBD(v.alto_vano,  v.alto_unidad)
      );
      const vidrios = calc.error ? [] : calc.piezas.filter(p => p.es_vidrio);
      return {
        id_ventana: v.id_ventana,
        ancho_vano: v.ancho_vano,
        alto_vano:  v.alto_vano,
        sistema:    v.sistema,
        perfil:     v.perfil,
        diseno:     v.diseno,
        vidrios,
      };
    });

    res.json({ ...cot, detalles, ventanas, vidrios_por_ventana });
  } catch (err) {
    console.error('[obtener cotización] ERROR:', err.message);
    res.status(500).json({ error: 'Error al obtener cotización', detalle: err.message });
  }
};

// ─── Eliminar ─────────────────────────────────────────────────────────────────
const eliminar = async (req, res) => {
  const { id } = req.params;
  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');
    const { rows } = await conn.query(
      `SELECT c.id_cotizacion, p.id_usuario_creador
       FROM cotizaciones c
       JOIN proyectos p ON c.id_proyecto=p.id_proyecto
       WHERE c.id_cotizacion=$1`, [id]
    );
    if (!rows.length) { await conn.query('ROLLBACK'); return res.status(404).json({ error: 'Cotización no encontrada' }); }
    const esAdmin = req.user.rol === 'Administrador';
    if (!esAdmin && rows[0].id_usuario_creador != req.user.id) {
      await conn.query('ROLLBACK');
      return res.status(403).json({ error: 'Sin permiso' });
    }
    await conn.query('DELETE FROM cotizacion_detalle_materiales WHERE id_cotizacion=$1', [id]);
    await conn.query('DELETE FROM cotizacion_parametros_mano_obra WHERE id_cotizacion=$1', [id]);
    await conn.query('DELETE FROM cotizaciones WHERE id_cotizacion=$1', [id]);
    await conn.query('COMMIT');
    res.json({ message: 'Cotización eliminada' });
  } catch (err) {
    await conn.query('ROLLBACK');
    res.status(500).json({ error: 'Error al eliminar: ' + err.message });
  } finally { conn.release(); }
};

// ─── Marcar oficial ───────────────────────────────────────────────────────────
const marcarOficial = async (req, res) => {
  const { id } = req.params;
  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');
    const { rows: cot } = await conn.query(
      `SELECT id_cotizacion, id_proyecto FROM cotizaciones WHERE id_cotizacion=$1`, [id]
    );
    if (!cot.length) { await conn.query('ROLLBACK'); return res.status(404).json({ error: 'Cotización no encontrada' }); }
    await conn.query(`UPDATE cotizaciones SET es_oficial=FALSE WHERE id_proyecto=$1`, [cot[0].id_proyecto]);
    await conn.query(`UPDATE cotizaciones SET es_oficial=TRUE  WHERE id_cotizacion=$1`, [id]);
    await conn.query('COMMIT');
    res.json({ message: 'Cotización marcada como oficial' });
  } catch (err) {
    await conn.query('ROLLBACK');
    res.status(500).json({ error: 'Error: ' + err.message });
  } finally { conn.release(); }
};

// ─── Generar PDF profesional de cotización ───────────────────────────────────
const generarPDF = async (req, res) => {
  const { id } = req.params;
  const log = (...args) => console.log(`[PDF cot=${id}]`, ...args);
  try {
    log('▶ Inicio');

    // 1/6 Cargar cotización
    log('1/6 cargando cotización...');
    const { rows: cotRows } = await pool.query(
      `SELECT c.*, p.nombre_proyecto, p.nombre_cliente, p.id_proyecto,
              p.id_usuario_creador
       FROM cotizaciones c
       JOIN proyectos p ON c.id_proyecto = p.id_proyecto
       WHERE c.id_cotizacion = $1`, [id]
    );
    if (!cotRows.length) {
      log('✗ No encontrada');
      return res.status(404).json({ error: 'Cotización no encontrada' });
    }
    const cot = cotRows[0];
    log('✓ cot ok, proyecto=' + cot.id_proyecto);

    // 2+3+4a EN PARALELO: permisos, detalles, y detección columnas ventanas
    // son INDEPENDIENTES entre sí (solo necesitan cot.id_proyecto/cot.id_cotizacion).
    // Antes se hacían secuenciales → 3 round-trips innecesarios.
    log('2-4a paralelo: permisos + detalles + cols ventanas...');
    const esDueno = cot.id_usuario_creador == req.user.id;
    const [accRes, detallesRes, colsVentRes] = await Promise.all([
      // Permisos (solo se necesita si no es dueño; lo lanzamos siempre para simplicidad)
      esDueno
        ? Promise.resolve({ rows: [{ ok: 1 }] })
        : pool.query(
            `SELECT 1 FROM proyecto_accesos WHERE id_proyecto=$1 AND id_usuario=$2`,
            [cot.id_proyecto, req.user.id]
          ).catch(e => { log('⚠ accesos:', e.message); return { rows: [] }; }),
      // Detalles
      pool.query(
        `SELECT cd.*,
                COALESCE(m.nombre_material, cd.nombre_item) AS nombre_material,
                COALESCE(m.unidad_medida, 'und')            AS unidad_medida
         FROM cotizacion_detalle_materiales cd
         LEFT JOIN materiales m ON cd.id_material = m.id_material
         WHERE cd.id_cotizacion = $1
         ORDER BY cd.id_ventana NULLS LAST, cd.id_cotizacion`, [id]
      ),
      // Detección columnas ventanas
      pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='ventanas'`),
    ]);

    if (!esDueno && !accRes.rows.length) {
      log('✗ sin permiso');
      return res.status(403).json({ error: 'Sin permiso para esta cotización' });
    }
    const detalles = detallesRes.rows;
    const ventCols = new Set(colsVentRes.rows.map(r => r.column_name));
    log(`✓ permisos ok · ${detalles.length} detalles · cols ventanas detectadas`);

    // 4b Ventanas (necesita ventCols del paso anterior)
    log('4b ventanas...');
    const selPrecioVidrio  = ventCols.has('precio_vidrio_m2') ? 'v.precio_vidrio_m2' : 'NULL::numeric AS precio_vidrio_m2';
    const selTipoVidrio    = ventCols.has('tipo_vidrio')      ? 'v.tipo_vidrio'      : 'NULL::text AS tipo_vidrio';
    const selNombreVentana = ventCols.has('nombre')           ? 'v.nombre'           : 'NULL::text AS nombre';
    const selAnchoUnidad   = ventCols.has('ancho_unidad')     ? 'v.ancho_unidad'     : `'cm'::varchar AS ancho_unidad`;
    const selAltoUnidad    = ventCols.has('alto_unidad')      ? 'v.alto_unidad'      : `'cm'::varchar AS alto_unidad`;

    let ventanas = [];
    try {
      const { rows } = await pool.query(
        `SELECT v.id_ventana, v.ancho_vano, v.alto_vano,
                v.id_sistema, v.id_perfil, v."id_diseño" AS id_diseno,
                COALESCE(v.color_perfil,'Natural') AS color_perfil,
                v.referencia_vidrio, v.notas,
                ${selPrecioVidrio}, ${selTipoVidrio}, ${selNombreVentana}, ${selAnchoUnidad}, ${selAltoUnidad},
                s.nombre  AS sistema,
                pf.referencia AS perfil,
                d.nombre  AS diseno
         FROM ventanas v
         JOIN sistemas_ventaneria s ON v.id_sistema = s.id_sistema
         JOIN perfiles pf           ON v.id_perfil  = pf.id_perfil
         JOIN "diseños" d           ON v."id_diseño" = d."id_diseño"
         WHERE v.id_proyecto = $1 ORDER BY v.id_ventana`, [cot.id_proyecto]
      );
      ventanas = rows;
    } catch (errV) {
      log('⚠ fallo JOIN, usando fallback:', errV.message);
      const { rows } = await pool.query(
        `SELECT v.id_ventana, v.ancho_vano, v.alto_vano,
                v.id_sistema, v.id_perfil, v."id_diseño" AS id_diseno,
                COALESCE(v.color_perfil,'Natural') AS color_perfil,
                v.referencia_vidrio, v.notas,
                ${selPrecioVidrio}, ${selTipoVidrio}, ${selNombreVentana}, ${selAnchoUnidad}, ${selAltoUnidad},
                'Sistema ' || v.id_sistema AS sistema,
                ''                        AS perfil,
                'Diseño ' || v."id_diseño" AS diseno
         FROM ventanas v
         WHERE v.id_proyecto = $1 ORDER BY v.id_ventana`, [cot.id_proyecto]
      );
      ventanas = rows;
    }
    log(`✓ ${ventanas.length} ventanas`);

    // 5/6 Vidrios desde motor (defensivo)
    // Leer la unidad del proyecto (default 'cm' si la columna no existe aún).
    // Esto se pasa a calcularVentana para que las medidas y fórmulas vuelvan
    // en la unidad correcta — luego el builder y el template la respetan.
    let projectUnit = 'cm';
    try {
      const { rows: pu } = await pool.query(
        `SELECT unidad_default FROM proyectos WHERE id_proyecto = $1`,
        [cot.id_proyecto]
      );
      if (pu.length && pu[0].unidad_default) {
        projectUnit = String(pu[0].unidad_default).toLowerCase() === 'mm' ? 'mm' : 'cm';
      }
    } catch (e) {
      log('⚠ unidad_default no disponible, usando cm:', e.message);
    }
    log(`5/6 motor vidrios (unit=${projectUnit})...`);
    // POLÍTICA UNIFICADA: el motor SIEMPRE recibe cm canónico. La unidad del
    // proyecto solo afecta cómo el frontend presenta los resultados — no cómo
    // se calculan. normalizarDeBD corrige los datos legacy con valores en mm.
    const vidrios_por_ventana = ventanas.map(v => {
      try {
        const calc = calcularVentana(
          v.id_perfil, v.id_sistema, getIdDiseno(v),
          normalizarDeBD(v.ancho_vano, v.ancho_unidad),
          normalizarDeBD(v.alto_vano,  v.alto_unidad),
          v.referencia_vidrio || '5MM',
        );
        const vidrios = calc.error ? [] : calc.piezas.filter(p => p.es_vidrio);
        return { id_ventana: v.id_ventana, vidrios };
      } catch (errC) {
        log(`⚠ ventana ${v.id_ventana}:`, errC.message);
        return { id_ventana: v.id_ventana, vidrios: [] };
      }
    });
    log('✓ vidrios ok');

    // 6/6 projectQuotation + render
    log('6/6 building projectQuotation + render...');
    // Por defecto NO aplicar precio: si el usuario no puso precio, mostrar $0
    // (puede sobrescribirse con env VIDRIO_PRECIO_M2_DEFAULT si se desea)
    const priceM2Fallback = parseFloat(process.env.VIDRIO_PRECIO_M2_DEFAULT || '0');
    const empresa = {
      nombre:       process.env.EMPRESA_NOMBRE       || 'CorteAlum',
      razon_social: process.env.EMPRESA_RAZON_SOCIAL || 'CorteAlum S.A.S',
      nit:          process.env.EMPRESA_NIT          || 'NIT —',
      direccion:    process.env.EMPRESA_DIRECCION    || '—',
      telefono:     process.env.EMPRESA_TELEFONO     || '—',
      email:        process.env.EMPRESA_EMAIL        || '—',
      web:          process.env.EMPRESA_WEB          || '',
      logo_url:     process.env.EMPRESA_LOGO_URL     || null,
    };

    const projectQuotation = buildProjectQuotation(
      { ...cot, detalles, ventanas, vidrios_por_ventana },
      { empresa, priceM2Fallback, unit: projectUnit }
    );
    log(`  → ${projectQuotation.windows.length} ventanas, total $${projectQuotation.totals.totalFinal}, unit=${projectUnit}`);

    // Modo debug: GET /api/cotizaciones/:id/pdf?debug=1 → devuelve JSON
    if (req.query.debug === '1') {
      log('🐛 debug → JSON');
      return res.json({ ok: true, projectQuotation });
    }
    if (req.query.debug === 'raw') {
      log('🐛 debug raw → detalles crudos');
      // Útil para verificar qué tipo_item están guardados en BD
      const counts = detalles.reduce((m, d) => { const t=d.tipo_item||'(null)'; m[t]=(m[t]||0)+1; return m; }, {});
      return res.json({ ok: true, total: detalles.length, counts, detalles, ventanas });
    }
    if (req.query.debug === 'html') {
      log('🐛 debug → HTML preview');
      const html = renderHTML(projectQuotation);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(html);
    }

    const html = renderHTML(projectQuotation);
    log(`  → HTML ${html.length} bytes`);

    const pdfBuffer = await htmlToPDF(html);
    log(`✓ PDF ${pdfBuffer.length} bytes`);

    const filename = `${projectQuotation.quotationInfo.numero}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Cache-Control', 'no-store');
    return res.end(pdfBuffer, 'binary');
  } catch (err) {
    console.error(`[PDF cot=${id}] ✗✗✗ ERROR:`, err.message);
    console.error(err.stack);
    return res.status(500).json({
      error: 'Error al generar PDF',
      detalle: err.message,
    });
  }
};

// ─── Endpoint debug: devuelve el projectQuotation JSON (para inspección) ─────
const previewProjectQuotation = async (req, res) => {
  try {
    const { id } = req.params;
    const { rows: cotRows } = await pool.query(
      `SELECT c.*, p.nombre_proyecto, p.nombre_cliente, p.id_proyecto,
              p.id_usuario_creador
       FROM cotizaciones c
       JOIN proyectos p ON c.id_proyecto = p.id_proyecto
       WHERE c.id_cotizacion = $1`, [id]
    );
    if (!cotRows.length) return res.status(404).json({ error: 'Cotización no encontrada' });
    const cot = cotRows[0];

    const { rows: detalles } = await pool.query(
      `SELECT cd.*, COALESCE(m.nombre_material, cd.nombre_item) AS nombre_material,
              COALESCE(m.unidad_medida, 'und') AS unidad_medida
       FROM cotizacion_detalle_materiales cd
       LEFT JOIN materiales m ON cd.id_material = m.id_material
       WHERE cd.id_cotizacion = $1`, [id]
    );

    const { rows: ventanas } = await pool.query(
      `SELECT v.id_ventana, v.ancho_vano, v.alto_vano, v.id_sistema, v.id_perfil,
              v."id_diseño" AS id_diseno, COALESCE(v.color_perfil,'Natural') AS color_perfil,
              COALESCE(v.ancho_unidad,'cm') AS ancho_unidad,
              COALESCE(v.alto_unidad, 'cm') AS alto_unidad,
              v.referencia_vidrio, v.notas,
              s.nombre AS sistema, pf.referencia AS perfil, d.nombre AS diseno
       FROM ventanas v
       JOIN sistemas_ventaneria s ON v.id_sistema = s.id_sistema
       JOIN perfiles pf           ON v.id_perfil  = pf.id_perfil
       JOIN "diseños" d           ON v."id_diseño" = d."id_diseño"
       WHERE v.id_proyecto = $1 ORDER BY v.id_ventana`, [cot.id_proyecto]
    );

    const vidrios_por_ventana = ventanas.map(v => {
      const calc = calcularVentana(v.id_perfil, v.id_sistema, getIdDiseno(v),
        normalizarDeBD(v.ancho_vano, v.ancho_unidad),
        normalizarDeBD(v.alto_vano,  v.alto_unidad));
      return { id_ventana: v.id_ventana, vidrios: calc.error ? [] : calc.piezas.filter(p => p.es_vidrio) };
    });

    const pq = buildProjectQuotation({ ...cot, detalles, ventanas, vidrios_por_ventana }, {
      priceM2Fallback: parseFloat(process.env.VIDRIO_PRECIO_M2_DEFAULT || '0'),
    });
    res.json(pq);
  } catch (err) {
    console.error('[previewProjectQuotation ERROR]', err);
    res.status(500).json({ error: err.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// WORKFLOW DE COTIZACIÓN — Estados y transiciones
// ═══════════════════════════════════════════════════════════════════════════
//
// Estados:
//   - borrador    (default al crear)
//   - enviada     (se envió al cliente)
//   - aceptada    (cliente aceptó)
//   - rechazada   (cliente rechazó — estado final)
//   - convertida  (convertida a orden de producción — estado final)
//   - cancelada   (cancelada por el usuario — estado final)
//
// Transiciones válidas (cualquier otra → 400 Bad Request).
const TRANSICIONES_COT = {
  borrador:   ['enviada', 'cancelada'],
  enviada:    ['aceptada', 'rechazada', 'cancelada', 'borrador'],
  aceptada:   ['convertida', 'cancelada'],
  rechazada:  [],   // final
  convertida: [],   // final
  cancelada:  [],   // final
};

// Por cada nuevo estado, qué columna fecha se actualiza (NULL = no se toca)
const FECHA_AL_TRANSITAR = {
  enviada:    'fecha_enviada',
  aceptada:   'fecha_aceptada',
  convertida: 'fecha_convertida',
};

const cambiarEstado = async (req, res) => {
  const { id } = req.params;
  const { estado, motivo } = req.body || {};

  if (!estado) return res.status(400).json({ error: 'Falta el nuevo estado en el body' });
  if (!TRANSICIONES_COT.hasOwnProperty(estado))
    return res.status(400).json({ error: `Estado desconocido: ${estado}` });

  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');

    // 1. Cargar cotización + verificar permiso (dueño del proyecto o admin)
    const { rows } = await conn.query(
      `SELECT c.id_cotizacion,
              c.estado_workflow,
              c.id_proyecto,
              p.id_usuario_creador,
              p.nombre_proyecto
       FROM cotizaciones c
       JOIN proyectos p ON c.id_proyecto = p.id_proyecto
       WHERE c.id_cotizacion = $1`,
      [id]
    );
    if (!rows.length) {
      await conn.query('ROLLBACK');
      return res.status(404).json({ error: 'Cotización no encontrada' });
    }
    const cot = rows[0];
    const esAdmin = req.user.rol === 'Administrador';
    if (!esAdmin && cot.id_usuario_creador != req.user.id) {
      await conn.query('ROLLBACK');
      return res.status(403).json({ error: 'Sin permiso para cambiar el estado de esta cotización' });
    }

    // 2. Validar transición
    const estadoActual = cot.estado_workflow || 'borrador';
    const permitidos = TRANSICIONES_COT[estadoActual] || [];
    if (estadoActual === estado) {
      await conn.query('ROLLBACK');
      return res.status(400).json({ error: `La cotización ya está en estado "${estado}"` });
    }
    if (!permitidos.includes(estado)) {
      await conn.query('ROLLBACK');
      return res.status(400).json({
        error: `Transición inválida: "${estadoActual}" → "${estado}"`,
        transiciones_permitidas: permitidos,
      });
    }

    // 3. UPDATE con fecha condicional
    const setFecha = FECHA_AL_TRANSITAR[estado];
    let sql = `UPDATE cotizaciones SET estado_workflow = $1, motivo_estado = $2`;
    const params = [estado, motivo || null];
    let nextParam = 3;
    if (setFecha) {
      // Solo setea la fecha la PRIMERA vez (COALESCE preserva si ya estaba)
      sql += `, ${setFecha} = COALESCE(${setFecha}, NOW())`;
    }
    sql += ` WHERE id_cotizacion = $${nextParam} RETURNING estado_workflow`;
    params.push(id);

    const { rows: upd } = await conn.query(sql, params);

    // 4. Registrar en audit_log (dentro de la transacción)
    const auditLog = require('../services/auditLog');
    await auditLog.registrar({
      req,
      accion: 'cambio_estado',
      entidad: 'cotizacion',
      entidad_id: parseInt(id),
      descripcion: `Cotización ${id} (${cot.nombre_proyecto}): "${estadoActual}" → "${estado}"`,
      cambios: { de: estadoActual, a: estado, motivo: motivo || null },
      client: conn,
    });

    await conn.query('COMMIT');
    res.json({
      ok: true,
      id_cotizacion: parseInt(id),
      estado_workflow: upd[0].estado_workflow,
      mensaje: `Estado actualizado a "${estado}"`,
    });
  } catch (err) {
    try { await conn.query('ROLLBACK'); } catch {}
    console.error('[cambiarEstado]', err);
    res.status(500).json({ error: 'Error al cambiar estado: ' + err.message });
  } finally { conn.release(); }
};

module.exports = { previewMateriales, generarCotizacion, listar, obtener, eliminar, marcarOficial, generarPDF, previewProjectQuotation, cambiarEstado };
