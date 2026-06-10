/**
 * calcEngine.js — CorteAlu
 * Fórmulas extraídas directamente de los xlsx oficiales.
 *
 * Descuento del vano: A = vano_ancho - DESCUENTO_VANO_CM
 *                     H = vano_alto  - DESCUENTO_VANO_CM
 *
 * El DESCUENTO_VANO_CM se define en config/constants.js (por defecto 3 cm).
 * Si trabajas en MM, se convierte automáticamente: 3 cm → 30 mm.
 *
 * IDs BD: perfil 1=744, 2=5020, 3=8025 | sistema 1=Tradicional, 2=Línea90, 3=Híbrida
 * Diseños: 1=XX, 2=0X, 3=X0X, 4=0XX0, 5=XXX
 *
 * NOTAS:
 * - CABEZAL: siempre = A (ancho descontado del vano)
 * - SILLAR:  siempre = A (ancho descontado del vano) — igual al cabezal en todos los sistemas
 * - EMPAQUE y FELPA: calculados con fórmulas exactas de los xlsx por combinación
 */

// Cargar constante de descuento (configurable por env DESCUENTO_VANO_CM)
let DESCUENTO_VANO_CM = 3;
try {
  DESCUENTO_VANO_CM = require('../config/constants').DESCUENTO_VANO_CM;
} catch { /* fallback al default si no hay config */ }

const r2 = n => Math.round(n * 100) / 100;

// ═══════════════════════════════════════════════════════════════
// PERFIL 744
// ═══════════════════════════════════════════════════════════════

function _744_XX(A, H, v) {
  const tr = r2(H - 2.2), hs = r2(A / 2 - 0.1);
  const jamba = r2(H - 1);
  const v_a = r2(hs - 5.1), v_h = r2(tr - 6.6);
  // EMPAQUE xlsx: =(E18*4)+(E19*4) → (v_a*4)+(v_h*4)
  // FELPA   xlsx: =(D9*4)+(D12*2)+(D14*2) → (jamba*4)+(enganche*2)+(hor_inf*2)
  const empaque = r2((v_a * 4) + (v_h * 4));
  const felpa   = r2((jamba * 4) + (tr * 2) + (hs * 2));
  return {
    marco: [
      { ubicacion:'CABEZAL',        formula:'A',        resultado:r2(A),  cantidad:1, angulo:90 },
      { ubicacion:'SILLAR',         formula:'A',        resultado:r2(A),  cantidad:1, angulo:90 },
      { ubicacion:'JAMBA',          formula:'H - 1',    resultado:jamba,  cantidad:2, angulo:2  },
    ],
    nave_movil: [
      { ubicacion:'TRASLAPE',       formula:'H – 2,2',  resultado:tr, cantidad:2, angulo:90 },
      { ubicacion:'ENGANCHE',       formula:'H – 2,2',  resultado:tr, cantidad:2, angulo:90 },
      { ubicacion:'HORIZONTAL SUP', formula:'A/2-0,1',  resultado:hs, cantidad:2, angulo:90 },
      { ubicacion:'HORIZONTAL INF', formula:'A/2-0,1',  resultado:hs, cantidad:2, angulo:90 },
    ],
    vidrios: [
      { ubicacion:'VIDRIO', ref_vidrio:v, cantidad:2, es_vidrio:true,
        ancho:v_a, alto:v_h, formula_ancho:'HOR SUP – 5,1', formula_alto:'TRASLAPE – 6,6' },
    ],
    accesorios: _acc744(2, false, empaque, felpa, 8),
  };
}

function _744_0X(A, H, v) {
  const tr = r2(H - 2.2), trf = r2(H - 2), hs = r2(A / 2 - 0.1);
  const jamba = r2(H - 1);
  const v_a = r2(hs - 5.1), v_mov_h = r2(tr - 6.6), v_fij_h = r2(trf - 6.6);
  // EMPAQUE xlsx: =(E22*4)+(E23*2)+(E25*2) → (v_a*4)+(v_mov_h*2)+(v_fij_h*2)
  // FELPA   xlsx: =(D9*4)+(D12*1)+(D16*1)+(D18*2) → (jamba*4)+(enganche_mov*1)+(enganche_fij*1)+(hor_inf_fij*2)
  const empaque = r2((v_a * 4) + (v_mov_h * 2) + (v_fij_h * 2));
  const felpa   = r2((jamba * 4) + (tr * 1) + (trf * 1) + (hs * 2));
  return {
    marco: [
      { ubicacion:'CABEZAL',        formula:'A',        resultado:r2(A),  cantidad:1, angulo:90 },
      { ubicacion:'SILLAR',         formula:'A',        resultado:r2(A),  cantidad:1, angulo:90 },
      { ubicacion:'JAMBA',          formula:'H - 1',    resultado:jamba,  cantidad:2, angulo:2  },
    ],
    nave_movil: [
      { ubicacion:'TRASLAPE',       formula:'H – 2,2',  resultado:tr,  cantidad:1, angulo:90 },
      { ubicacion:'ENGANCHE',       formula:'H – 2,2',  resultado:tr,  cantidad:1, angulo:90 },
      { ubicacion:'HORIZONTAL SUP', formula:'A/2-0,1',  resultado:hs,  cantidad:1, angulo:90 },
      { ubicacion:'HORIZONTAL INF', formula:'A/2-0,1',  resultado:hs,  cantidad:1, angulo:90 },
    ],
    nave_fija: [
      { ubicacion:'TRASLAPE',       formula:'H – 2',    resultado:trf, cantidad:1, angulo:90 },
      { ubicacion:'ENGANCHE',       formula:'H – 2',    resultado:trf, cantidad:1, angulo:90 },
      { ubicacion:'HORIZONTAL SUP', formula:'A/2-0,1',  resultado:hs,  cantidad:1, angulo:90 },
      { ubicacion:'HORIZONTAL INF', formula:'A/2-0,1',  resultado:hs,  cantidad:1, angulo:90 },
    ],
    vidrios: [
      { ubicacion:'VIDRIO NAVE MÓVIL', ref_vidrio:v, cantidad:1, es_vidrio:true,
        ancho:v_a, alto:v_mov_h, formula_ancho:'HOR SUP – 5,1', formula_alto:'TRASLAPE – 6,6' },
      { ubicacion:'VIDRIO NAVE FIJA',  ref_vidrio:v, cantidad:1, es_vidrio:true,
        ancho:v_a, alto:v_fij_h, formula_ancho:'HOR SUP – 5,1', formula_alto:'TRASLAPE – 6,6' },
    ],
    accesorios: _acc744(1, false, empaque, felpa, 8),
  };
}

function _744_X0X(A, H, v) {
  const tr = r2(H - 2.2), trf = r2(H - 2);
  const hm = r2(A / 4 + 0.4), hf = r2(A / 4 * 2 + 1.9);
  const jamba = r2(H - 1);
  const v_mov_a = r2(hm - 5.1), v_mov_h = r2(tr - 6.6);
  const v_fij_a = r2(hf - 4.4), v_fij_h = r2(trf - 6.6);
  // EMPAQUE xlsx: =(E22*4)+(E23*4)+(E24*2)+(E25*2)
  // FELPA   xlsx: =(D9*4)+(D12*2)+(D16*2)+(D14*2)+(D18*1)
  const empaque = r2((v_mov_a * 4) + (v_mov_h * 4) + (v_fij_a * 2) + (v_fij_h * 2));
  const felpa   = r2((jamba * 4) + (tr * 2) + (trf * 2) + (hm * 2) + (hf * 1));
  return {
    marco: [
      { ubicacion:'CABEZAL',        formula:'A',           resultado:r2(A),  cantidad:1, angulo:90 },
      { ubicacion:'SILLAR',         formula:'A',           resultado:r2(A),  cantidad:1, angulo:90 },
      { ubicacion:'JAMBA',          formula:'H - 1',       resultado:jamba,  cantidad:2, angulo:2  },
    ],
    nave_movil: [
      { ubicacion:'TRASLAPE',       formula:'H – 2,2',     resultado:tr,  cantidad:2, angulo:90 },
      { ubicacion:'ENGANCHE',       formula:'H – 2,2',     resultado:tr,  cantidad:2, angulo:90 },
      { ubicacion:'HORIZONTAL SUP', formula:'A/4+0,4',     resultado:hm,  cantidad:2, angulo:90 },
      { ubicacion:'HORIZONTAL INF', formula:'A/4+0,4',     resultado:hm,  cantidad:2, angulo:90 },
    ],
    nave_fija: [
      { ubicacion:'TRASLAPE',       formula:'H – 2',       resultado:trf, cantidad:1, angulo:90 },
      { ubicacion:'ENGANCHE',       formula:'H – 2',       resultado:trf, cantidad:1, angulo:90 },
      { ubicacion:'HORIZONTAL SUP', formula:'A/4*2+1,9',   resultado:hf,  cantidad:1, angulo:90 },
      { ubicacion:'HORIZONTAL INF', formula:'A/4*2+1,9',   resultado:hf,  cantidad:1, angulo:90 },
    ],
    vidrios: [
      { ubicacion:'VIDRIO NAVE MÓVIL', ref_vidrio:v, cantidad:2, es_vidrio:true,
        ancho:v_mov_a, alto:v_mov_h, formula_ancho:'HOR SUP – 5,1', formula_alto:'TRASLAPE – 6,6' },
      { ubicacion:'VIDRIO NAVE FIJA',  ref_vidrio:v, cantidad:1, es_vidrio:true,
        ancho:v_fij_a, alto:v_fij_h, formula_ancho:'HOR SUP – 4,4', formula_alto:'TRASLAPE – 6,6' },
    ],
    accesorios: _acc744(2, false, empaque, felpa, 12),
  };
}

