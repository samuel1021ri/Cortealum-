import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { X, FileDown, CheckCircle, RefreshCw, AlertTriangle, RotateCcw, Package, Maximize2, Minimize2 } from 'lucide-react';
import api, { descargarReportePdf } from '../../api/client';
import LOGO_EMBLEMA from '../../assets/logoEmblema';
import toast from 'react-hot-toast';
import { convertFormulaToUnit } from '../../utils/unidades';

/* ─────────────────────────────────────────────────────────────────
   CONSTANTS & HELPERS
───────────────────────────────────────────────────────────────── */
const ID_TO_NAME = { 1:'XX', 2:'0X', 3:'X0', 4:'X0X', 5:'0XX0', 6:'0XX', 7:'XXX' };

function parseDiseno(val) {
  let name = typeof val === 'number' ? (ID_TO_NAME[val] || 'XX') : String(val || 'XX');
  name = name.toUpperCase().replace(/O/g, '0');
  const p = name.split('').map(ch => ({ m: ch === 'X' }));
  return p.length >= 1 ? p : [{ m:true }, { m:true }];
}

/**
 * Formatea una medida adaptativamente:
 *   - Si es entera         → sin decimales      ("54", "540")
 *   - Si tiene decimales   → hasta `dec` máx.   ("54,5", "54,25")
 *
 * `dec` es el TOPE máximo (no fuerza ceros a la derecha).
 * Default: 1 decimal para mm, 2 para cm.
 */
function fmtVal(val, unit, dec) {
  if (val == null || val === '?') return val;
  const n = typeof val === 'number' ? val : parseFloat(val);
  if (isNaN(n)) return val;
  const converted = unit === 'mm' ? n * 10 : n;
  const maxDec = dec != null ? dec : (unit === 'mm' ? 1 : 2);
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDec,
  }).format(converted);
}

/** Formatea un valor que ya está en cm, sin conversión, adaptativo. */
function fmtCm(cm, maxDec = 1) {
  const v = parseFloat(cm) || 0;
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDec,
  }).format(v);
}
const ul = unit => unit === 'mm' ? 'mm' : 'cm';

const T = {
  bg:'#F5F3EE', surface:'#EDEAE4', surfaceAlt:'#E6E2DA',
  border:'rgba(75,85,99,0.14)', borderMd:'rgba(75,85,99,0.22)', borderSt:'rgba(75,85,99,0.35)',
  blue:'#1A56DB', blueLt:'#3B82F6', bluePale:'#DBEAFE', blueDark:'#1239A6',
  blueGlow:'rgba(26,86,219,0.15)', blueDeep:'#0D1B2E',
  orange:'#92400E', green:'#166534', greenPale:'#DCFCE7',
  red:'#B91C1C', redPale:'#FEE2E2',
  textPri:'#111827', textSec:'#374151', textMut:'#6B7280', textDim:'#9CA3AF',
  canvas3DBg:'#060C14',
  font:"'JetBrains Mono','Fira Code','Courier New',monospace",
  fontSans:"'Barlow','Segoe UI',system-ui,sans-serif",
};
const SEC_BG  = { 'MARCO':'#EDF1F8','MARCO 744':'#EDF1F8','NAVE MÓVIL':'#F0EDE6','NAVE MOVIL':'#F0EDE6','NAVE FIJA':'#EDF1F8','ADAPTADOR':'#EDEAE4' };
const SEC_CLR = { 'MARCO':'#1A56DB','MARCO 744':'#1A56DB','NAVE MÓVIL':'#6B5B3E','NAVE MOVIL':'#6B5B3E','NAVE FIJA':'#1239A6','ADAPTADOR':'#374151' };