function _744_X0X_L90(A, H, v) {
  const tr = r2(H - 2.2), trf = r2(H - 2);
  const hm = r2(A / 4 + 0.4), hf = r2(A / 4 * 2 + 1.9);
  const jamba = r2(H - 1);
  const v_mov_a = r2(hm - 5.1), v_mov_h = r2(tr - 6.6);
  const v_fij_a = r2(hf - 4.2), v_fij_h = r2(trf - 6.6);
  // EMPAQUE xlsx: =(E22*4)+(E23*4)+(E24*2)+(E25*2)
  // FELPA   xlsx: =(D9*4)+(D12*2)+(D16*2)+(D14*2)+(D18*1)
  const empaque = r2((v_mov_a * 4) + (v_mov_h * 4) + (v_fij_a * 2) + (v_fij_h * 2));
  const felpa   = r2((jamba * 4) + (tr * 2) + (trf * 2) + (hm * 2) + (hf * 1));
  return {
    marco: [
      { ubicacion:'CABEZAL',        formula:'A',           resultado:r2(A),  cantidad:1, angulo:90 },
      { ubicacion:'SILLAR',         formula:'A',           resultado:r2(A),  cantidad:1, angulo:90 },
      { ubicacion:'JAMBA',          formula:'H - 1',       resultado:jamba,  cantidad:2, angulo:2  },
    ],
    nave_movil: [
      { ubicacion:'TRASLAPE',       formula:'H – 2,2',     resultado:tr,  cantidad:2, angulo:90 },
      { ubicacion:'ENGANCHE',       formula:'H – 2,2',     resultado:tr,  cantidad:2, angulo:90 },
      { ubicacion:'HORIZONTAL SUP', formula:'A/4+0,4',     resultado:hm,  cantidad:2, angulo:90 },
      { ubicacion:'HORIZONTAL INF', formula:'A/4+0,4',     resultado:hm,  cantidad:2, angulo:90 },
    ],
    nave_fija: [
      { ubicacion:'TRASLAPE',       formula:'H – 2',       resultado:trf, cantidad:1, angulo:90 },
      { ubicacion:'ENGANCHE',       formula:'H – 2',       resultado:trf, cantidad:1, angulo:90 },
      { ubicacion:'HORIZONTAL SUP', formula:'A/4*2+1,9',   resultado:hf,  cantidad:1, angulo:90 },
      { ubicacion:'HORIZONTAL INF', formula:'A/4*2+1,9',   resultado:hf,  cantidad:1, angulo:90 },
    ],
    vidrios: [
      { ubicacion:'VIDRIO NAVE MÓVIL', ref_vidrio:v, cantidad:2, es_vidrio:true,
        ancho:v_mov_a, alto:v_mov_h, formula_ancho:'HOR SUP – 5,1', formula_alto:'TRASLAPE – 6,6' },
      { ubicacion:'VIDRIO NAVE FIJA',  ref_vidrio:v, cantidad:1, es_vidrio:true,
        ancho:v_fij_a, alto:v_fij_h, formula_ancho:'HOR SUP – 4,2', formula_alto:'TRASLAPE – 6,6' },
    ],
    accesorios: _acc744(2, false, empaque, felpa, 12),
  };
}

function _744_0XX0(A, H, v) {
  const tr = r2(H - 2.2), trf = r2(H - 2);
  const hm = r2(A / 4 + 0.2);
  const jamba = r2(H - 1);
  const v_a = r2(hm - 5.1), v_mov_h = r2(tr - 6.6), v_fij_h = r2(trf - 6.6);
  // EMPAQUE xlsx: =(E22*4)+(E23*4)+(E24*4)+(E25*4)
  // FELPA   xlsx: =(D9*4)+(D12*2)+(D16*2)+(D14*4)
  const empaque = r2((v_a * 4) + (v_mov_h * 4) + (v_a * 4) + (v_fij_h * 4));
  const felpa   = r2((jamba * 4) + (tr * 2) + (trf * 2) + (hm * 4));
  return {
    marco: [
      { ubicacion:'CABEZAL',        formula:'A',           resultado:r2(A),  cantidad:1, angulo:90 },
      { ubicacion:'SILLAR',         formula:'A',           resultado:r2(A),  cantidad:1, angulo:90 },
      { ubicacion:'JAMBA',          formula:'H - 1',       resultado:jamba,  cantidad:2, angulo:2  },
    ],
    nave_movil: [
      { ubicacion:'TRASLAPE',       formula:'H – 2,2',     resultado:tr,  cantidad:2, angulo:90 },
      { ubicacion:'ENGANCHE',       formula:'H – 2,2',     resultado:tr,  cantidad:2, angulo:90 },
      { ubicacion:'HORIZONTAL SUP', formula:'A/4+0,2',     resultado:hm,  cantidad:2, angulo:90 },
      { ubicacion:'HORIZONTAL INF', formula:'A/4+0,2',     resultado:hm,  cantidad:2, angulo:90 },
    ],
    nave_fija: [
      { ubicacion:'TRASLAPE',       formula:'H – 2',       resultado:trf, cantidad:2, angulo:90 },
      { ubicacion:'ENGANCHE',       formula:'H – 2',       resultado:trf, cantidad:2, angulo:90 },
      { ubicacion:'HORIZONTAL SUP', formula:'A/4+0,2',     resultado:hm,  cantidad:2, angulo:90 },
      { ubicacion:'HORIZONTAL INF', formula:'A/4+0,2',     resultado:hm,  cantidad:2, angulo:90 },
    ],
    vidrios: [
      { ubicacion:'VIDRIO NAVE MÓVIL', ref_vidrio:v, cantidad:2, es_vidrio:true,
        ancho:v_a, alto:v_mov_h, formula_ancho:'HOR SUP – 5,1', formula_alto:'TRASLAPE – 6,6' },
      { ubicacion:'VIDRIO NAVE FIJA',  ref_vidrio:v, cantidad:2, es_vidrio:true,
        ancho:v_a, alto:v_fij_h, formula_ancho:'HOR SUP – 5,1', formula_alto:'ENGANCHE – 6,6' },
    ],
    accesorios: _acc744(2, false, empaque, felpa, 16),
  };
}

function _744_XXX(A, H, v, esL90) {
  const hs = esL90 ? r2(A / 3 + 0.8) : r2(A / 3 + 0.9);
  const fhs = esL90 ? 'A/3+0,8' : 'A/3+0,9';
  const tr = r2(H - 2.2);
  const jamba = r2(H - 1);
  const v_et_a = r2(hs - 5.1);
  const v_ee_a = esL90 ? r2(hs - 4.2) : r2(hs - 4.4);
  const fvEE = esL90 ? 'HOR SUP – 4,2' : 'HOR SUP – 4,4';
  const v_h = r2(tr - 6.7); // xlsx usa 6.7 en el alto XXX
  // EMPAQUE xlsx: =(E18*4)+(E20*4)+(E19*1) → (et_a*4)+(v_h*4)+(ee_a*1)
  // FELPA   xlsx: =(D9*4)+(D12*4)+(D14*4) → (jamba*4)+(enganche*4)+(hor_inf*4)
  const empaque = r2((v_et_a * 4) + (v_h * 4) + (v_ee_a * 1));
  const felpa   = r2((jamba * 4) + (tr * 4) + (hs * 4));
  return {
    marco: [
      { ubicacion:'CABEZAL',        formula:'A',    resultado:r2(A),  cantidad:1, angulo:90 },
      { ubicacion:'SILLAR',         formula:'A',    resultado:r2(A),  cantidad:1, angulo:90 },
      { ubicacion:'JAMBA',          formula:'H - 1',resultado:jamba,  cantidad:2, angulo:2  },
    ],
    nave_movil: [
      { ubicacion:'TRASLAPE',       formula:'H – 2,2', resultado:tr,  cantidad:2, angulo:90 },
      { ubicacion:'ENGANCHE',       formula:'H – 2,2', resultado:tr,  cantidad:4, angulo:90 },
      { ubicacion:'HORIZONTAL SUP', formula:fhs,       resultado:hs,  cantidad: esL90 ? 4 : 3, angulo:90 },
      { ubicacion:'HORIZONTAL INF', formula:fhs,       resultado:hs,  cantidad: esL90 ? 4 : 3, angulo:90 },
    ],
    vidrios: [
      { ubicacion:'VIDRIO', ref_vidrio:v, cantidad:2, es_vidrio:true,
        ancho:v_et_a, alto:v_h, formula_ancho:'HOR SUP – 5,1', formula_alto:'TRASLAPE – 6,6' },
      { ubicacion:'VIDRIO', ref_vidrio:v, cantidad:1, es_vidrio:true,
        ancho:v_ee_a, alto:v_h, formula_ancho:fvEE, formula_alto:'TRASLAPE – 6,6' },
    ],
    accesorios: _acc744(2, true, empaque, felpa, 12),
  };
}

function _acc744(cerrojos, tresTrenes, empaque, felpa, torn2 = 8) {
  // torn2 (2da tornillería): XX/X0=8  X0X=12  0XX0=16  XXX=12
  return [
    { descripcion:'CERROJO A2',            cantidad: cerrojos },
    { descripcion:'REMACHES 4-4',          cantidad: 6 },
    { descripcion:'REMACHES 4-2',          cantidad: 6 },
    { descripcion:'EMPAQUE 744',           cantidad: r2(empaque || 0), unidad:'cm' },
    { descripcion:'FELPA 744',             cantidad: r2(felpa   || 0), unidad:'cm' },
    { descripcion:'RODACHINAS ACERO',      cantidad: tresTrenes ? 6 : cerrojos === 1 ? 2 : 4 },
    { descripcion:'GUÍAS 744 SUPERIORES',  cantidad: tresTrenes ? 6 : 4 },
    { descripcion:'GUÍAS 744 INFERIORES',  cantidad: tresTrenes ? 6 : 4 },
    { descripcion:'TORNILLERÍA #8 1"1/2',  cantidad: 8 },
    { descripcion:'TORNILLERÍA #8 1"1/2',  cantidad: torn2 },
  ];
}

// ═══════════════════════════════════════════════════════════════
// PERFIL 5020 TRADICIONAL
// ═══════════════════════════════════════════════════════════════

function _5020T_XX(A, H, v) {
  const tr = r2(H - 3.3), hs = r2(A / 2 - 1.4);
  const jamba = r2(H - 1.6);
  const v_a = r2(hs - 1.7), v_h = r2(tr - 6);
  // EMPAQUE xlsx: =(E18*4)+(E19*4)
  // FELPA   xlsx: =(D9*2)+(D12*2)+(D13*2)+(D14*2) → jamba*2+enganche*2+hor_sup*2+hor_inf*2
  const empaque = r2((v_a * 4) + (v_h * 4));
  const felpa   = r2((jamba * 2) + (tr * 2) + (hs * 2) + (hs * 2));
  return {
    marco: [
      { ubicacion:'CABEZAL',        formula:'A',        resultado:r2(A),    cantidad:1, angulo:90 },
      { ubicacion:'SILLAR',         formula:'A',        resultado:r2(A),    cantidad:1, angulo:90 },
      { ubicacion:'JAMBA',          formula:'H – 1,6',  resultado:jamba,    cantidad:2, angulo:7  },
    ],
    nave_movil: [
      { ubicacion:'TRASLAPE',       formula:'H – 3,3',  resultado:tr, cantidad:2, angulo:90 },
      { ubicacion:'ENGANCHE',       formula:'H – 3,3',  resultado:tr, cantidad:2, angulo:90 },
      { ubicacion:'HORIZONTAL SUP', formula:'A/2-1,4',  resultado:hs, cantidad:2, angulo:90 },
      { ubicacion:'HORIZONTAL INF', formula:'A/2-1,4',  resultado:hs, cantidad:2, angulo:90 },
    ],
    vidrios: [
      { ubicacion:'VIDRIO', ref_vidrio:v, cantidad:2, es_vidrio:true,
        ancho:v_a, alto:v_h, formula_ancho:'HOR SUP – 1,7', formula_alto:'TRASLAPE – 6' },
    ],
    accesorios: _acc5020(2, 4, empaque, felpa, 8),
  };
}

function _5020T_0X(A, H, v) {
  const tr = r2(H - 3.3), hs = r2(A / 2 - 1.4);
  const jamba = r2(H - 1.6);
  const v_a = r2(hs - 1.7), v_h = r2(tr - 6);
  // EMPAQUE xlsx: =(E22*2)+(E23*2)+(E24*2)+(E25*2)
  // FELPA   xlsx: =(D9*4)+(D12*1)+(D14*1)+(D16*1)+(D17*1)
  const empaque = r2((v_a * 2) + (v_h * 2) + (v_a * 2) + (v_h * 2));
  const felpa   = r2((jamba * 4) + (tr * 1) + (hs * 1) + (tr * 1) + (hs * 1));
  return {
    marco: [
      { ubicacion:'CABEZAL',        formula:'A',        resultado:r2(A),    cantidad:1, angulo:90 },
      { ubicacion:'SILLAR',         formula:'A',        resultado:r2(A),    cantidad:1, angulo:90 },
      { ubicacion:'JAMBA',          formula:'H – 1,6',  resultado:jamba,    cantidad:2, angulo:7  },
    ],
    nave_movil: [
      { ubicacion:'TRASLAPE',       formula:'H – 3,3',  resultado:tr, cantidad:1, angulo:90 },
      { ubicacion:'ENGANCHE',       formula:'H – 3,3',  resultado:tr, cantidad:1, angulo:90 },
      { ubicacion:'HORIZONTAL SUP', formula:'A/2-1,4',  resultado:hs, cantidad:1, angulo:90 },
      { ubicacion:'HORIZONTAL INF', formula:'A/2-1,4',  resultado:hs, cantidad:1, angulo:90 },
    ],
    nave_fija: [
      { ubicacion:'TRASLAPE',       formula:'H – 3,3',  resultado:tr, cantidad:1, angulo:90 },
      { ubicacion:'ENGANCHE',       formula:'H – 3,3',  resultado:tr, cantidad:1, angulo:90 },
      { ubicacion:'HORIZONTAL SUP', formula:'A/2-1,4',  resultado:hs, cantidad:1, angulo:90 },
      { ubicacion:'HORIZONTAL INF', formula:'A/2-1,4',  resultado:hs, cantidad:1, angulo:90 },
    ],
    vidrios: [
      { ubicacion:'VIDRIO NAVE MÓVIL', ref_vidrio:v, cantidad:1, es_vidrio:true,
        ancho:v_a, alto:v_h, formula_ancho:'HOR SUP – 1,7', formula_alto:'TRASLAPE – 6' },
      { ubicacion:'VIDRIO NAVE FIJA',  ref_vidrio:v, cantidad:1, es_vidrio:true,
        ancho:v_a, alto:v_h, formula_ancho:'HOR SUP – 1,7', formula_alto:'TRASLAPE – 6' },
    ],
    accesorios: _acc5020(1, 2, empaque, felpa, 8),
  };
}

function _5020T_X0X(A, H, v) {
  const tr = r2(H - 3.3), hm = r2(A / 4 - 0.8), hf = r2(A / 4 * 2 + 1);
  const jamba = r2(H - 1.6);
  const v_mov_a = r2(hm - 1.7), v_mov_h = r2(tr - 6);
  const v_fij_a = r2(hf - 2.6), v_fij_h = r2(tr - 6);
  // EMPAQUE xlsx: =(E21*4)+(E22*4)+(E23*2)+(E24*2)
  // FELPA   xlsx: =(D9*4)+(D12*2)+(D14*2)+(D15*2)+(D16*1)
  const empaque = r2((v_mov_a * 4) + (v_mov_h * 4) + (v_fij_a * 2) + (v_fij_h * 2));
  const felpa   = r2((jamba * 4) + (tr * 2) + (hm * 2) + (tr * 2) + (hf * 1));
  return {
    marco: [
      { ubicacion:'CABEZAL',        formula:'A',           resultado:r2(A),    cantidad:1, angulo:90 },
      { ubicacion:'SILLAR',         formula:'A',           resultado:r2(A),    cantidad:1, angulo:90 },
      { ubicacion:'JAMBA',          formula:'H – 1,6',     resultado:jamba,    cantidad:2, angulo:7  },
    ],
    nave_movil: [
      { ubicacion:'TRASLAPE',       formula:'H – 3,3',     resultado:tr,  cantidad:2, angulo:90 },
      { ubicacion:'ENGANCHE',       formula:'H – 3,3',     resultado:tr,  cantidad:2, angulo:90 },
      { ubicacion:'HORIZONTAL SUP', formula:'A/4-0,8',     resultado:hm,  cantidad:2, angulo:90 },
      { ubicacion:'HORIZONTAL INF', formula:'A/4-0,8',     resultado:hm,  cantidad:2, angulo:90 },
    ],
    nave_fija: [
      { ubicacion:'ENGANCHE',       formula:'H – 3,3',     resultado:tr,  cantidad:2, angulo:90 },
      { ubicacion:'HORIZONTAL SUP', formula:'A/4*2+1',     resultado:hf,  cantidad:1, angulo:90 },
      { ubicacion:'HORIZONTAL INF', formula:'A/4*2+1',     resultado:hf,  cantidad:1, angulo:90 },
    ],
    vidrios: [
      { ubicacion:'VIDRIO NAVE MÓVIL', ref_vidrio:v, cantidad:2, es_vidrio:true,
        ancho:v_mov_a, alto:v_mov_h, formula_ancho:'HOR SUP – 1,7', formula_alto:'TRASLAPE – 6' },
      { ubicacion:'VIDRIO NAVE FIJA',  ref_vidrio:v, cantidad:1, es_vidrio:true,
        ancho:v_fij_a, alto:v_fij_h, formula_ancho:'HOR SUP – 2,6', formula_alto:'ENGANCHE – 6' },
    ],
    accesorios: _acc5020(2, 6, empaque, felpa, 12),
  };
}

function _5020T_0XX0(A, H, v) {
  const tr = r2(H - 3.3), hm = r2(A / 4 - 0.7);
  const jamba = r2(H - 1.6);
  const v_a = r2(hm - 1.7), v_h = r2(tr - 6);
  // EMPAQUE xlsx: =(E23*4)+(E24*4)+(E25*4)+(E26*4)
  // FELPA   xlsx: =(D9*4)+(D12*2)+(D14*2)+(D17*2)+(D18*2)
  const empaque = r2((v_a * 4) + (v_h * 4) + (v_a * 4) + (v_h * 4));
  const felpa   = r2((jamba * 4) + (tr * 2) + (hm * 2) + (tr * 2) + (hm * 2));
  return {
    marco: [
      { ubicacion:'CABEZAL',        formula:'A',           resultado:r2(A),    cantidad:1, angulo:90 },
      { ubicacion:'SILLAR',         formula:'A',           resultado:r2(A),    cantidad:1, angulo:90 },
      { ubicacion:'JAMBA',          formula:'H – 1,6',     resultado:jamba,    cantidad:2, angulo:7  },
    ],
    nave_movil: [
      { ubicacion:'TRASLAPE',       formula:'H – 3,3',     resultado:tr, cantidad:2, angulo:90 },
      { ubicacion:'ENGANCHE',       formula:'H – 3,3',     resultado:tr, cantidad:2, angulo:90 },
      { ubicacion:'HORIZONTAL SUP', formula:'A/4-0,7',     resultado:hm, cantidad:2, angulo:90 },
      { ubicacion:'HORIZONTAL INF', formula:'A/4-0,7',     resultado:hm, cantidad:2, angulo:90 },
    ],
    adaptador: [
      { ubicacion:'ADAPTADOR',      formula:'H-3,3',       resultado:tr, cantidad:1, angulo:90 },
    ],
    nave_fija: [
      { ubicacion:'TRASLAPE',       formula:'H – 3,3',     resultado:tr, cantidad:2, angulo:90 },
      { ubicacion:'ENGANCHE',       formula:'H – 3,3',     resultado:tr, cantidad:2, angulo:90 },
      { ubicacion:'HORIZONTAL SUP', formula:'A/4-0,7',     resultado:hm, cantidad:2, angulo:90 },
      { ubicacion:'HORIZONTAL INF', formula:'A/4-0,7',     resultado:hm, cantidad:2, angulo:90 },
    ],
    vidrios: [
      { ubicacion:'VIDRIO', ref_vidrio:v, cantidad:2, es_vidrio:true,
        ancho:v_a, alto:v_h, formula_ancho:'HOR SUP – 1,7', formula_alto:'TRASLAPE – 6' },
      { ubicacion:'VIDRIO NAVE FIJA',  ref_vidrio:v, cantidad:2, es_vidrio:true,
        ancho:v_a, alto:v_h, formula_ancho:'HOR SUP – 1,7', formula_alto:'ENGANCHE – 6' },
    ],
    accesorios: _acc5020(1, 8, empaque, felpa, 16, 4), // 0XX0: 4 hojas → 4 rodachinas
  };
}

// ═══════════════════════════════════════════════════════════════
// PERFIL 5020 HÍBRIDA
// ═══════════════════════════════════════════════════════════════

function _5020H_XX(A, H, v) {
  const tr = r2(H - 2.3), hs = r2(A / 2 - 0.5), hi = r2(A / 2 - 0.9);
  const jamba = r2(H - 1);
  const v_a = r2(hs - 4.1), v_h = r2(tr - 6.2);
  // EMPAQUE xlsx: =(E18*4)+(E19*4)
  // FELPA   xlsx: =(D9*2)+(D12*2)+(D13*2)+(D14*2)
  const empaque = r2((v_a * 4) + (v_h * 4));
  const felpa   = r2((jamba * 2) + (tr * 2) + (hs * 2) + (hi * 2));
  return {
    marco_744: [
      { ubicacion:'CABEZAL',        formula:'A',        resultado:r2(A),  cantidad:1, angulo:90 },
      { ubicacion:'SILLAR',         formula:'A',        resultado:r2(A),  cantidad:1, angulo:90 },
      { ubicacion:'JAMBA',          formula:'H – 1',    resultado:jamba,  cantidad:2, angulo:2  },
    ],
    nave_movil: [
      { ubicacion:'TRASLAPE',       formula:'H – 2,3',  resultado:tr, cantidad:2, angulo:90 },
      { ubicacion:'ENGANCHE',       formula:'H – 2,3',  resultado:tr, cantidad:2, angulo:90 },
      { ubicacion:'HORIZONTAL SUP', formula:'A/2-0,5',  resultado:hs, cantidad:2, angulo:90 },
      { ubicacion:'HORIZONTAL INF', formula:'A/2-0,9',  resultado:hi, cantidad:2, angulo:90 },
    ],
    vidrios: [
      { ubicacion:'VIDRIO', ref_vidrio:v, cantidad:2, es_vidrio:true,
        ancho:v_a, alto:v_h, formula_ancho:'HOR SUP – 4,1', formula_alto:'TRASLAPE – 6,2' },
    ],
    accesorios: _acc5020H(2, 4, empaque, felpa, 8),
  };
}