/* ─────────────────────────────────────────────────────────────────
   STYLES
───────────────────────────────────────────────────────────────── */
const GLOBAL_STYLE = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=DM+Sans:wght@300;400;500;600;700&display=swap');
  .sm-ov{position:fixed;inset:0;z-index:1000;background:rgba(15,23,42,0.62);backdrop-filter:blur(22px) saturate(0.8);display:flex;align-items:center;justify-content:center;padding:10px;animation:sm-fi .18s ease}
  @keyframes sm-fi{from{opacity:0}to{opacity:1}}
  @keyframes sm-si{from{opacity:0;transform:translateY(18px) scale(0.97)}to{opacity:1;transform:none}}
  @keyframes sm-spin{to{transform:rotate(360deg)}}
  @keyframes sm-pulse{0%,100%{opacity:1}50%{opacity:.35}}
  @keyframes sm-scan{0%{transform:translateX(-100%)}100%{transform:translateX(200vw)}}
  @keyframes sm-row{from{opacity:0;transform:translateX(-5px)}to{opacity:1;transform:none}}
  .sm-modal{width:98vw;max-width:1440px;max-height:96vh;display:flex;flex-direction:column;border-radius:22px;overflow:hidden;background:${T.bg};border:1px solid ${T.borderMd};box-shadow:0 0 0 1px rgba(37,99,235,.05),0 40px 90px rgba(15,23,42,.25),0 8px 32px rgba(37,99,235,.08);animation:sm-si .26s cubic-bezier(.16,1,.3,1);font-family:${T.fontSans};color:${T.textPri}}
  .sm-scroll::-webkit-scrollbar{width:4px}.sm-scroll::-webkit-scrollbar-track{background:${T.surfaceAlt}}.sm-scroll::-webkit-scrollbar-thumb{background:${T.borderMd};border-radius:99px}
  .sm-btn{transition:all .14s;cursor:pointer;border:none;display:flex;align-items:center;justify-content:center;gap:6px;font-family:${T.fontSans};font-weight:600}
  .sm-btn:hover:not(:disabled){filter:brightness(1.07);transform:translateY(-1px)}.sm-btn:active:not(:disabled){transform:none;filter:brightness(.96)}.sm-btn:disabled{opacity:.42;cursor:not-allowed}
  .sm-dot{width:7px;height:7px;border-radius:50%;background:#22C55E;box-shadow:0 0 8px #22C55E;animation:sm-pulse 1.8s ease-in-out infinite;flex-shrink:0}
  .sm-spinner{width:16px;height:16px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:sm-spin .7s linear infinite}
  .sm-tbl{width:100%;border-collapse:separate;border-spacing:0}
  .sm-tbl thead th{background:${T.surfaceAlt};padding:9px 13px;font-family:${T.font};font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:${T.textMut};border-top:1.5px solid ${T.border};border-bottom:1.5px solid ${T.border}}
  .sm-tbl thead th:first-child{border-left:1.5px solid ${T.border};border-radius:10px 0 0 0}.sm-tbl thead th:last-child{border-right:1.5px solid ${T.border};border-radius:0 10px 0 0}
  .sm-tbl tbody tr{animation:sm-row .22s ease both}
  .sm-tbl tbody tr td{padding:9px 13px;border-bottom:1px solid ${T.border};vertical-align:middle;font-size:.87rem;background:${T.bg};transition:background .1s}
  .sm-tbl tbody tr:nth-child(even) td{background:${T.surface}}.sm-tbl tbody tr:hover td{background:${T.bluePale}!important}
  .sm-tbl tbody tr td:first-child{border-left:1.5px solid ${T.border}}.sm-tbl tbody tr td:last-child{border-right:1.5px solid ${T.border}}
  .sm-tbl tbody tr:last-child td{border-bottom:1.5px solid ${T.border}}.sm-tbl tbody tr:last-child td:first-child{border-radius:0 0 0 10px}.sm-tbl tbody tr:last-child td:last-child{border-radius:0 0 10px 0}
  .sm-hdr-shine{position:absolute;bottom:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,${T.blue},${T.blueLt},transparent);animation:sm-scan 3.5s ease-in-out infinite;opacity:.6}
  .sm-ut{display:inline-flex;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);border-radius:8px;overflow:hidden}
  .sm-ub{padding:5px 13px;border:none;background:transparent;color:rgba(255,255,255,.5);font-size:11px;font-weight:700;cursor:pointer;font-family:${T.font};letter-spacing:.05em;transition:all .15s;text-transform:uppercase}
  .sm-ub.on{background:rgba(255,255,255,.18);color:#fff}
  /* 3D canvas system */
  .cv3{display:block;width:100%;cursor:grab;touch-action:none;user-select:none}
  .cv3.drag{cursor:grabbing}
  .tb3{display:flex;align-items:center;justify-content:space-between;padding:6px 13px;background:#040810;flex-wrap:wrap;gap:5px;border-bottom:1px solid rgba(255,255,255,.05)}
  .b3{padding:3px 9px;border-radius:5px;border:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.03);color:#475569;font-size:10px;font-weight:600;cursor:pointer;transition:all .15s;letter-spacing:.05em;text-transform:uppercase;font-family:${T.font}}
  .b3:hover{background:rgba(255,255,255,.08);color:#64748b}
  .b3.on{background:rgba(59,130,246,.18);color:#93c5fd;border-color:rgba(59,130,246,.38)}
  .b3.o.on{background:rgba(249,115,22,.18);color:#fdba74;border-color:rgba(249,115,22,.38)}
  .b3.g.on{background:rgba(34,197,94,.18);color:#86efac;border-color:rgba(34,197,94,.38)}
  .pp{display:flex;flex-wrap:wrap;gap:4px;padding:6px 12px;background:rgba(4,8,14,.9);border-top:1px solid rgba(255,255,255,.04);min-height:34px}
  .pc{padding:3px 8px;border-radius:5px;border:1px solid rgba(255,255,255,.06);border-left-width:3px;background:rgba(255,255,255,.02);font-size:10px;color:#475569;cursor:pointer;transition:all .12s;font-weight:500;white-space:nowrap;font-family:${T.fontSans}}
  .pc:hover{background:rgba(255,255,255,.06);color:#64748b}
  .pc.sel{background:rgba(59,130,246,.12);color:#93c5fd;border-left-color:#3b82f6}
  .sb{display:inline-flex;align-items:center;gap:4px;font-family:${T.font};font-size:10px;font-weight:700;padding:3px 8px;border-radius:5px;letter-spacing:.07em;text-transform:uppercase;background:rgba(0,0,0,.72);border:1px solid rgba(249,115,22,.48);color:#fdba74}
  .sd{width:5px;height:5px;border-radius:50%;background:#f97316;box-shadow:0 0 5px #f97316;flex-shrink:0;animation:sm-pulse 1.5s infinite}
  .lr{display:flex;align-items:center;gap:6px;flex:1;min-width:130px;padding:3px 7px}
  .ll{font-size:9px;color:#334155;width:44px;text-transform:uppercase;letter-spacing:.06em;flex-shrink:0;font-family:${T.font}}
  .ls{flex:1;-webkit-appearance:none;height:2px;border-radius:2px;background:rgba(255,255,255,.07);outline:none;cursor:pointer}
  .ls::-webkit-slider-thumb{-webkit-appearance:none;width:11px;height:11px;border-radius:50%;background:#3b82f6;cursor:pointer;border:1.5px solid #1d4ed8}
  .lv{font-size:9px;color:#3b82f6;font-family:${T.font};width:26px;text-align:right;flex-shrink:0}
  .lb{display:flex;align-items:center;justify-content:space-between;padding:5px 13px;background:rgba(4,8,14,.85);border-top:1px solid rgba(255,255,255,.04);flex-wrap:wrap;gap:5px}
`;

function injectStyles() {
  if (document.getElementById('sm-sty4')) return;
  const el = document.createElement('style');
  el.id = 'sm-sty4'; el.textContent = GLOBAL_STYLE;
  document.head.appendChild(el);
}

/* ─────────────────────────────────────────────────────────────────
   PDF GENERATOR
───────────────────────────────────────────────────────────────── */
function buildSVGStr(diseno, A, H) {
  const panels = parseDiseno(diseno); const NP = panels.length;
  const W = 260, HH = 180, MT = 10, innerW = W - MT*2, innerH = HH - MT*2, panelW = innerW/NP;
  let s = [`<rect x="0" y="0" width="${W}" height="${HH}" rx="4" fill="#0a1220"/>`,
    `<rect x="${MT/2}" y="${MT/2}" width="${W-MT}" height="${HH-MT}" rx="3" fill="none" stroke="#1e3a5f" stroke-width="${MT}"/>`];
  for (let i = 0; i < NP; i++) {
    const px = MT + i*panelW, py = MT, ph = innerH, isMov = panels[i].m;
    s.push(`<rect x="${px+3}" y="${py+3}" width="${panelW-6}" height="${ph-6}" rx="2" fill="${isMov?'rgba(37,99,235,0.22)':'rgba(71,85,105,0.18)'}" stroke="${isMov?'#2563eb':'#475569'}" stroke-width="1.5"/>`);
    const cx2 = px+panelW/2, cy2 = py+ph/2;
    if (isMov) {
      s.push(`<line x1="${cx2-10}" y1="${cy2}" x2="${cx2+10}" y2="${cy2}" stroke="#2563eb" stroke-width="2" stroke-linecap="round"/>`);
      s.push(`<polyline points="${cx2+5},${cy2-5} ${cx2+10},${cy2} ${cx2+5},${cy2+5}" fill="none" stroke="#2563eb" stroke-width="2" stroke-linejoin="round"/>`);
    } else {
      s.push(`<line x1="${cx2-6}" y1="${cy2-6}" x2="${cx2+6}" y2="${cy2+6}" stroke="#64748b" stroke-width="1.8" stroke-linecap="round"/>`);
      s.push(`<line x1="${cx2+6}" y1="${cy2-6}" x2="${cx2-6}" y2="${cy2+6}" stroke="#64748b" stroke-width="1.8" stroke-linecap="round"/>`);
    }
    if (i < NP-1) s.push(`<rect x="${px+panelW-2}" y="${py}" width="4" height="${ph}" fill="#1e3a5f"/>`);
  }
  s.push(`<text x="${W/2}" y="${HH-2}" text-anchor="middle" font-family="monospace" font-size="8" fill="#475569">${A}</text>`);
  s.push(`<text x="3" y="${HH/2}" text-anchor="middle" font-family="monospace" font-size="8" fill="#475569" transform="rotate(-90,3,${HH/2})">${H}</text>`);
  return `<svg width="${W}" height="${HH}" viewBox="0 0 ${W} ${HH}" xmlns="http://www.w3.org/2000/svg">${s.join('')}</svg>`;
}

export async function generarReportePDF(ventana, calculo, unit = 'cm') {
  if (!calculo?.piezas) return;
  const perf = calculo.piezas.filter(p => !p.es_vidrio && !p.es_accesorio && p.resultado != null);
  // ── Extraer vidrios y accesorios para incluirlos en el PDF ─────────────
  // FIX bug "1 ítem / nombre = —" en accesorios:
  //   Antes se hacía `piezas.filter(es_accesorio) + concat(calculo.accesorios)`
  //   y dedupe por `ubicacion`. Pero los accesorios del backend usan
  //   `descripcion` (no `ubicacion`); todos tenían `ubicacion === undefined`,
  //   así que el dedupe los consideraba duplicados del primero → solo
  //   sobrevivía 1, y además mostraba "—" porque la celda leía ubicacion/nombre.
  //   Solución: una sola fuente (calculo.piezas) ya trae todos los accesorios
  //   con el flag `es_accesorio:true` desde el backend (calcEngine.js línea
  //   1161), así que no hace falta concat ni dedupe.
  const vidriosArr     = calculo.piezas.filter(p => p.es_vidrio);
  const accesoriosArr  = calculo.piezas.filter(p => p.es_accesorio);

  // ── NUEVO: materiales con costos (best-effort) ─────────────────────────
  // Llama al endpoint /api/ventanas/:id/materiales y enriquece el PDF con
  // costos. Si la llamada falla (red, permisos, ventana sin reporte), se
  // genera el PDF SIN sección de costos en lugar de fallar todo.
  let materialesCosto = [];
  try {
    if (ventana?.id_ventana) {
      const apiModule = await import('../../api/client');
      const { data } = await apiModule.default.get(`/ventanas/${ventana.id_ventana}/materiales`);
      materialesCosto = Array.isArray(data) ? data : [];
    }
  } catch (_) { /* sin costos, el PDF sigue */ }

  const fecha = new Date().toLocaleDateString('es-CO',{year:'numeric',month:'long',day:'numeric'});
  // Los resultados internos siempre en cm; convertir según unidad seleccionada
  // y formatear adaptativamente: sin ceros a la derecha innecesarios.
  const cvt = v => { if (v==null||v==='?') return v; const n=parseFloat(v); return isNaN(n)?v:unit==='mm'?n*10:n; };
  const fmt = (v, dec) => {
    const c = cvt(v);
    if (typeof c !== 'number') return c;
    const maxDec = dec != null ? dec : (unit==='mm' ? 1 : 2);
    return new Intl.NumberFormat('es-CO', {
      minimumFractionDigits: 0,
      maximumFractionDigits: maxDec,
    }).format(c);
  };
  const uLabel = unit==='mm'?'mm':'cm';
  const rawA = calculo.A??calculo.ancho_ventana??'?', rawH = calculo.H??calculo.alto_ventana??'?';
  const A=fmt(rawA), H=fmt(rawH);
  const did = ventana.diseno||(ID_TO_NAME[ventana.id_diseno||ventana.id_diseño])||'XX';
  const svgStr = buildSVGStr(did,`${A} ${uLabel}`,`${H} ${uLabel}`);
  const sC = s=>({'MARCO':'#1e293b','MARCO 744':'#1e293b','NAVE MÓVIL':'#92400e','NAVE MOVIL':'#92400e','NAVE FIJA':'#1d4ed8','ADAPTADOR':'#6d28d9'}[s]||'#374151');
  const sCLight = s=>({'MARCO':'#dbeafe','MARCO 744':'#dbeafe','NAVE MÓVIL':'#fed7aa','NAVE MOVIL':'#fed7aa','NAVE FIJA':'#ede9fe','ADAPTADOR':'#cffafe'}[s]||'#f1f5f9');
  const sCStr = s=>({'MARCO':'#2563eb','MARCO 744':'#1d4ed8','NAVE MÓVIL':'#ea580c','NAVE MOVIL':'#ea580c','NAVE FIJA':'#7c3aed','ADAPTADOR':'#0891b2'}[s]||'#64748b');
  const rows = perf.map((p,i)=>{
    const res = typeof p.resultado==='number'?fmt(p.resultado):p.resultado;
    // FÓRMULA: las fórmulas master están en CM. Si el usuario está viendo
    // en MM, convertimos automáticamente las constantes (×10).
    const formulaShown = convertFormulaToUnit(p.formula, unit) || '—';
    return `<tr style="background:${i%2===0?'#fff':'#f8fafc'}"><td style="padding:6px 9px;color:#94a3b8;text-align:center;font-size:.75rem;font-family:monospace">P-${String(3500+i).padStart(4,'0')}</td><td style="padding:6px 9px"><span style="background:${sC(p.seccion)};color:#fff;font-size:.6rem;font-weight:700;padding:2px 6px;border-radius:3px;text-transform:uppercase;font-family:monospace">${p.seccion||''}</span><div style="font-weight:700;font-size:.88rem;color:#0f172a;margin-top:2px">${p.ubicacion}</div></td><td style="padding:6px 9px;text-align:center;font-weight:700;font-family:monospace">0${p.cantidad}</td><td style="padding:6px 9px;font-family:monospace;font-size:.75rem;color:#64748b">${formulaShown}</td><td style="padding:6px 9px;text-align:right;font-weight:700;color:#2563eb;font-size:1rem;font-family:monospace">${res} <span style="font-size:.65rem;color:#94a3b8">${uLabel}</span></td></tr>`;
  }).join('');

  // ── PLAN DE BARRAS para PDF ──
  // FIX (regla del instructor Marcel): cada tipo de pieza es una barra
  // física independiente. NO se mezclan CABEZAL con JAMBA en la misma barra.
  // Por eso agrupamos por ubicación ANTES del bin-packing.
  const BARRA_MM = 6000;
  const KERF_MM = 3;
  const fmtMM = mm => {
    if (unit === 'mm') return `${mm.toLocaleString('es-CO')} mm`;
    const cm = mm / 10;
    const num = new Intl.NumberFormat('es-CO', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    }).format(cm);
    return `${num} cm`;
  };
  const cortesPorUbiPDF = {};
  perf.forEach(p => {
    const raw = typeof p.resultado==='number' ? p.resultado : parseFloat(p.resultado||0);
    const longMM = Math.round(raw * 10);
    if (longMM<=0||longMM>BARRA_MM) return;
    const ubi = p.ubicacion || 'PERFIL';
    if (!cortesPorUbiPDF[ubi]) cortesPorUbiPDF[ubi] = [];
    for (let i=0;i<(p.cantidad||1);i++) {
      cortesPorUbiPDF[ubi].push({nombre:ubi, longMM, seccion:p.seccion||'MARCO'});
    }
  });
  const cortesPDF = [];
  const barrasPDF = [];
  for (const ubi of Object.keys(cortesPorUbiPDF)) {
    const cortesUbi = cortesPorUbiPDF[ubi];
    cortesPDF.push(...cortesUbi);
    const sortedUbi = [...cortesUbi].sort((a,b)=>b.longMM-a.longMM);
    const barrasUbi = [];
    sortedUbi.forEach(corte => {
      let ok=false;
      for (const b of barrasUbi) {
        const esp=corte.longMM+(b.cortes.length>0?KERF_MM:0);
        if(b.usado+esp<=BARRA_MM){b.usado+=esp;b.cortes.push(corte);ok=true;break;}
      }
      if(!ok) barrasUbi.push({cortes:[corte],usado:corte.longMM,ubicacion:ubi});
    });
    barrasUbi.forEach(b => { b.ubicacion = ubi; });
    barrasPDF.push(...barrasUbi);
  }
  const totalB=barrasPDF.length;
  const totalU=barrasPDF.reduce((s,b)=>s+b.usado,0);
  const totalD=totalB*BARRA_MM;
  const pctOpt=Math.round((totalU/totalD)*100);
  const optColor = pctOpt>=80?'#16a34a':pctOpt>=60?'#ca8a04':pctOpt>=40?'#2563eb':'#dc2626';
  const optLabel = pctOpt>=80?'MÁXIMO APROVECHAMIENTO':pctOpt>=60?'USO MODERADO':pctOpt>=40?'RESIDUO REUTILIZABLE':'ALTO DESPERDICIO';

  // ── PLAN DE BARRAS: tarjetas claras (layout apaisado, 1-up en columna) ──
  const barrasHTML = barrasPDF.map((barra,bi)=>{
    const desp=BARRA_MM-barra.usado;
    const pctB=Math.round((barra.usado/BARRA_MM)*100);
    const bColor=pctB>=85?'#16a34a':pctB>=65?'#ca8a04':pctB>=40?'#2563eb':'#dc2626';
    const segCol = (s)=> sCStr(s) || '#475569';
    let segs='';
    barra.cortes.forEach(c=>{
      const w=(c.longMM/BARRA_MM*100);
      segs+=`<div style="width:${w}%;background:${segCol(c.seccion)};height:100%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:7px;font-weight:700;font-family:'DM Mono',monospace;overflow:hidden;white-space:nowrap;border-right:1px solid #fff;box-sizing:border-box">${w>=13?(c.longMM/10).toFixed(0):''}</div>`;
    });
    const sobW=(desp/BARRA_MM*100);
    const reut=desp>=200;
    const sobBg=reut?'repeating-linear-gradient(45deg,#dcfce7,#dcfce7 3px,#bbf7d0 3px,#bbf7d0 6px)':'repeating-linear-gradient(45deg,#fee2e2,#fee2e2 3px,#fecaca 3px,#fecaca 6px)';
    const sobTx=reut?'#15803d':'#b91c1c';
    if(sobW>0.5) segs+=`<div style="width:${sobW}%;height:100%;background:${sobBg};display:flex;align-items:center;justify-content:center;color:${sobTx};font-size:7px;font-weight:700;font-family:'DM Mono',monospace;white-space:nowrap;overflow:hidden">${sobW>12?(reut?'\u267b ':'\u2715 ')+fmtMM(desp):''}</div>`;
    const chipsHTML = barra.cortes.map(c=>`<span style="display:inline-block;background:#fff;border:1px solid ${segCol(c.seccion)}55;border-left:2.5px solid ${segCol(c.seccion)};border-radius:5px;padding:1.5px 6px;margin:0 3px 3px 0;font-family:'DM Mono',monospace;font-size:8.5px;white-space:nowrap"><b style="color:${segCol(c.seccion)}">${c.nombre}</b>&nbsp;<span style="color:#0f172a;font-weight:700">${fmtMM(c.longMM)}</span></span>`).join('');
    return `<div class="barraBlk" style="border:1px solid #e2e8f0;border-left:3px solid ${bColor};border-radius:6px;padding:2px 9px;background:#fff;page-break-inside:avoid;break-inside:avoid">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;gap:6px">
        <div style="display:flex;align-items:center;gap:6px;white-space:nowrap">
          <span style="width:18px;height:18px;background:${bColor};color:#fff;border-radius:5px;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:9px;font-family:'DM Mono',monospace;flex:none">${bi+1}</span>
          <b style="font-size:11.5px;white-space:nowrap">Barra ${bi+1}</b>
          <span style="font-size:8px;color:#94a3b8;font-family:'DM Mono',monospace;white-space:nowrap">${barra.cortes.length} pza${barra.cortes.length!==1?'s':''}</span>
        </div>
        <div style="font-family:'DM Mono',monospace;font-size:9px;text-align:right;white-space:nowrap"><span style="color:#16a34a;font-weight:700">${fmtMM(barra.usado)}</span> / <b>${fmtMM(desp)}</b> &middot; <b style="color:${bColor}">${pctB}%</b></div>
      </div>
      <div style="display:flex;height:10px;border-radius:3px;overflow:hidden;background:#f1f5f9;border:1px solid #e2e8f0">${segs}</div>
      <div style="margin-top:4px">${chipsHTML}</div>
    </div>`;
  }).join('');

  // ── Lista de corte (filas amplias para llenar la columna central) ──
  const cutRowsLand = perf.map((p,i)=>{
    const res = typeof p.resultado==='number'?fmt(p.resultado):p.resultado;
    const formulaShown = convertFormulaToUnit(p.formula, unit) || '—';
    return `<tr style="background:${i%2===0?'#fff':'#f8fafc'}"><td style="padding:6px 9px;color:#94a3b8;text-align:left;font-size:9px;font-family:'DM Mono',monospace">P-${String(3500+i).padStart(4,'0')}</td><td style="padding:6px 9px"><span style="background:${sC(p.seccion)};color:#fff;font-size:7.5px;font-weight:700;padding:2px 6px;border-radius:3px;font-family:'DM Mono',monospace">${p.seccion||''}</span> <b style="font-size:11.5px;color:#0f172a">${p.ubicacion}</b></td><td style="padding:6px 9px;text-align:center;font-weight:700;font-family:'DM Mono',monospace;font-size:10px">0${p.cantidad}</td><td style="padding:6px 9px;text-align:right;font-weight:700;color:#2563eb;font-size:12.5px;font-family:'DM Mono',monospace">${res} <span style="font-size:8px;color:#94a3b8">${uLabel}</span></td></tr>`;
  }).join('');

  // ── Filas vidrios / accesorios (compactas, panel uniforme) ──
  const vidRowsLand = vidriosArr.map((v,i)=>{
    const a=fmt(v.ancho), h=fmt(v.alto), cant=parseInt(v.cantidad||1);
    const areaTotal=(((parseFloat(v.ancho)*parseFloat(v.alto))/10000)*cant).toFixed(4);
    return `<tr style="background:${i%2===0?'#fff':'#f8fafc'}"><td style="padding:5px 9px;font-size:9px;font-weight:600">${v.ubicacion||'—'}</td><td style="padding:5px 9px;text-align:center;font-weight:700;font-size:9px">${cant}</td><td style="padding:5px 9px;text-align:right;font-size:9px">${a}</td><td style="padding:5px 9px;text-align:right;font-size:9px">${h}</td><td style="padding:5px 9px;text-align:right;font-weight:700;font-size:9px;color:#0f2d52">${areaTotal}</td></tr>`;
  }).join('');
  const accRowsLand = accesoriosArr.map((a,i)=>{
    const esLongCm=a.unidad==='cm';
    const cantDisplay=(esLongCm&&unit==='mm')?Math.round((a.cantidad||0)*10*100)/100:(a.cantidad||1);
    const unitDisplay=(esLongCm&&unit==='mm')?'mm':(a.unidad||'und');
    return `<tr style="background:${i%2===0?'#fff':'#f8fafc'}"><td style="padding:5px 9px;font-size:10px;font-weight:600">${a.descripcion||a.ubicacion||a.nombre||'—'}</td><td style="padding:5px 9px;text-align:center;font-weight:700;font-size:11px;font-family:'DM Mono',monospace">${cantDisplay}</td><td style="padding:5px 9px;text-align:right;font-size:8px;color:#94a3b8">${unitDisplay}</td></tr>`;
  }).join('');

  // ── Costos (opcional; va a lo ancho debajo si existe) ──
  const fmtCOP = n => '$ ' + new Intl.NumberFormat('es-CO',{maximumFractionDigits:0}).format(Math.round(parseFloat(n)||0));
  const costoTotal = materialesCosto.reduce((s,m)=>s+(parseFloat(m.costo_total)||0),0);
  const costosPanel = materialesCosto.length===0?'':`
    <div style="margin-top:12px">
      <div class="ph"><div class="pt">Costos de materiales</div><div class="ps">Total: ${fmtCOP(costoTotal)}</div></div>
      <div class="pnl"><table><thead><tr><th>Material</th><th style="text-align:right">Cant.</th><th>Un</th><th style="text-align:right">Precio</th><th style="text-align:right">Subtotal</th></tr></thead><tbody>${materialesCosto.map((m,i)=>`<tr style="background:${i%2?'#f8fafc':'#fff'}"><td style="padding:5px 9px;font-size:10px;font-weight:600">${m.nombre_material||'—'}</td><td style="padding:5px 9px;text-align:right;font-size:9px">${(parseFloat(m.cantidad_usada||0)).toFixed(2)}</td><td style="padding:5px 9px;font-size:8px;color:#64748b">${m.unidad_medida||'m'}</td><td style="padding:5px 9px;text-align:right;font-size:9px">${fmtCOP(m.costo_unitario)}</td><td style="padding:5px 9px;text-align:right;font-weight:700;font-size:9px;color:#065F46">${fmtCOP(m.costo_total)}</td></tr>`).join('')}</tbody></table></div>
    </div>`;

  const ph = (t,s)=>`<div class="ph"><div class="pt">${t}</div><div class="ps">${s||''}</div></div>`;

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><title>Reporte V#${ventana.id_ventana}</title><link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=DM+Sans:wght@400;600;700;800&display=swap" rel="stylesheet"/><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'DM Sans',sans-serif;background:#fff;color:#0f172a;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{padding:0}
.hdr{background:linear-gradient(135deg,#0f2d52,#1e3a8a);border-radius:9px;padding:5px 18px;display:flex;justify-content:space-between;align-items:center;color:#fff;margin-bottom:6px}
.bn{font-size:16px;font-weight:800;font-family:'DM Sans',sans-serif;letter-spacing:.04em;line-height:1.05}
.bs{font-size:8px;opacity:.7;font-family:'DM Mono',monospace;letter-spacing:.08em;text-transform:uppercase}
.meta{font-family:'DM Mono',monospace;font-size:8.5px;text-align:right;opacity:.95;line-height:1.5}
.meta strong{font-weight:700}
.chips{display:flex;gap:9px;margin-bottom:6px}
.chip{flex:1;background:#fff;border:1px solid #dbeafe;border-radius:7px;padding:4px 13px}
.chip.a{background:#eff6ff;border-color:#bfdbfe}
.cl{font-size:8px;color:#94a3b8;font-family:'DM Mono',monospace;text-transform:uppercase;letter-spacing:.06em}
.cv{font-size:13px;font-weight:700;color:#0f2d52;font-family:'DM Mono',monospace}
.grid3{display:grid;grid-template-columns:290px 1.05fr 1.15fr;gap:14px;align-items:stretch}
.page.fill{display:flex;flex-direction:column}
.fill .grid3{flex:1 1 auto}
.fill .grid3 > div{display:flex;flex-direction:column}
.fill .grid3 > div > .mtg{display:flex;flex-direction:column}
.fill .pnl.grow{flex:1 1 auto;display:flex;flex-direction:column}
.fill .pnl.grow > table{flex:1 1 auto}
.fill .grid3 > div > .mtg:last-child{flex:1 1 auto}
.fill .grid3 > div > .mtg:last-child > .pnl{flex:1 1 auto;display:flex;flex-direction:column}
.fill .grid3 > div > .mtg:last-child > .pnl > table{flex:1 1 auto}
.ph{background:#0f2d52;border-radius:7px 7px 0 0;padding:8px 13px;display:flex;justify-content:space-between;align-items:center}
.pt{color:#fff;font-weight:700;font-size:12.5px;font-family:'DM Sans',sans-serif}
.ps{color:rgba(255,255,255,.65);font-size:9.5px;font-family:'DM Mono',monospace;white-space:nowrap}
.pnl{border:1px solid #e2e8f0;border-top:none;border-radius:0 0 7px 7px;overflow:hidden}
.mtg{margin-top:9px}
.svgbx{padding:8px;text-align:center}
.svgbx svg{max-height:150px;width:auto;max-width:100%;display:block;margin:0 auto;border-radius:5px}
table{width:100%;border-collapse:collapse;font-family:'DM Mono',monospace}
th{padding:6px 9px;text-align:left;font-size:8.5px;color:#64748b;background:#f8fafc;font-weight:600;letter-spacing:.04em}
td{vertical-align:middle}
@page{size:A4 landscape;margin:9mm}
@media print{thead{display:table-header-group}tr{page-break-inside:avoid;break-inside:avoid}.barraBlk{page-break-inside:avoid;break-inside:avoid}.grid3{break-inside:avoid}}
</style></head><body><div class="page fit-one">
  <div class="hdr"><div style="display:flex;align-items:center;gap:11px"><img src="${LOGO_EMBLEMA}" style="height:34px;display:block" alt="CorteAlum"/><div><div class="bn">CORTEALUM</div><div class="bs">Automatización de corte de aluminio</div></div></div><div class="meta">REPORTE · <strong>V#${ventana.id_ventana}</strong> · ${ventana.sistema||'—'} · ${ventana.perfil||'—'} · ${did} · ${uLabel}</div></div>
  <div class="chips">
    <div class="chip"><div class="cl">Ancho vano</div><div class="cv">${fmtVal(ventana.ancho_vano, unit)} ${uLabel}</div></div>
    <div class="chip"><div class="cl">Alto vano</div><div class="cv">${fmtVal(ventana.alto_vano, unit)} ${uLabel}</div></div>
    <div class="chip a"><div class="cl">A cálculo</div><div class="cv">${A} ${uLabel}</div></div>
    <div class="chip a"><div class="cl">H cálculo</div><div class="cv">${H} ${uLabel}</div></div>
  </div>
  <div class="grid3">
    <div>
      ${ph('Vista técnica', did)}<div class="pnl svgbx">${svgStr}</div>
      ${vidriosArr.length?`<div class="mtg">${ph('Vidrios', (ventana.referencia_vidrio||'5MM')+' · '+vidriosArr.length+' pza'+(vidriosArr.length!==1?'s':''))}<div class="pnl"><table><thead><tr><th>Ubicación</th><th style="text-align:center">C</th><th style="text-align:right">Ancho</th><th style="text-align:right">Alto</th><th style="text-align:right">Área m²</th></tr></thead><tbody>${vidRowsLand}</tbody></table></div></div>`:''}
      ${accesoriosArr.length?`<div class="mtg">${ph('Accesorios', accesoriosArr.length+' ítem'+(accesoriosArr.length!==1?'s':''))}<div class="pnl"><table><thead><tr><th>Item</th><th style="text-align:center">Cant.</th><th style="text-align:right">Un</th></tr></thead><tbody>${accRowsLand}</tbody></table></div></div>`:''}
    </div>
    <div>${ph('Lista de corte', perf.length+' pieza'+(perf.length!==1?'s':''))}<div class="pnl grow"><table><thead><tr><th>Cód</th><th>Descripción</th><th style="text-align:center">C</th><th style="text-align:right">Longitud</th></tr></thead><tbody>${cutRowsLand}</tbody></table></div></div>
    <div>${cortesPDF.length?`${ph('Plan de Barras de Aluminio', totalB+' barras · '+cortesPDF.length+' cortes · '+pctOpt+'%')}<div class="pnl grow" style="padding:7px;display:flex;flex-direction:column;gap:3px;justify-content:space-between">${barrasHTML}</div>`:''}</div>
  </div>
  ${costosPanel}
<script>(function(){function fit(){var pg=document.querySelector('.page')||document.body;document.body.style.zoom='';pg.classList.remove('fill');pg.style.minHeight='0px';var avail=722;var h=Math.ceil(pg.getBoundingClientRect().height);var z=1;if(h>avail){z=Math.max(0.5,avail/h);document.body.style.zoom=String(z);}pg.style.minHeight=(avail/z)+'px';pg.classList.add('fill');}try{if(document.fonts&&document.fonts.ready){document.fonts.ready.then(fit);}}catch(e){}fit();})();</script>
</div></body></html>`;
  await descargarReportePdf(html, `CorteAlu_V${ventana.id_ventana}_${uLabel}`);
}

/* ─────────────────────────────────────────────────────────────────
   PBR 3D ENGINE — pure functions (no React)
───────────────────────────────────────────────────────────────── */
const MONO_FONT = "'DM Mono','Courier New',monospace";
// Scene constants
const FW=340,FH=215,FD=22,FT=16,VT=9;
const SL=-FW/2,SR=FW/2,ST=-FH/2,SB=FH/2;
const IL=SL+FT,IR=SR-FT,IT=ST+FT,IB=SB-FT;
const ALU=[180,183,178], RIL=[128,152,178];

function mkProj(W,H,rotX,rotY){
  const rx=rotX*Math.PI/180, ry=rotY*Math.PI/180;
  return (x,y,z)=>{
    const x1=x*Math.cos(ry)-z*Math.sin(ry);
    const z1=x*Math.sin(ry)+z*Math.cos(ry);
    const y2=y*Math.cos(rx)+z1*Math.sin(rx);
    const z2=-y*Math.sin(rx)+z1*Math.cos(rx);
    const F=520, sc=F/(F+z2+90);
    return{px:W/2+x1*sc, py:H/2+y2*sc, sc, z:z2};
  };
}

function pbr(R,G,B,nx,ny,nz,LX,LY,amb=0.28,rough=0.52,metal=0.86){
  const LZ=0.48;
  const d=Math.max(0,nx*LX+ny*LY+nz*LZ);
  const sp=Math.pow(Math.max(0,-nx*LX*.3-ny*LY*.3+nz*.9),9*(1-rough))*(metal*.54);
  const f=amb+(1-amb)*d;
  return`rgb(${Math.min(255,(R*f+sp*238)|0)},${Math.min(255,(G*f+sp*230)|0)},${Math.min(255,(B*f+sp*218)|0)})`;
}

function faceP(ctx,verts,fill,stk,lw=0.6,wire=false){
  if(!verts||verts.length<3)return verts;
  ctx.beginPath();ctx.moveTo(verts[0].px,verts[0].py);
  for(let i=1;i<verts.length;i++)ctx.lineTo(verts[i].px,verts[i].py);
  ctx.closePath();
  if(wire){ctx.strokeStyle=stk||'rgba(100,190,255,.4)';ctx.lineWidth=0.6;ctx.stroke();}
  else{ctx.fillStyle=fill;ctx.fill();if(stk){ctx.strokeStyle=stk;ctx.lineWidth=lw;ctx.stroke();}}
  return verts;
}

function box3D(ctx,proj,x1,y1,z1,x2,y2,z2,R,G,B,a=1,LX=0.55,LY=-0.70,rough=0.52,metal=0.86,wire=false){
  ctx.globalAlpha=a;
  const P=v=>proj(v[0],v[1],v[2]);
  const s=(nx,ny,nz)=>pbr(R,G,B,nx,ny,nz,LX,LY,0.28,rough,metal);
  faceP(ctx,[[x1,y1,z2],[x2,y1,z2],[x2,y2,z2],[x1,y2,z2]].map(P),s(0,0,-1),null,0.6,wire);
  faceP(ctx,[[x1,y1,z1],[x2,y1,z1],[x2,y1,z2],[x1,y1,z2]].map(P),s(0,-1,0),'rgba(255,255,255,.07)',0.4,wire);
  faceP(ctx,[[x1,y2,z1],[x2,y2,z1],[x2,y2,z2],[x1,y2,z2]].map(P),s(0,1,0),null,0.6,wire);
  faceP(ctx,[[x1,y1,z1],[x1,y1,z2],[x1,y2,z2],[x1,y2,z1]].map(P),s(-1,0,0),'rgba(0,0,0,.05)',0.4,wire);
  faceP(ctx,[[x2,y1,z1],[x2,y1,z2],[x2,y2,z2],[x2,y2,z1]].map(P),s(1,0,0),'rgba(255,255,255,.05)',0.4,wire);
  const fv=faceP(ctx,[[x1,y1,z1],[x2,y1,z1],[x2,y2,z1],[x1,y2,z1]].map(P),s(0,0,1),'rgba(0,0,0,.07)',0.5,wire);
  if(fv&&!wire){
    ctx.beginPath();ctx.moveTo(fv[0].px,fv[0].py);ctx.lineTo(fv[1].px,fv[1].py);
    ctx.strokeStyle='rgba(255,255,255,.22)';ctx.lineWidth=0.9;ctx.stroke();
    const mx=(fv[0].px+fv[1].px)*.5;
    const gr=ctx.createLinearGradient(fv[0].px,fv[0].py,mx,fv[2].py);
    gr.addColorStop(0,'rgba(255,255,255,.12)');gr.addColorStop(1,'rgba(255,255,255,0)');
    ctx.beginPath();ctx.moveTo(fv[0].px,fv[0].py);ctx.lineTo(mx,fv[0].py);
    ctx.lineTo(mx*.8+fv[3].px*.2,fv[3].py);ctx.lineTo(fv[3].px,fv[3].py);ctx.closePath();
    ctx.fillStyle=gr;ctx.fill();
    if((x2-x1)>8&&(y2-y1)>8){
      const mg=Math.min((x2-x1)*.15,(y2-y1)*.15,5);
      const iv=[[x1+mg,y1+mg,z1],[x2-mg,y1+mg,z1],[x2-mg,y2-mg,z1],[x1+mg,y2-mg,z1]].map(P);
      ctx.beginPath();iv.forEach((p,i)=>i?ctx.lineTo(p.px,p.py):ctx.moveTo(p.px,p.py));ctx.closePath();
      ctx.strokeStyle='rgba(0,0,0,.12)';ctx.lineWidth=0.5;ctx.stroke();
    }
  }
  ctx.globalAlpha=1;
}

function glassPBR(ctx,proj,x1,y1,z1,x2,y2,z2,isMov,a=1,wire=false){
  ctx.globalAlpha=a;
  const P=v=>proj(v[0],v[1],v[2]);
  const ga=isMov?.40:.18;
  if(!wire){
    const gb=[[x1,y1,z2],[x2,y1,z2],[x2,y2,z2],[x1,y2,z2]].map(P);
    faceP(ctx,gb,isMov?`rgba(37,99,235,${ga*.65})`:'rgba(71,85,105,.13)',null);
  }
  const gv=[[x1,y1,z1],[x2,y1,z1],[x2,y2,z1],[x1,y2,z1]].map(P);
  if(wire){ctx.beginPath();gv.forEach((p,i)=>i?ctx.lineTo(p.px,p.py):ctx.moveTo(p.px,p.py));ctx.closePath();ctx.strokeStyle=isMov?'rgba(59,130,246,.55)':'rgba(71,85,105,.4)';ctx.lineWidth=0.6;ctx.stroke();}
  else{
    const gr=ctx.createLinearGradient(gv[0].px,gv[0].py,gv[2].px,gv[2].py);
    gr.addColorStop(0,isMov?`rgba(59,130,246,${ga})`:'rgba(71,85,105,.22)');
    gr.addColorStop(1,isMov?`rgba(29,78,216,${ga*.72})`:'rgba(51,65,85,.12)');
    ctx.beginPath();gv.forEach((p,i)=>i?ctx.lineTo(p.px,p.py):ctx.moveTo(p.px,p.py));ctx.closePath();
    ctx.fillStyle=gr;ctx.fill();ctx.strokeStyle=isMov?'rgba(147,197,253,.28)':'rgba(100,116,139,.2)';ctx.lineWidth=0.7;ctx.stroke();
    const rfW=(gv[1].px-gv[0].px)*.3;
    const rf=ctx.createLinearGradient(gv[0].px,gv[0].py,gv[0].px+rfW,gv[3].py);
    rf.addColorStop(0,'rgba(255,255,255,.52)');rf.addColorStop(.5,'rgba(255,255,255,.10)');rf.addColorStop(1,'rgba(255,255,255,0)');
    ctx.beginPath();ctx.moveTo(gv[0].px,gv[0].py);ctx.lineTo(gv[0].px+rfW,gv[0].py);
    ctx.lineTo(gv[0].px+rfW*.55,gv[3].py);ctx.lineTo(gv[3].px,gv[3].py);ctx.closePath();
    ctx.fillStyle=rf;ctx.fill();
  }
  ctx.globalAlpha=1;
}

function drawScrew(ctx,proj,x,y,z){
  const p=proj(x,y,z);const r=4.5*p.sc;
  const g=ctx.createRadialGradient(p.px-r*.3,p.py-r*.3,.5,p.px,p.py,r);
  g.addColorStop(0,'#5a6070');g.addColorStop(.6,'#2a3040');g.addColorStop(1,'#181e28');
  ctx.beginPath();ctx.arc(p.px,p.py,r,0,Math.PI*2);ctx.fillStyle=g;ctx.fill();
  ctx.strokeStyle='rgba(0,0,0,.65)';ctx.lineWidth=0.6;ctx.stroke();
  ctx.strokeStyle='rgba(80,92,112,.85)';ctx.lineWidth=0.9;
  ctx.beginPath();ctx.moveTo(p.px-r*.6,p.py);ctx.lineTo(p.px+r*.6,p.py);ctx.stroke();
  ctx.beginPath();ctx.moveTo(p.px,p.py-r*.6);ctx.lineTo(p.px,p.py+r*.6);ctx.stroke();
}

function drawWheel(ctx,proj,x,y,z,wire=false){
  const p=proj(x,y,z);
  // FIX v49: en modo wire dibujar el contorno de la rueda (antes no se
  // dibujaba en wireframe, así que los accesorios desaparecían en ese modo).
  if(wire){
    ctx.strokeStyle='rgba(96,165,250,.6)';ctx.lineWidth=.7;
    ctx.beginPath();ctx.ellipse(p.px,p.py,8*p.sc,5.5*p.sc,0,0,Math.PI*2);ctx.stroke();
    ctx.beginPath();ctx.ellipse(p.px,p.py,5*p.sc,3.4*p.sc,0,0,Math.PI*2);ctx.stroke();
    return;
  }
  const g=ctx.createRadialGradient(p.px-p.sc,p.py-p.sc,.5,p.px,p.py,8*p.sc);
  g.addColorStop(0,'#555e6e');g.addColorStop(.6,'#222830');g.addColorStop(1,'#141820');
  ctx.beginPath();ctx.ellipse(p.px,p.py,8*p.sc,5.5*p.sc,0,0,Math.PI*2);ctx.fillStyle=g;ctx.fill();
  ctx.strokeStyle='rgba(0,0,0,.55)';ctx.lineWidth=0.6;ctx.stroke();
  const ig=ctx.createRadialGradient(p.px-p.sc*.4,p.py-p.sc*.4,.5,p.px,p.py,5*p.sc);
  ig.addColorStop(0,'#7a8492');ig.addColorStop(1,'#383e4c');
  ctx.beginPath();ctx.ellipse(p.px,p.py,5*p.sc,3.4*p.sc,0,0,Math.PI*2);ctx.fillStyle=ig;ctx.fill();
  ctx.beginPath();ctx.ellipse(p.px,p.py,2*p.sc,1.3*p.sc,0,0,Math.PI*2);ctx.fillStyle='#a8b0bc';ctx.fill();
}

function label3D(ctx,px,py,txt,col,a=1,sz=8){
  ctx.globalAlpha=Math.max(0,Math.min(1,a));
  ctx.font=`600 ${sz}px ${MONO_FONT}`;
  const tw=ctx.measureText(txt).width+13;
  ctx.fillStyle='rgba(2,6,16,.90)';
  ctx.beginPath();if(ctx.roundRect)ctx.roundRect(px-tw/2,py-9,tw,17,3);else ctx.rect(px-tw/2,py-9,tw,17);
  ctx.fill();ctx.strokeStyle=col;ctx.lineWidth=0.65;ctx.stroke();
  ctx.fillStyle='rgba(255,255,255,.9)';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText(txt,px,py);ctx.globalAlpha=1;
}

function getPanelDir(panels,i){
  const NP=panels.length;
  let lf=-1,rf=NP;
  for(let j=i-1;j>=0;j--)if(!panels[j].m){lf=j;break;}
  for(let j=i+1;j<NP;j++)if(!panels[j].m){rf=j;break;}
  if(lf===-1&&rf===NP)return i<NP/2?1:-1;
  if(lf===-1)return 1;if(rf===NP)return -1;
  return(i-lf)<=(rf-i)?-1:1;
}

function easeCubic(t){ return t<.5?2*t*t:-1+(4-2*t)*t; }

/* ─────────────────────────────────────────────────────────────────
   UNIFIED 3D CANVAS COMPONENT
   - Assembled view + Explode in SAME canvas
   - Click piece → fly-out with spotlight + glow
───────────────────────────────────────────────────────────────── */
function UnifiedCanvas3D({ diseno, anchoLabel, altoLabel, perfiles, expanded, onToggleExpand }) {
  const panels = parseDiseno(diseno);
  const NP = panels.length;

  const cvRef       = useRef(null);
  const wrapRef     = useRef(null);
  const rotRef      = useRef({ x: 22, y: -32 });       // degrees
  const dragRef     = useRef(null);
  const hovRef      = useRef(-1);

  // animation state (refs = no re-render on every frame)
  const buildRef    = useRef(0);
  const buildDoneRef= useRef(false);
  const buildRAF    = useRef(null);
  const openRef     = useRef({});
  const openRAFs    = useRef({});
  const explodeRef  = useRef(0);
  const explodeRAF  = useRef(null);
  const selRef      = useRef(-1);
  const flyRefs     = useRef({});   // id → t [0..1]
  const flyRAFs     = useRef({});
  const sparksRef   = useRef([]);
  const zoomRef     = useRef(1.0);   // 0.4 … 3.0
  const pinchRef    = useRef(null);  // { dist, zoom }
  const mainRAF     = useRef(null);
  const drawRef     = useRef(null);  // FIX v46: siempre apunta a la última `draw`
  const LXRef       = useRef(0.55);
  const LYRef       = useRef(-0.70);
  const wireRef     = useRef(false);
  const lblRef      = useRef(true);
  const envRef      = useRef(false);
  const accRef      = useRef(true);   // FIX v49: espejo de showAcc para el render loop
  const explActiveRef = useRef(false);

  // Wall view refs
  const activeViewRef    = useRef(0);   // 0=3D  1=wall
  const wallDoneRef      = useRef(new Set());
  const wallStepRef      = useRef(-1);
  const wallDoneAllRef   = useRef(false);
  const timeRef          = useRef(0.55);
  const ambRef           = useRef(0.6);

  // React state only for UI re-renders
  const [buildPct,   setBuildPct]   = useState(0);
  const [buildDone,  setBuildDone]  = useState(false);
  const [selName,    setSelName]    = useState('');
  const [explodeOn,  setExplodeOn]  = useState(false);
  const [showLbl,    setShowLbl]    = useState(true);
  const [wire,       setWire]       = useState(false);
  const [env,        setEnv]        = useState(false);
  const [showAcc,    setShowAcc]    = useState(true);   // FIX v49: toggle accesorios (herrajes/ruedas)
  const [LXs,        setLXs]        = useState(55);
  const [LYs,        setLYs]        = useState(-70);
  const [activeView, setActiveView] = useState(0);
  const [timeOfDay,  setTimeOfDay]  = useState(55);
  const [ambFactor,  setAmbFactor]  = useState(60);
  const [wallLog,    setWallLog]    = useState('');
  const [,           forceR]        = useState(0);

  // sync refs ↔ state
  wireRef.current = wire;
  lblRef.current  = showLbl;
  envRef.current  = env;
  accRef.current  = showAcc;
  explActiveRef.current = explodeOn;
  activeViewRef.current = activeView;
  timeRef.current = timeOfDay / 100;
  ambRef.current  = ambFactor / 100;

  /* ── init canvas size ───────────────────────────── */
  function initSize(){
    const cv = cvRef.current; if(!cv) return;
    const dpr = window.devicePixelRatio||1;
    const wrap = wrapRef.current;
    const w = wrap?.clientWidth || 680;
    const h = expanded ? (window.innerHeight - 120) : Math.round(w*.64);
    cv.style.width  = w+'px';
    cv.style.height = h+'px';
    cv.width  = w*dpr;
    cv.height = h*dpr;
    cv.getContext('2d').setTransform(dpr,0,0,dpr,0,0);
  }

  /* ── build animation ────────────────────────────── */
  function startBuild(){
    if(buildRAF.current)cancelAnimationFrame(buildRAF.current);
    buildRef.current=0; buildDoneRef.current=false;
    openRef.current={}; sparksRef.current=[];
    setBuildDone(false); setBuildPct(0);
    const dur=2700, t0=Date.now();
    function tick(){
      const t=Math.min((Date.now()-t0)/dur,1);
      buildRef.current=easeCubic(t);
      setBuildPct(Math.round(buildRef.current*100));
      if(t<1)buildRAF.current=requestAnimationFrame(tick);
      else{buildRef.current=1; buildDoneRef.current=true; setBuildDone(true);}
    }
    buildRAF.current=requestAnimationFrame(tick);
  }

  /* ── panel open/close ───────────────────────────── */
  function animPanel(i,tgt){
    if(openRAFs.current[i])cancelAnimationFrame(openRAFs.current[i]);
    const st=openRef.current[i]||0, diff=tgt-st;
    const dur=Math.abs(diff)*500+80, t0=Date.now();
    function step(){
      const t=Math.min((Date.now()-t0)/dur,1);
      openRef.current[i]=st+diff*easeCubic(t);
      if(t<1)openRAFs.current[i]=requestAnimationFrame(step);
      else openRef.current[i]=tgt;
    }
    openRAFs.current[i]=requestAnimationFrame(step);
  }

  /* ── explode animation ──────────────────────────── */
  function animExplode(tgt){
    if(explodeRAF.current)cancelAnimationFrame(explodeRAF.current);
    const from=explodeRef.current, dur=1100, t0=Date.now();
    function step(){
      const t=Math.min((Date.now()-t0)/dur,1);
      explodeRef.current=from+(tgt-from)*easeCubic(t);
      if(t<1)explodeRAF.current=requestAnimationFrame(step);
      else explodeRef.current=tgt;
    }
    explodeRAF.current=requestAnimationFrame(step);
  }

  /* ── fly-out: piece protagonist ─────────────────── */
  function animFly(id,tgt){
    if(flyRAFs.current[id])cancelAnimationFrame(flyRAFs.current[id]);
    const from=flyRefs.current[id]||0, dur=680, t0=Date.now();
    function step(){
      const t=Math.min((Date.now()-t0)/dur,1);
      flyRefs.current[id]=from+(tgt-from)*easeCubic(t);
      if(t<1)flyRAFs.current[id]=requestAnimationFrame(step);
      else flyRefs.current[id]=tgt;
    }
    flyRAFs.current[id]=requestAnimationFrame(step);
  }

  /* ── piece definitions ──────────────────────────── */
  function buildPieces(){
    const IW=IR-IL, pw=IW/NP;
    const ex=explodeRef.current;
    const list=[];

    // ── Fixed frame ──────────────────────────────
    list.push({ id:0, name:'Cabezal',     col:'#b2bac8', cx:0,       cy:ST+FT/2-62*ex, cz:-13*ex,
      draw(ctx,proj,a,fly){ const oy=-62*ex+fly.y,oz=-13*ex+fly.z,ox=fly.x;
        box3D(ctx,proj,SL+ox,ST+oy,-FD*.55+oz,SR+ox,ST+FT+oy,oz,...ALU,a,LXRef.current,LYRef.current,.45,.88,wireRef.current);
        if((ex>.25||fly.act)&&a>.3)label3D(ctx,proj(ox,ST+FT/2+oy,oz).px,proj(ox,ST+FT/2+oy,oz).py,'CABEZAL','#b2bac8',(ex>.25?Math.min(1,(ex-.25)/.4):0)*a+fly.la); }
    });
    list.push({ id:1, name:'Sillar',      col:'#b2bac8', cx:0,       cy:SB-FT/2+62*ex, cz:0,
      draw(ctx,proj,a,fly){ const oy=62*ex+fly.y,ox=fly.x,oz=fly.z;
        box3D(ctx,proj,SL+ox,SB-FT+oy,-FD*.55+oz,SR+ox,SB+oy,oz,...ALU,a,LXRef.current,LYRef.current,.45,.88,wireRef.current);
        if((ex>.25||fly.act)&&a>.3)label3D(ctx,proj(ox,SB-FT/2+oy,oz).px,proj(ox,SB-FT/2+oy,oz).py,'SILLAR','#b2bac8',(ex>.25?Math.min(1,(ex-.25)/.4):0)*a+fly.la); }
    });
    list.push({ id:2, name:'Jamba izq.',  col:'#b2bac8', cx:SL+FT/2-90*ex, cy:0, cz:0,
      draw(ctx,proj,a,fly){ const ox=-90*ex+fly.x,oy=fly.y,oz=fly.z;
        box3D(ctx,proj,SL+ox,ST+FT,-FD*.55+oz,SL+FT+ox,SB-FT,oz,...ALU,a,LXRef.current,LYRef.current,.45,.88,wireRef.current);
        if((ex>.25||fly.act)&&a>.3)label3D(ctx,proj(SL+FT/2+ox,(ST+FT+SB-FT)/2,oz).px,proj(SL+FT/2+ox,(ST+FT+SB-FT)/2,oz).py,'JAMBA IZQ.','#b2bac8',(ex>.25?Math.min(1,(ex-.25)/.4):0)*a+fly.la); }
    });
    list.push({ id:3, name:'Jamba der.',  col:'#b2bac8', cx:SR-FT/2+90*ex, cy:0, cz:0,
      draw(ctx,proj,a,fly){ const ox=90*ex+fly.x,oy=fly.y,oz=fly.z;
        box3D(ctx,proj,SR-FT+ox,ST+FT,-FD*.55+oz,SR+ox,SB-FT,oz,...ALU,a,LXRef.current,LYRef.current,.45,.88,wireRef.current);
        if((ex>.25||fly.act)&&a>.3)label3D(ctx,proj(SR-FT/2+ox,(ST+FT+SB-FT)/2,oz).px,proj(SR-FT/2+ox,(ST+FT+SB-FT)/2,oz).py,'JAMBA DER.','#b2bac8',(ex>.25?Math.min(1,(ex-.25)/.4):0)*a+fly.la); }
    });
    list.push({ id:4, name:'Riel superior',col:'#7a9ab8', cx:0, cy:IT+4-32*ex, cz:-43*ex,
      draw(ctx,proj,a,fly){ const oy=-32*ex+fly.y,oz=-43*ex+fly.z,ox=fly.x;
        box3D(ctx,proj,IL+ox,IT+oy,oz,IR+ox,IT+8+oy,oz-FD*.4,...RIL,a,LXRef.current,LYRef.current,.5,.75,wireRef.current);
        if((ex>.25||fly.act)&&a>.3)label3D(ctx,proj(ox,IT+4+oy,oz).px,proj(ox,IT+4+oy,oz).py,'RIEL SUP.','#7aa8c8',(ex>.25?Math.min(1,(ex-.25)/.4):0)*a+fly.la); }
    });
    list.push({ id:5, name:'Riel inferior',col:'#7a9ab8', cx:0, cy:IB-4+32*ex, cz:-43*ex,
      draw(ctx,proj,a,fly){ const oy=32*ex+fly.y,oz=-43*ex+fly.z,ox=fly.x;
        box3D(ctx,proj,IL+ox,IB-8+oy,oz,IR+ox,IB+oy,oz-FD*.4,...RIL,a,LXRef.current,LYRef.current,.5,.75,wireRef.current);
        if((ex>.25||fly.act)&&a>.3)label3D(ctx,proj(ox,IB-4+oy,oz).px,proj(ox,IB-4+oy,oz).py,'RIEL INF.','#7aa8c8',(ex>.25?Math.min(1,(ex-.25)/.4):0)*a+fly.la); }
    });

    // ── Panel pieces ──────────────────────────────
    panels.forEach((panel,i)=>{
      const cxN = i-(NP-1)/2;
      const exX = cxN*90*ex;
      const pZ  = -78*ex - i*18*ex;
      const PL  = IL+pw*i+exX, PR=PL+pw, PT=IT, PB=IB;
      const PC  = panel.m?[32,90,198]:[58,68,84];
      const pCol= panel.m?'#3b82f6':'#64748b';
      const pNm = panel.m?`Hoja X${i+1}`:`Hoja O${i+1}`;

      // Frame + glass of panel
      list.push({ id:10+i*5, name:pNm+' marco', col:pCol, isPanel:true, panelIdx:i,
        cx:(PL+PR)/2, cy:(PT+PB)/2, cz:pZ,
        draw(ctx,proj,a,fly){
          const ox=fly.x,oy=fly.y,oz=pZ+fly.z;
          const pl=PL+ox,pr=PR+ox,pt=PT+oy,pb=PB+oy;
          box3D(ctx,proj,pl,pt,oz-FD*.56,pl+VT,pb,oz,...PC,a,LXRef.current,LYRef.current,.35,.88,wireRef.current);
          box3D(ctx,proj,pr-VT,pt,oz-FD*.56,pr,pb,oz,...PC,a,LXRef.current,LYRef.current,.35,.88,wireRef.current);
          box3D(ctx,proj,pl+VT,pt,oz-FD*.56,pr-VT,pt+VT,oz,...PC,a,LXRef.current,LYRef.current,.35,.88,wireRef.current);
          box3D(ctx,proj,pl+VT,pb-VT,oz-FD*.56,pr-VT,pb,oz,...PC,a,LXRef.current,LYRef.current,.35,.88,wireRef.current);
          // seals
          if(!wireRef.current){
            ctx.globalAlpha=a;
            [[pt+VT+1.5,pt+VT+3.5],[pb-VT-3.5,pb-VT-1.5]].forEach(([ya,yb])=>{
              const sv=[[pl+VT,ya,oz],[pr-VT,ya,oz],[pr-VT,yb,oz],[pl+VT,yb,oz]].map(v=>proj(v[0],v[1],v[2]));
              faceP(ctx,sv,'rgba(26,48,22,.9)','rgba(52,88,45,.45)',.4);
            });
            ctx.globalAlpha=1;
          }
          glassPBR(ctx,proj,pl+VT,pt+VT,oz,pr-VT,pb-VT,oz-FD*.45,panel.m,a,wireRef.current);
          if((ex>.25||fly.act)&&a>.3)label3D(ctx,proj((pl+pr)/2,(pt+pb)/2,oz).px,proj((pl+pr)/2,(pt+pb)/2,oz).py,pNm,pCol,(ex>.25?Math.min(1,(ex-.25)/.4):0)*a+fly.la*.5);
        }
      });

      // Vidrio separado en despiece
      const vidZ=pZ-60*ex;
      list.push({ id:10+i*5+1, name:`Vidrio ${i+1}`, col:'#60a0d8', isPanel:true, panelIdx:i,
        cx:(PL+PR)/2, cy:(PT+PB)/2, cz:vidZ,
        draw(ctx,proj,a,fly){
          const oz2=vidZ+fly.z,ox=fly.x,oy=fly.y;
          glassPBR(ctx,proj,PL+VT+ox,PT+VT+oy,oz2,PR-VT+ox,PB-VT+oy,oz2-8,panel.m,a,wireRef.current);
          if((ex>.4||fly.act)&&a>.3)label3D(ctx,proj((PL+PR)/2+ox,(PT+PB)/2+oy,oz2).px,proj((PL+PR)/2+ox,(PT+PB)/2+oy,oz2).py,`VIDRIO ${i+1}`,'#93c5fd',(ex>.4?Math.min(1,(ex-.4)/.4):0)*a+fly.la*.5);
        }
      });

      if(panel.m){
        const HX=i===NP-1?PL+11:PR-20, HY=(PT+PB)/2;
        const hdlZ=pZ-30*ex, hdlOX=cxN*20*ex;

        // Handle
        list.push({ id:10+i*5+2, name:`Manejador H${i+1}`, col:'#6b7280', isPanel:true, panelIdx:i,
          cx:HX+5+hdlOX, cy:HY, cz:hdlZ,
          draw(ctx,proj,a,fly){
            const oz3=hdlZ+fly.z,ox=fly.x+hdlOX,oy=fly.y;
            box3D(ctx,proj,HX-1.5+ox,HY-26+oy,oz3,HX+9+ox,HY+26+oy,oz3+2,80,88,102,a,LXRef.current,LYRef.current,.4,.85,wireRef.current);
            box3D(ctx,proj,HX-2.5+ox,HY-16+oy,oz3+2,HX+11+ox,HY+16+oy,oz3+6,104,114,130,a,LXRef.current,LYRef.current,.35,.9,wireRef.current);
            box3D(ctx,proj,HX-.5+ox,HY-13+oy,oz3+5.5,HX+3.5+ox,HY+3+oy,oz3+9.5,210,215,225,a,LXRef.current,LYRef.current,.18,.94,wireRef.current);
            if(!wireRef.current&&a>.4){
              [HY-23,HY+23].forEach(ty=>{
                const tp=proj(HX+3.5+ox,ty+oy,oz3+1);
                const rg=ctx.createRadialGradient(tp.px-tp.sc,tp.py-tp.sc,.5,tp.px,tp.py,4.5*tp.sc);
                rg.addColorStop(0,'#505860');rg.addColorStop(.5,'#282e3a');rg.addColorStop(1,'#141820');
                ctx.globalAlpha=a;ctx.beginPath();ctx.arc(tp.px,tp.py,4.5*tp.sc,0,Math.PI*2);ctx.fillStyle=rg;ctx.fill();
                ctx.strokeStyle='rgba(0,0,0,.7)';ctx.lineWidth=.8;ctx.stroke();
                ctx.strokeStyle='rgba(80,92,112,.85)';ctx.lineWidth=1;
                ctx.beginPath();ctx.moveTo(tp.px-2.8*tp.sc,tp.py);ctx.lineTo(tp.px+2.8*tp.sc,tp.py);ctx.stroke();
                ctx.beginPath();ctx.moveTo(tp.px,tp.py-2.8*tp.sc);ctx.lineTo(tp.px,tp.py+2.8*tp.sc);ctx.stroke();
                ctx.globalAlpha=1;
              });
            }
            if((ex>.45||fly.act)&&a>.3)label3D(ctx,proj(HX+5+ox,HY+oy,oz3+4).px,proj(HX+5+ox,HY+oy,oz3+4).py,'MANEJADOR','#9ca3af',(ex>.45?Math.min(1,(ex-.45)/.4):0)*a+fly.la*.5);
          }
        });

        // Rodachinas
        list.push({ id:10+i*5+3, name:`Rodachinas H${i+1}`, col:'#4a5568', isPanel:true, panelIdx:i,
          cx:(PL+PR)/2, cy:PB+36*ex, cz:pZ-10,
          draw(ctx,proj,a,fly){
            const ox=fly.x,oy=fly.y+36*ex,oz4=pZ-10+fly.z;
            ctx.globalAlpha=a;
            [.28,.72].forEach(f=>drawWheel(ctx,proj,PL+pw*f+ox,PB+oy,oz4));
            ctx.globalAlpha=1;
            if((ex>.4||fly.act)&&a>.3)label3D(ctx,proj((PL+PR)/2+ox,PB+oy,oz4).px,proj((PL+PR)/2+ox,PB+oy,oz4).py,'RODACHINAS','#6b7280',(ex>.4?Math.min(1,(ex-.4)/.4):0)*a+fly.la*.5);
          }
        });
      }
    });

    return list;
  }

  /* ── fly-out offset — clamped so piece stays visible ─── */
  function getFly(piece){
    const t=flyRefs.current[piece.id]||0;
    const ease=easeCubic(t);
    if(ease<0.01)return{x:0,y:0,z:0,la:0,act:false};
    // Direction outward from scene center, but limit to 75px max in any axis
    // so the piece always stays well inside the canvas viewport.
    const cx=piece.cx||0, cy=piece.cy||0, cz=piece.cz||0;
    const mag=Math.sqrt(cx*cx+cy*cy+(cz*cz)*.4)||1;
    // Max displacement: 80 scene-units (roughly 60-70px on canvas)
    const MAX=80;
    const dist=MAX*ease;
    return{
      x:Math.max(-MAX,Math.min(MAX,(cx/mag)*dist)),
      y:Math.max(-MAX,Math.min(MAX,(cy/mag)*dist)),
      z:Math.max(-MAX,Math.min(MAX,(cz/mag*.4)*dist)),
      la:ease,
      act:ease>.06
    };
  }

  /* ── global alpha for pieces ─────────────────────── */
  function getAlpha(pieceId){
    const bp=buildRef.current;
    if(selRef.current===-1)return bp;
    if(selRef.current===pieceId)return bp;
    const t=flyRefs.current[selRef.current]||0;
    const ease=easeCubic(t);
    return bp*(1-ease*.84);
  }

  /* ── WALL: sky colors by time ──────────────────────── */
  function timeToSky(t){
    function lc(a,b,p){const pa=a.match(/[\da-f]{2}/gi).map(h=>parseInt(h,16));const pb=b.match(/[\da-f]{2}/gi).map(h=>parseInt(h,16));return`rgb(${pa.map((v,i)=>(v+(pb[i]-v)*p)|0).join(',')})`;}
    if(t<.08) return{top:'#0a0a1a',bot:'#1a1230',gr:'#0d0d18',grDk:'#050508',glT:'rgba(20,20,50,.7)',glB:'rgba(10,10,30,.8)',gR:20,gG:30,gB:15};
    if(t<.2){const p2=(t-.08)/.12;return{top:lc('#0a0a1a','#1a1260',p2),bot:lc('#1a1230','#ff7020',p2),gr:lc('#0d0d18','#3a2820',p2),grDk:lc('#050508','#1a1010',p2),glT:`rgba(${(20+p2*60)|0},${(20+p2*40)|0},${(50+p2*20)|0},.6)`,glB:`rgba(${(10+p2*40)|0},${(10+p2*30)|0},${(30+p2*10)|0},.7)`,gR:(20+p2*30)|0,gG:(30+p2*50)|0,gB:(15+p2*20)|0};}
    if(t<.35){const p2=(t-.2)/.15;return{top:lc('#1a1260','#4488cc',p2),bot:lc('#ff7020','#88ccff',p2),gr:lc('#3a2820','#5a6840',p2),grDk:lc('#1a1010','#2a3820',p2),glT:`rgba(${(80+p2*80)|0},${(120+p2*80)|0},${(200+p2*40)|0},.45)`,glB:`rgba(${(40+p2*40)|0},${(80+p2*60)|0},${(160+p2*40)|0},.5)`,gR:(50+p2*30)|0,gG:(80+p2*60)|0,gB:(35+p2*20)|0};}
    if(t<.65) return{top:'#1a7aff',bot:'#b8e8ff',gr:'#6a8050',grDk:'#3a5028',glT:'rgba(140,190,240,.38)',glB:'rgba(100,160,220,.45)',gR:80,gG:140,gB:55};
    if(t<.8){const p2=(t-.65)/.15;return{top:lc('#1a7aff','#ff8820',p2),bot:lc('#b8e8ff','#ff6020',p2),gr:lc('#6a8050','#7a6040',p2),grDk:lc('#3a5028','#4a3820',p2),glT:`rgba(${(140-p2*60)|0},${(130-p2*60)|0},${(200-p2*80)|0},.4)`,glB:`rgba(${(100-p2*40)|0},${(90-p2*50)|0},${(160-p2*60)|0},.5)`,gR:(80+p2*20)|0,gG:(140-p2*60)|0,gB:(55-p2*20)|0};}
    const p2=(t-.8)/.2;return{top:lc('#ff8820','#0a0a1a',p2),bot:lc('#ff6020','#1a1230',p2),gr:lc('#7a6040','#0d0d18',p2),grDk:lc('#4a3820','#050508',p2),glT:`rgba(${(80-p2*60)|0},${(70-p2*50)|0},${(120-p2*70)|0},.5)`,glB:`rgba(${(60-p2*50)|0},${(50-p2*40)|0},${(90-p2*60)|0},.6)`,gR:(100-p2*80)|0,gG:(80-p2*50)|0,gB:(35-p2*20)|0};
  }

  /* ── WALL: brick texture ────────────────────────────── */
  function drawBricks(ctx,wx,wy,ww,wh){
    const bW=40,bH=17,mortar=3;
    for(let row=0;row*(bH+mortar)<wh;row++){
      const offset=row%2===0?0:bW/2;
      for(let col=-1;col*(bW+mortar)<ww+bW;col++){
        const bx=wx+offset+col*(bW+mortar),by=wy+row*(bH+mortar);
        const clx=Math.max(bx,wx),cly=Math.max(by,wy);
        const crx=Math.min(bx+bW,wx+ww),cry=Math.min(by+bH,wy+wh);
        if(crx<=clx||cry<=cly)continue;
        const v=Math.sin(col*7.3+row*13.1)*.08+Math.cos(col*3.1-row*5.7)*.05;
        const r=(168+v*80)|0,g=(88+v*40)|0,bv=(62+v*30)|0;
        ctx.fillStyle=`rgb(${Math.min(255,r)},${Math.min(255,g)},${Math.min(255,bv)})`;
        ctx.fillRect(clx,cly,crx-clx,cry-cly);
        ctx.fillStyle='rgba(255,200,150,.07)';ctx.fillRect(clx,cly,crx-clx,2);
        ctx.fillStyle='rgba(0,0,0,.14)';ctx.fillRect(clx,cry-2,crx-clx,2);
      }
    }
    for(let row=0;row*(bH+mortar)<=wh;row++){ctx.fillStyle='rgba(195,178,155,.55)';ctx.fillRect(wx,wy+row*(bH+mortar)+bH,ww,mortar);}
  }

  /* ── WALL: start step-by-step build ─────────────────── */
  function startWallBuild(){
    wallDoneRef.current = new Set();
    wallStepRef.current = 0;
    wallDoneAllRef.current = false;
    setWallLog('');
    scheduleWallStep();
  }

  function getWallSteps(){
    const base=['wall','rough','repello','cabezal','sillar','jamba_izq','jamba_der','riel_sup','riel_inf'];
    panels.forEach((_,i)=>base.push(`panel_${i}`));
    base.push('sellado','acabado');
    return base;
  }

  const WALL_NAMES={wall:'Muro de ladrillo',rough:'Vano bruto',repello:'Repello reveals',cabezal:'Perfil cabezal ALU',sillar:'Perfil sillar ALU',jamba_izq:'Jamba izquierda ALU',jamba_der:'Jamba derecha ALU',riel_sup:'Riel superior guía',riel_inf:'Riel inferior carril',sellado:'Sellado silicona',acabado:'Acabado final'};

  function scheduleWallStep(){
    const steps=getWallSteps();
    if(wallStepRef.current>=steps.length){ wallDoneAllRef.current=true; setWallLog('✓ Instalación completada'); return; }
    const delay=wallStepRef.current===0?500:360;
    setTimeout(()=>{
      const s=steps[wallStepRef.current];
      if(s){
        wallDoneRef.current.add(s);
        const pNm=s.startsWith('panel_')?panels[+s.split('_')[1]]?`Hoja X${+s.split('_')[1]+1}`:`Hoja O${+s.split('_')[1]+1}`:(WALL_NAMES[s]||s);
        setWallLog('▶ '+pNm.toUpperCase());
        forceR(n=>n+1);
      }
      wallStepRef.current++;
      scheduleWallStep();
    }, delay);
  }

  /* ── WALL DRAW ──────────────────────────────────────── */
  function drawWall(ctx, W, H){
    ctx.clearRect(0,0,W,H);
    const t=timeRef.current;
    const amb=ambRef.current;
    const sky=timeToSky(t);

    // Sky
    const skyGr=ctx.createLinearGradient(0,0,0,H*.62);
    skyGr.addColorStop(0,sky.top);skyGr.addColorStop(1,sky.bot);
    ctx.fillStyle=skyGr;ctx.fillRect(0,0,W,H*.62);

    // Sun/moon
    const sunX=W*(.1+t*.8),sunY=H*(.05+.16*(1-Math.sin(t*Math.PI)));
    if(t>.08&&t<.92){
      const sg=ctx.createRadialGradient(sunX,sunY,2,sunX,sunY,t>.5?26:18);
      sg.addColorStop(0,t<.15||t>.85?'rgba(255,140,60,.95)':'rgba(255,230,120,.92)');
      sg.addColorStop(.5,t<.15||t>.85?'rgba(255,100,30,.5)':'rgba(255,210,80,.4)');
      sg.addColorStop(1,'rgba(0,0,0,0)');
      ctx.beginPath();ctx.arc(sunX,sunY,t>.5?26:18,0,Math.PI*2);ctx.fillStyle=sg;ctx.fill();
    }

    // Ground
    const groundY=H*.68;
    const grdGr=ctx.createLinearGradient(0,groundY,0,H);
    grdGr.addColorStop(0,sky.gr);grdGr.addColorStop(1,sky.grDk);
    ctx.fillStyle=grdGr;ctx.fillRect(0,groundY,W,H-groundY);
    for(let i=0;i<W;i+=4){ctx.fillStyle=`rgba(${sky.gR},${sky.gG},${sky.gB},${.18+Math.sin(i*.3)*.07})`;ctx.fillRect(i,groundY-1,2,3);}

    const D=wallDoneRef.current;
    if(!D.has('wall'))return;

    const wX=W*.11,wY=H*.07,wW=W*.78,wH=H*.62;

    // Wall shadow
    ctx.fillStyle=`rgba(0,0,0,${(.4+t*.25)*amb*.35})`;ctx.fillRect(wX+14,wY+14,wW,wH);

    // Wall surface
    const wallFill=D.has('acabado')?'rgba(218,205,180,1)':'rgba(155,138,115,1)';
    ctx.fillStyle=wallFill;ctx.fillRect(wX,wY,wW,wH);
    drawBricks(ctx,wX,wY,wW,wH);

    // Wall ambient light gradient
    const wl=ctx.createLinearGradient(wX,wY,wX+wW,wY+wH);
    const la=(.12+t*.09)*amb;
    wl.addColorStop(0,`rgba(255,230,180,${la})`);wl.addColorStop(.5,'rgba(0,0,0,0)');wl.addColorStop(1,`rgba(0,0,0,${la*.6})`);
    ctx.fillStyle=wl;ctx.fillRect(wX,wY,wW,wH);

    // Window opening dimensions
    const openW=wW*.40,openH=wH*.50;
    const oX=wX+(wW-openW)/2,oY=wY+(wH-openH)/2;
    const depth=16;

    if(D.has('rough')){
      // Lintel reveals — depth side faces
      ctx.fillStyle='rgba(105,90,70,1)';ctx.fillRect(oX-depth,oY-depth,openW+depth*2,depth);  // top
      ctx.fillStyle='rgba(95,82,62,1)';ctx.fillRect(oX-depth,oY,depth,openH);                 // left side
      ctx.fillStyle='rgba(118,105,82,1)';ctx.fillRect(oX+openW,oY,depth,openH);               // right side
      ctx.fillStyle='rgba(95,82,62,1)';ctx.fillRect(oX-depth,oY+openH,openW+depth*2,depth);   // bottom
      // The hole
      const intCol=t>.1&&t<.9?'rgba(32,22,14,.92)':'rgba(8,4,2,.97)';
      ctx.fillStyle=intCol;ctx.fillRect(oX,oY,openW,openH);
      // Interior warm glow (light from inside room)
      if(t>.2&&t<.8){
        const ig=ctx.createRadialGradient(oX+openW/2,oY+openH*.65,0,oX+openW/2,oY+openH*.65,openW*.65);
        ig.addColorStop(0,'rgba(255,200,100,.20)');ig.addColorStop(1,'rgba(0,0,0,0)');
        ctx.fillStyle=ig;ctx.fillRect(oX,oY,openW,openH);
      }
    }

    // Repello on reveals
    if(D.has('repello')){
      ctx.fillStyle='rgba(192,180,160,1)';
      ctx.fillRect(oX-depth,oY,depth-1,openH);
      ctx.fillRect(oX+openW+1,oY,depth-1,openH);
      ctx.fillRect(oX-depth,oY-depth,openW+depth*2,depth-1);
      ctx.fillRect(oX-depth,oY+openH+1,openW+depth*2,depth-1);
    }

    // Profile thickness
    const pT=13,rT=7;
    const aluH='#e8eae8',aluM='#c8ccc8',aluD='#9aa09a';

    function prof3D(x,y,w,h,face='front'){
      // draws a profile bar with 3D appearance
      if(face==='top'||face==='bot'){
        ctx.fillStyle=face==='top'?aluH:aluD;ctx.fillRect(x,y,w,h*.6);
        ctx.fillStyle=aluM;ctx.fillRect(x,y+h*.6,w,h*.4);
        ctx.fillStyle='rgba(0,0,0,.12)';ctx.fillRect(x,face==='top'?y+h:y,w,2);
        // profile groove
        ctx.fillStyle='rgba(0,0,0,.1)';ctx.fillRect(x+4,face==='top'?y+h*.35:y+h*.2,w-8,2);
      } else {
        ctx.fillStyle=face==='left'?aluH:aluD;ctx.fillRect(x,y,w*.6,h);
        ctx.fillStyle=aluM;ctx.fillRect(x+w*.6,y,w*.4,h);
        ctx.fillStyle='rgba(0,0,0,.12)';ctx.fillRect(face==='left'?x+w:x,y,2,h);
        ctx.fillStyle='rgba(0,0,0,.1)';ctx.fillRect(face==='left'?x+w*.35:x+w*.2,y+4,2,h-8);
      }
    }

    if(D.has('cabezal')){prof3D(oX,oY,openW,pT,'top');// shadow below
      ctx.fillStyle=`rgba(0,0,0,${.18*amb})`;ctx.fillRect(oX+4,oY+pT,openW-4,4);}
    if(D.has('sillar')){prof3D(oX,oY+openH-pT,openW,pT,'bot');
      ctx.fillStyle=`rgba(0,0,0,${.1*amb})`;ctx.fillRect(oX,oY+openH-pT-3,openW,3);}
    if(D.has('jamba_izq')){prof3D(oX,oY,pT,openH,'left');
      ctx.fillStyle=`rgba(0,0,0,${.15*amb})`;ctx.fillRect(oX+pT,oY+4,4,openH-4);}
    if(D.has('jamba_der')){prof3D(oX+openW-pT,oY,pT,openH,'right');
      ctx.fillStyle=`rgba(0,0,0,${.08*amb})`;ctx.fillRect(oX+openW-pT-3,oY,3,openH);}
    if(D.has('riel_sup')){
      const ry=oY+pT;
      ctx.fillStyle='#9aacbe';ctx.fillRect(oX+pT,ry,openW-pT*2,rT);
      ctx.fillStyle='#7a8eaa';ctx.fillRect(oX+pT,ry+rT*.65,openW-pT*2,rT*.35);
      ctx.fillStyle='rgba(0,0,0,.18)';ctx.fillRect(oX+pT,ry+rT,openW-pT*2,2);
    }
    if(D.has('riel_inf')){
      const ry=oY+openH-pT-rT;
      ctx.fillStyle='rgba(0,0,0,.12)';ctx.fillRect(oX+pT,ry-2,openW-pT*2,2);
      ctx.fillStyle='#7a8eaa';ctx.fillRect(oX+pT,ry,openW-pT*2,rT*.35);
      ctx.fillStyle='#9aacbe';ctx.fillRect(oX+pT,ry+rT*.35,openW-pT*2,rT*.65);
    }

    // Panels
    const pInnerW=openW-pT*2,pInnerH=openH-pT*2-rT*2;
    const pBaseX=oX+pT,pBaseY=oY+pT+rT;
    const panelW=pInnerW/NP;

    panels.forEach((isMov,i)=>{
      if(!D.has(`panel_${i}`))return;
      const oa=openRef.current[i]||0;
      const dir=getPanelDir(panels,i);
      const slideW=oa*panelW*.82;
      const drawX=pBaseX+panelW*i+dir*slideW;

      // Glass
      const gX=drawX+5,gY=pBaseY+5,gW=panelW-10,gH=pInnerH-10;
      const gGr=ctx.createLinearGradient(gX,gY,gX,gY+gH);
      gGr.addColorStop(0,sky.glT);gGr.addColorStop(1,sky.glB);
      ctx.fillStyle=gGr;ctx.fillRect(gX,gY,gW,gH);
      // glass reflection strip
      const rfW=gW*.32;
      const rfGr=ctx.createLinearGradient(gX,gY,gX+rfW,gY+gH*.8);
      rfGr.addColorStop(0,'rgba(255,255,255,.48)');rfGr.addColorStop(.4,'rgba(255,255,255,.10)');rfGr.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=rfGr;ctx.fillRect(gX,gY,rfW,gH);
      ctx.strokeStyle=isMov?'rgba(59,130,246,.45)':'rgba(71,85,105,.3)';ctx.lineWidth=1.2;ctx.strokeRect(gX+.6,gY+.6,gW-1.2,gH-1.2);

      // Panel frame
      const fc=isMov?'#5888cc':'#5a6478';
      const fH=isMov?'#78a8ee':'#7a8498';
      const fD=isMov?'#3868ac':'#3a4458';
      [[drawX,pBaseY,panelW,5,'t'],[drawX,pBaseY+pInnerH-5,panelW,5,'b'],[drawX,pBaseY,5,pInnerH,'l'],[drawX+panelW-5,pBaseY,5,pInnerH,'r']].forEach(([px,py,pw,ph,s])=>{
        ctx.fillStyle=s==='t'||s==='l'?fH:fD;ctx.fillRect(px,py,pw,ph);
        ctx.fillStyle='rgba(0,0,0,.14)';
        if(s==='t')ctx.fillRect(px,py+ph-1,pw,1);
        if(s==='b')ctx.fillRect(px,py,pw,1);
        if(s==='l')ctx.fillRect(px+pw-1,py,1,ph);
        if(s==='r')ctx.fillRect(px,py,1,ph);
      });

      if(isMov){
        // Handle
        const hX=dir>0?drawX+7:drawX+panelW-16,hY=pBaseY+pInnerH/2;
        ctx.fillStyle='#2e3848';ctx.fillRect(hX,hY-20,8,40);
        ctx.fillStyle='#4a5668';ctx.fillRect(hX+1,hY-15,6,30);
        ctx.fillStyle='rgba(255,255,255,.16)';ctx.fillRect(hX+2,hY-13,2,26);
        [hY-15,hY+15].forEach(ty=>{
          ctx.fillStyle='#151c26';ctx.beginPath();ctx.arc(hX+4,ty,2.8,0,Math.PI*2);ctx.fill();
          ctx.strokeStyle='rgba(80,90,110,.7)';ctx.lineWidth=.7;
          ctx.beginPath();ctx.moveTo(hX+2.2,ty);ctx.lineTo(hX+5.8,ty);ctx.stroke();
          ctx.beginPath();ctx.moveTo(hX+4,ty-2);ctx.lineTo(hX+4,ty+2);ctx.stroke();
        });
        // Rodachinas
        const pw2=pInnerW/NP;
        [pBaseX+panelW*i+pw2*.25+dir*slideW, pBaseX+panelW*i+pw2*.72+dir*slideW].forEach(rx=>{
          ctx.fillStyle='#1e2530';ctx.beginPath();ctx.ellipse(rx,pBaseY+pInnerH+1,5.5,3.5,0,0,Math.PI*2);ctx.fill();
          ctx.strokeStyle='rgba(0,0,0,.4)';ctx.lineWidth=.5;ctx.stroke();
          const wg=ctx.createRadialGradient(rx-1,pBaseY+pInnerH,0,rx,pBaseY+pInnerH,4);
          wg.addColorStop(0,'#4a5260');wg.addColorStop(1,'#252c38');
          ctx.fillStyle=wg;ctx.beginPath();ctx.ellipse(rx,pBaseY+pInnerH,3.5,2.2,0,0,Math.PI*2);ctx.fill();
          ctx.beginPath();ctx.ellipse(rx,pBaseY+pInnerH,1.5,.9,0,0,Math.PI*2);ctx.fillStyle='#a0a8b4';ctx.fill();
        });
        // Opening shadow
        if(oa>.01){
          ctx.fillStyle='rgba(0,0,0,.38)';
          const gapX=dir>0?pBaseX+panelW*i:pBaseX+panelW*i+panelW+dir*slideW;
          ctx.fillRect(gapX,pBaseY,Math.abs(slideW),pInnerH);
        }
        // Hover / open indicator
        if(hovRef.current===i&&buildDoneRef.current&&!oa){
          ctx.strokeStyle='rgba(59,130,246,.75)';ctx.lineWidth=1.8;ctx.strokeRect(drawX+1,pBaseY+1,panelW-2,pInnerH-2);
          ctx.fillStyle='rgba(0,0,0,.6)';ctx.fillRect(drawX+panelW/2-22,pBaseY+pInnerH/2-9,44,18);
          ctx.fillStyle='#93c5fd';ctx.font=`bold 9px ${MONO_FONT}`;ctx.textAlign='center';ctx.textBaseline='middle';
          ctx.fillText('ABRIR →',drawX+panelW/2,pBaseY+pInnerH/2);
        }
        if(oa>.05){
          ctx.fillStyle='rgba(0,0,0,.65)';ctx.fillRect(drawX+panelW/2-16,pBaseY+pInnerH/2-9,32,18);
          ctx.fillStyle='#93c5fd';ctx.font=`bold 9px ${MONO_FONT}`;ctx.textAlign='center';ctx.textBaseline='middle';
          ctx.fillText(`${Math.round(oa*100)}%`,drawX+panelW/2,pBaseY+pInnerH/2);
        }
      }
    });

    // Silicone bead
    if(D.has('sellado')){
      ctx.strokeStyle='rgba(25,25,25,.65)';ctx.lineWidth=3.5;ctx.strokeRect(oX+.5,oY+.5,openW-1,openH-1);
      ctx.strokeStyle='rgba(15,15,15,.4)';ctx.lineWidth=1.5;ctx.strokeRect(oX+2,oY+2,openW-4,openH-4);
    }

    // Final paint reveal
    if(D.has('acabado')){
      const fc2='rgba(212,198,175,1)';
      ctx.fillStyle=fc2;
      ctx.fillRect(oX-depth,oY-depth,depth-1,openH+depth*2);
      ctx.fillRect(oX+openW+1,oY-depth,depth-1,openH+depth*2);
      ctx.fillRect(oX-depth,oY-depth,openW+depth*2,depth-1);
      ctx.fillRect(oX-depth,oY+openH+1,openW+depth*2,depth-1);
    }

    // Cast shadow from sun
    if(D.has('cabezal')&&t>.12&&t<.88){
      const sunAngleX=(t-.5)*2;
      const shadowLen=16*(1-Math.abs(sunAngleX)*.45);
      const offX=sunAngleX*shadowLen*.75;
      const sA=.22*(1-Math.abs(t-.5)*1.6)*amb;
      if(sA>0){
        ctx.fillStyle=`rgba(0,0,0,${sA})`;
        ctx.fillRect(oX+Math.max(0,offX),oY-shadowLen*.28,openW-Math.abs(offX),shadowLen*.4);
        if(offX>0)ctx.fillRect(oX+openW,oY+offX*.25,shadowLen*.6*offX,openH);
        else if(offX<0)ctx.fillRect(oX+offX*1.05,-offX*.25+oY,shadowLen*.6*Math.abs(offX),openH);
      }
    }

    // Labels
    if(showLbl&&wallDoneAllRef.current){
      ctx.font=`600 8px ${MONO_FONT}`;
      [[oX+openW/2,oY-22,'CABEZAL ALU','#b2bac8'],[oX+openW/2,oY+openH+18,'SILLAR ALU','#b2bac8'],
       [oX+openW+54,oY+openH*.35,'VIDRIO 5mm','#60a0d8'],[oX-54,oY+openH*.65,'JAMBA ALU','#b2bac8']
      ].forEach(([x,y,txt,col])=>{
        const tw=ctx.measureText(txt).width+10;
        ctx.fillStyle='rgba(0,0,0,.75)';ctx.fillRect(x-tw/2,y-7,tw,14);
        ctx.strokeStyle=col;ctx.lineWidth=.6;ctx.strokeRect(x-tw/2,y-7,tw,14);
        ctx.fillStyle=col;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(txt,x,y);
      });
      // Dimension lines
      const mc='rgba(96,165,250,.7)';
      ctx.strokeStyle=mc;ctx.lineWidth=1;ctx.setLineDash([3,3]);
      ctx.beginPath();ctx.moveTo(oX,oY+openH+32);ctx.lineTo(oX+openW,oY+openH+32);ctx.stroke();
      [oX,oX+openW].forEach(x=>{ctx.beginPath();ctx.moveTo(x,oY+openH+27);ctx.lineTo(x,oY+openH+37);ctx.stroke();});
      ctx.setLineDash([]);ctx.fillStyle=mc;ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.font=`600 9px ${MONO_FONT}`;ctx.fillText(`${Math.round(openW/wW*210)} cm`,oX+openW/2,oY+openH+32);
    }
  }

  /* ── MAIN DRAW ───────────────────────────────────── */
  function draw(){
    const cv=cvRef.current; if(!cv)return;
    const dpr=window.devicePixelRatio||1;
    const W=cv.width/dpr, H=cv.height/dpr;
    const ctx=cv.getContext('2d');

    // Route to wall view
    if(activeViewRef.current===1){ drawWall(ctx,W,H); return; }

    ctx.clearRect(0,0,W,H);

    const LX=LXRef.current, LY=LYRef.current;
    const wireMode=wireRef.current;
    const bp=buildRef.current;
    const ex=explodeRef.current;
    const {x:rX, y:rY}=rotRef.current;
    const zoom=zoomRef.current;

    // Apply zoom via canvas transform (scale around centre)
    ctx.save();
    ctx.translate(W/2,H/2);
    ctx.scale(zoom,zoom);
    ctx.translate(-W/2,-H/2);

    const proj=mkProj(W,H,rX,rY);
    const IW=IR-IL, pw=IW/NP;

    // Background
    if(envRef.current){
      const eg=ctx.createLinearGradient(0,0,0,H*.7);
      eg.addColorStop(0,'#091422');eg.addColorStop(.5,'#0c2035');eg.addColorStop(1,'#091422');
      ctx.fillStyle=eg;ctx.fillRect(0,0,W,H);
      for(let i=0;i<60;i++){const sx=((i*137.5)%W),sy=((i*73.1)%(H*.88)),r=.5+(i%3)*.6;ctx.beginPath();ctx.arc(sx,sy,r,0,Math.PI*2);ctx.fillStyle=`rgba(255,255,255,${.18+(i%4)*.07})`;ctx.fill();}
    } else {
      const bg=ctx.createRadialGradient(W/2,H*.45,8,W/2,H*.45,Math.max(W,H)*.92);
      bg.addColorStop(0,'#0f1c30');bg.addColorStop(.6,'#0a1220');bg.addColorStop(1,'#060c14');
      ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
      ctx.strokeStyle='rgba(37,99,235,.02)';ctx.lineWidth=.35;
      for(let i=0;i<=18;i++){ctx.beginPath();ctx.moveTo(i*W/18,0);ctx.lineTo(i*W/18,H);ctx.stroke();}
      for(let i=0;i<=11;i++){ctx.beginPath();ctx.moveTo(0,i*H/11);ctx.lineTo(W,i*H/11);ctx.stroke();}
    }

    // ── ASSEMBLED FRAME (only when not exploded and no piece selected) ──
    if(bp>.08&&ex<.05&&selRef.current===-1){
      const mA=Math.min(1,bp/.38);ctx.globalAlpha=mA;
      box3D(ctx,proj,SL,ST,-FD*.55,SR,ST+FT,0,...ALU,1,LX,LY,.45,.88,wireMode);
      box3D(ctx,proj,SL,SB-FT,-FD*.55,SR,SB,0,...ALU,1,LX,LY,.45,.88,wireMode);
      box3D(ctx,proj,SL,ST+FT,-FD*.55,SL+FT,SB-FT,0,...ALU,1,LX,LY,.45,.88,wireMode);
      box3D(ctx,proj,SR-FT,ST+FT,-FD*.55,SR,SB-FT,0,...ALU,1,LX,LY,.45,.88,wireMode);
      box3D(ctx,proj,IL,IT,0,IR,IT+7,-FD*.4,...RIL,1,LX,LY,.5,.75,wireMode);
      box3D(ctx,proj,IL,IB-7,0,IR,IB,-FD*.4,...RIL,1,LX,LY,.5,.75,wireMode);
      if(!wireMode){
        [[SL+8,ST+8],[SR-8,ST+8],[SL+8,SB-8],[SR-8,SB-8],[0,ST+6],[0,SB-6]].forEach(([x,y])=>drawScrew(ctx,proj,x,y,.5));
        [[ST+FT,ST+FT+7],[SB-FT-7,SB-FT]].forEach(([ya,yb])=>{
          const p1=proj(IL,ya,0),p2=proj(IR,ya,0);
          ctx.lineWidth=3;ctx.strokeStyle='rgba(45,70,28,.52)';ctx.beginPath();ctx.moveTo(p1.px,p1.py);ctx.lineTo(p2.px,p2.py);ctx.stroke();
          ctx.lineWidth=1.8;ctx.strokeStyle='rgba(37,99,235,.36)';ctx.beginPath();ctx.moveTo(proj(IL,yb,0).px,proj(IL,yb,0).py);ctx.lineTo(proj(IR,yb,0).px,proj(IR,yb,0).py);ctx.stroke();
        });
      }
      ctx.globalAlpha=1;
    }

    // ── ASSEMBLED PANELS (only when not exploded, no selection) ─────────
    if(ex<.05&&selRef.current===-1){
      panels.forEach((panel,i)=>{
        const ps=.28+(i/NP)*.34,pe=ps+.32;
        const pA=Math.min(1,Math.max(0,(bp-ps)/(pe-ps)));
        if(pA<=0)return;
        ctx.globalAlpha=pA;
        const dir=getPanelDir(panels,i);
        const oa=openRef.current[i]||0, slide=dir*oa*pw*.82;
        const PL=IL+pw*i+slide, PR=PL+pw, PT=IT, PB=IB;
        const PC=panel.m?[32,90,198]:[58,68,84];
        const isHov=hovRef.current===i&&buildDoneRef.current;

        box3D(ctx,proj,PL,PT,-FD*.56,PL+VT,PB,0,...PC,1,LX,LY,.35,.88,wireMode);
        box3D(ctx,proj,PR-VT,PT,-FD*.56,PR,PB,0,...PC,1,LX,LY,.35,.88,wireMode);
        box3D(ctx,proj,PL+VT,PT,-FD*.56,PR-VT,PT+VT,0,...PC,1,LX,LY,.35,.88,wireMode);
        box3D(ctx,proj,PL+VT,PB-VT,-FD*.56,PR-VT,PB,0,...PC,1,LX,LY,.35,.88,wireMode);
        if(!wireMode){
          [[PT+VT+1.5,PT+VT+3.5],[PB-VT-3.5,PB-VT-1.5]].forEach(([ya,yb])=>{
            const sv=[[PL+VT,ya,0],[PR-VT,ya,0],[PR-VT,yb,0],[PL+VT,yb,0]].map(v=>proj(v[0],v[1],v[2]));
            faceP(ctx,sv,'rgba(26,48,22,.9)','rgba(52,88,45,.45)',.4);
          });
        }
        glassPBR(ctx,proj,PL+VT,PT+VT,0,PR-VT,PB-VT,-FD*.45,panel.m,pA,wireMode);

        // Handle + wheels for movable panels (assembled view)
        // FIX v49: respetar el toggle de accesorios (accRef) — si está OFF, no
        // se dibujan manija, tornillos ni ruedas.
        if(panel.m&&buildDoneRef.current&&accRef.current){
          const dir2=getPanelDir(panels,i);
          const HX=dir2>0?PL+12:PR-20, HY=(PT+PB)/2;
          box3D(ctx,proj,HX-1.5,HY-26,0,HX+9,HY+26,2,80,88,102,pA,LX,LY,.4,.85,wireMode);
          box3D(ctx,proj,HX-2.5,HY-16,2,HX+11,HY+16,6,104,114,130,pA,LX,LY,.35,.9,wireMode);
          box3D(ctx,proj,HX-.5,HY-13,5.5,HX+3.5,HY+3,9.5,210,215,225,pA,LX,LY,.18,.94,wireMode);
          // FIX v49: tornillos y ruedas. Los tornillos (detalle PBR) solo en
          // sólido; las ruedas ahora también en wire (drawWheel con flag wire),
          // para que los accesorios se vean en wireframe como el resto.
          if(!wireMode){
            [HY-23,HY+23].forEach(ty=>{
              const tp=proj(HX+3.5,ty,1);
              const rg=ctx.createRadialGradient(tp.px-tp.sc,tp.py-tp.sc,.5,tp.px,tp.py,4.5*tp.sc);
              rg.addColorStop(0,'#505860');rg.addColorStop(.5,'#282e3a');rg.addColorStop(1,'#141820');
              ctx.globalAlpha=pA;ctx.beginPath();ctx.arc(tp.px,tp.py,4.5*tp.sc,0,Math.PI*2);ctx.fillStyle=rg;ctx.fill();
              ctx.strokeStyle='rgba(0,0,0,.7)';ctx.lineWidth=.8;ctx.stroke();
              ctx.strokeStyle='rgba(80,92,112,.85)';ctx.lineWidth=1;
              ctx.beginPath();ctx.moveTo(tp.px-2.8*tp.sc,tp.py);ctx.lineTo(tp.px+2.8*tp.sc,tp.py);ctx.stroke();
              ctx.beginPath();ctx.moveTo(tp.px,tp.py-2.8*tp.sc);ctx.lineTo(tp.px,tp.py+2.8*tp.sc);ctx.stroke();
              ctx.globalAlpha=1;
            });
          }
          [.26,.74].forEach(f=>drawWheel(ctx,proj,PL+pw*f,IB-VT*.5,0,wireMode));

          // Open/hover indicator
          const oa2=openRef.current[i]||0;
          if(!oa2||oa2<.05){
            const cp=proj((PL+PR)/2,(PT+PB)/2,.5);
            ctx.globalAlpha=isHov?pA*.92:pA*.32;
            if(isHov){
              ctx.fillStyle='rgba(0,0,0,.70)';ctx.beginPath();ctx.arc(cp.px,cp.py,24*cp.sc,0,Math.PI*2);ctx.fill();
              ctx.strokeStyle='rgba(59,130,246,.7)';ctx.lineWidth=1.2;ctx.stroke();
              ctx.fillStyle='#93c5fd';ctx.font=`bold ${Math.round(9*cp.sc)}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('ABRIR',cp.px,cp.py-10*cp.sc);
              ctx.fillStyle='rgba(255,255,255,.9)';ctx.font=`bold ${Math.round(17*cp.sc)}px sans-serif`;ctx.fillText('↔',cp.px,cp.py+4*cp.sc);
            } else {
              ctx.fillStyle='rgba(255,255,255,.88)';ctx.font=`bold ${Math.round(17*cp.sc)}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('↔',cp.px,cp.py);
            }
            ctx.globalAlpha=pA;
          } else {
            const cp=proj((PL+PR)/2,(PT+PB)/2,.5);
            ctx.globalAlpha=.9*pA;
            ctx.beginPath();ctx.arc(cp.px,cp.py,22*cp.sc,0,Math.PI*2);ctx.fillStyle='rgba(0,0,0,.78)';ctx.fill();
            ctx.strokeStyle='rgba(59,130,246,.6)';ctx.lineWidth=1;ctx.stroke();
            ctx.fillStyle='#93c5fd';ctx.font=`bold ${Math.round(11*cp.sc)}px ${MONO_FONT}`;ctx.textAlign='center';ctx.textBaseline='middle';
            ctx.fillText(`${Math.round(oa2*100)}%`,cp.px,cp.py-5*cp.sc);
            ctx.font=`${Math.round(7*cp.sc)}px sans-serif`;ctx.fillStyle='rgba(200,200,200,.7)';ctx.fillText('✕ cerrar',cp.px,cp.py+8*cp.sc);
            ctx.globalAlpha=pA;
          }
        }

        // Opening shadow
        if(panel.m&&(openRef.current[i]||0)>.01){
          const oa3=openRef.current[i]||0, sl3=getPanelDir(panels,i)*oa3*pw*.82;
          const GX=getPanelDir(panels,i)>0?IL+pw*i:IL+pw*i+pw+sl3;
          const shv=[[GX,IT,0],[GX+Math.abs(sl3),IT,0],[GX+Math.abs(sl3),IB,0],[GX,IB,0]].map(v=>proj(v[0],v[1],v[2]));
          ctx.beginPath();shv.forEach((p,ii)=>ii?ctx.lineTo(p.px,p.py):ctx.moveTo(p.px,p.py));ctx.closePath();ctx.fillStyle='rgba(1,5,10,.88)';ctx.fill();
        }

        // Fixed separator montant
        if(i>0&&!panels[i-1].m&&!panel.m)
          box3D(ctx,proj,IL+pw*i-4,IT,-FD*.5,IL+pw*i+4,IB,0,...ALU,pA,LX,LY,.45,.88,wireMode);

        ctx.globalAlpha=1;
      });
    }

    // ── EXPLODE / PROTAGONIST MODE ───────────────────
    if(ex>.01||selRef.current!==-1){
      const pcList=buildPieces();
      // sort back-to-front
      const sorted=[...pcList].sort((a,b)=>{
        const fa=getFly(a), fb=getFly(b);
        return proj(a.cx+fa.x,a.cy+fa.y,a.cz+fa.z).z - proj(b.cx+fb.x,b.cy+fb.y,b.cz+fb.z).z;
      });
      sorted.forEach(p=>{
        const a=getAlpha(p.id);
        if(a<=0.01)return;
        const fly=getFly(p);
        p.draw(ctx,proj,a,fly);
      });

      // ── SPOTLIGHT + GLOW for selected piece ───────
      if(selRef.current!==-1){
        const sp=pcList.find(p=>p.id===selRef.current);
        if(sp){
          const ft=flyRefs.current[sp.id]||0;
          const ease=easeCubic(ft);
          const fly=getFly(sp);
          const cp=proj(sp.cx+fly.x,sp.cy+fly.y,sp.cz+fly.z);

          // Vignette darkening effect (rest of canvas dims)
          ctx.fillStyle=`rgba(0,0,0,${ease*.45})`;
          ctx.fillRect(0,0,W,H);
          // This re-draws the selected piece OVER the darkened canvas:
          sp.draw(ctx,proj,Math.min(1,buildRef.current+0.1),fly);

          // Pulsing glow ring
          const glowR=80*cp.sc*(1+ease*.3);
          const col=sp.col;
          const r2=parseInt(col.slice(1,3),16)||100;
          const g2=parseInt(col.slice(3,5),16)||100;
          const b2=parseInt(col.slice(5,7),16)||100;
          ctx.globalAlpha=ease*.55;
          const glow=ctx.createRadialGradient(cp.px,cp.py,0,cp.px,cp.py,glowR);
          glow.addColorStop(0,`rgba(${r2},${g2},${b2},0.35)`);
          glow.addColorStop(.6,`rgba(${r2},${g2},${b2},0.12)`);
          glow.addColorStop(1,'rgba(0,0,0,0)');
          ctx.beginPath();ctx.arc(cp.px,cp.py,glowR,0,Math.PI*2);ctx.fillStyle=glow;ctx.fill();
          ctx.globalAlpha=1;

          // Orbit ring
          if(ease>.4){
            const ringR=45*cp.sc;
            ctx.globalAlpha=ease*.7;
            ctx.beginPath();ctx.arc(cp.px,cp.py,ringR,0,Math.PI*2);
            ctx.strokeStyle=`rgba(${r2},${g2},${b2},0.5)`;ctx.lineWidth=1;ctx.setLineDash([4,4]);
            ctx.stroke();ctx.setLineDash([]);
            ctx.globalAlpha=1;
          }

          // Large floating label with piece name above
          if(ease>.35){
            const lp=proj(sp.cx+fly.x,sp.cy+fly.y-30,sp.cz+fly.z);
            label3D(ctx,lp.px,lp.py,sp.name.toUpperCase(),col,ease,10);
          }
        }
      }
    }

    // ── DIMENSION LABELS ───────────────────────────
    if(bp>.6&&lblRef.current&&buildDoneRef.current&&ex<.05&&selRef.current===-1&&!wireMode){
      const la=Math.min(1,(bp-.6)/.28);
      function dimLine(x,y,z,txt,col,right=true){
        const p=proj(x,y,z);const ll=28,off=right?1:-1;
        const ex2=p.px+off*ll,ey=p.py-8;
        ctx.globalAlpha=la*.8;ctx.strokeStyle=col;ctx.lineWidth=.7;ctx.setLineDash([2.5,2]);
        ctx.beginPath();ctx.moveTo(p.px,p.py);ctx.lineTo(ex2,ey);ctx.stroke();ctx.setLineDash([]);
        ctx.beginPath();ctx.arc(p.px,p.py,2.3,0,Math.PI*2);ctx.fillStyle=col;ctx.fill();
        ctx.globalAlpha=la*.85;ctx.font=`600 8px ${MONO_FONT}`;
        const tw=ctx.measureText(txt).width+9;const tx=right?ex2+2:ex2-tw-2;
        ctx.fillStyle='rgba(2,6,16,.82)';ctx.fillRect(tx,ey-7,tw,14);
        ctx.strokeStyle=col;ctx.lineWidth=.55;ctx.strokeRect(tx,ey-7,tw,14);
        ctx.fillStyle=col;ctx.textAlign=right?'left':'right';ctx.textBaseline='middle';ctx.fillText(txt,right?ex2+5:ex2-4,ey);ctx.globalAlpha=1;
      }
      dimLine(0,SB+26,0,`↔ ${anchoLabel}`,'#60a5fa');
      dimLine(SL-24,(ST+SB)/2,0,`↕ ${altoLabel}`,'#60a5fa',false);
      dimLine(SL+7,ST+8,0,'Cabezal','#b0b8c0');
      dimLine(SL+7,SB-8,0,'Sillar','#b0b8c0');
      // FIX v47: etiquetar TODAS las piezas del marco igual que en despiece.
      // Antes solo salían Cabezal, Sillar, Riel y la 1ª hoja de cada tipo.
      // Ahora también jambas, ambos rieles y todas las hojas numeradas.
      dimLine(SL+FT/2,(ST+SB)/2-28,0,'Jamba Izq.','#b0b8c0',false);
      dimLine(SR-FT/2,(ST+SB)/2-28,0,'Jamba Der.','#b0b8c0');
      dimLine(IL+7,IT+3,0,'Riel Sup.','#7aa8c8',false);
      dimLine(IR-7,IB-3,0,'Riel Inf.','#7aa8c8');
      panels.forEach((pan,i)=>{
        const oa4=openRef.current[i]||0,sl4=getPanelDir(panels,i)*oa4*pw*.82;
        const cxp=IL+pw*i+sl4+pw/2;
        const nm = pan.m?`Hoja X${i+1}`:`Hoja O${i+1}`;
        const col = pan.m?'#93c5fd':'#64748b';
        // Alternar altura para que las etiquetas de hojas no se solapen
        const yOff = i%2===0 ? -18 : 18;
        dimLine(cxp,(IT+IB)/2+yOff,0,nm,col,i%2===0);
      });
    }

    // ── SPARKS ─────────────────────────────────────
    sparksRef.current=sparksRef.current.filter(s=>s.life>0);
    sparksRef.current.forEach(s=>{
      ctx.globalAlpha=s.life*.88;ctx.beginPath();ctx.arc(s.x,s.y,s.sz*s.life,0,Math.PI*2);ctx.fillStyle=s.col;ctx.fill();
      s.x+=s.vx;s.y+=s.vy;s.vy+=.22;s.life-=s.dec;
    });
    ctx.globalAlpha=1;

    // ── BUILD PROGRESS ─────────────────────────────
    if(!buildDoneRef.current&&bp>0){
      const idx=Math.min(Math.floor(bp*(perfiles?.length||1)),(perfiles?.length||1)-1);
      const pz=perfiles?.[idx];
      ctx.fillStyle='rgba(0,0,0,.72)';
      ctx.beginPath();if(ctx.roundRect)ctx.roundRect(W/2-122,H-50,244,36,7);else ctx.rect(W/2-122,H-50,244,36);ctx.fill();
      ctx.strokeStyle='rgba(37,99,235,.45)';ctx.lineWidth=.8;ctx.stroke();
      ctx.fillStyle='rgba(37,99,235,.72)';ctx.fillRect(W/2-118,H-46,236*bp,5);
      ctx.fillStyle='rgba(255,255,255,.28)';ctx.font=`bold 8px ${MONO_FONT}`;ctx.textAlign='center';
      ctx.fillText(`ENSAMBLANDO  ${Math.round(bp*100)}%`,W/2,H-28);
      if(pz){ctx.fillStyle='#93c5fd';ctx.font=`bold 9px ${MONO_FONT}`;ctx.fillText(`${pz.seccion||''} · ${pz.ubicacion}`,W/2,H-14);}
    }

    // Explode percentage indicator
    if(ex>.02&&ex<.95){
      ctx.fillStyle='rgba(249,115,22,.55)';ctx.font=`700 9px ${MONO_FONT}`;ctx.textAlign='left';ctx.textBaseline='bottom';
      ctx.fillText(`DESPIECE ${Math.round(ex*100)}%`,12,H-8);
    }

    // Restore zoom transform so HUD overlays are NOT zoomed
    ctx.restore();

    // ── ZOOM INDICATOR (outside zoom transform, always crisp) ──
    if(Math.abs(zoom-1)>.05){
      ctx.globalAlpha=.7;
      ctx.fillStyle='rgba(0,0,0,.65)';
      ctx.beginPath();if(ctx.roundRect)ctx.roundRect(W-68,10,58,20,5);else ctx.rect(W-68,10,58,20);ctx.fill();
      ctx.fillStyle='#60a5fa';ctx.font=`600 9px ${MONO_FONT}`;ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText(`ZOOM ${zoom.toFixed(1)}×`,W-39,20);
      ctx.globalAlpha=1;
    }
  }

  // FIX v46: el render loop (useEffect [expanded,NP]) capturaba esta función
  // `draw` en su closure. Como `draw` se redefine en cada render y NO está en
  // las dependencias del effect, el loop seguía ejecutando una versión VIEJA
  // que leía estado/geometría del primer montaje. Eso hacía que al alternar
  // Ensamblar/Despiece el toggle "no respondiera" (el loop nunca veía la draw
  // nueva). Guardamos siempre la última draw en un ref y el loop la llama vía
  // drawRef.current(), garantizando que cada frame use la versión fresca.
  drawRef.current = draw;

  /* ── effects ─────────────────────────────────────── */
  useEffect(()=>{
    const cv=cvRef.current; if(!cv)return;
    initSize();
    const ro=new ResizeObserver(initSize);ro.observe(cvRef.current.parentElement);

    // ── Scroll wheel zoom ──
    function onWheel(e){
      e.preventDefault();
      const delta=e.deltaY>0?-0.10:0.10;
      zoomRef.current=Math.max(0.35,Math.min(3.5,zoomRef.current+delta));
    }
    cv.addEventListener('wheel',onWheel,{passive:false});

    // ── Pinch zoom (touch) ──
    function getTouchDist(touches){
      const dx=touches[0].clientX-touches[1].clientX;
      const dy=touches[0].clientY-touches[1].clientY;
      return Math.sqrt(dx*dx+dy*dy);
    }
    function onTouchStartZoom(e){
      if(e.touches.length===2){
        pinchRef.current={dist:getTouchDist(e.touches),zoom:zoomRef.current};
      }
    }
    function onTouchMoveZoom(e){
      if(e.touches.length===2&&pinchRef.current){
        const newDist=getTouchDist(e.touches);
        const scale=newDist/pinchRef.current.dist;
        zoomRef.current=Math.max(0.35,Math.min(3.5,pinchRef.current.zoom*scale));
        e.preventDefault();
      }
    }
    function onTouchEndZoom(){ pinchRef.current=null; }
    cv.addEventListener('touchstart',onTouchStartZoom,{passive:true});
    cv.addEventListener('touchmove',onTouchMoveZoom,{passive:false});
    cv.addEventListener('touchend',onTouchEndZoom);

    let alive=true;
    function loop(){if(!alive)return;if(drawRef.current)drawRef.current();mainRAF.current=requestAnimationFrame(loop);}
    loop();
    return()=>{
      alive=false;
      cancelAnimationFrame(mainRAF.current);
      cv.removeEventListener('wheel',onWheel);
      cv.removeEventListener('touchstart',onTouchStartZoom);
      cv.removeEventListener('touchmove',onTouchMoveZoom);
      cv.removeEventListener('touchend',onTouchEndZoom);
      ro.disconnect();
    };
  },[expanded,NP]);

  useEffect(()=>{
    selRef.current=-1; flyRefs.current={};
    Object.values(flyRAFs.current).forEach(r=>cancelAnimationFrame(r));
    flyRAFs.current={};
    setSelName('');
    startBuild();
    // Reset wall build for new design
    wallDoneRef.current=new Set();
    wallStepRef.current=-1;
    wallDoneAllRef.current=false;
    if(activeViewRef.current===1) setTimeout(startWallBuild,200);
  },[diseno]);



  /* ── pointer handlers ────────────────────────────── */
  function onPointerDown(e){
    if(activeViewRef.current===1){ e.preventDefault?.(); return; } // wall view: no drag
    if(!buildDoneRef.current)return;
    const cx=e.touches?e.touches[0].clientX:e.clientX;
    const cy2=e.touches?e.touches[0].clientY:e.clientY;
    dragRef.current={sx:cx,sy:cy2,rx:rotRef.current.x,ry:rotRef.current.y,mv:false};
    e.preventDefault?.();
  }

  function onPointerMove(e){
    const cx=e.touches?e.touches[0].clientX:e.clientX;
    const cy2=e.touches?e.touches[0].clientY:e.clientY;

    // Wall view hover detection
    if(activeViewRef.current===1){
      const cv=cvRef.current; if(!cv)return;
      const dpr=window.devicePixelRatio||1;
      const W2=cv.width/dpr,H2=cv.height/dpr;
      const r=cv.getBoundingClientRect();
      const mx=(cx-r.left)*(W2/r.width);
      const my=(cy2-r.top)*(H2/r.height);
      const wX=W2*.11,wY=H2*.07,wW=W2*.78,wH=H2*.62;
      const openW2=wW*.40,openH2=wH*.50;
      const oX=wX+(wW-openW2)/2,oY=wY+(wH-openH2)/2;
      const pT2=13,rT2=7;
      const pInnerW2=openW2-pT2*2;
      const panelW2=pInnerW2/NP;
      const pBaseX2=oX+pT2,pBaseY2=oY+pT2+rT2;
      const pInnerH2=openH2-pT2*2-rT2*2;
      let hi2=-1;
      for(let i=0;i<NP;i++){
        if(!panels[i].m)continue;
        const oa=openRef.current[i]||0,dir=getPanelDir(panels,i),sl=dir*oa*panelW2*.82;
        const pX2=pBaseX2+panelW2*i+sl;
        if(mx>=pX2&&mx<=pX2+panelW2&&my>=pBaseY2&&my<=pBaseY2+pInnerH2){hi2=i;break;}
      }
      hovRef.current=hi2;
      return;
    }

    if(dragRef.current){
      const dx=cx-dragRef.current.sx, dy=cy2-dragRef.current.sy;
      if(Math.abs(dx)>3||Math.abs(dy)>3)dragRef.current.mv=true;
      rotRef.current={
        x:Math.max(-70,Math.min(70,dragRef.current.rx+dy*.4)),
        y:dragRef.current.ry-dx*.55
      };
    } else if(buildDoneRef.current&&explodeRef.current<.05&&selRef.current===-1){
      const cv=cvRef.current; if(!cv)return;
      const dpr=window.devicePixelRatio||1;
      const W2=cv.width/dpr;
      const r=cv.getBoundingClientRect();
      const mx=(cx-r.left)*(W2/r.width);
      const IW2=IR-IL, pw2=IW2/NP;
      const proj=mkProj(W2,cv.height/dpr,rotRef.current.x,rotRef.current.y);
      let hi=-1;
      for(let i=0;i<NP;i++){
        const oa=openRef.current[i]||0, sl=getPanelDir(panels,i)*oa*pw2*.82;
        const PL=IL+pw2*i+sl;
        const pL=proj(PL,(IT+IB)/2,0), pR=proj(PL+pw2,(IT+IB)/2,0);
        if(mx>=Math.min(pL.px,pR.px)&&mx<=Math.max(pL.px,pR.px)){hi=i;break;}
      }
      hovRef.current=(hi>=0&&panels[hi].m)?hi:-1;
    }
  }

  function onPointerUp(e){
    // Wall view click → open/close panel
    if(activeViewRef.current===1){
      if(!wallDoneAllRef.current)return;
      const cv=cvRef.current; if(!cv)return;
      const dpr=window.devicePixelRatio||1;
      const W2=cv.width/dpr,H2=cv.height/dpr;
      const r=cv.getBoundingClientRect();
      const ce=e.changedTouches?e.changedTouches[0]:e;
      const mx=(ce.clientX-r.left)*(W2/r.width);
      const my=(ce.clientY-r.top)*(H2/r.height);
      const wX=W2*.11,wY=H2*.07,wW=W2*.78,wH=H2*.62;
      const openW2=wW*.40,openH2=wH*.50;
      const oX=wX+(wW-openW2)/2,oY=wY+(wH-openH2)/2;
      const pT2=13,rT2=7;
      const pInnerW2=openW2-pT2*2;
      const panelW2=pInnerW2/NP;
      const pBaseX2=oX+pT2,pBaseY2=oY+pT2+rT2;
      const pInnerH2=openH2-pT2*2-rT2*2;
      for(let i=0;i<NP;i++){
        if(!panels[i].m)continue;
        const oa=openRef.current[i]||0,dir=getPanelDir(panels,i),sl=dir*oa*panelW2*.82;
        const pX2=pBaseX2+panelW2*i+sl;
        if(mx>=pX2&&mx<=pX2+panelW2&&my>=pBaseY2&&my<=pBaseY2+pInnerH2){
          const cur=openRef.current[i]||0; animPanel(i,cur>.5?0:1); break;
        }
      }
      return;
    }

    if(!dragRef.current)return;
    const moved=dragRef.current.mv;
    dragRef.current=null;
    if(moved||!buildDoneRef.current)return;

    const cv=cvRef.current; if(!cv)return;
    const dpr=window.devicePixelRatio||1;
    const W2=cv.width/dpr, H2=cv.height/dpr;
    const r=cv.getBoundingClientRect();
    const ce=e.changedTouches?e.changedTouches[0]:e;
    const mx=(ce.clientX-r.left)*(W2/r.width);
    const my=(ce.clientY-r.top)*(H2/r.height);

    // spawn sparks
    for(let i=0;i<18;i++) sparksRef.current.push({x:mx,y:my,vx:(Math.random()-.5)*8,vy:-2.5-Math.random()*5.5,life:1,dec:.04+Math.random()*.045,sz:1.5+Math.random()*2.5,col:['#93c5fd','#3b82f6','#dbeafe','#60a5fa'][i%4]});

    // If in explode mode → try hit piece
    if(explodeRef.current>.15){
      const proj=mkProj(W2,H2,rotRef.current.x,rotRef.current.y);
      const pcList=buildPieces();
      let hit=-1, bestZ=-Infinity;
      pcList.forEach(p=>{
        const fly=getFly(p);
        const c=proj(p.cx+fly.x,p.cy+fly.y,p.cz+fly.z);
        const ddx=mx-c.px, ddy=my-c.py;
        if(ddx*ddx+ddy*ddy<(54*c.sc)**2&&c.z>bestZ){bestZ=c.z;hit=p.id;}
      });
      if(hit!==-1){
        const prev=selRef.current;
        if(prev===hit){
          selRef.current=-1; animFly(hit,0); setSelName('');
        } else {
          if(prev!==-1)animFly(prev,0);
          selRef.current=hit; animFly(hit,1);
          const found=pcList.find(p=>p.id===hit);
          setSelName(found?found.name:'');
        }
        forceR(n=>n+1);
        return;
      }
    }

    // Assembled mode → open panel
    if(explodeRef.current<.05){
      const IW2=IR-IL, pw2=IW2/NP;
      const proj=mkProj(W2,H2,rotRef.current.x,rotRef.current.y);
      let hi=-1;
      for(let i=0;i<NP;i++){
        const oa=openRef.current[i]||0, sl=getPanelDir(panels,i)*oa*pw2*.82;
        const PL=IL+pw2*i+sl;
        const pL=proj(PL,(IT+IB)/2,0), pR=proj(PL+pw2,(IT+IB)/2,0);
        if(mx>=Math.min(pL.px,pR.px)&&mx<=Math.max(pL.px,pR.px)){hi=i;break;}
      }
      if(hi>=0&&panels[hi].m){const cur=openRef.current[hi]||0;animPanel(hi,cur>.5?0:1);}
    }
  }

  /* ── toolbar actions ─────────────────────────────── */
  function toggleExplode(){
    const next=!explodeOn;
    setExplodeOn(next);
    explActiveRef.current=next;
    if(!next){
      selRef.current=-1;
      Object.keys(flyRefs.current).forEach(k=>animFly(+k,0));
      setSelName('');
    }
    animExplode(next?.9:0);
    // FIX v46: forzar re-render SIEMPRE (antes solo al ensamblar). Así el
    // botón Ensamblar/Despiece y el indicador de modo reflejan el cambio de
    // inmediato, y la draw fresca queda registrada en drawRef.
    forceR(n=>n+1);
  }

  function selectPiece(id){
    if(!explodeOn){ toggleExplode(); }
    const prev=selRef.current;
    if(prev===id){ selRef.current=-1; animFly(id,0); setSelName(''); }
    else { if(prev!==-1)animFly(prev,0); selRef.current=id; animFly(id,1); const found=buildPieces().find(p=>p.id===id); setSelName(found?found.name:''); }
    forceR(n=>n+1);
  }

  function resetView(){
    rotRef.current={x:22,y:-32};
    zoomRef.current=1.0;
    selRef.current=-1;
    Object.keys(flyRefs.current).forEach(k=>animFly(+k,0));
    setSelName('');
    setExplodeOn(false);
    explActiveRef.current=false;
    animExplode(0);
    openRef.current={};
    forceR(n=>n+1);
  }

  const disLabel=typeof diseno==='number'?(ID_TO_NAME[diseno]||`D${diseno}`):String(diseno||'');

  const cvEl=(
    <canvas ref={cvRef}
      className="cv3"
      style={{display:'block',width:'100%',aspectRatio:expanded?undefined:'680/440',height:expanded?'100%':undefined,borderRadius:expanded?0:12}}
      onMouseDown={onPointerDown} onMouseMove={onPointerMove} onMouseUp={onPointerUp}
      onMouseLeave={()=>{hovRef.current=-1;}}
      onTouchStart={onPointerDown} onTouchMove={onPointerMove} onTouchEnd={onPointerUp}
    />
  );

  if(expanded){
    return (
      <div style={{position:'fixed',inset:0,zIndex:2000,background:'#030810',display:'flex',flexDirection:'column',padding:16}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10,flexWrap:'wrap',gap:7}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <div style={{width:7,height:7,borderRadius:'50%',background:'#22c55e',boxShadow:'0 0 8px #22c55e',animation:'sm-pulse 1.8s infinite'}}/>
            <span style={{fontFamily:T.font,fontSize:'.7rem',fontWeight:700,color:'#22C55E',letterSpacing:'.08em',textTransform:'uppercase'}}>PBR 3D UNIFICADO — PANTALLA COMPLETA</span>
          </div>
          <div style={{display:'flex',gap:6}}>
            <button onClick={()=>setShowLbl(s=>!s)} className="b3" style={{}} >🏷 {showLbl?'ON':'OFF'}</button>
            <button onClick={()=>{setWire(s=>!s);wireRef.current=!wire;}} className={`b3${wire?' on':''}`}>Wire</button>
            <button onClick={()=>setShowAcc(s=>!s)} className={`b3${showAcc?' on':''}`}>🔩 Acc {showAcc?'ON':'OFF'}</button>
            <button onClick={toggleExplode} className={`b3 o${explodeOn?' on':''}`}><Package size={10}/> {explodeOn?'Ensamblar':'Despiece'}</button>
            <button onClick={()=>startBuild()} className="b3"><RotateCcw size={10}/> Replay</button>
            <button onClick={onToggleExpand} className="b3" style={{background:'rgba(239,68,68,.12)',borderColor:'rgba(239,68,68,.35)',color:'#fca5a5'}}><Minimize2 size={10}/> Reducir</button>
          </div>
        </div>
        <div ref={wrapRef} style={{flex:1,position:'relative',borderRadius:14,overflow:'hidden',border:'1px solid rgba(37,99,235,.2)'}}>{cvEl}</div>
        {selName&&<div style={{display:'flex',justifyContent:'center',marginTop:8}}><span className="sb"><span className="sd"/>{selName.toUpperCase()}</span></div>}
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:14,marginTop:8,flexWrap:'wrap'}}>
          {panels.map((p,i)=>(
            <div key={i} style={{width:24,height:30,borderRadius:4,background:p.m?'rgba(37,99,235,.18)':'rgba(71,85,105,.18)',border:`1.5px solid ${p.m?'#3B82F6':'#475569'}`,display:'flex',alignItems:'center',justifyContent:'center'}}>
              <span style={{fontFamily:T.font,fontSize:'.65rem',fontWeight:700,color:p.m?'#93C5FD':'#64748B'}}>{p.m?'X':'0'}</span>
            </div>
          ))}
          {[['#4a90e2','X Móvil'],['#5a6070','0 Fijo'],['#b0b8c0','Marco ALU'],['rgba(100,160,220,.5)','Vidrio'],['arrastra','rota y clic']].map(([c,l],i)=>(
            <div key={l} style={{display:'flex',alignItems:'center',gap:4}}>
              {i<4&&<div style={{width:11,height:2,background:c,borderRadius:2}}/>}
              <span style={{fontFamily:T.font,fontSize:'.6rem',color:'rgba(255,255,255,.38)',textTransform:'uppercase',letterSpacing:'.03em'}}>{l}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{display:'flex',flexDirection:'column',gap:0,userSelect:'none',width:'100%'}}>

      {/* ── View Tabs ── */}
      <div style={{display:'flex',background:'#040810',borderBottom:'1px solid rgba(255,255,255,.06)'}}>
        {[{id:0,label:'Vista 3D',dot:'#3B82F6'}].map(tab=>(
          <button key={tab.id} onClick={()=>{
            setActiveView(tab.id);
            activeViewRef.current=tab.id;
          }} style={{
            display:'flex',alignItems:'center',gap:5,padding:'8px 15px',border:'none',
            background:'transparent',
            borderBottom:`2px solid ${activeView===tab.id?'#3B82F6':'transparent'}`,
            cursor:'pointer',transition:'all .15s',
            color:activeView===tab.id?'#93c5fd':'#334155',
            fontFamily:T.font,fontSize:'10px',fontWeight:activeView===tab.id?700:500,
            letterSpacing:'.06em',textTransform:'uppercase',marginBottom:'-1px',
          }}>
            <div style={{width:5,height:5,borderRadius:'50%',background:tab.dot,boxShadow:activeView===tab.id?`0 0 5px ${tab.dot}`:'none'}}/>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Toolbar (changes by view) ── */}
      <div className="tb3">
        <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
          {activeView===0?(
            <>
              <div style={{display:'flex',alignItems:'center',gap:5}}>
                <div style={{width:6,height:6,borderRadius:'50%',background:explodeOn?'#f97316':'#22c55e',boxShadow:`0 0 6px ${explodeOn?'#f97316':'#22c55e'}`}}/>
                <span style={{fontFamily:T.font,fontSize:'.68rem',fontWeight:700,color:explodeOn?'#f97316':'#22C55E',letterSpacing:'.08em',textTransform:'uppercase'}}>
                  {explodeOn?'MODO DESPIECE':'PBR 3D'}{!buildDone&&` · ${buildPct}%`}
                </span>
              </div>
              {selName&&<span className="sb"><span className="sd"/>{selName.toUpperCase()}</span>}
            </>
          ):(
            <div style={{display:'flex',alignItems:'center',gap:5}}>
              <div style={{width:6,height:6,borderRadius:'50%',background:'#b87333',boxShadow:'0 0 6px #b87333'}}/>
              <span style={{fontFamily:T.font,fontSize:'.68rem',fontWeight:700,color:'#fcd9a0',letterSpacing:'.08em',textTransform:'uppercase'}}>
                VISTA EN PARED{!wallDoneAllRef.current&&' · INSTALANDO...'}
              </span>
            </div>
          )}
        </div>
        <div style={{display:'flex',gap:4,flexWrap:'wrap',alignItems:'center'}}>
          <div style={{display:'inline-flex',background:T.surfaceAlt,border:`1.5px solid ${T.border}`,borderRadius:7,overflow:'hidden'}}>
            <button className={`b3${showLbl?' on':''}`} style={{borderRadius:0,border:'none'}} onClick={()=>setShowLbl(s=>!s)}>etiq.</button>
            <button className={`b3${wire?' on':''}`} style={{borderRadius:0,border:'none'}} onClick={()=>{setWire(s=>!s);wireRef.current=!wire;}}>wire</button>
            <button className={`b3${env?' on':''}`} style={{borderRadius:0,border:'none'}} onClick={()=>{setEnv(s=>!s);envRef.current=!env;}}>env</button>
            <button className={`b3${showAcc?' on':''}`} style={{borderRadius:0,border:'none'}} onClick={()=>setShowAcc(s=>!s)}>acc</button>
          </div>
          {/* Zoom (3D only) */}
          {activeView===0&&(
            <div style={{display:'inline-flex',background:'rgba(255,255,255,.04)',border:'1px solid rgba(255,255,255,.09)',borderRadius:7,overflow:'hidden'}}>
              <button className="b3" style={{borderRadius:0,border:'none',fontSize:13,padding:'2px 9px',lineHeight:1}} onClick={()=>{zoomRef.current=Math.min(3.5,zoomRef.current+0.2);}}>＋</button>
              <button className="b3" style={{borderRadius:0,border:'none',padding:'2px 7px',fontSize:9,minWidth:34,color:'#3b82f6'}} onClick={()=>{zoomRef.current=1.0;}}>1×</button>
              <button className="b3" style={{borderRadius:0,border:'none',fontSize:13,padding:'2px 9px',lineHeight:1}} onClick={()=>{zoomRef.current=Math.max(0.35,zoomRef.current-0.2);}}>－</button>
            </div>
          )}
          {activeView===0&&(
            <button onClick={toggleExplode} className={`b3 o${explodeOn?' on':''}`} style={{gap:4}}>
              <Package size={9}/> {explodeOn?'Ensamblar':'Despiece'}
            </button>
          )}
          {activeView===1&&(
            <button onClick={()=>{wallDoneRef.current=new Set();wallStepRef.current=0;wallDoneAllRef.current=false;setWallLog('');forceR(n=>n+1);setTimeout(startWallBuild,100);}} className="b3" style={{gap:3,color:'#b87333',borderColor:'rgba(184,115,51,.3)'}}>
              <RotateCcw size={9}/> Reinstalar
            </button>
          )}
          <button onClick={()=>startBuild()} className="b3" style={{gap:3}}><RotateCcw size={9}/> Replay</button>
          <button onClick={resetView} className="b3">Reset</button>
          <button onClick={onToggleExpand} className="b3 on" style={{gap:3}}><Maximize2 size={9}/> Expandir</button>
        </div>
      </div>

      {/* Canvas */}
      <div ref={wrapRef} style={{
        position:'relative',overflow:'hidden',
        background:activeView===0?T.canvas3DBg:'#0a0d14',
        border:`1px solid ${activeView===0?'rgba(37,99,235,.15)':'rgba(184,115,51,.15)'}`,
        boxShadow:'0 8px 32px rgba(0,0,0,.32)'
      }}>
        {cvEl}
        {/* Build progress bar — 3D view */}
        {activeView===0&&!buildDone&&(
          <div style={{position:'absolute',bottom:0,left:0,right:0,height:3,background:'rgba(37,99,235,.12)'}}>
            <div style={{height:'100%',width:`${buildPct}%`,background:`linear-gradient(90deg,${T.blueDark},${T.blue},#93C5FD)`,transition:'width .08s linear',borderRadius:2}}/>
          </div>
        )}
        {/* Selection badge */}
        {selName&&activeView===0&&(
          <div style={{position:'absolute',bottom:10,left:12,pointerEvents:'none'}}>
            <span className="sb"><span className="sd"/>{selName.toUpperCase()}</span>
          </div>
        )}
        {/* 3D hints */}
        {activeView===0&&buildDone&&!selName&&(
          <div style={{position:'absolute',bottom:10,right:12,pointerEvents:'none',fontFamily:T.font,fontSize:9,color:explodeOn?'rgba(249,115,22,.45)':'rgba(59,130,246,.4)',letterSpacing:'.05em',textTransform:'uppercase'}}>
            {explodeOn?'clic en pieza para protagonismo':'scroll zoom · arrastra rota · clic X abre'}
          </div>
        )}
        {/* Wall hint */}
        {activeView===1&&wallDoneAllRef.current&&(
          <div style={{position:'absolute',bottom:10,right:12,pointerEvents:'none',fontFamily:T.font,fontSize:9,color:'rgba(184,115,51,.5)',letterSpacing:'.05em',textTransform:'uppercase'}}>
            clic en hoja X para abrir
          </div>
        )}
      </div>

      {/* Sliders — luz + hora del día */}
      <div style={{display:'flex',background:'rgba(4,8,14,.9)',border:`1px solid rgba(255,255,255,.04)`,borderTop:'none',flexWrap:'wrap'}}>
        {[
          {lbl:'Luz X',val:LXs,setV:v=>{setLXs(v);LXRef.current=v/100;},min:-100,max:100,fmt:v=>(v/100).toFixed(2)},
          {lbl:'Luz Y',val:LYs,setV:v=>{setLYs(v);LYRef.current=v/100;},min:-100,max:100,fmt:v=>(v/100).toFixed(2)},
          {lbl:'Hora',val:timeOfDay,setV:setTimeOfDay,min:0,max:100,fmt:v=>{const n=['noche','amanecer','mañana','mediodía','tarde','atardecer','noche'];return n[Math.round(v/100*6)]||'día';}},
          {lbl:'Ambiente',val:ambFactor,setV:v=>{setAmbFactor(v);ambRef.current=v/100;},min:0,max:100,fmt:v=>(v/100).toFixed(2)},
        ].map((sl,i)=>(
          <div key={i} className="lr">
            <span className="ll">{sl.lbl}</span>
            <input type="range" className="ls" min={sl.min} max={sl.max} value={sl.val} onChange={e=>sl.setV(+e.target.value)}/>
            <span className="lv">{sl.fmt(sl.val)}</span>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="lb">
        <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
          {(activeView===0
            ?[['#4a90e2','X Móvil'],['#5a6070','0 Fijo'],['#b0b8c0','Marco ALU'],['rgba(100,160,220,.5)','Vidrio']]
            :[['#c8ccc8','Perfil ALU'],['rgba(100,160,220,.5)','Vidrio'],['#9a7050','Ladrillo'],['#d4c5a9','Repello']]
          ).map(([c,l])=>(
            <div key={l} style={{display:'flex',alignItems:'center',gap:3}}>
              <div style={{width:11,height:2.5,background:c,borderRadius:2}}/>
              <span style={{fontSize:9,color:'#334155',textTransform:'uppercase',letterSpacing:'.04em',fontFamily:T.font}}>{l}</span>
            </div>
          ))}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          {panels.map((p,i)=>(
            <div key={i} style={{width:20,height:25,borderRadius:4,background:p.m?T.bluePale:T.surfaceAlt,border:`1.5px solid ${p.m?T.blue:T.borderMd}`,display:'flex',alignItems:'center',justifyContent:'center'}}>
              <span style={{fontFamily:T.font,fontSize:'.58rem',fontWeight:700,color:p.m?T.blue:T.textMut}}>{p.m?'X':'0'}</span>
            </div>
          ))}
          <span style={{fontFamily:T.font,fontSize:'.62rem',fontWeight:600,color:T.textDim,marginLeft:3}}>= {disLabel}</span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   ACCESSORY ICON
───────────────────────────────────────────────────────────────── */
function AccIcon({nombre,size=14}){
  const u=(nombre||'').toUpperCase();
  const s={width:size,height:size,display:'block',flexShrink:0};
  const c=T.textMut;
  if(u.includes('CERRADURA')||u.includes('CARACOL'))
    return <svg {...s} viewBox="0 0 24 24" fill="none"><rect x="3" y="11" width="18" height="11" rx="2" fill="rgba(100,116,139,0.12)" stroke={c} strokeWidth="1.8"/><path d="M7 11V7a5 5 0 0110 0v4" stroke={c} strokeWidth="1.8"/><circle cx="12" cy="16" r="1.5" fill={c}/></svg>;
  if(u.includes('REMACHE')||u.includes('TORNILL'))
    return <svg {...s} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="7" r="4" fill="rgba(100,116,139,0.12)" stroke={c} strokeWidth="1.8"/><line x1="12" y1="9" x2="12" y2="20" stroke={c} strokeWidth="2.2"/></svg>;
  if(u.includes('EMPAQUE')||u.includes('FELPA'))
    return <svg {...s} viewBox="0 0 24 24" fill="none"><rect x="2" y="8" width="20" height="8" rx="2" fill="rgba(100,116,139,0.12)" stroke={c} strokeWidth="1.8"/>{[6,9,12,15,18].map(x=><line key={x} x1={x} y1="8" x2={x} y2="16" stroke={c} strokeWidth="1.2"/>)}</svg>;
  if(u.includes('RODACH'))
    return <svg {...s} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" fill="rgba(100,116,139,0.08)" stroke={c} strokeWidth="1.8"/><circle cx="12" cy="12" r="3.5" fill="rgba(100,116,139,0.18)" stroke={c} strokeWidth="1.5"/><circle cx="12" cy="12" r="1.5" fill={c}/></svg>;
  return <svg {...s} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" fill="rgba(100,116,139,0.08)" stroke={c} strokeWidth="1.8"/><line x1="12" y1="8" x2="12" y2="12" stroke={c} strokeWidth="2"/><circle cx="12" cy="15.5" r="1.2" fill={c}/></svg>;
}

/* ─────────────────────────────────────────────────────────────────
   UNIT TOGGLE
───────────────────────────────────────────────────────────────── */
function UnitToggle({unit:u,onChange}){
  return(
    <div className="sm-ut">
      <button className={`sm-ub${u==='cm'?' on':''}`} onClick={()=>onChange('cm')}>cm</button>
      <button className={`sm-ub${u==='mm'?' on':''}`} onClick={()=>onChange('mm')}>mm</button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   SECTION CHIP
───────────────────────────────────────────────────────────────── */
function SecChip({s}){
  const bg=SEC_BG[s]||'#F0F5FF', clr=SEC_CLR[s]||T.blue;
  return<span style={{fontFamily:T.font,fontSize:'.58rem',fontWeight:700,padding:'3px 7px',borderRadius:5,textTransform:'uppercase',letterSpacing:'.07em',background:bg,color:clr,border:`1px solid ${clr}22`}}>{s}</span>;
}

/* ─────────────────────────────────────────────────────────────────
   SIMULACION MODAL — MAIN COMPONENT
───────────────────────────────────────────────────────────────── */



export default function SimulacionModal({ventana,onClose,onReporteGenerado}){
  useEffect(()=>{ injectStyles(); },[]);

  const [calculo,       setCalculo]       = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [generando,     setGenerando]     = useState(false);
  // FIX v30: removidos los estados `descontarStock` y `confirmando`. La opción
  // "Descontar del stock / No descontar" se quitó de la UI por pedido del
  // usuario — la funcionalidad de descuento de inventario no se está usando
  // (la tabla `materiales` no se popula con datos reales), así que ofrecer
  // la opción confundía sin aportar valor. El backend sigue aceptando ambos
  // valores; siempre le mandamos `false`.
  const [reporteOk,     setReporteOk]     = useState(!!ventana.reporte_generado);
  const [expanded3D,    setExpanded3D]    = useState(false);
  // Unidad visual: tomar la que la ventana tiene guardada (su `ancho_unidad`/
  // `alto_unidad` = unidadUI elegida al crearla en VentanaModal). NO transformar
  // los datos — solo respetar la unidad de visualización. Default a 'cm' solo
  // si la ventana no tiene unidad declarada (legacy).
  const _unidadDetectada = String(ventana?.ancho_unidad || ventana?.alto_unidad || 'cm').toLowerCase() === 'mm' ? 'mm' : 'cm';
  // Debug temporal para diagnosticar problema reportado por usuario:
  // si V140 fue creada en mm pero SimulacionModal abre en cm, esto va a
  // mostrar exactamente qué llega en `ventana.ancho_unidad` desde el backend.
  if (typeof window !== 'undefined' && window.console) {
    console.log('[SimulacionModal] ventana recibida:', {
      id: ventana?.id_ventana,
      ancho_unidad: ventana?.ancho_unidad,
      alto_unidad:  ventana?.alto_unidad,
      ancho_vano: ventana?.ancho_vano,
      alto_vano:  ventana?.alto_vano,
      _unidadDetectada,
    });
  }
  const [unit,          setUnit]          = useState(_unidadDetectada);
  const [activeTab,     setActiveTab]     = useState('vista');

  // FIX v76: detección de móvil para apilar el layout (canvas arriba, panel abajo)
  const [isMobile, setIsMobile] = useState(typeof window!=='undefined' && window.innerWidth < 760);
  useEffect(()=>{
    const onResize=()=>setIsMobile(window.innerWidth < 760);
    window.addEventListener('resize',onResize);
    return ()=>window.removeEventListener('resize',onResize);
  },[]);

  useEffect(()=>{
    const body=ventana.id_ventana
      ?{id_ventana:ventana.id_ventana}
      :{id_sistema:ventana.id_sistema,id_perfil:ventana.id_perfil,id_diseno:(ventana.id_diseno||ventana['id_diseño']),ancho_vano:ventana.ancho_vano,alto_vano:ventana.alto_vano};
    api.post('/ventanas/simular',body)
      .then(r=>setCalculo({...r.data,referencia_vidrio:ventana.referencia_vidrio||'5MM'}))
      .catch(e=>toast.error(e?.response?.data?.error||'Error al calcular'))
      .finally(()=>setLoading(false));
  },[]);

  const perfiles   = calculo?.piezas?.filter(p=>!p.es_vidrio&&!p.es_accesorio&&p.resultado!=null)||[];
  const accesorios = (calculo?.piezas?.filter(p=>p.es_accesorio).length?calculo.piezas.filter(p=>p.es_accesorio):calculo?.accesorios)||[];
  const vidrios    = (calculo?.piezas?.filter(p=>p.es_vidrio).length?calculo.piezas.filter(p=>p.es_vidrio):calculo?.vidrios)||[];
  const rawA=calculo?.A??calculo?.ancho_ventana;
  const rawH=calculo?.H??calculo?.alto_ventana;
  const A=fmtVal(rawA,unit); const H=fmtVal(rawH,unit); const uLabel=ul(unit);
  const baseCode=parseInt(ventana.sistema?.replace(/\D/g,'')||'3500')||3500;
  const disLabel=ventana.diseno||(ID_TO_NAME[ventana.id_diseno||ventana.id_diseño])||'XX';

  const handleGenerar = async () => {
    // FIX v30: el flujo viejo tenía confirmación + opción de descontar stock.
    // Lo simplifiqué a un solo paso: generar el PDF. El backend recibe siempre
    // descontar_stock=false (no toca inventario). Si en el futuro se quiere
    // recuperar la funcionalidad de descontar materiales, agregar un botón
    // separado o desde el módulo de materiales.
    //
    // FIX v31: el PDF SIEMPRE se genera en la unidad ORIGINAL de la ventana
    // (la que tenía cuando se creó). Antes usaba `unit` del toggle del modal,
    // así que si el usuario jugaba con MM/CM el PDF salía en una unidad que
    // podía no coincidir con la unidad "oficial" de la ventana. Ahora el toggle
    // solo afecta lo que se ve en pantalla; el PDF respeta la unidad guardada
    // en BD (ventana.ancho_unidad / alto_unidad).
    setGenerando(true);
    try {
      const { data } = await api.post(
        `/ventanas/${ventana.id_ventana}/reporte`,
        { descontar_stock: false }
      );
      await generarReportePDF(ventana, data.calculo || calculo, unit);
      toast.success(`Reporte generado en ${unit.toUpperCase()} ✓`);
      setReporteOk(true);
      onReporteGenerado?.();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Error al generar reporte');
    } finally {
      setGenerando(false);
    }
  };

  const TABS=[
    {id:'vista',label:'Vista 3D + Despiece',icon:<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="3" stroke="currentColor" strokeWidth="2"/><line x1="12" y1="2" x2="12" y2="22" stroke="currentColor" strokeWidth="1.5"/><line x1="2" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="1.5"/></svg>, badge:null},
    {id:'corte',label:'Lista de Corte',icon:<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><line x1="3" y1="6" x2="21" y2="6" stroke="currentColor" strokeWidth="2"/><line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="2"/><line x1="3" y1="18" x2="21" y2="18" stroke="currentColor" strokeWidth="2"/></svg>, badge:null},

    {id:'accesorios',label:'Accesorios',icon:<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" stroke="currentColor" strokeWidth="2" fill="none"/></svg>, badge:null},
  ];

  return(
    <>
      {expanded3D&&calculo&&(
        <UnifiedCanvas3D
          diseno={disLabel}
          anchoLabel={`${fmtVal(rawA,unit)} ${uLabel}`}
          altoLabel={`${fmtVal(rawH,unit)} ${uLabel}`}
          perfiles={perfiles}
          expanded={true}
          onToggleExpand={()=>setExpanded3D(false)}
        />
      )}

      <div className="sm-ov" onClick={onClose}>
        <div className="sm-modal" onClick={e=>e.stopPropagation()}>

          {/* ── HEADER ── */}
          <div style={{background:`linear-gradient(135deg,#0D1B2E 0%,#1239A6 55%,#1A56DB 100%)`,padding:'18px 26px',flexShrink:0,display:'flex',justifyContent:'space-between',alignItems:'center',position:'relative',overflow:'hidden'}}>
            <div style={{position:'absolute',inset:0,pointerEvents:'none',overflow:'hidden'}}>
              <div style={{position:'absolute',top:-40,right:-40,width:160,height:160,borderRadius:'50%',background:'rgba(255,255,255,0.04)'}}/>
              <div className="sm-hdr-shine"/>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:16,position:'relative'}}>
              <div style={{width:46,height:46,borderRadius:12,background:'rgba(255,255,255,0.12)',border:'1.5px solid rgba(255,255,255,0.2)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="3" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.7)" strokeWidth="1.8"/><line x1="12" y1="2" x2="12" y2="22" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5"/><line x1="2" y1="12" x2="22" y2="12" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5"/></svg>
              </div>
              <div>
                <div style={{display:'flex',alignItems:'baseline',gap:10,marginBottom:6}}>
                  <span style={{fontFamily:T.font,fontWeight:500,fontSize:'1.22rem',color:'#fff',letterSpacing:'.02em'}}>Ventana #{ventana.id_ventana}</span>
                  <span style={{color:'rgba(255,255,255,.3)'}}>·</span>
                  <span style={{fontFamily:T.fontSans,fontWeight:700,fontSize:'1rem',color:'rgba(255,255,255,.9)'}}>{ventana.sistema} {ventana.perfil}</span>
                </div>
                <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                  <span style={{display:'inline-flex',alignItems:'center',gap:5,fontFamily:T.font,fontSize:'.66rem',fontWeight:700,padding:'4px 10px',borderRadius:6,letterSpacing:'.07em',textTransform:'uppercase',border:'1.5px solid',background:'rgba(34,197,94,.2)',color:'#BBF7D0',borderColor:'rgba(34,197,94,.4)'}}>
                    <div style={{width:5,height:5,borderRadius:'50%',background:'#4ADE80',boxShadow:'0 0 5px #4ADE80'}}/>READY
                  </span>
                  <span style={{display:'inline-flex',alignItems:'center',fontFamily:T.font,fontSize:'.66rem',fontWeight:700,padding:'4px 10px',borderRadius:6,letterSpacing:'.07em',textTransform:'uppercase',border:'1.5px solid',background:'rgba(255,255,255,.1)',color:'rgba(255,255,255,.65)',borderColor:'rgba(255,255,255,.18)'}}>
                    DISEÑO: {disLabel}
                  </span>
                </div>
              </div>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:12,position:'relative',zIndex:1}}>
              <UnitToggle unit={unit} onChange={setUnit}/>
              <button onClick={onClose} className="sm-btn" style={{background:'rgba(255,255,255,.1)',color:'rgba(255,255,255,.8)',border:'1.5px solid rgba(255,255,255,.2)',borderRadius:10,padding:'7px',width:38,height:38}}><X size={16}/></button>
            </div>
          </div>

          {/* ── TAB BAR ── */}
          <div style={{display:'flex',alignItems:'stretch',background:T.bg,borderBottom:`1.5px solid ${T.border}`,paddingLeft:22,flexShrink:0,overflowX:'auto',WebkitOverflowScrolling:'touch'}} className="sm-tabbar">
            {TABS.map(tab=>{
              const isActive=activeTab===tab.id;
              return(
                <button key={tab.id} onClick={()=>setActiveTab(tab.id)} style={{display:'flex',alignItems:'center',gap:5,padding:'11px 17px',border:'none',background:'transparent',borderBottom:isActive?`2.5px solid ${T.blue}`:'2.5px solid transparent',cursor:'pointer',transition:'all .15s',color:isActive?T.blue:T.textMut,fontFamily:T.fontSans,fontSize:'.8rem',fontWeight:isActive?700:500,whiteSpace:'nowrap',marginBottom:'-1.5px'}}>
                  {tab.icon}{tab.label}
                  {tab.badge&&<span style={{fontFamily:T.font,fontSize:'.52rem',fontWeight:700,background:`linear-gradient(135deg,${T.blue},${T.blueDark})`,color:'#fff',padding:'1px 5px',borderRadius:3,letterSpacing:'.06em'}}>{tab.badge}</span>}
                </button>
              );
            })}
          </div>

          {/* ── BODY ── */}
          <div className="sm-scroll" style={{flex:1,overflowY:'auto',minHeight:0,background:T.surface}}>
            {loading?(
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'6rem 2rem',gap:16,background:T.bg}}>
                <div className="sm-spinner" style={{width:28,height:28,borderWidth:3,borderColor:T.bluePale,borderTopColor:T.blue}}/>
                <span style={{fontFamily:T.fontSans,fontSize:'1rem',color:T.textMut,fontWeight:500}}>Calculando ventana...</span>
              </div>
            ):!calculo?(
              <div style={{margin:20,padding:'16px 18px',borderRadius:12,background:'#FEF2F2',border:'1.5px solid #FECACA',display:'flex',gap:10,alignItems:'flex-start'}}>
                <AlertTriangle size={15} color="#DC2626" style={{flexShrink:0,marginTop:1}}/>
                <span style={{fontFamily:T.fontSans,fontSize:'.94rem',color:'#991B1B',fontWeight:500}}>No se pudo calcular esta combinación.</span>
              </div>
            ):(
              <>
                {/* ── TAB: VISTA 3D + DESPIECE (UNIFIED) ── */}
                {activeTab==='vista'&&(
                  <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 280px',gap:0,background:T.bg,borderBottom:`1px solid ${T.border}`}}>
                    {/* Canvas unificado */}
                    <div style={{borderRight:isMobile?'none':`1px solid ${T.border}`,borderBottom:isMobile?`1px solid ${T.border}`:'none',overflow:'hidden'}}>
                      {!expanded3D?(
                        <UnifiedCanvas3D
                          diseno={disLabel}
                          anchoLabel={`${fmtVal(rawA,unit)} ${uLabel}`}
                          altoLabel={`${fmtVal(rawH,unit)} ${uLabel}`}
                          perfiles={perfiles}
                          expanded={false}
                          onToggleExpand={()=>setExpanded3D(true)}
                        />
                      ):(
                        <div style={{display:'flex',alignItems:'center',justifyContent:'center',aspectRatio:'680/480',background:T.surfaceAlt,border:`1.5px dashed ${T.borderMd}`,borderRadius:0,flexDirection:'column',gap:10,padding:30}}>
                          <Maximize2 size={28} color={T.borderSt}/>
                          <span style={{fontFamily:T.fontSans,fontSize:'.9rem',color:T.textMut,fontWeight:500}}>Vista 3D expandida activa</span>
                          <button onClick={()=>setExpanded3D(false)} className="sm-btn" style={{background:T.bluePale,border:`1.5px solid ${T.borderSt}`,borderRadius:8,padding:'9px 20px',color:T.blue,fontFamily:T.fontSans,fontSize:'.8rem',fontWeight:700,marginTop:6}}><Minimize2 size={12}/> Volver a vista normal</button>
                        </div>
                      )}
                    </div>

                    {/* ── SIDEBAR: medidas + PDF ── */}
                    <div style={{padding:'18px 16px',background:T.surface,display:'flex',flexDirection:'column',gap:0}}>
                      <div style={{marginBottom:18}}>
                        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
                          <div style={{width:32,height:32,borderRadius:8,background:T.bluePale,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" stroke={T.blue} strokeWidth="2"/><line x1="8" y1="12" x2="16" y2="12" stroke={T.blue} strokeWidth="1.8"/></svg>
                          </div>
                          <span style={{fontFamily:T.fontSans,fontSize:'1rem',fontWeight:700,color:T.textPri}}>Medidas de Vano</span>
                        </div>
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                          {[['Ancho',fmtVal(ventana.ancho_vano,unit),'↔'],['Alto',fmtVal(ventana.alto_vano,unit),'↕']].map(([lbl,val,icon])=>(
                            <div key={lbl} style={{background:T.bg,border:`1.5px solid ${T.borderMd}`,borderRadius:10,padding:'12px 13px',position:'relative',overflow:'hidden'}}>
                              <div style={{position:'absolute',top:8,right:10,fontSize:'1.1rem',opacity:.07}}>{icon}</div>
                              <div style={{fontFamily:T.font,fontSize:'.6rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'.09em',color:T.textDim,marginBottom:5}}>{lbl}</div>
                              <div style={{fontFamily:T.font,fontWeight:500,color:T.blue,fontSize:'1.35rem',lineHeight:1}}>{val}</div>
                              <div style={{fontFamily:T.font,fontSize:'.62rem',color:T.textDim,marginTop:3,letterSpacing:'.05em',fontWeight:600}}>{uLabel}</div>
                            </div>
                          ))}
                        </div>
                        {(rawA!=null||rawH!=null)&&(
                          <div style={{marginTop:8,display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                            {[['A calc.',A],['H calc.',H]].map(([lbl,val])=>(
                              <div key={lbl} style={{background:T.bluePale,border:`1.5px solid ${T.borderSt}`,borderRadius:10,padding:'10px 13px'}}>
                                <div style={{fontFamily:T.font,fontSize:'.6rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'.09em',color:T.blue,opacity:.7,marginBottom:4}}>{lbl}</div>
                                <div style={{fontFamily:T.font,fontWeight:500,color:T.blueDark,fontSize:'1.12rem',lineHeight:1}}>{val}</div>
                                <div style={{fontFamily:T.font,fontSize:'.62rem',color:T.blue,marginTop:3,opacity:.6,fontWeight:600}}>{uLabel}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div style={{height:1,background:T.border,marginBottom:10}}/>

                      {/* ── DESPIECE: lista de piezas con color ── */}
                      {perfiles.length>0&&(
                        <div style={{marginBottom:12}}>
                          <div style={{fontFamily:T.font,fontSize:'.62rem',fontWeight:700,color:T.textMut,textTransform:'uppercase',letterSpacing:'.09em',marginBottom:7}}>
                            Piezas del Despiece — {perfiles.reduce((s,p)=>s+(p.cantidad||1),0)} uds
                          </div>
                          <div style={{display:'flex',flexDirection:'column',gap:3,maxHeight:220,overflowY:'auto'}}>
                            {perfiles.map((p,i)=>{
                              const secClr = SEC_CLR[p.seccion||'MARCO']||T.blue;
                              const secBg  = SEC_BG[p.seccion||'MARCO']||T.bluePale;
                              const res = typeof p.resultado==='number'?fmtVal(p.resultado,unit):p.resultado;
                              return(
                                <div key={i} style={{display:'flex',alignItems:'center',gap:7,padding:'5px 8px',borderRadius:7,background:T.bg,border:`1px solid ${T.border}`,transition:'background .1s'}}
                                  onMouseEnter={e=>e.currentTarget.style.background=T.bluePale}
                                  onMouseLeave={e=>e.currentTarget.style.background=T.bg}
                                >
                                  <div style={{width:4,height:28,borderRadius:2,background:secClr,flexShrink:0}}/>
                                  <div style={{flex:1,minWidth:0}}>
                                    <div style={{fontFamily:T.fontSans,fontWeight:700,fontSize:'.75rem',color:T.textPri,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{p.ubicacion}</div>
                                    <div style={{display:'flex',gap:5,marginTop:1}}>
                                      <span style={{fontFamily:T.font,fontSize:'.6rem',color:secClr,background:secBg,padding:'1px 5px',borderRadius:3,fontWeight:700}}>{p.seccion||'MARCO'}</span>
                                    </div>
                                  </div>
                                  <div style={{textAlign:'right',flexShrink:0}}>
                                    <div style={{fontFamily:T.font,fontWeight:800,fontSize:'.82rem',color:T.blue}}>{res} <span style={{fontSize:'.58rem',color:T.textDim}}>{uLabel}</span></div>
                                    <div style={{fontFamily:T.font,fontSize:'.6rem',color:T.textMut}}>× {p.cantidad||1}</div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <div style={{height:1,background:T.border,marginTop:10,marginBottom:10}}/>
                        </div>
                      )}

                      <div style={{flex:1,display:'flex',flexDirection:'column',gap:10}}>
                        {reporteOk&&(
                          <div style={{display:'flex',alignItems:'center',gap:8,background:T.greenPale,border:'1.5px solid rgba(22,163,74,0.25)',borderRadius:9,padding:'9px 11px'}}>
                            <CheckCircle size={13} color={T.green}/>
                            <span style={{fontFamily:T.fontSans,fontSize:'.82rem',fontWeight:600,color:T.green}}>Reporte generado anteriormente</span>
                          </div>
                        )}
                        {/* FIX v30: removidos los radios "Descontar / No descontar" y la
                            confirmación, porque el descuento de stock no se está usando
                            (la tabla materiales no tiene datos reales). El botón ahora
                            genera el PDF directamente sin tocar inventario. */}
                        <button onClick={handleGenerar} disabled={generando} className="sm-btn" style={{width:'100%',padding:'13px',borderRadius:10,fontWeight:700,fontSize:'.9rem',fontFamily:T.fontSans,background:`linear-gradient(135deg,${T.blue},${T.blueDark})`,color:'#fff',boxShadow:`0 4px 16px ${T.blueGlow}`,border:'none'}}>
                          {generando ? <><div className="sm-spinner"/> Generando...</>
                            : reporteOk ? <><RefreshCw size={14}/> Regenerar PDF</>
                            : <><FileDown size={14}/> Generar y descargar PDF</>}
                        </button>
                        <p style={{textAlign:'center',fontFamily:T.font,fontSize:'.63rem',color:T.textDim,opacity:.6,margin:0,letterSpacing:'.03em'}}>
                          PDF en <strong>{unit.toUpperCase()}</strong> · Cambiá el toggle arriba para alternar cm/mm · No afecta inventario
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── TAB: LISTA DE CORTE ── */}
                {activeTab==='corte'&&(
                  <div style={{padding:'20px 22px',background:T.bg,borderBottom:`1px solid ${T.border}`}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
                      <div style={{display:'flex',alignItems:'center',gap:10}}>
                        <div style={{width:32,height:32,borderRadius:8,background:T.bluePale,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><line x1="3" y1="6" x2="21" y2="6" stroke={T.blue} strokeWidth="2"/><line x1="3" y1="12" x2="21" y2="12" stroke={T.blue} strokeWidth="2"/><line x1="3" y1="18" x2="21" y2="18" stroke={T.blue} strokeWidth="2"/></svg>
                        </div>
                        <div>
                          <div style={{fontFamily:T.fontSans,fontSize:'1rem',fontWeight:700,color:T.textPri}}>Lista de Corte de Perfiles</div>
                          <div style={{fontFamily:T.font,fontSize:'.7rem',color:T.textDim,marginTop:2}}>{perfiles.length} piezas · medidas en <strong>{uLabel}</strong></div>
                        </div>
                      </div>
                      <button className="sm-btn" onClick={async()=>{await generarReportePDF(ventana,calculo,unit);}} style={{background:T.bluePale,border:`1.5px solid ${T.borderSt}`,borderRadius:8,padding:'8px 14px',color:T.blue,fontFamily:T.fontSans,fontSize:'.76rem',fontWeight:700}}><FileDown size={12}/> Exportar PDF ({unit.toUpperCase()})</button>
                    </div>
                    <table className="sm-tbl">
                      <thead><tr>
                        <th style={{textAlign:'left'}}>Código</th>
                        <th style={{textAlign:'left'}}>Sección</th>
                        <th style={{textAlign:'left'}}>Descripción</th>
                        <th style={{textAlign:'center'}}>Cant.</th>
                        <th style={{textAlign:'right'}}>Longitud ({uLabel})</th>
                        <th style={{textAlign:'center'}}>Ángulo</th>
                      </tr></thead>
                      <tbody>
                        {perfiles.map((p,i)=>{
                          const code=`P-${String(baseCode+1+i).padStart(4,'0')}`;
                          const isSpecial=p.angulo&&p.angulo!==90;
                          const res=typeof p.resultado==='number'?fmtVal(p.resultado,unit):p.resultado;
                          return(
                            <tr key={i} style={{animationDelay:`${i*.04}s`}}>
                              <td><span style={{fontFamily:T.font,fontSize:'.72rem',fontWeight:600,color:T.blue,background:T.bluePale,padding:'3px 8px',borderRadius:5,letterSpacing:'.04em',border:`1px solid rgba(37,99,235,.15)`}}>{code}</span></td>
                              <td><SecChip s={p.seccion||'MARCO'}/></td>
                              <td style={{fontFamily:T.fontSans,fontWeight:600,color:T.textPri}}>{p.ubicacion}</td>
                              <td style={{textAlign:'center'}}><span style={{fontFamily:T.font,fontWeight:700,fontSize:'.82rem',color:T.textSec,background:T.surfaceAlt,padding:'3px 9px',borderRadius:5,border:`1px solid ${T.border}`}}>{String(p.cantidad).padStart(2,'0')}</span></td>
                              <td style={{textAlign:'right'}}>
                                <span style={{fontFamily:T.font,fontSize:'1rem',fontWeight:700,color:T.blue,letterSpacing:'.02em'}}>{res}</span>
                                <span style={{fontFamily:T.font,fontSize:'.62rem',fontWeight:600,color:T.textDim,marginLeft:4}}>{uLabel}</span>
                              </td>
                              <td style={{textAlign:'center'}}>
                                <span style={{fontFamily:T.font,fontSize:'.74rem',fontWeight:600,color:isSpecial?T.orange:T.textMut,background:isSpecial?'#FFF7ED':T.surfaceAlt,padding:'3px 8px',borderRadius:5,border:`1px solid ${isSpecial?'rgba(234,88,12,.22)':T.border}`}}>
                                  {isSpecial?`${p.angulo}° / ${p.angulo}°`:'90° / 90°'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div style={{marginTop:12,padding:'11px 14px',borderRadius:10,background:T.bluePale,border:`1.5px solid ${T.borderSt}`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                      <span style={{fontFamily:T.font,fontSize:'.72rem',fontWeight:700,color:T.blue,textTransform:'uppercase',letterSpacing:'.07em'}}>Total de piezas</span>
                      <span style={{fontFamily:T.font,fontSize:'1rem',fontWeight:500,color:T.blueDark}}>
                        {perfiles.reduce((s,p)=>s+(p.cantidad||1),0)} unidades · {perfiles.length} referencias
                      </span>
                    </div>

                    {/* ── PLAN DE BARRAS ── */}
                    {(()=>{
                      const BARRA_MM = 6000;
                      const KERF_MM = 3;

                      // Convertir resultado a mm siempre (los resultados están en cm internamente)
                      const toMM = (p) => {
                        const raw = typeof p.resultado === 'number' ? p.resultado : parseFloat(p.resultado || 0);
                        if (isNaN(raw)) return 0;
                        // Los resultados siempre están en cm; multiplicar x10 para mm
                        return Math.round(raw * 10);
                      };

                      // Formatear valor para mostrar según unidad seleccionada (adaptativo: sin ceros de relleno)
                      const fmtBarraVal = (mm) => unit === 'mm' ? `${mm.toLocaleString('es-CO')} mm` : `${fmtCm(mm/10)} cm`;

                      // ── FIX (regla del instructor Marcel) ───────────────
                      // Agrupar cortes POR UBICACIÓN antes de bin-packing.
                      // Cada tipo de pieza es una barra física independiente:
                      // CABEZAL va en su barra de cabezal, SILLAR en la suya,
                      // etc. NO se mezclan en la misma barra simulada.
                      const cortesPorUbi = {};
                      perfiles.forEach((p) => {
                        const longMM = toMM(p);
                        if (longMM <= 0 || longMM > BARRA_MM) return;
                        const cant = p.cantidad || 1;
                        const ubi = p.ubicacion || 'PERFIL';
                        if (!cortesPorUbi[ubi]) cortesPorUbi[ubi] = [];
                        for (let i = 0; i < cant; i++) {
                          cortesPorUbi[ubi].push({ nombre: ubi, longMM, seccion: p.seccion || 'MARCO' });
                        }
                      });

                      // Bin-pack cada ubicación POR SEPARADO
                      const barras = [];
                      for (const ubi of Object.keys(cortesPorUbi)) {
                        const cortesUbi = cortesPorUbi[ubi];
                        const sortedUbi = [...cortesUbi].sort((a, b) => b.longMM - a.longMM);
                        const barrasUbi = [];
                        sortedUbi.forEach(corte => {
                          let ubicado = false;
                          for (const barra of barrasUbi) {
                            const esp = corte.longMM + (barra.cortes.length > 0 ? KERF_MM : 0);
                            if (barra.usado + esp <= BARRA_MM) {
                              barra.usado += esp; barra.cortes.push(corte); ubicado = true; break;
                            }
                          }
                          if (!ubicado) barrasUbi.push({ cortes: [corte], usado: corte.longMM, ubicacion: ubi });
                        });
                        barrasUbi.forEach(b => { b.ubicacion = ubi; });
                        barras.push(...barrasUbi);
                      }

                      if (barras.length === 0) return null;

                      // Lista plana de cortes (todos los grupos juntos) para
                      // métricas globales y leyenda de secciones. Necesario porque
                      // antes existía como variable `cortes` directa, y al
                      // reestructurar el bin-packing por ubicación se debe rearmar.
                      const cortes = barras.flatMap(b => b.cortes);

                      const totalBarras = barras.length;
                      const totalUsado = barras.reduce((s, b) => s + b.usado, 0);
                      const totalDisponible = totalBarras * BARRA_MM;
                      const pctOptimizacion = Math.round((totalUsado / totalDisponible) * 100);

                      const getOptColor = (pct) => {
                        if (pct >= 80) return { bg:'#F0FDF4', bgDark:'#DCFCE7', border:'#86EFAC', borderSt:'#16A34A', text:'#15803D', dot:'#22C55E', label:'MÁXIMO APROVECHAMIENTO', icon:'▲' };
                        if (pct >= 60) return { bg:'#FEFCE8', bgDark:'#FEF9C3', border:'#FDE047', borderSt:'#CA8A04', text:'#A16207', dot:'#EAB308', label:'USO MODERADO', icon:'◆' };
                        if (pct >= 40) return { bg:'#EFF6FF', bgDark:'#DBEAFE', border:'#93C5FD', borderSt:'#2563EB', text:'#1D4ED8', dot:'#3B82F6', label:'RESIDUO REUTILIZABLE', icon:'●' };
                        return { bg:'#FFF1F2', bgDark:'#FEE2E2', border:'#FCA5A5', borderSt:'#DC2626', text:'#B91C1C', dot:'#EF4444', label:'ALTO DESPERDICIO', icon:'▼' };
                      };

                      const SEC_COLORS = {
                        'MARCO':'#1A3A5C','MARCO 744':'#243B55','NAVE MÓVIL':'#374151',
                        'NAVE MOVIL':'#374151','NAVE FIJA':'#1239A6','ADAPTADOR':'#4B5563'
                      };
                      const SEC_LIGHT = {
                        'MARCO':'#C8D5E8','MARCO 744':'#B8C8DA','NAVE MÓVIL':'#D1D5DB',
                        'NAVE MOVIL':'#D1D5DB','NAVE FIJA':'#BFDBFE','ADAPTADOR':'#E5E7EB'
                      };
                      const getSecColor = (s) => SEC_COLORS[s] || '#64748B';
                      const getSecLight = (s) => SEC_LIGHT[s] || '#F1F5F9';

                      const optStyle = getOptColor(pctOptimizacion);

                      return (
                        <div style={{marginTop:24}}>
                          {/* ── BANNER LÓGICO: aclara que esto es SOLO de esta ventana ── */}
                          {/* El plan real del taller se hace con TODAS las ventanas juntas
                              (combina cortes entre ventanas + reutiliza residuos del banco). */}
                          <div style={{
                            background:'#FEF3C7',
                            border:`1px solid #F59E0B55`,
                            borderLeft:`4px solid #F59E0B`,
                            borderRadius:'10px',
                            padding:'10px 14px',
                            marginBottom:12,
                            display:'flex',
                            alignItems:'flex-start',
                            gap:10,
                            fontFamily:T.fontSans,
                          }}>
                            <div style={{flexShrink:0,marginTop:1}}>
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                                <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="#B45309" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </div>
                            <div style={{flex:1}}>
                              <div style={{fontSize:'.78rem',fontWeight:700,color:'#92400E',marginBottom:3}}>
                                Vista informativa por ventana
                              </div>
                              <div style={{fontSize:'.72rem',color:'#78350F',lineHeight:1.45}}>
                                Este plan estima los cortes <strong>solo para esta ventana</strong>, asumiendo
                                barras nuevas. El plan <strong>real del taller</strong> combina TODAS las ventanas
                                del proyecto y reutiliza residuos del banco — ahorra material y barras.
                                <br/>
                                Usa <strong>“Optimizar cortes”</strong> en la pantalla del proyecto para ver
                                el plan completo y autorizar el corte.
                              </div>
                            </div>
                          </div>

                          {/* ── HEADER SECCIÓN ── */}
                          <div style={{background:`linear-gradient(135deg, #0D1B2E 0%, #1239A6 60%, #1A56DB 100%)`,borderRadius:'14px 14px 0 0',padding:'16px 20px',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:10}}>
                            <div style={{display:'flex',alignItems:'center',gap:12}}>
                              <div style={{width:38,height:38,borderRadius:10,background:'rgba(255,255,255,.1)',border:'1.5px solid rgba(255,255,255,.2)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                                  <rect x="2" y="6" width="20" height="5" rx="2" fill="rgba(147,197,253,.25)" stroke="#93C5FD" strokeWidth="1.6"/>
                                  <rect x="2" y="13" width="13" height="5" rx="2" fill="rgba(147,197,253,.15)" stroke="#93C5FD" strokeWidth="1.6"/>
                                  <line x1="17" y1="15.5" x2="22" y2="15.5" stroke="#FCA5A5" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="2.5 2"/>
                                </svg>
                              </div>
                              <div>
                                <div style={{fontFamily:T.fontSans,fontSize:'1rem',fontWeight:700,color:'#fff',letterSpacing:'.01em'}}>
                                  Plan de Optimización de Barras
                                </div>
                                <div style={{fontFamily:T.font,fontSize:'.68rem',color:'rgba(147,197,253,.8)',marginTop:2,letterSpacing:'.04em'}}>
                                  BARRA ESTÁNDAR {fmtBarraVal(BARRA_MM)} · KERF {KERF_MM}mm · ALGORITMO FFD
                                </div>
                              </div>
                            </div>
                            {/* Badge optimización */}
                            <div style={{display:'flex',alignItems:'center',gap:10,background:'rgba(255,255,255,.08)',border:`1.5px solid ${optStyle.dot}`,borderRadius:10,padding:'8px 16px',backdropFilter:'blur(4px)'}}>
                              <div style={{width:12,height:12,borderRadius:'50%',background:optStyle.dot,boxShadow:`0 0 10px ${optStyle.dot}`,flexShrink:0,animation:'sm-pulse 1.8s ease-in-out infinite'}}/>
                              <div>
                                <div style={{fontFamily:T.font,fontSize:'.58rem',fontWeight:700,color:optStyle.dot,textTransform:'uppercase',letterSpacing:'.1em'}}>{optStyle.label}</div>
                                <div style={{fontFamily:T.font,fontSize:'1.05rem',fontWeight:700,color:'#fff'}}>{pctOptimizacion}<span style={{fontSize:'.7rem',marginLeft:2,opacity:.7}}>% aprovechado</span></div>
                              </div>
                            </div>
                          </div>

                          {/* ── MÉTRICAS RESUMEN ── */}
                          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',background:'#EDEAE4',border:`1px solid ${T.borderMd}`,borderTop:'none',borderBottom:'none'}}>
                            {[
                              {label:'Barras totales', val:totalBarras, unit:'uds', color:T.blue, icon:'📦'},
                              {label:'Cortes realizados', val:cortes.length, unit:'cortes', color:'#7C3AED', icon:'✂️'},
                              {label:'Material usado', val:fmtBarraVal(totalUsado), unit:'', color:T.green, icon:'✅'},
                              {label:'Desperdicio total', val:fmtBarraVal(totalDisponible-totalUsado), unit:'', color:T.red, icon:'♻️'},
                            ].map((item,i)=>(
                              <div key={i} style={{padding:'12px 14px',borderRight:i<3?`1px solid ${T.border}`:'none',textAlign:'center',position:'relative',overflow:'hidden'}}>
                                <div style={{position:'absolute',top:6,right:8,fontSize:'16px',opacity:.12}}>{item.icon}</div>
                                <div style={{fontFamily:T.font,fontSize:'.58rem',color:T.textDim,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:4}}>{item.label}</div>
                                <div style={{fontFamily:T.font,fontSize:'.95rem',fontWeight:700,color:item.color}}>{item.val}{item.unit&&<span style={{fontSize:'.6rem',marginLeft:3,color:T.textMut}}>{item.unit}</span>}</div>
                              </div>
                            ))}
                          </div>

                          {/* ── BARRAS ── */}
                          <div style={{border:`1px solid ${T.borderMd}`,borderTop:'none',borderRadius:'0 0 14px 14px',overflow:'hidden'}}>
                            {barras.map((barra, bi) => {
                              const desperdicio = BARRA_MM - barra.usado;
                              const pctBarra = Math.round((barra.usado / BARRA_MM) * 100);
                              const barStyle = getOptColor(pctBarra);
                              const isLast = bi === barras.length - 1;
                              return (
                                <div key={bi} style={{borderBottom:isLast?'none':`1px solid ${T.border}`}}>
                                  {/* Cabecera barra */}
                                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 16px',background:bi%2===0?'#F5F3EE':'#EDEAE4',borderBottom:`1px solid ${T.border}`,flexWrap:'wrap',gap:8}}>
                                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                                      {/* Número barra */}
                                      <div style={{width:32,height:32,borderRadius:8,background:`linear-gradient(135deg,${T.blueDeep},${T.blue})`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,boxShadow:`0 2px 8px ${T.blueGlow}`}}>
                                        <span style={{fontFamily:T.font,fontSize:'.72rem',fontWeight:700,color:'#fff'}}>{String(bi+1).padStart(2,'0')}</span>
                                      </div>
                                      <div>
                                        <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                                          <span style={{fontFamily:T.fontSans,fontSize:'.84rem',fontWeight:700,color:T.textPri}}>Barra {bi+1}</span>
                                          {barra.ubicacion && (
                                            <span style={{fontFamily:T.font,fontSize:'.62rem',fontWeight:700,background:'#DBEAFE',color:'#1E40AF',border:'1px solid #93C5FD',borderRadius:4,padding:'1px 7px',textTransform:'uppercase',letterSpacing:'.06em'}}>{barra.ubicacion}</span>
                                          )}
                                          <span style={{fontFamily:T.font,fontSize:'.62rem',fontWeight:600,background:barStyle.bgDark,color:barStyle.text,border:`1px solid ${barStyle.borderSt}`,borderRadius:4,padding:'1px 6px',textTransform:'uppercase',letterSpacing:'.06em'}}>{pctBarra}%</span>
                                        </div>
                                        <div style={{fontFamily:T.font,fontSize:'.68rem',color:T.textMut,marginTop:1}}>
                                          {barra.cortes.length} pieza{barra.cortes.length!==1?'s':''} · usado {fmtBarraVal(barra.usado)} de {fmtBarraVal(BARRA_MM)}
                                        </div>
                                      </div>
                                    </div>
                                    {/* Stats derecha */}
                                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                                      <div style={{textAlign:'center',background:T.bg,border:`1px solid ${T.border}`,borderRadius:7,padding:'5px 10px',minWidth:70}}>
                                        <div style={{fontFamily:T.font,fontSize:'.55rem',color:T.textDim,textTransform:'uppercase',letterSpacing:'.07em'}}>Usado</div>
                                        <div style={{fontFamily:T.font,fontSize:'.78rem',fontWeight:700,color:T.green}}>{fmtBarraVal(barra.usado)}</div>
                                      </div>
                                      <div style={{textAlign:'center',background:T.bg,border:`1px solid ${desperdicio>1500?'#FCA5A5':T.border}`,borderRadius:7,padding:'5px 10px',minWidth:70}}>
                                        <div style={{fontFamily:T.font,fontSize:'.55rem',color:T.textDim,textTransform:'uppercase',letterSpacing:'.07em'}}>Sobrante</div>
                                        <div style={{fontFamily:T.font,fontSize:'.78rem',fontWeight:700,color:desperdicio<=300?T.green:desperdicio<=1500?T.orange:T.red}}>{fmtBarraVal(desperdicio)}</div>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Contenido barra */}
                                  <div style={{padding:'12px 16px 14px',background:T.bg}}>
                                    {/* Barra de aluminio */}
                                    <div style={{position:'relative',marginBottom:10}}>
                                      {/* Perfil de aluminio extruido */}
                                      <div style={{
                                        position:'relative', height:44, borderRadius:6,
                                        overflow:'hidden',
                                        border:'1.5px solid #8FA3B1',
                                        boxShadow:'0 2px 8px rgba(13,17,23,.15), inset 0 1px 0 rgba(255,255,255,.5), inset 0 -1px 0 rgba(0,0,0,.12)',
                                        background:'linear-gradient(180deg,#D4D8DD 0%,#B8BEC5 18%,#9BA4AE 38%,#8090A0 50%,#9BA4AE 62%,#B8BEC5 82%,#D4D8DD 100%)',
                                      }}>
                                        {/* Líneas de extrusión del aluminio (textura) */}
                                        {[20,40,60,80].map(p=>(
                                          <div key={p} style={{position:'absolute',left:`${p}%`,top:0,bottom:0,width:1,background:'rgba(255,255,255,.18)',zIndex:1}}/>
                                        ))}
                                        {/* Cortes */}
                                        {barra.cortes.map((c, ci) => {
                                          const pctAncho = (c.longMM / BARRA_MM) * 100;
                                          const color = getSecColor(c.seccion);
                                          const lightColor = getSecLight(c.seccion);
                                          const offsetPct = barra.cortes.slice(0, ci).reduce((s, cc) => s + ((cc.longMM + KERF_MM) / BARRA_MM) * 100, 0);
                                          return (
                                            <div key={ci} title={`${c.nombre}: ${fmtBarraVal(c.longMM)}`}
                                              style={{position:'absolute',left:`${offsetPct}%`,width:`${pctAncho}%`,height:'100%',
                                                background:`linear-gradient(180deg,${color}18 0%,${color}38 40%,${color}52 50%,${color}38 60%,${color}18 100%)`,
                                                borderRight:'1.5px solid rgba(255,255,255,.6)',
                                                borderLeft: ci===0?'none':'1.5px solid rgba(0,0,0,.12)',
                                                display:'flex',alignItems:'center',justifyContent:'center',
                                                overflow:'hidden',minWidth:4,zIndex:2}}>
                                              {/* Brillo metálico */}
                                              <div style={{position:'absolute',top:0,left:0,right:0,height:'30%',background:'rgba(255,255,255,.25)',pointerEvents:'none'}}/>
                                              {/* Línea de corte izquierda */}
                                              <div style={{position:'absolute',left:0,top:'10%',bottom:'10%',width:'2px',background:`linear-gradient(180deg,transparent,${color},transparent)`,opacity:.7}}/>
                                              {pctAncho > 5 && (
                                                <span style={{fontFamily:T.font,fontSize:'8.5px',fontWeight:700,color:color,textShadow:'0 1px 2px rgba(255,255,255,.9)',letterSpacing:'.02em',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:'88%',padding:'0 3px',position:'relative',zIndex:1}}>
                                                  {c.nombre}
                                                </span>
                                              )}
                                            </div>
                                          );
                                        })}
                                        {/* Zona sobrante — aluminio sin cortar */}
                                        {desperdicio > 0 && (
                                          <div style={{position:'absolute',right:0,width:`${(desperdicio/BARRA_MM)*100}%`,height:'100%',
                                            background:'linear-gradient(180deg,#C8CDD2 0%,#ADB4BC 40%,#9BA4AE 50%,#ADB4BC 60%,#C8CDD2 100%)',
                                            borderLeft:'2px dashed #6B7280',display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',zIndex:2}}>
                                            {/* Patrón de sierra */}
                                            <div style={{position:'absolute',inset:0,backgroundImage:'repeating-linear-gradient(-55deg,transparent,transparent 8px,rgba(0,0,0,.04) 8px,rgba(0,0,0,.04) 9px)'}}/>
                                            {(desperdicio/BARRA_MM)*100 > 5 && (
                                              <span style={{fontFamily:T.font,fontSize:'8.5px',color:'#4B5563',fontWeight:700,whiteSpace:'nowrap',position:'relative',zIndex:1,textShadow:'0 1px 2px rgba(255,255,255,.8)'}}>
                                                −{fmtBarraVal(desperdicio)}
                                              </span>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    {/* Regla mm/cm */}
                                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:10,paddingLeft:2,paddingRight:2}}>
                                      {[0,25,50,75,100].map(p=>(
                                        <span key={p} style={{fontFamily:T.font,fontSize:'8px',color:T.textDim,letterSpacing:'.02em'}}>
                                          {fmtBarraVal(Math.round(BARRA_MM*(p/100)))}
                                        </span>
                                      ))}
                                    </div>

                                    {/* Tarjetas de perfiles — estilo láminas de aluminio */}
                                    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))',gap:8}}>
                                      {barra.cortes.map((c, ci) => {
                                        const secColor = getSecColor(c.seccion);
                                        const secLight = getSecLight(c.seccion);
                                        return (
                                          <div key={ci} style={{
                                            position:'relative',
                                            borderRadius:7,
                                            overflow:'hidden',
                                            background:'linear-gradient(160deg,#e8eaec 0%,#d4d8dd 18%,#c2c8d0 38%,#b0b8c4 50%,#c2c8d0 62%,#d4d8dd 82%,#e8eaec 100%)',
                                            border:'1px solid #a0a8b4',
                                            boxShadow:'0 2px 8px rgba(0,0,0,.18), inset 0 1px 0 rgba(255,255,255,.55), inset 0 -1px 0 rgba(0,0,0,.1)',
                                          }}>
                                            {/* Borde superior tipo lámina de aluminio */}
                                            <div style={{
                                              height:4,
                                              background:`linear-gradient(90deg,${secColor}cc,${secColor},${secColor}aa)`,
                                              boxShadow:`0 2px 6px ${secColor}66`,
                                            }}/>
                                            {/* Líneas de extrusión sutiles */}
                                            <div style={{position:'absolute',top:4,left:0,right:0,bottom:0,backgroundImage:'repeating-linear-gradient(90deg,transparent,transparent 28px,rgba(255,255,255,.1) 28px,rgba(255,255,255,.1) 29px)',pointerEvents:'none',zIndex:1}}/>
                                            {/* Brillo superior */}
                                            <div style={{position:'absolute',top:4,left:0,right:0,height:'35%',background:'linear-gradient(180deg,rgba(255,255,255,.4) 0%,transparent 100%)',pointerEvents:'none',zIndex:1}}/>
                                            {/* Contenido */}
                                            <div style={{position:'relative',zIndex:2,padding:'7px 10px 8px'}}>
                                              {/* Etiqueta sección */}
                                              <div style={{
                                                display:'inline-flex',alignItems:'center',gap:4,
                                                background:`${secColor}22`,border:`1px solid ${secColor}55`,
                                                borderRadius:3,padding:'1px 5px',marginBottom:5,
                                              }}>
                                                <div style={{width:5,height:5,borderRadius:'50%',background:secColor,flexShrink:0,boxShadow:`0 0 4px ${secColor}`}}/>
                                                <span style={{fontFamily:T.font,fontSize:'.52rem',fontWeight:700,color:secColor,textTransform:'uppercase',letterSpacing:'.08em'}}>{c.seccion}</span>
                                              </div>
                                              {/* Nombre del corte */}
                                              <div style={{fontFamily:T.fontSans,fontSize:'.78rem',fontWeight:700,color:'#1a2332',lineHeight:1.2,marginBottom:5,textShadow:'0 1px 1px rgba(255,255,255,.7)'}}>{c.nombre}</div>
                                              {/* Longitud — valor principal */}
                                              <div style={{
                                                display:'flex',alignItems:'baseline',gap:3,
                                                background:'rgba(0,0,0,.08)',borderRadius:4,padding:'3px 7px',
                                                border:'1px solid rgba(0,0,0,.1)',
                                                boxShadow:'inset 0 1px 3px rgba(0,0,0,.12), 0 1px 0 rgba(255,255,255,.5)',
                                              }}>
                                                <span style={{fontFamily:T.font,fontSize:'.95rem',fontWeight:700,color:'#0f172a',letterSpacing:'-.01em'}}>{fmtBarraVal(c.longMM)}</span>
                                              </div>
                                            </div>
                                            {/* Borde inferior tipo lámina */}
                                            <div style={{
                                              height:3,
                                              background:'linear-gradient(90deg,rgba(0,0,0,.15),rgba(0,0,0,.08),rgba(0,0,0,.15))',
                                            }}/>
                                          </div>
                                        );
                                      })}
                                      {desperdicio > 0 && (
                                        <div style={{
                                          position:'relative',borderRadius:7,overflow:'hidden',
                                          background:'linear-gradient(160deg,#f1f3f5 0%,#e4e8ec 40%,#d8dde3 50%,#e4e8ec 60%,#f1f3f5 100%)',
                                          border:'1.5px dashed #94a3b8',
                                          boxShadow:'0 1px 4px rgba(0,0,0,.1)',
                                        }}>
                                          <div style={{height:4,background:'repeating-linear-gradient(90deg,#94a3b8 0px,#94a3b8 8px,transparent 8px,transparent 14px)'}}/>
                                          <div style={{position:'absolute',top:4,left:0,right:0,bottom:0,backgroundImage:'repeating-linear-gradient(-55deg,transparent,transparent 8px,rgba(0,0,0,.03) 8px,rgba(0,0,0,.03) 9px)',pointerEvents:'none'}}/>
                                          <div style={{position:'relative',zIndex:2,padding:'7px 10px 8px'}}>
                                            <div style={{display:'inline-flex',alignItems:'center',gap:3,background:'rgba(148,163,184,.15)',border:'1px solid rgba(148,163,184,.4)',borderRadius:3,padding:'1px 5px',marginBottom:5}}>
                                              <span style={{fontFamily:T.font,fontSize:'.52rem',fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'.08em'}}>Sobrante</span>
                                            </div>
                                            <div style={{fontFamily:T.fontSans,fontSize:'.78rem',fontWeight:700,color:'#475569',marginBottom:5}}>Sin corte</div>
                                            <div style={{display:'flex',alignItems:'baseline',gap:3,background:'rgba(0,0,0,.06)',borderRadius:4,padding:'3px 7px',border:'1px solid rgba(0,0,0,.08)',boxShadow:'inset 0 1px 3px rgba(0,0,0,.08)'}}>
                                              <span style={{fontFamily:T.font,fontSize:'.95rem',fontWeight:700,color:desperdicio>=2000?T.red:desperdicio>=800?T.orange:'#475569'}}>{fmtBarraVal(desperdicio)}</span>
                                            </div>
                                          </div>
                                          <div style={{height:3,background:'linear-gradient(90deg,rgba(0,0,0,.08),rgba(0,0,0,.04),rgba(0,0,0,.08))'}}/>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* ── LEYENDA ── */}
                          <div style={{marginTop:10,display:'flex',flexWrap:'wrap',gap:6,alignItems:'center'}}>
                            <span style={{fontFamily:T.font,fontSize:'.62rem',color:T.textDim,textTransform:'uppercase',letterSpacing:'.07em',marginRight:4}}>Secciones:</span>
                            {Object.entries(SEC_COLORS).filter(([k])=>cortes.some(c=>c.seccion===k)).map(([k,v])=>(
                              <div key={k} style={{display:'flex',alignItems:'center',gap:4,background:getSecLight(k),border:`1px solid ${v}44`,borderRadius:5,padding:'2px 8px'}}>
                                <div style={{width:8,height:8,borderRadius:2,background:v,flexShrink:0}}/>
                                <span style={{fontFamily:T.font,fontSize:'.62rem',fontWeight:600,color:v,textTransform:'uppercase',letterSpacing:'.05em'}}>{k}</span>
                              </div>
                            ))}
                            <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:4,background:'#F1F5F9',border:'1px dashed #CBD5E1',borderRadius:5,padding:'2px 8px'}}>
                              <span style={{fontFamily:T.font,fontSize:'9px',color:'#94A3B8'}}>▨</span>
                              <span style={{fontFamily:T.font,fontSize:'.62rem',color:T.textDim,fontWeight:600}}>Desperdicio</span>
                            </div>
                          </div>

                          {/* ── PANEL RESIDUOS REUTILIZABLES ── */}
                          {barras.some(b => (BARRA_MM - b.usado) > 0) && (
                            <div style={{marginTop:16,borderRadius:12,overflow:'hidden',border:'1.5px solid #86EFAC',boxShadow:'0 2px 12px rgba(34,197,94,.1)'}}>
                              {/* Header */}
                              <div style={{background:'linear-gradient(135deg,#166534 0%,#15803D 100%)',padding:'11px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,flexWrap:'wrap',borderRadius:'8px 8px 0 0'}}>
                                <div style={{display:'flex',alignItems:'center',gap:10}}>
                                  <div style={{width:34,height:34,borderRadius:9,background:'rgba(255,255,255,.12)',border:'1.5px solid rgba(255,255,255,.2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>♻️</div>
                                  <div>
                                    <div style={{fontFamily:T.fontSans,fontWeight:700,color:'#fff',fontSize:'.9rem'}}>Vista previa de sobrantes (solo informativo)</div>
                                    <div style={{fontFamily:T.font,fontSize:'.62rem',color:'rgba(187,247,208,.8)',marginTop:1,letterSpacing:'.04em'}}>EL BANCO DE RESIDUOS SE ACTUALIZA AL OPTIMIZAR EL PROYECTO COMPLETO</div>
                                  </div>
                                </div>
                                <div style={{background:'rgba(255,255,255,.1)',border:'1px solid rgba(134,239,172,.4)',borderRadius:8,padding:'6px 14px',textAlign:'center'}}>
                                  <div style={{fontFamily:T.font,fontSize:'.55rem',color:'rgba(187,247,208,.8)',textTransform:'uppercase',letterSpacing:'.08em'}}>Sobrantes</div>
                                  <div style={{fontFamily:T.font,fontWeight:700,color:'#fff',fontSize:'1rem'}}>{barras.filter(b=>(BARRA_MM-b.usado)>0).length} barras</div>
                                </div>
                              </div>
                              {/* Tabla de sobrantes */}
                              <div style={{background:'#F0FDF4'}}>
                                {barras.map((barra, bi) => {
                                  const sob = BARRA_MM - barra.usado;
                                  if (sob <= 0) return null;
                                  const sobCm = parseFloat((sob / 10).toFixed(1));
                                  const minimo = 20;
                                  const esReutilizable = sobCm >= minimo;
                                  const pctUsado = Math.min(100, Math.round((barra.usado / BARRA_MM) * 100));
                                  const pctSob = 100 - pctUsado;
                                  const usadoLabel = fmtBarraVal(barra.usado);
                                  const sobLabel = fmtBarraVal(sob);
                                  return (
                                    <div key={bi} style={{
                                      display:'flex',alignItems:'center',gap:14,
                                      padding:'14px 20px',
                                      borderBottom:`1px solid ${esReutilizable?'#dcfce7':'#fee2e2'}`,
                                      background:esReutilizable?'#f0fdf4':'#fff1f2',
                                      flexWrap:'wrap'
                                    }}>
                                      {/* Número de barra */}
                                      <div style={{
                                        width:32,height:32,borderRadius:8,flexShrink:0,
                                        background:esReutilizable?'#16a34a':'#dc2626',
                                        display:'flex',alignItems:'center',justifyContent:'center',
                                        boxShadow:`0 2px 8px ${esReutilizable?'rgba(22,163,74,.35)':'rgba(220,38,38,.35)'}`
                                      }}>
                                        <span style={{fontFamily:T.font,fontSize:'.7rem',fontWeight:800,color:'#fff'}}>{bi+1}</span>
                                      </div>

                                      {/* Badge ubicacion */}
                                      {barra.ubicacion && (
                                        <span style={{
                                          fontFamily:T.font,fontSize:'.62rem',fontWeight:700,
                                          background:'#DBEAFE',color:'#1E40AF',
                                          border:'1px solid #93C5FD',
                                          borderRadius:4,padding:'2px 8px',
                                          textTransform:'uppercase',letterSpacing:'.06em',flexShrink:0
                                        }}>{barra.ubicacion}</span>
                                      )}

                                      {/* Barra de progreso estilo imagen */}
                                      <div style={{flex:1,minWidth:160}}>
                                        <div style={{
                                          height:14,borderRadius:4,overflow:'hidden',
                                          background:'#e2e8f0',
                                          boxShadow:'inset 0 1px 3px rgba(0,0,0,.12)',
                                          display:'flex'
                                        }}>
                                          {/* Parte usada — azul */}
                                          <div style={{
                                            width:`${pctUsado}%`,
                                            background:'linear-gradient(90deg,#1d4ed8,#3b82f6)',
                                            borderRadius:'4px 0 0 4px',
                                            transition:'width .4s'
                                          }}/>
                                          {/* Parte sobrante */}
                                          <div style={{
                                            width:`${pctSob}%`,
                                            background:esReutilizable
                                              ?'linear-gradient(90deg,#16a34a,#22c55e)'
                                              :'linear-gradient(90deg,#dc2626,#ef4444)',
                                            borderRadius:'0 4px 4px 0',
                                            transition:'width .4s'
                                          }}/>
                                        </div>
                                        <div style={{display:'flex',justifyContent:'space-between',marginTop:5}}>
                                          <span style={{fontFamily:T.font,fontSize:'.62rem',color:'#3b82f6',fontWeight:600}}>
                                            Usado: {usadoLabel}
                                          </span>
                                          <span style={{fontFamily:T.font,fontSize:'.62rem',fontWeight:700,
                                            color:esReutilizable?'#15803d':'#b91c1c'}}>
                                            Sobrante: {sobLabel}
                                          </span>
                                        </div>
                                      </div>

                                      {/* Badge reutilizable/descartado */}
                                      <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:3,flexShrink:0}}>
                                        <span style={{
                                          display:'inline-flex',alignItems:'center',gap:5,
                                          background:esReutilizable?'#dcfce7':'#fee2e2',
                                          color:esReutilizable?'#15803d':'#b91c1c',
                                          border:`1.5px solid ${esReutilizable?'#86efac':'#fca5a5'}`,
                                          borderRadius:999,padding:'4px 12px',
                                          fontFamily:T.font,fontSize:'.68rem',fontWeight:700,
                                          boxShadow:`0 1px 4px ${esReutilizable?'rgba(34,197,94,.2)':'rgba(239,68,68,.2)'}`
                                        }}>
                                          {esReutilizable
                                            ?<>✅ Reutilizable</>
                                            :<>✕ Descartado</>
                                          }
                                        </span>
                                        <span style={{fontFamily:T.font,fontSize:'.58rem',color:'#6b7280'}}>
                                          {esReutilizable
                                            ? `≥ ${fmtBarraVal(200)} — irá al banco como ${barra.ubicacion || 'perfil'}`
                                            : `< ${fmtBarraVal(200)} — se descarta`}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                                {/* Nota informativa */}
                                <div style={{padding:'10px 18px',background:'#FEF3C7',borderTop:'1px solid #FCD34D',display:'flex',alignItems:'center',gap:8}}>
                                  <span style={{fontSize:14}}>⚠️</span>
                                  <span style={{fontFamily:T.fontSans,fontSize:'.76rem',color:'#92400E'}}>
                                    Esta optimización es <strong>solo de esta ventana</strong>. Para registrar residuos reales en el banco, usa <strong>"Optimizar cortes"</strong> en el proyecto completo — así se aprovechan barras entre varias ventanas.
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                  </div>
                )}

                {/* ── TAB: ACCESORIOS ── */}

                {activeTab==='accesorios'&&(
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',background:T.surface,borderBottom:`1px solid ${T.border}`}}>
                    {/* Vidrios */}
                    <div style={{padding:'18px 20px',borderRight:`1px solid ${T.border}`}}>
                      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
                        <div style={{width:32,height:32,borderRadius:8,background:'#EFF6FF',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="9" height="9" rx="1.5" fill="rgba(37,99,235,0.1)" stroke={T.blue} strokeWidth="1.8"/><rect x="13" y="2" width="9" height="9" rx="1.5" fill="rgba(37,99,235,0.1)" stroke={T.blue} strokeWidth="1.8"/><rect x="2" y="13" width="9" height="9" rx="1.5" fill="rgba(37,99,235,0.1)" stroke={T.blue} strokeWidth="1.8"/><rect x="13" y="13" width="9" height="9" rx="1.5" fill="rgba(37,99,235,0.1)" stroke={T.blue} strokeWidth="1.8"/></svg>
                        </div>
                        <div>
                          <div style={{fontFamily:T.fontSans,fontSize:'1rem',fontWeight:700,color:T.textPri}}>Especificaciones de Vidrio</div>
                          <div style={{fontFamily:T.font,fontSize:'.7rem',color:T.textDim,marginTop:2}}>{vidrios.length} tipo{vidrios.length!==1?'s':''}</div>
                        </div>
                      </div>
                      {vidrios.length===0?(
                        <div style={{padding:'20px',textAlign:'center',color:T.textDim,fontFamily:T.fontSans,fontSize:'.86rem'}}>Sin especificaciones de vidrio</div>
                      ):(
                        <div style={{display:'flex',flexDirection:'column',gap:8}}>
                          {vidrios.map((v,i)=>(
                            <div key={i} style={{background:T.bg,border:`1.5px solid ${T.borderMd}`,borderRadius:12,padding:'13px 14px',borderLeft:`4px solid ${T.blue}`}}>
                              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
                                <div style={{flex:1}}>
                                  <div style={{fontFamily:T.fontSans,fontWeight:700,fontSize:'.92rem',color:T.textPri,marginBottom:3}}>{v.ubicacion}</div>
                                  <span style={{fontFamily:T.font,fontSize:'.7rem',fontWeight:600,padding:'3px 8px',borderRadius:5,letterSpacing:'.05em',textTransform:'uppercase',background:T.bluePale,color:T.blue,border:`1px solid ${T.borderSt}`}}>Ref. {v.ref_vidrio||'5MM'}</span>
                                </div>
                                <div style={{textAlign:'right'}}>
                                  <div style={{fontFamily:T.font,fontSize:'.84rem',fontWeight:700,color:T.blue}}>{typeof v.ancho==='number'?fmtVal(v.ancho,unit):'—'} × {typeof v.alto==='number'?fmtVal(v.alto,unit):'—'}</div>
                                  <div style={{fontFamily:T.font,fontSize:'.62rem',color:T.textDim,marginTop:2}}>Ancho × Alto ({uLabel})</div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Accesorios */}
                    <div style={{padding:'18px 20px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
                        <div style={{width:32,height:32,borderRadius:8,background:T.surfaceAlt,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" stroke={T.textMut} strokeWidth="1.8" fill="none"/></svg>
                        </div>
                        <div>
                          <div style={{fontFamily:T.fontSans,fontSize:'1rem',fontWeight:700,color:T.textPri}}>Accesorios y Consumibles</div>
                          <div style={{fontFamily:T.font,fontSize:'.7rem',color:T.textDim,marginTop:2}}>{accesorios.length} tipo{accesorios.length!==1?'s':''}</div>
                        </div>
                      </div>
                      {accesorios.length===0?(
                        <div style={{padding:'20px',textAlign:'center',color:T.textDim,fontFamily:T.fontSans,fontSize:'.86rem'}}>Sin accesorios asignados</div>
                      ):(
                        <div style={{display:'flex',flexDirection:'column',gap:6}}>
                          {accesorios.map((a,i)=>{
                            const lbl=a.descripcion||a.ubicacion||'—';
                            const qty=a.cantidad!=null?(typeof a.cantidad==='number'?fmtCm(a.cantidad, a.unidad==='cm'?1:0):a.cantidad):'—';
                            const accUnit=a.unidad||'un';
                            return(
                              <div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',background:T.bg,border:`1.5px solid ${T.border}`,borderLeft:`3px solid ${T.borderMd}`,borderRadius:10,padding:'10px 13px',transition:'all .14s'}}>
                                <div style={{display:'flex',alignItems:'center',gap:10}}>
                                  <div style={{width:30,height:30,borderRadius:7,background:T.surfaceAlt,border:`1px solid ${T.border}`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                                    <AccIcon nombre={lbl} size={14}/>
                                  </div>
                                  <span style={{fontFamily:T.fontSans,fontWeight:600,fontSize:'.88rem',color:T.textSec}}>{lbl}</span>
                                </div>
                                <div style={{display:'flex',alignItems:'baseline',gap:3,flexShrink:0,background:T.surfaceAlt,border:`1px solid ${T.borderMd}`,borderRadius:6,padding:'4px 10px'}}>
                                  <span style={{fontFamily:T.font,fontSize:'.9rem',fontWeight:700,color:T.textPri}}>{String(qty).padStart(2,'0')}</span>
                                  <span style={{fontFamily:T.font,fontSize:'.62rem',fontWeight:600,color:T.textMut,marginLeft:2}}>{accUnit}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── FOOTER ── */}
          <div style={{padding:'12px 22px',background:T.bg,borderTop:`1.5px solid ${T.border}`,display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexShrink:0,flexWrap:'wrap'}}>
            <span style={{fontFamily:T.font,fontSize:'.65rem',color:T.textDim,letterSpacing:'.04em',fontWeight:500}}>
              CorteAlu · Motor PBR Unificado · Clic en pieza para protagonismo · Medidas en <strong>{uLabel}</strong>
            </span>
            <div style={{display:'flex',gap:8}}>
              <button onClick={onClose} className="sm-btn" style={{padding:'9px 20px',borderRadius:9,border:`1.5px solid ${T.border}`,background:T.bg,color:T.textMut,fontWeight:600,fontSize:'.86rem',fontFamily:T.fontSans}}>Cerrar</button>
              {calculo&&(
                <button onClick={async()=>{await generarReportePDF(ventana,calculo,unit);toast.success(`PDF en ${unit.toUpperCase()} descargado`);}} className="sm-btn" style={{padding:'9px 20px',borderRadius:9,border:`1.5px solid ${T.borderSt}`,background:T.bluePale,color:T.blue,fontWeight:700,fontSize:'.86rem',fontFamily:T.fontSans}}>
                  <FileDown size={14}/> Descargar PDF ({unit.toUpperCase()})
                </button>
              )}
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