function _5020H_0X(A, H, v) {
  const tr = r2(H - 2.3), hs = r2(A / 2 - 0.5), hi = r2(A / 2 - 0.9);
  const jamba = r2(H - 1);
  const v_a = r2(hs - 4.1), v_h = r2(tr - 6.2);
  // EMPAQUE xlsx: =(E21*4)+(E22*4)  (solo nave movil tiene vidrios segun xlsx)
  // FELPA   xlsx: =(D9*2)+(D12*2)+(D13*2)+(D14*2)
  const empaque = r2((v_a * 4) + (v_h * 4));
  const felpa   = r2((jamba * 2) + (tr * 2) + (hs * 2) + (hi * 2));
  return {
    marco_744: [
      { ubicacion:'CABEZAL',        formula:'A',        resultado:r2(A),  cantidad:1, angulo:90 },
      { ubicacion:'SILLAR',         formula:'A',        resultado:r2(A),  cantidad:1, angulo:90 },
      { ubicacion:'JAMBA',          formula:'H – 1',    resultado:jamba,  cantidad:2, angulo:2  },
    ],
    nave_movil: [
      { ubicacion:'TRASLAPE',       formula:'H – 2,3',  resultado:tr,  cantidad:2, angulo:90 },
      { ubicacion:'ENGANCHE',       formula:'H – 2,3',  resultado:tr,  cantidad:2, angulo:90 },
      { ubicacion:'HORIZONTAL SUP', formula:'A/2-0,5',  resultado:hs,  cantidad:2, angulo:90 },
      { ubicacion:'HORIZONTAL INF', formula:'A/2-0,9',  resultado:hi,  cantidad:2, angulo:90 },
    ],
    nave_fija: [
      { ubicacion:'TRASLAPE',       formula:'H – 2,3',  resultado:tr,  cantidad:2, angulo:90 },
      { ubicacion:'ENGANCHE',       formula:'H – 2,3',  resultado:tr,  cantidad:2, angulo:90 },
      { ubicacion:'HORIZONTAL SUP', formula:'A/2-0,5',  resultado:hs,  cantidad:2, angulo:90 },
      { ubicacion:'HORIZONTAL INF', formula:'A/2-0,5',  resultado:hs,  cantidad:2, angulo:90 },
    ],
    vidrios: [
      { ubicacion:'VIDRIO', ref_vidrio:v, cantidad:2, es_vidrio:true,
        ancho:v_a, alto:v_h, formula_ancho:'HOR SUP – 4,1', formula_alto:'TRASLAPE – 6,2' },
    ],
    // ⚠️ Excel oficial 5020 Híbrida 0X: rodachinas=2 (1 hoja móvil = 2 rodachinas).
    // El default de _acc5020H pone 4 cuando cerraduras=2, lo cual es incorrecto
    // para este diseño. Forzamos explícitamente 2.
    accesorios: _acc5020H(2, 4, empaque, felpa, 8, 2),
  };
}

function _5020H_X0X(A, H, v) {
  const tr = r2(H - 2.3);
  const hm_s = r2(A / 4 + 0.4), hm_i = r2(A / 4);
  const hf = r2(A / 4 * 2 + 1);
  const jamba = r2(H - 1);
  const v_mov_a = r2(hm_s - 4.1), v_mov_h = r2(tr - 6.2);
  const v_fij_a = r2(hf - 3), v_fij_h = r2(tr - 6.2);
  // EMPAQUE xlsx: =(E21*4)+(E22*4)+(E23*2)+(E24*2)
  // FELPA   xlsx: =(D9*4)+(D12*2)+(D14*2)+(D15*2)+(D16*1)
  const empaque = r2((v_mov_a * 4) + (v_mov_h * 4) + (v_fij_a * 2) + (v_fij_h * 2));
  const felpa   = r2((jamba * 4) + (tr * 2) + (hm_i * 2) + (tr * 2) + (hf * 1));
  return {
    marco_744: [
      { ubicacion:'CABEZAL',        formula:'A',           resultado:r2(A),  cantidad:1, angulo:90 },
      { ubicacion:'SILLAR',         formula:'A',           resultado:r2(A),  cantidad:1, angulo:90 },
      { ubicacion:'JAMBA',          formula:'H – 1',       resultado:jamba,  cantidad:2, angulo:2  },
    ],
    nave_movil: [
      { ubicacion:'TRASLAPE',       formula:'H – 2,3',     resultado:tr,    cantidad:2, angulo:90 },
      { ubicacion:'ENGANCHE',       formula:'H – 2,3',     resultado:tr,    cantidad:2, angulo:90 },
      { ubicacion:'HORIZONTAL SUP', formula:'A/4+0,4',     resultado:hm_s,  cantidad:2, angulo:90 },
      { ubicacion:'HORIZONTAL INF', formula:'A/4',         resultado:hm_i,  cantidad:2, angulo:90 },
    ],
    nave_fija: [
      { ubicacion:'ENGANCHE',       formula:'H – 2,3',     resultado:tr,    cantidad:2, angulo:90 },
      { ubicacion:'HORIZONTAL SUP', formula:'A/4*2+1',     resultado:hf,    cantidad:1, angulo:90 },
      { ubicacion:'HORIZONTAL INF', formula:'A/4*2+1',     resultado:hf,    cantidad:1, angulo:90 },
    ],
    vidrios: [
      { ubicacion:'VIDRIO NAVE MÓVIL', ref_vidrio:v, cantidad:2, es_vidrio:true,
        ancho:v_mov_a, alto:v_mov_h, formula_ancho:'HOR SUP – 4,1', formula_alto:'TRASLAPE – 6,2' },
      { ubicacion:'VIDRIO NAVE FIJA',  ref_vidrio:v, cantidad:1, es_vidrio:true,
        ancho:v_fij_a, alto:v_fij_h, formula_ancho:'HOR SUP – 3',   formula_alto:'ENGANCHE – 6,2' },
    ],
    accesorios: _acc5020H(2, 6, empaque, felpa, 12),
  };
}

function _5020H_0XX0(A, H, v) {
  const tr = r2(H - 2.3);
  const hm_s = r2(A / 4 - 0.1), hm_i = r2(A / 4 - 0.5);
  const hf_s = r2(A / 4 - 0.1);
  const jamba = r2(H - 1);
  const v_mov_a = r2(hm_s - 4.1), v_mov_h = r2(tr - 6.2);
  const v_fij_a = r2(hf_s - 4.1), v_fij_h = r2(tr - 6.2);
  // EMPAQUE xlsx: =(E23*4)+(E24*4)+(E25*4)+(E26*4)
  // FELPA   xlsx: =(D9*4)+(D12*2)+(D14*2)+(D17*2)+(D18*2)
  const empaque = r2((v_mov_a * 4) + (v_mov_h * 4) + (v_fij_a * 4) + (v_fij_h * 4));
  const felpa   = r2((jamba * 4) + (tr * 2) + (hm_i * 2) + (tr * 2) + (hf_s * 2));
  return {
    marco_744: [
      { ubicacion:'CABEZAL',        formula:'A',           resultado:r2(A),  cantidad:1, angulo:90 },
      { ubicacion:'SILLAR',         formula:'A',           resultado:r2(A),  cantidad:1, angulo:90 },
      { ubicacion:'JAMBA',          formula:'H – 1',       resultado:jamba,  cantidad:2, angulo:2  },
    ],
    nave_movil: [
      { ubicacion:'TRASLAPE',       formula:'H – 2,3',     resultado:tr,    cantidad:2, angulo:90 },
      { ubicacion:'ENGANCHE',       formula:'H – 2,3',     resultado:tr,    cantidad:2, angulo:90 },
      { ubicacion:'HORIZONTAL SUP', formula:'A/4-0,1',     resultado:hm_s,  cantidad:2, angulo:90 },
      { ubicacion:'HORIZONTAL INF', formula:'A/4-0,5',     resultado:hm_i,  cantidad:2, angulo:90 },
    ],
    adaptador: [
      { ubicacion:'ADAPTADOR',      formula:'H-2,3',       resultado:tr,    cantidad:1, angulo:90 },
    ],
    nave_fija: [
      { ubicacion:'TRASLAPE',       formula:'H – 2,3',     resultado:tr,    cantidad:2, angulo:90 },
      { ubicacion:'ENGANCHE',       formula:'H – 2,3',     resultado:tr,    cantidad:2, angulo:90 },
      { ubicacion:'HORIZONTAL SUP', formula:'A/4-0,1',     resultado:hf_s,  cantidad:2, angulo:90 },
      { ubicacion:'HORIZONTAL INF', formula:'A/4-0,1',     resultado:hf_s,  cantidad:2, angulo:90 },
    ],
    vidrios: [
      { ubicacion:'VIDRIO NAVE MÓVIL', ref_vidrio:v, cantidad:2, es_vidrio:true,
        ancho:v_mov_a, alto:v_mov_h, formula_ancho:'HOR SUP – 4,1', formula_alto:'TRASLAPE – 6,2' },
      { ubicacion:'VIDRIO NAVE FIJA',  ref_vidrio:v, cantidad:2, es_vidrio:true,
        ancho:v_fij_a, alto:v_fij_h, formula_ancho:'HOR SUP – 4,1', formula_alto:'ENGANCHE – 6,2' },
    ],
    accesorios: _acc5020H(1, 8, empaque, felpa, 16, 4), // 0XX0: 4 hojas → 4 rodachinas
  };
}

function _acc5020(cerraduras, guias, empaque, felpa, torn2 = 8, rodachinas = null) {
  // guias: XX/0X=4  X0X=6  0XX0=8 | torn2: XX/0X=8  X0X=12  0XX0=16
  // rodachinas: si no se pasa, infiere por cerraduras; 0XX0 necesita 4 aunque tenga 1 cerradura
  const roda = rodachinas !== null ? rodachinas : (cerraduras === 1 ? 2 : 4);
  return [
    { descripcion:'CERRADURA CARACOL',          cantidad: cerraduras },
    { descripcion:'REMACHES 4-4',               cantidad: 6 },
    { descripcion:'REMACHES 4-2',               cantidad: 6 },
    { descripcion:'EMPAQUE MULTIUSO',           cantidad: r2(empaque || 0), unidad:'cm' },
    { descripcion:'FELPA 5020',                 cantidad: r2(felpa   || 0), unidad:'cm' },
    { descripcion:'RODACHINAS PLÁSTICA DOBLE',  cantidad: roda },
    { descripcion:'GUÍAS 5020 SUPERIORES',      cantidad: guias },
    { descripcion:'GUÍAS 5020 INFERIORES',      cantidad: guias },
    { descripcion:'TORNILLERÍA #6 1"',          cantidad: 8 },
    { descripcion:'TORNILLERÍA #6 1"',          cantidad: torn2 },
  ];
}

function _acc5020H(cerraduras, guias, empaque, felpa, torn2 = 8, rodachinas = null) {
  // guias: XX/0X=4  X0X=6  0XX0=8 | torn2: XX/0X=8  X0X=12  0XX0=16
  const roda = rodachinas !== null ? rodachinas : (cerraduras === 1 ? 2 : 4);
  return [
    { descripcion:'CERRADURA CARACOL',          cantidad: cerraduras },
    { descripcion:'REMACHES 4-4',               cantidad: 6 },
    { descripcion:'REMACHES 4-2',               cantidad: 6 },
    { descripcion:'EMPAQUE MULTIUSO',           cantidad: r2(empaque || 0), unidad:'cm' },
    { descripcion:'FELPA 5020',                 cantidad: r2(felpa   || 0), unidad:'cm' },
    { descripcion:'RODACHINAS PLÁSTICA DOBLE',  cantidad: roda },
    { descripcion:'GUÍAS 5020 SUPERIORES',      cantidad: guias },
    { descripcion:'GUÍAS 5020 INFERIORES',      cantidad: guias },
    { descripcion:'TORNILLERÍA #6 1"',          cantidad: 8 },
    { descripcion:'TORNILLERÍA #6 1"',          cantidad: torn2 },
  ];
}

// ═══════════════════════════════════════════════════════════════
// PERFIL 8025
// ═══════════════════════════════════════════════════════════════

function _8025T_XX(A, H, v) {
  const tr = r2(H - 2.8), hs = r2(A / 2), hi = r2(A / 2 - 0.2);
  const jamba = r2(H - 1.1);
  const v_a = r2(hs - 5.9), v_h = r2(tr - 8);
  // EMPAQUE xlsx: =(E18*4)+(E19*4)
  // FELPA   xlsx: =(D9*4)+(D12*2)+(D14*2)
  const empaque = r2((v_a * 4) + (v_h * 4));
  const felpa   = r2((jamba * 4) + (tr * 2) + (hi * 2));
  return {
    marco: [
      { ubicacion:'CABEZAL',        formula:'A',         resultado:r2(A),    cantidad:1, angulo:90 },
      { ubicacion:'SILLAR',         formula:'A',         resultado:r2(A),    cantidad:1, angulo:90 },
      { ubicacion:'JAMBA',          formula:'H - 1,1',   resultado:jamba,    cantidad:2, angulo:2  },
    ],
    nave_movil: [
      { ubicacion:'TRASLAPE',       formula:'H - 2,8',   resultado:tr, cantidad:2, angulo:90 },
      { ubicacion:'ENGANCHE',       formula:'H - 2,8',   resultado:tr, cantidad:2, angulo:90 },
      { ubicacion:'HORIZONTAL SUP', formula:'A/2',       resultado:hs, cantidad:2, angulo:90 },
      { ubicacion:'HORIZONTAL INF', formula:'A/2-0,2',   resultado:hi, cantidad:2, angulo:90 },
    ],
    vidrios: [
      { ubicacion:'VIDRIO', ref_vidrio:v, cantidad:2, es_vidrio:true,
        ancho:v_a, alto:v_h, formula_ancho:'HOR SUP – 5,9', formula_alto:'TRASLAPE – 8' },
    ],
    accesorios: _acc8025(2, false, 4, empaque, felpa, 8),
  };
}

function _8025T_0X(A, H, v) {
  const tr = r2(H - 2.8), trf = r2(H - 2.3);
  const hs = r2(A / 2), hi = r2(A / 2 - 0.2), hsf = r2(A / 2);
  const jamba = r2(H - 1.1);
  const v_mov_a = r2(hs - 5.9), v_mov_h = r2(tr - 8);
  const v_fij_a = r2(hsf - 5.9), v_fij_h = r2(trf - 8);
  // EMPAQUE xlsx: =(E22*2)+(E23*2)+(E24*2)+(E25*2)
  // FELPA   xlsx: =(D9*4)+(D12*1)+(D14*1)+(D16*1)+(D17*1)
  const empaque = r2((v_mov_a * 2) + (v_mov_h * 2) + (v_fij_a * 2) + (v_fij_h * 2));
  const felpa   = r2((jamba * 4) + (tr * 1) + (hi * 1) + (trf * 1) + (hsf * 1));
  return {
    marco: [
      { ubicacion:'CABEZAL',        formula:'A',         resultado:r2(A),    cantidad:1, angulo:90 },
      { ubicacion:'SILLAR',         formula:'A',         resultado:r2(A),    cantidad:1, angulo:90 },
      { ubicacion:'JAMBA',          formula:'H - 1,1',   resultado:jamba,    cantidad:2, angulo:2  },
    ],
    nave_movil: [
      { ubicacion:'TRASLAPE',       formula:'H - 2,8',   resultado:tr,  cantidad:1, angulo:90 },
      { ubicacion:'ENGANCHE',       formula:'H - 2,8',   resultado:tr,  cantidad:1, angulo:90 },
      { ubicacion:'HORIZONTAL SUP', formula:'A/2',       resultado:hs,  cantidad:1, angulo:90 },
      { ubicacion:'HORIZONTAL INF', formula:'A/2-0,2',   resultado:hi,  cantidad:1, angulo:90 },
    ],
    nave_fija: [
      { ubicacion:'TRASLAPE',       formula:'H – 2,3',   resultado:trf, cantidad:1, angulo:90 },
      { ubicacion:'ENGANCHE',       formula:'H – 2,3',   resultado:trf, cantidad:1, angulo:90 },
      { ubicacion:'HORIZONTAL SUP', formula:'A/2',       resultado:hsf, cantidad:1, angulo:90 },
      { ubicacion:'HORIZONTAL INF', formula:'A/2',       resultado:hsf, cantidad:1, angulo:90 },
    ],
    vidrios: [
      { ubicacion:'VIDRIO NAVE MÓVIL', ref_vidrio:v, cantidad:1, es_vidrio:true,
        ancho:v_mov_a, alto:v_mov_h, formula_ancho:'HOR SUP – 5,9', formula_alto:'TRASLAPE – 8' },
      { ubicacion:'VIDRIO NAVE FIJA',  ref_vidrio:v, cantidad:1, es_vidrio:true,
        ancho:v_fij_a, alto:v_fij_h, formula_ancho:'HOR SUP – 5,9', formula_alto:'TRASLAPE – 8' },
    ],
    accesorios: _acc8025(1, false, 4, empaque, felpa, 8),
  };
}

function _8025T_X0X(A, H, v) {
  const tr = r2(H - 2.8), trf = r2(H - 2.3);
  const hm_s = r2(A / 4 + 0.2), hm_i = r2(A / 4);
  const hf = r2(A / 4 * 2 + 2.2);
  const jamba = r2(H - 1.1);
  const v_mov_a = r2(hm_s - 5.9), v_mov_h = r2(tr - 8);
  const v_fij_a = r2(hf - 5.2), v_fij_h = r2(trf - 8);
  // EMPAQUE xlsx: =(E21*4)+(E22*4)+(E23*2)+(E24*2)
  // FELPA   xlsx: =(D9*4)+(D12*2)+(D14*2)+(D15*2)+(D16*1)
  const empaque = r2((v_mov_a * 4) + (v_mov_h * 4) + (v_fij_a * 2) + (v_fij_h * 2));
  const felpa   = r2((jamba * 4) + (tr * 2) + (hm_i * 2) + (trf * 2) + (hf * 1));
  return {
    marco: [
      { ubicacion:'CABEZAL',        formula:'A',           resultado:r2(A),    cantidad:1, angulo:90 },
      { ubicacion:'SILLAR',         formula:'A',           resultado:r2(A),    cantidad:1, angulo:90 },
      { ubicacion:'JAMBA',          formula:'H - 1,1',     resultado:jamba,    cantidad:2, angulo:2  },
    ],
    nave_movil: [
      { ubicacion:'TRASLAPE',       formula:'H - 2,8',     resultado:tr,    cantidad:2, angulo:90 },
      { ubicacion:'ENGANCHE',       formula:'H - 2,8',     resultado:tr,    cantidad:2, angulo:90 },
      { ubicacion:'HORIZONTAL SUP', formula:'A/4+0,2',     resultado:hm_s,  cantidad:2, angulo:90 },
      { ubicacion:'HORIZONTAL INF', formula:'A/4',         resultado:hm_i,  cantidad:2, angulo:90 },
    ],
    nave_fija: [
      { ubicacion:'ENGANCHE',       formula:'H – 2,3',     resultado:trf,   cantidad:2, angulo:90 },
      { ubicacion:'HORIZONTAL SUP', formula:'A/4*2+2,2',   resultado:hf,    cantidad:1, angulo:90 },
      { ubicacion:'HORIZONTAL INF', formula:'A/4*2+2,2',   resultado:hf,    cantidad:1, angulo:90 },
    ],
    vidrios: [
      { ubicacion:'VIDRIO NAVE MÓVIL', ref_vidrio:v, cantidad:2, es_vidrio:true,
        ancho:v_mov_a, alto:v_mov_h, formula_ancho:'HOR SUP – 5,9', formula_alto:'TRASLAPE – 8' },
      { ubicacion:'VIDRIO NAVE FIJA',  ref_vidrio:v, cantidad:1, es_vidrio:true,
        ancho:v_fij_a, alto:v_fij_h, formula_ancho:'HOR SUP – 5,2', formula_alto:'ENGANCHE – 8' },
    ],
    accesorios: _acc8025(2, false, 6, empaque, felpa, 12),
  };
}

function _8025T_0XX0(A, H, v) {
  const tr = r2(H - 2.8), trf = r2(H - 2.3);
  const hm_s = r2(A / 4 + 0.4), hm_i = r2(A / 4 + 0.2);
  const hf = r2(A / 4 + 0.4);
  const jamba = r2(H - 1.1);
  const v_mov_a = r2(hm_s - 5.9), v_mov_h = r2(tr - 8);
  const v_fij_a = r2(hf - 5.9), v_fij_h = r2(trf - 8);
  // EMPAQUE xlsx: =(E23*4)+(E24*4)+(E25*4)+(E26*4)
  // FELPA   xlsx: =(D9*4)+(D12*2)+(D14*2)+(D17*2)+(D18*2)
  const empaque = r2((v_mov_a * 4) + (v_mov_h * 4) + (v_fij_a * 4) + (v_fij_h * 4));
  const felpa   = r2((jamba * 4) + (tr * 2) + (hm_i * 2) + (trf * 2) + (hf * 2));
  return {
    marco: [
      { ubicacion:'CABEZAL',        formula:'A',           resultado:r2(A),    cantidad:1, angulo:90 },
      { ubicacion:'SILLAR',         formula:'A',           resultado:r2(A),    cantidad:1, angulo:90 },
      { ubicacion:'JAMBA',          formula:'H - 1,1',     resultado:jamba,    cantidad:2, angulo:2  },
    ],
    nave_movil: [
      { ubicacion:'TRASLAPE',       formula:'H - 2,8',     resultado:tr,   cantidad:2, angulo:90 },
      { ubicacion:'ENGANCHE',       formula:'H - 2,8',     resultado:tr,   cantidad:2, angulo:90 },
      { ubicacion:'HORIZONTAL SUP', formula:'A/4+0,4',     resultado:hm_s, cantidad:2, angulo:90 },
      { ubicacion:'HORIZONTAL INF', formula:'A/4+0,2',     resultado:hm_i, cantidad:2, angulo:90 },
    ],
    adaptador: [
      { ubicacion:'ADAPTADOR',      formula:'H-2,8',       resultado:tr,   cantidad:1, angulo:90 },
    ],
    nave_fija: [
      { ubicacion:'TRASLAPE',       formula:'H – 2,3',     resultado:trf,  cantidad:2, angulo:90 },
      { ubicacion:'ENGANCHE',       formula:'H – 2,3',     resultado:trf,  cantidad:2, angulo:90 },
      { ubicacion:'HORIZONTAL SUP', formula:'A/4+0,4',     resultado:hf,   cantidad:2, angulo:90 },
      { ubicacion:'HORIZONTAL INF', formula:'A/4+0,4',     resultado:hf,   cantidad:2, angulo:90 },
    ],
    vidrios: [
      { ubicacion:'VIDRIO NAVE MÓVIL', ref_vidrio:v, cantidad:2, es_vidrio:true,
        ancho:v_mov_a, alto:v_mov_h, formula_ancho:'HOR SUP – 5,9', formula_alto:'TRASLAPE – 8' },
      { ubicacion:'VIDRIO NAVE FIJA',  ref_vidrio:v, cantidad:2, es_vidrio:true,
        ancho:v_fij_a, alto:v_fij_h, formula_ancho:'HOR SUP – 5,9', formula_alto:'ENGANCHE – 8' },
    ],
    accesorios: _acc8025(1, false, 8, empaque, felpa, 16, 4) // 0XX0: 4 hojas → 4 rodachinas,
  };
}

function _8025T_XXX(A, H, v) {
  const hs = r2(A / 3 + 0.4), hi = r2(A / 3 + 0.2);
  const tr = r2(H - 2.8);
  const jamba = r2(H - 1.1);
  const v_a = r2(hs - 5.9), v_h = r2(tr - 8);
  // EMPAQUE xlsx: =(E18*6)+(E19*6)
  // FELPA   xlsx: =(D9*4)+(D12*4)+(D14*3)
  const empaque = r2((v_a * 6) + (v_h * 6));
  const felpa   = r2((jamba * 4) + (tr * 4) + (hi * 3));
  return {
    marco: [
      { ubicacion:'CABEZAL',        formula:'A',         resultado:r2(A),    cantidad:1, angulo:90 },
      { ubicacion:'SILLAR',         formula:'A',         resultado:r2(A),    cantidad:1, angulo:90 },
      { ubicacion:'JAMBA',          formula:'H - 1,1',   resultado:jamba,    cantidad:2, angulo:2  },
    ],
    nave_movil: [
      { ubicacion:'TRASLAPE',       formula:'H - 2,8',   resultado:tr, cantidad:2, angulo:90 },
      { ubicacion:'ENGANCHE',       formula:'H - 2,8',   resultado:tr, cantidad:4, angulo:90 },
      { ubicacion:'HORIZONTAL SUP', formula:'A/3+0,4',   resultado:hs, cantidad:3, angulo:90 },
      { ubicacion:'HORIZONTAL INF', formula:'A/3+0,2',   resultado:hi, cantidad:3, angulo:90 },
    ],
    vidrios: [
      { ubicacion:'VIDRIO', ref_vidrio:v, cantidad:3, es_vidrio:true,
        ancho:v_a, alto:v_h, formula_ancho:'HOR SUP – 5,9', formula_alto:'TRASLAPE – 8' },
    ],
    accesorios: _acc8025(2, true,  6, empaque, felpa, 12),
  };
}

function _8025L90_XX(A, H, v) {
  const tr = r2(H - 2.8), hs = r2(A / 2 - 0.5);
  const jamba = r2(H - 1.1);
  const v_a = r2(hs - 5.6), v_h = r2(tr - 8.1);
  // EMPAQUE xlsx: =(E18*4)+(E19*4)
  // FELPA   xlsx: =(D9*4)+(D12*2)+(D14*2)
  const empaque = r2((v_a * 4) + (v_h * 4));
  const felpa   = r2((jamba * 4) + (tr * 2) + (hs * 2));
  return {
    marco: [
      { ubicacion:'CABEZAL',        formula:'A',         resultado:r2(A),    cantidad:1, angulo:90 },
      { ubicacion:'SILLAR',         formula:'A',         resultado:r2(A),    cantidad:1, angulo:90 },
      { ubicacion:'JAMBA',          formula:'H - 1,1',   resultado:jamba,    cantidad:2, angulo:2  },
    ],
    nave_movil: [
      { ubicacion:'TRASLAPE',       formula:'H - 2,8',   resultado:tr, cantidad:2, angulo:90 },
      { ubicacion:'ENGANCHE',       formula:'H - 2,8',   resultado:tr, cantidad:2, angulo:90 },
      { ubicacion:'HORIZONTAL SUP', formula:'A/2-0,5',   resultado:hs, cantidad:2, angulo:90 },
      { ubicacion:'HORIZONTAL INF', formula:'A/2-0,5',   resultado:hs, cantidad:2, angulo:90 },
    ],
    vidrios: [
      { ubicacion:'VIDRIO', ref_vidrio:v, cantidad:2, es_vidrio:true,
        ancho:v_a, alto:v_h, formula_ancho:'HOR SUP – 5,6', formula_alto:'TRASLAPE – 8,1' },
    ],
    accesorios: _acc8025(2, false, 4, empaque, felpa, 8),
  };
}

function _8025L90_0X(A, H, v) {
  const tr = r2(H - 2.8), trf = r2(H - 2.3), hs = r2(A / 2 - 0.5);
  const jamba = r2(H - 1.1);
  const v_a = r2(hs - 5.6), v_mov_h = r2(tr - 8.1), v_fij_h = r2(trf - 8.1);
  // EMPAQUE xlsx: =(E22*2)+(E23*2)+(E24*2)+(E25*2)
  // FELPA   xlsx: =(D9*4)+(D12*1)+(D14*1)+(D16*1)+(D17*1)
  const empaque = r2((v_a * 2) + (v_mov_h * 2) + (v_a * 2) + (v_fij_h * 2));
  const felpa   = r2((jamba * 4) + (tr * 1) + (hs * 1) + (trf * 1) + (hs * 1));
  return {
    marco: [
      { ubicacion:'CABEZAL',        formula:'A',         resultado:r2(A),    cantidad:1, angulo:90 },
      { ubicacion:'SILLAR',         formula:'A',         resultado:r2(A),    cantidad:1, angulo:90 },
      { ubicacion:'JAMBA',          formula:'H - 1,1',   resultado:jamba,    cantidad:2, angulo:2  },
    ],
    nave_movil: [
      { ubicacion:'TRASLAPE',       formula:'H - 2,8',   resultado:tr,  cantidad:1, angulo:90 },
      { ubicacion:'ENGANCHE',       formula:'H - 2,8',   resultado:tr,  cantidad:1, angulo:90 },
      { ubicacion:'HORIZONTAL SUP', formula:'A/2-0,5',   resultado:hs,  cantidad:1, angulo:90 },
      { ubicacion:'HORIZONTAL INF', formula:'A/2-0,5',   resultado:hs,  cantidad:1, angulo:90 },
    ],
    nave_fija: [
      { ubicacion:'TRASLAPE',       formula:'H – 2,3',   resultado:trf, cantidad:1, angulo:90 },
      { ubicacion:'ENGANCHE',       formula:'H – 2,3',   resultado:trf, cantidad:1, angulo:90 },
      { ubicacion:'HORIZONTAL SUP', formula:'A/2-0,5',   resultado:hs,  cantidad:1, angulo:90 },
      { ubicacion:'HORIZONTAL INF', formula:'A/2-0,5',   resultado:hs,  cantidad:1, angulo:90 },
    ],
    vidrios: [
      { ubicacion:'VIDRIO NAVE MÓVIL', ref_vidrio:v, cantidad:1, es_vidrio:true,
        ancho:v_a, alto:v_mov_h, formula_ancho:'HOR SUP – 5,6', formula_alto:'TRASLAPE – 8,1' },
      { ubicacion:'VIDRIO NAVE FIJA',  ref_vidrio:v, cantidad:1, es_vidrio:true,
        ancho:v_a, alto:v_fij_h, formula_ancho:'HOR SUP – 5,6', formula_alto:'TRASLAPE – 8,1' },
    ],
    accesorios: _acc8025(1, false, 4, empaque, felpa, 8),
  };
}

function _8025L90_X0X(A, H, v) {
  const tr = r2(H - 2.8), trf = r2(H - 2.3);
  const hm = r2(A / 4 + 0.2), hf = r2(A / 4 * 2 + 2.2);
  const jamba = r2(H - 1.1);
  const v_mov_a = r2(hm - 5.6), v_mov_h = r2(tr - 8.1);
  const v_fij_a = r2(hf - 5.4), v_fij_h = r2(trf - 8.1);
  // EMPAQUE xlsx: =(E21*4)+(E22*4)+(E23*2)+(E24*2)
  // FELPA   xlsx: =(D9*4)+(D12*2)+(D14*2)+(D15*2)+(D16*1)
  const empaque = r2((v_mov_a * 4) + (v_mov_h * 4) + (v_fij_a * 2) + (v_fij_h * 2));
  const felpa   = r2((jamba * 4) + (tr * 2) + (hm * 2) + (trf * 2) + (hf * 1));
  return {
    marco: [
      { ubicacion:'CABEZAL',        formula:'A',           resultado:r2(A),    cantidad:1, angulo:90 },
      { ubicacion:'SILLAR',         formula:'A',           resultado:r2(A),    cantidad:1, angulo:90 },
      { ubicacion:'JAMBA',          formula:'H - 1,1',     resultado:jamba,    cantidad:2, angulo:2  },
    ],
    nave_movil: [
      { ubicacion:'TRASLAPE',       formula:'H - 2,8',     resultado:tr,  cantidad:2, angulo:90 },
      { ubicacion:'ENGANCHE',       formula:'H - 2,8',     resultado:tr,  cantidad:2, angulo:90 },
      { ubicacion:'HORIZONTAL SUP', formula:'A/4+0,2',     resultado:hm,  cantidad:2, angulo:90 },
      { ubicacion:'HORIZONTAL INF', formula:'A/4+0,2',     resultado:hm,  cantidad:2, angulo:90 },
    ],
    nave_fija: [
      { ubicacion:'ENGANCHE',       formula:'H – 2,3',     resultado:trf, cantidad:2, angulo:90 },
      { ubicacion:'HORIZONTAL SUP', formula:'A/4*2+2,2',   resultado:hf,  cantidad:1, angulo:90 },
      { ubicacion:'HORIZONTAL INF', formula:'A/4*2+2,2',   resultado:hf,  cantidad:1, angulo:90 },
    ],
    vidrios: [
      { ubicacion:'VIDRIO NAVE MÓVIL', ref_vidrio:v, cantidad:2, es_vidrio:true,
        ancho:v_mov_a, alto:v_mov_h, formula_ancho:'HOR SUP – 5,6', formula_alto:'TRASLAPE – 8,1' },
      { ubicacion:'VIDRIO NAVE FIJA',  ref_vidrio:v, cantidad:1, es_vidrio:true,
        ancho:v_fij_a, alto:v_fij_h, formula_ancho:'HOR SUP – 5,4', formula_alto:'ENGANCHE – 8,1' },
    ],
    accesorios: _acc8025(2, false, 6, empaque, felpa, 12),
  };
}

function _8025L90_0XX0(A, H, v) {
  const tr = r2(H - 2.8), trf = r2(H - 2.3);
  const hm = r2(A / 4 - 0.4);
  const jamba = r2(H - 1.1);
  const v_a = r2(hm - 5.6), v_mov_h = r2(tr - 8.1), v_fij_h = r2(trf - 8.1);
  // EMPAQUE xlsx: =(E23*4)+(E24*4)+(E25*4)+(E26*4)
  // FELPA   xlsx: =(D9*4)+(D12*2)+(D14*2)+(D17*2)+(D18*2)
  const empaque = r2((v_a * 4) + (v_mov_h * 4) + (v_a * 4) + (v_fij_h * 4));
  const felpa   = r2((jamba * 4) + (tr * 2) + (hm * 2) + (trf * 2) + (hm * 2));
  return {
    marco: [
      { ubicacion:'CABEZAL',        formula:'A',           resultado:r2(A),    cantidad:1, angulo:90 },
      { ubicacion:'SILLAR',         formula:'A',           resultado:r2(A),    cantidad:1, angulo:90 },
      { ubicacion:'JAMBA',          formula:'H - 1,1',     resultado:jamba,    cantidad:2, angulo:2  },
    ],
    nave_movil: [
      { ubicacion:'TRASLAPE',       formula:'H - 2,8',     resultado:tr,  cantidad:2, angulo:90 },
      { ubicacion:'ENGANCHE',       formula:'H - 2,8',     resultado:tr,  cantidad:2, angulo:90 },
      { ubicacion:'HORIZONTAL SUP', formula:'A/4-0,4',     resultado:hm,  cantidad:2, angulo:90 },
      { ubicacion:'HORIZONTAL INF', formula:'A/4-0,4',     resultado:hm,  cantidad:2, angulo:90 },
    ],
    adaptador: [
      { ubicacion:'ADAPTADOR',      formula:'H-2,8',       resultado:tr,  cantidad:1, angulo:90 },
    ],
    nave_fija: [
      { ubicacion:'TRASLAPE',       formula:'H – 2,3',     resultado:trf, cantidad:2, angulo:90 },
      { ubicacion:'ENGANCHE',       formula:'H – 2,3',     resultado:trf, cantidad:2, angulo:90 },
      { ubicacion:'HORIZONTAL SUP', formula:'A/4-0,4',     resultado:hm,  cantidad:2, angulo:90 },
      { ubicacion:'HORIZONTAL INF', formula:'A/4-0,4',     resultado:hm,  cantidad:2, angulo:90 },
    ],
    vidrios: [
      { ubicacion:'VIDRIO NAVE MÓVIL', ref_vidrio:v, cantidad:2, es_vidrio:true,
        ancho:v_a, alto:v_mov_h, formula_ancho:'HOR SUP – 5,6', formula_alto:'TRASLAPE – 8,1' },
      { ubicacion:'VIDRIO NAVE FIJA',  ref_vidrio:v, cantidad:2, es_vidrio:true,
        ancho:v_a, alto:v_fij_h, formula_ancho:'HOR SUP – 5,6', formula_alto:'ENGANCHE – 8,1' },
    ],
    accesorios: _acc8025(1, false, 8, empaque, felpa, 16, 4) // 0XX0: 4 hojas → 4 rodachinas,
  };
}

function _8025L90_XXX(A, H, v) {
  const hs = r2(A / 3 + 0.3);
  const tr = r2(H - 2.8);
  const jamba = r2(H - 1.1);
  const v_a = r2(hs - 5.9), v_h = r2(tr - 8);
  // EMPAQUE xlsx: =(E18*6)+(E19*6)
  // FELPA   xlsx: =(D9*4)+(D12*4)+(D14*3)
  const empaque = r2((v_a * 6) + (v_h * 6));
  const felpa   = r2((jamba * 4) + (tr * 4) + (hs * 3));
  return {
    marco: [
      { ubicacion:'CABEZAL',        formula:'A',         resultado:r2(A),    cantidad:1, angulo:90 },
      { ubicacion:'SILLAR',         formula:'A',         resultado:r2(A),    cantidad:1, angulo:90 },
      { ubicacion:'JAMBA',          formula:'H - 1,1',   resultado:jamba,    cantidad:2, angulo:2  },
    ],
    nave_movil: [
      { ubicacion:'TRASLAPE',       formula:'H - 2,8',   resultado:tr, cantidad:2, angulo:90 },
      { ubicacion:'ENGANCHE',       formula:'H - 2,8',   resultado:tr, cantidad:4, angulo:90 },
      { ubicacion:'HORIZONTAL SUP', formula:'A/3+0,3',   resultado:hs, cantidad:3, angulo:90 },
      { ubicacion:'HORIZONTAL INF', formula:'A/3+0,3',   resultado:hs, cantidad:3, angulo:90 },
    ],
    vidrios: [
      { ubicacion:'VIDRIO', ref_vidrio:v, cantidad:3, es_vidrio:true,
        ancho:v_a, alto:v_h, formula_ancho:'HOR SUP – 5,9', formula_alto:'TRASLAPE – 8' },
    ],
    accesorios: _acc8025(2, true,  6, empaque, felpa, 12),
  };
}

function _acc8025(cerraduras, tresTrenes, guias, empaque, felpa, torn2 = 8, rodachinas = null) {
  // guias: XX/0X=4  X0X=6  0XX0=8  XXX=6 | torn2 (#8): XX/0X=8  X0X=12  0XX0=16  XXX=12
  // rodachinas: 0XX0 tiene 1 cerradura pero 4 rodachinas (4 hojas); pasar explícito cuando aplica
  const roda = rodachinas !== null ? rodachinas : (tresTrenes ? 6 : cerraduras === 1 ? 2 : 4);
  return [
    { descripcion:'CERRADURA A2',           cantidad: cerraduras },
    { descripcion:'REMACHES 4-4',           cantidad: 6 },
    { descripcion:'REMACHES 4-2',           cantidad: 6 },
    { descripcion:'EMPAQUE 8025',           cantidad: r2(empaque || 0), unidad:'cm' },
    { descripcion:'FELPA 8025',             cantidad: r2(felpa   || 0), unidad:'cm' },
    { descripcion:'RODACHINAS ACERO',       cantidad: roda },
    { descripcion:'GUÍAS 8025 SUPERIORES',  cantidad: guias },
    { descripcion:'GUÍAS 8025 INFERIORES',  cantidad: guias },
    { descripcion:'TORNILLERÍA #10 1"1/2',  cantidad: 8 },
    { descripcion:'TORNILLERÍA #8 1"1/2',   cantidad: torn2 },
  ];
}

// ═══════════════════════════════════════════════════════════════
// FUNCIÓN PRINCIPAL
// ═══════════════════════════════════════════════════════════════

// Mapa nombre diseño → id engine. Cubre nombres exactos de la BD y variantes.
// Nombres reales en BD Supabase: XX, OX, XO, XOX, OXXO, OXX, XXX
// (usan letra O en lugar de cero, y X0 TRAD tiene la fija a la derecha = mismo engine que 0X)
const DISENO_NOMBRE_ENGINE = {
  // Nombres exactos de la BD (con letra O)
  'XX':1, 'OX':2, 'XO':2, 'XOX':3, 'OXXO':4, 'OXX':2, 'XXX':5,
  // Nombres con ceros (variantes)
  'X X':1, '0X':2, 'X0':2, 'X0X':3, '0XX0':4, 'X0X':3, 'X X X':5,
  // Con sufijo TRADICIONAL
  'XX TRADICIONAL':1,
  'OX TRADICIONAL':2, 'XO TRADICIONAL':2, '0X TRADICIONAL':2, 'X0 TRADICIONAL':2,
  'XOX TRADICIONAL':3, 'X0X TRADICIONAL':3,
  'OXXO TRADICIONAL':4, '0XX0 TRADICIONAL':4,
  'OXX TRADICIONAL':2,
  'XXX TRADICIONAL':5,
  // Con sufijo LINEA 90 / L90
  'XX LINEA 90':1, 'XX L90':1,
  'OX LINEA 90':2, '0X LINEA 90':2, 'XO LINEA 90':2,
  'XOX LINEA 90':3, 'X0X LINEA 90':3,
  'OXXO LINEA 90':4, '0XX0 LINEA 90':4,
  'XXX LINEA 90':5, 'XXX L90':5,
  // Con sufijo HIBRIDA
  'XX HIBRIDA':1,
  'OX HIBRIDA':2, '0X HIBRIDA':2, 'XO HIBRIDA':2,
  'XOX HIBRIDA':3, 'X0X HIBRIDA':3,
  'OXXO HIBRIDA':4, '0XX0 HIBRIDA':4,
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPER DE UNIDAD — Conversión automática CM ↔ MM
// ═══════════════════════════════════════════════════════════════════════════
//
// REGLA: las fórmulas internas SIEMPRE trabajan en CM (compatibilidad con
// catálogos técnicos reales). Si el usuario pide MM:
//   - Input: dividimos entrada / 10 (mm → cm)
//   - Cálculo: como siempre, en CM
//   - Output: multiplicamos resultados × 10 (cm → mm)
//   - Fórmulas string: convertimos numéricos × 10 ("H - 2,3" → "H - 23")
//
// Matemáticamente equivalente a multiplicar todas las constantes de las
// fórmulas por 10. Pero NO toca el código de las fórmulas: es álgebra.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Convierte los números literales de una fórmula textual de CM a MM.
 * Solo afecta NÚMEROS (constantes), NUNCA letras como A o H ni operadores.
 *
 * Soporta formato europeo (coma decimal) y formato US (punto):
 *   "H – 2,3"     → "H – 23"
 *   "A/2 - 0.1"   → "A/2 - 1"
 *   "TRASLAPE – 6,6" → "TRASLAPE – 66"
 *   "H - 1"       → "H - 10"
 *
 * IMPORTANTE: NO toca las letras variables (A, H, T, V, etc.) ni divisores
 * que aparezcan junto a una variable (ej. A/2, A/4 → siguen igual).
 */
function convertFormulaCmToMm(formula) {
  if (formula == null || typeof formula !== 'string') return formula;
  // Convierte solo CONSTANTES DIMENSIONALES (cm), no multiplicadores o divisores.
  // Una constante dimensional se reconoce porque NO está adyacente a operadores
  // multiplicativos (*, /). Ejemplos:
  //   "H - 2,3"     → "H - 23"     (2,3 es constante en cm)
  //   "A/2 - 0,1"   → "A/2 - 1"    (2 es divisor → no cambia; 0,1 es constante)
  //   "2*A"         → "2*A"        (2 es multiplicador → no cambia)
  //
  // La regla: el número está rodeado solo por espacios o operadores +/-,
  // no por *, /, ni letras.
  return formula.replace(
    /(?<![A-Za-z/*])(\d+(?:[.,]\d+)?)(?![*/])/g,
    (match) => {
      const decimal = match.includes(',') ? ',' : (match.includes('.') ? '.' : null);
      const normalized = match.replace(',', '.');
      const value = parseFloat(normalized);
      if (isNaN(value)) return match;
      const mm = value * 10;
      // Preservar el separador decimal original si lo hay
      if (Number.isInteger(mm)) return String(mm);
      return decimal === ',' ? String(mm).replace('.', ',') : String(mm);
    }
  );
}

/**
 * Aplica la unidad MM a un resultado completo de cálculo (mutando piezas).
 * Convierte:
 *   - resultado (cm → mm)        número × 10
 *   - ancho, alto (cm → mm)      número × 10
 *   - formula, formula_ancho, formula_alto (texto)
 * NO toca: cantidad, angulo, seccion, ubicacion, ref_vidrio, es_vidrio, etc.
 */
function applyUnitToResult(calcOutput, unit) {
  if (unit !== 'mm' || !calcOutput || calcOutput.error) return calcOutput;

  // Convertir A y H raíz
  if (typeof calcOutput.A === 'number')              calcOutput.A              = r2(calcOutput.A * 10);
  if (typeof calcOutput.H === 'number')              calcOutput.H              = r2(calcOutput.H * 10);
  if (typeof calcOutput.ancho_ventana === 'number')  calcOutput.ancho_ventana  = r2(calcOutput.ancho_ventana * 10);
  if (typeof calcOutput.alto_ventana === 'number')   calcOutput.alto_ventana   = r2(calcOutput.alto_ventana * 10);

  const convertPieza = (p) => {
    if (p == null) return p;
    if (typeof p.resultado === 'number')  p.resultado = r2(p.resultado * 10);
    if (typeof p.ancho === 'number')      p.ancho     = r2(p.ancho * 10);
    if (typeof p.alto === 'number')       p.alto      = r2(p.alto * 10);
    if (typeof p.formula === 'string')        p.formula        = convertFormulaCmToMm(p.formula);
    if (typeof p.formula_ancho === 'string')  p.formula_ancho  = convertFormulaCmToMm(p.formula_ancho);
    if (typeof p.formula_alto === 'string')   p.formula_alto   = convertFormulaCmToMm(p.formula_alto);
    return p;
  };

  // piezas (estructura plana)
  if (Array.isArray(calcOutput.piezas))     calcOutput.piezas     = calcOutput.piezas.map(convertPieza);
  // vidrios + accesorios (estructura paralela)
  if (Array.isArray(calcOutput.vidrios))    calcOutput.vidrios    = calcOutput.vidrios.map(convertPieza);
  // FIX (clarificación del usuario): accesorios de longitud (FELPA, EMPAQUE)
  // tienen su valor en `cantidad` (no en `resultado`). El convertPieza estándar
  // no los tocaba → si la ventana estaba en MM, FELPA seguía mostrándose en CM.
  // Ahora, si el accesorio tiene unidad='cm' y vamos a MM, convertimos cantidad
  // ×10 y actualizamos la unidad a 'mm' para que el frontend/PDF la muestren bien.
  if (Array.isArray(calcOutput.accesorios)) {
    calcOutput.accesorios = calcOutput.accesorios.map(a => {
      const aa = convertPieza({ ...a });
      if (aa && aa.unidad === 'cm' && typeof aa.cantidad === 'number') {
        aa.cantidad = r2(aa.cantidad * 10);
        aa.unidad = 'mm';
      }
      return aa;
    });
  }

  return calcOutput;
}

function calcularVentana(id_perfil, id_sistema, id_diseno, ancho_vano, alto_vano, ref_vidrio = '5MM', unit = 'cm') {
  const p = parseInt(id_perfil);
  const s = parseInt(id_sistema);
  // Aceptar tanto id numérico como nombre de diseño (ej: '0XX0', 'XX HIBRIDA')
  const nombreKey = String(id_diseno).trim().toUpperCase();
  const d = DISENO_NOMBRE_ENGINE[nombreKey] || parseInt(id_diseno);

  // ── UNIDAD: si el caller manda MM, convertimos al sistema CM interno ──
  // (las fórmulas hardcoded siguen siendo en CM, no se tocan)
  const u = (String(unit || 'cm').toLowerCase() === 'mm') ? 'mm' : 'cm';
  const anchoCm = u === 'mm' ? parseFloat(ancho_vano) / 10 : parseFloat(ancho_vano);
  const altoCm  = u === 'mm' ? parseFloat(alto_vano)  / 10 : parseFloat(alto_vano);

  // Descuento del vano (configurable en config/constants.js → DESCUENTO_VANO_CM).
  // Por defecto 0.3 cm = 3 mm (valor estándar de los Excel oficiales).
  // La conversión cm/mm se aplica automáticamente porque trabajamos
  // internamente en cm y al final llamamos a applyUnitToResult.
  const A = r2(anchoCm - DESCUENTO_VANO_CM);
  const H = r2(altoCm  - DESCUENTO_VANO_CM);
  const v = ref_vidrio || '5MM';

  if (isNaN(A) || isNaN(H) || A <= 0 || H <= 0)
    return { error: 'Dimensiones de vano inválidas' };

  const dispatch = {
    '1-1-1': () => _744_XX(A,H,v),
    '1-1-2': () => _744_0X(A,H,v),
    '1-1-3': () => _744_X0X(A,H,v),
    '1-1-4': () => _744_0XX0(A,H,v),
    '1-1-5': () => _744_XXX(A,H,v,false),
    '1-2-1': () => _744_XX(A,H,v),
    '1-2-2': () => _744_0X(A,H,v),
    '1-2-3': () => _744_X0X_L90(A,H,v),
    '1-2-4': () => _744_0XX0(A,H,v),
    '1-2-5': () => _744_XXX(A,H,v,true),
    '2-1-1': () => _5020T_XX(A,H,v),
    '2-1-2': () => _5020T_0X(A,H,v),
    '2-1-3': () => _5020T_X0X(A,H,v),
    '2-1-4': () => _5020T_0XX0(A,H,v),
    '2-3-1': () => _5020H_XX(A,H,v),
    '2-3-2': () => _5020H_0X(A,H,v),
    '2-3-3': () => _5020H_X0X(A,H,v),
    '2-3-4': () => _5020H_0XX0(A,H,v),
    '3-1-1': () => _8025T_XX(A,H,v),
    '3-1-2': () => _8025T_0X(A,H,v),
    '3-1-3': () => _8025T_X0X(A,H,v),
    '3-1-4': () => _8025T_0XX0(A,H,v),
    '3-1-5': () => _8025T_XXX(A,H,v),
    '3-2-1': () => _8025L90_XX(A,H,v),
    '3-2-2': () => _8025L90_0X(A,H,v),
    '3-2-3': () => _8025L90_X0X(A,H,v),
    '3-2-4': () => _8025L90_0XX0(A,H,v),
    '3-2-5': () => _8025L90_XXX(A,H,v),
  };

  const fn = dispatch[`${p}-${s}-${d}`];
  if (!fn) return { error: `Combinación no disponible: perfil=${p}, sistema=${s}, diseño=${d}` };

  const data = fn();

  const SECTION_LABELS = {
    marco:      'MARCO',
    marco_744:  'MARCO 744',
    nave_movil: 'NAVE MÓVIL',
    nave_fija:  'NAVE FIJA',
    adaptador:  'ADAPTADOR',
  };

  const piezas = [];
  for (const [key, label] of Object.entries(SECTION_LABELS)) {
    if (data[key]) {
      for (const piece of data[key]) {
        piezas.push({ seccion: label, ...piece });
      }
    }
  }

  for (const vg of (data.vidrios || [])) {
    piezas.push({ seccion:'VIDRIO', es_vidrio:true, ...vg });
  }

  for (const a of (data.accesorios || [])) {
    piezas.push({ seccion:'ACCESORIO', es_accesorio:true, resultado:null, angulo:null, formula:null, ...a });
  }

  const resultado = {
    A, H,
    ancho_ventana: A,
    alto_ventana:  H,
    unidad: u,                      // ← NUEVO: la unidad que se está usando
    piezas,
    vidrios:    data.vidrios    || [],
    accesorios: data.accesorios || [],
  };

  // Si el caller pidió MM, convertimos toda la salida al final
  return applyUnitToResult(resultado, u);
}

module.exports = { calcularVentana, convertFormulaCmToMm, applyUnitToResult };