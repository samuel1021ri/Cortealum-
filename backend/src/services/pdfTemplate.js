/**
 * CorteAlum — PDF Template Excel-Style v3
 * ─────────────────────────────────────────────────────────────────────────────
 * Base: el rediseño "Excel-style" del chat anterior.
 *
 * Cambios v3 respecto al borrador del chat anterior:
 *   • Layout endurecido: width fijo por columna (22/26/28/24) y table-layout fixed
 *     en TODAS las tablas internas. Sin esto, contenidos largos hacían overflow
 *     horizontal y se salían del A4 landscape.
 *   • Tipografías y paddings auditados para A4 landscape (6mm 7mm margins).
 *   • Word-wrap forzado en celdas largas (nombres de perfil, descripciones).
 *   • Fallbacks duales en TODOS los campos de ventana (design/diseno, line/perfil,
 *     system/sistema, glassType/tipo_vidrio/vidrio, unidad/'cm').
 *   • Builder produce todos los campos económicos a nivel proyecto que este
 *     template lee. Páginas de ventana NO leen MO/IVA/utilidad/recargo (esos
 *     son de proyecto, no de ventana).
 *   • SVG: recibe metros directos y unidad por ventana (no más ×100 ni 'cm' fijo).
 *   • La tabla outer del cuerpo (body) se removió a favor de una sola tabla con
 *     4 td.col de width fijo: más predecible para Puppeteer.
 */

// ── Helpers de formato ─────────────────────────────────────────────────────
const LOGO_EMBLEMA = require('./logoEmblema');
const _formatLatino = (numero, decimales = 0) => {
  const n = parseFloat(numero) || 0;
  const negativo = n < 0;
  const abs = Math.abs(n);
  const [parteEntera, parteDecimal = ''] = abs.toFixed(decimales).split('.');
  const entConSep = parteEntera.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const resultado = decimales > 0 && parteDecimal
    ? `${entConSep},${parteDecimal}`
    : entConSep;
  return negativo ? '-' + resultado : resultado;
};

const fmtCOP = (n) => '$ ' + _formatLatino(n, 0);
const fmtNum = (n, dec = 2) => _formatLatino(n, dec);

const fmtFecha = (iso) => {
  try {
    const d = new Date(iso);
    // FIX: se fuerza la zona horaria de Colombia para que la fecha del PDF no
    // dependa de la zona del servidor (Render usa UTC). Sin esto, una cotización
    // generada de noche en Colombia salía fechada al día siguiente.
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Bogota' });
  } catch { return '—'; }
};

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const fmtUnidad = (u) => {
  if (!u) return 'und';
  const lo = String(u).toLowerCase().trim();
  if (lo === 'ml' || lo === 'm.l' || lo === 'm.l.') return 'm.l.';
  return u;
};

// ── SVG preview por ventana ────────────────────────────────────────────────
// Recibe ancho/alto en METROS. Etiquetas en la unidad pedida (cm o mm).
function buildVentanaSVG(disenoNombre, w, h, unidad = 'cm') {
  const upper = String(disenoNombre || '').toUpperCase().replace(/\s+/g, '');
  const map = {
    'XX':   [{m:true},{m:true}],
    'OX':   [{m:false},{m:true}],
    'XO':   [{m:true},{m:false}],
    'XOX':  [{m:true},{m:false},{m:true}],
    'OXXO': [{m:false},{m:true},{m:true},{m:false}],
    'OXX':  [{m:false},{m:true},{m:true}],
    'XXO':  [{m:true},{m:true},{m:false}],
    'XXX':  [{m:true},{m:true},{m:true}],
    'OXO':  [{m:false},{m:true},{m:false}],
    'OXXXO':[{m:false},{m:true},{m:true},{m:true},{m:false}],
    'XOXO': [{m:true},{m:false},{m:true},{m:false}],
    'OXOX': [{m:false},{m:true},{m:false},{m:true}],
  };
  // Match exacto preferido; si no, prefijo más largo primero (sino "XX" gana
  // sobre "XXX" y "OX" sobre "OXXO" → siempre dibujaba 2 paneles).
  let panels = map[upper];
  if (!panels) {
    const keysByLength = Object.keys(map).sort((a, b) => b.length - a.length);
    const keyPref = keysByLength.find(k => upper.startsWith(k));
    panels = map[keyPref || 'XX'];
  }

  const u = String(unidad || 'cm').toLowerCase() === 'mm' ? 'mm' : 'cm';
  const wEnUnidad = u === 'mm' ? w * 1000 : w * 100;
  const hEnUnidad = u === 'mm' ? h * 1000 : h * 100;
  const decimals  = u === 'mm' ? 0 : 1;
  const wLabel = `${_formatLatino(wEnUnidad, decimals)} ${u}`;
  const hLabel = `${_formatLatino(hEnUnidad, decimals)} ${u}`;

  // Mismo diseño que el reporte del proyecto (consolidado): fondo oscuro,
  // paneles MÓVIL (azul) / FIJO (gris), vidrio con reflejo y cotas.
  const W = 280, H = 190, ML = 28, MR = 16, MT = 13, MB = 28;
  const fw = W - ML - MR, fh = H - MT - MB, OUTER = 6, INNER = 5;
  const ox = ML, oy = MT, ix = ox + OUTER, iy = oy + OUTER;
  const iw = fw - OUTER * 2, ih = fh - OUTER * 2, pw = iw / panels.length;
  const panel = (i, mv) => {
    const px = ix + pw * i, gx = px + INNER, gy = iy + INNER, gw = pw - INNER * 2, gh = ih - INNER * 2;
    const cx = px + pw / 2, cy = iy + ih / 2;
    return `<rect x='${px}' y='${iy}' width='${pw}' height='${ih}' fill='${mv ? '#1565C0' : '#4A5568'}' rx='1.5'/>`
      + `<rect x='${gx}' y='${gy}' width='${gw}' height='${gh}' fill='${mv ? 'rgba(147,197,225,.42)' : 'rgba(180,210,228,.2)'}' rx='1'/>`
      + `<rect x='${gx + 2}' y='${gy + 2}' width='${gw * .36}' height='${gh * .2}' fill='rgba(255,255,255,.16)' rx='1'/>`
      + (mv
        ? `<line x1='${cx - 9}' y1='${cy}' x2='${cx + 9}' y2='${cy}' stroke='rgba(255,255,255,.42)' stroke-width='1.4'/>`
          + `<polygon points='${cx - 9},${cy} ${cx - 6},${cy - 2.5} ${cx - 6},${cy + 2.5}' fill='rgba(255,255,255,.42)'/>`
          + `<polygon points='${cx + 9},${cy} ${cx + 6},${cy - 2.5} ${cx + 6},${cy + 2.5}' fill='rgba(255,255,255,.42)'/>`
        : `<line x1='${gx + gw * .5}' y1='${gy + 4}' x2='${gx + gw * .5}' y2='${gy + gh - 4}' stroke='rgba(255,255,255,.1)' stroke-width='1' stroke-dasharray='3,3'/>`)
      + `<text x='${cx}' y='${iy + ih - 8}' text-anchor='middle' font-size='6.5' fill='rgba(255,255,255,.45)' font-weight='700'>${mv ? 'MÓVIL' : 'FIJO'}</text>`
      + (i > 0 ? `<rect x='${px - 1.5}' y='${iy}' width='3' height='${ih}' fill='#5A6A7A' rx='1'/>` : '');
  };
  return `
  <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;max-width:300px">
    <rect width="${W}" height="${H}" fill="#111820" rx="8"/>
    <rect x="${ox}" y="${oy}" width="${fw}" height="${fh}" fill="#2E343C" rx="2"/>
    <rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" fill="#111820" rx="1"/>
    <line x1="${ix}" y1="${iy + 3}" x2="${ix + iw}" y2="${iy + 3}" stroke="#5A6A7A" stroke-width="1.2" opacity=".45"/>
    <line x1="${ix}" y1="${iy + ih - 3}" x2="${ix + iw}" y2="${iy + ih - 3}" stroke="#5A6A7A" stroke-width="1.2" opacity=".45"/>
    ${panels.map((p, i) => panel(i, p.m)).join('')}
    <line x1="${ox}" y1="${oy + fh + 6}" x2="${ox + fw}" y2="${oy + fh + 6}" stroke="#1565C0" stroke-width=".8"/>
    <line x1="${ox}" y1="${oy + fh + 3}" x2="${ox}" y2="${oy + fh + 9}" stroke="#1565C0" stroke-width=".8"/>
    <line x1="${ox + fw}" y1="${oy + fh + 3}" x2="${ox + fw}" y2="${oy + fh + 9}" stroke="#1565C0" stroke-width=".8"/>
    <text x="${ox + fw / 2}" y="${oy + fh + 18}" text-anchor="middle" font-size="7" fill="#1565C0" font-weight="700">${wLabel}</text>
    <line x1="${ox - 6}" y1="${oy}" x2="${ox - 6}" y2="${oy + fh}" stroke="#1565C0" stroke-width=".8"/>
    <line x1="${ox - 9}" y1="${oy}" x2="${ox - 3}" y2="${oy}" stroke="#1565C0" stroke-width=".8"/>
    <line x1="${ox - 9}" y1="${oy + fh}" x2="${ox - 3}" y2="${oy + fh}" stroke="#1565C0" stroke-width=".8"/>
    <text x="${ox - 17}" y="${oy + fh / 2}" text-anchor="middle" font-size="7" fill="#1565C0" font-weight="700" transform="rotate(-90,${ox - 17},${oy + fh / 2})">${hLabel}</text>
  </svg>`;
}

// ── CSS ────────────────────────────────────────────────────────────────────
const CSS = `
  @page { size: A4 landscape; margin: 6mm 7mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }

  html, body {
    font-family: Arial, Helvetica, "Liberation Sans", sans-serif;
    font-size: 8pt;
    color: #1A2233;
    background: #FFFFFF;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
    line-height: 1.3;
  }

  /* ─── HEADER ─── */
  table.hdr { width: 100%; border-collapse: separate; border-spacing: 4px; margin-bottom: 6px; table-layout: fixed; }
  table.hdr > tbody > tr > td { padding: 0; vertical-align: top; }

  td.hdr-brand {
    background: #1F2D52; color: #FFFFFF; width: 25%;
    padding: 10px 12px; border-radius: 1px;
  }
  td.hdr-brand .row { display: table; width: 100%; }
  td.hdr-brand .ico-cell { display: table-cell; vertical-align: middle; width: 66px; padding-right: 11px; }
  td.hdr-brand .ico-cell .ic-img { height: 44px; width: auto; display: block; }
  td.hdr-brand .t { display: table-cell; vertical-align: middle; }
  td.hdr-brand h1 { font-size: 11.5pt; font-weight: 900; letter-spacing: .02em; line-height: 1.1; }
  td.hdr-brand h2 { font-size: 10.5pt; font-weight: 900; letter-spacing: .02em; line-height: 1.1; }
  td.hdr-brand p  { font-size: 7pt; color: #B8C9E5; margin-top: 3px; font-style: italic; }

  td.hdr-meta-wrap { padding: 0 !important; }
  table.hdr-meta { width: 100%; border-collapse: separate; border-spacing: 4px 0; table-layout: fixed; }
  table.hdr-meta td {
    background: #FFFFFF; border: 1px solid #C8D0E0;
    padding: 7px 9px; height: 58px; vertical-align: middle;
  }
  table.hdr-meta .lbl { font-size: 7pt; font-weight: 800; color: #1F2D52; letter-spacing: .04em; margin-bottom: 3px; }
  table.hdr-meta .val { font-size: 9pt; font-weight: 700; color: #1A2233; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  td.hdr-total { background: #2EBA6A; color: #FFFFFF; text-align: center; width: 17%; padding: 0; }
  td.hdr-total .lbl { background: #1F2D52; padding: 5px 8px; font-size: 8pt; font-weight: 800; letter-spacing: .08em; }
  td.hdr-total .val { padding: 6px 8px 3px; font-size: 15pt; font-weight: 900; letter-spacing: -.01em; }
  td.hdr-total .note { padding: 0 8px 6px; font-size: 6.5pt; font-weight: 700; color: #D5F7E0; letter-spacing: .03em; }

  /* ─── BODY 4 columnas ─── */
  table.body { width: 100%; border-collapse: separate; border-spacing: 5px 0; table-layout: fixed; }
  table.body > tbody > tr > td { vertical-align: top; padding: 0; }
  table.body > tbody > tr > td.c1 { width: 21%; }
  table.body > tbody > tr > td.c2 { width: 26%; }
  table.body > tbody > tr > td.c3 { width: 30%; }
  table.body > tbody > tr > td.c4 { width: 23%; }

  table.body > tbody > tr > td.c1, table.body > tbody > tr > td.c2,
  table.body > tbody > tr > td.c3, table.body > tbody > tr > td.c4 { height: 1px; }
  .cflex { display: flex; flex-direction: column; height: 100%; }
  .cflex > table { flex: 0 0 auto; }
  .cflex > table.grow { flex: 1 1 auto; }


  /* ─── SECCIONES ─── */
  table.sec { width: 100%; border-collapse: collapse; border: 1px solid #1F2D52; margin-bottom: 7px; background: #FFFFFF; table-layout: fixed; }
  table.sec > thead > tr > td.sec-hdr {
    background: #1F2D52; color: #FFFFFF;
    padding: 6px 10px; font-size: 9pt; font-weight: 800;
    text-transform: uppercase; letter-spacing: .05em; text-align: center;
  }
  table.sec > tbody > tr > td {
    padding: 9.5px 11px; font-size: 9.5pt;
    border-bottom: 1px solid #DCE0E8; vertical-align: middle;
    word-wrap: break-word;
  }
  table.sec > tbody > tr:last-child > td { border-bottom: 0; }

  td.k { font-weight: 700; color: #1F2D52; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .02em; width: 56%; }
  td.v { text-align: right; color: #1A2233; font-weight: 700; font-size: 9pt; }

  td.sec-hdr.blue   { background: #3B5BA9 !important; }
  td.sec-hdr.green  { background: #1F8A4C !important; }
  td.sec-hdr.purple { background: #6E4AA5 !important; }
  td.sec-hdr.amber  { background: #C68900 !important; }
  td.sec-hdr.yellow { background: #FBC841 !important; color: #1A2233 !important; }
  td.sec-hdr.red    { background: #D63B3B !important; }

  /* Notas explicativas */
  .sec table td.param-note {
    background: #F8FAFC !important; color: #5A6478 !important;
    font-style: italic; font-size: 7pt !important;
    padding: 3px 10px 4px !important; border-bottom: 1px solid #ECF1F9 !important;
    text-transform: none !important; letter-spacing: 0 !important;
    line-height: 1.25; font-weight: 400 !important; text-align: left !important;
  }

  /* Sección amarilla (Instalación) */
  table.sec.yellow { border-color: #C68900; }
  table.sec.yellow > tbody > tr > td.v { background: #FFFBE8; color: #6B5400; font-weight: 800; font-size: 10pt; }
  table.sec.yellow > tbody > tr > td.k { background: #FFF1B8; color: #6B5400; }

  /* Sección roja (Transportes) */
  table.sec.red { border: 2px solid #D63B3B; }
  table.sec.red > thead > tr > td.sec-hdr.red { background: #FCEBEB !important; color: #8B1F1F !important; }
  table.sec.red > tbody > tr > td { background: #FFFFFF; color: #8B1F1F; font-weight: 700; }
  table.sec.red > tbody > tr > td.k { color: #8B1F1F; font-weight: 700; }
  table.sec.red > tbody > tr.total-row > td { background: #1F2D52 !important; color: #FFFFFF !important; font-weight: 900; font-size: 9.5pt; text-transform: uppercase; }

  /* Diagrama */
  td.diagram-cell { padding: 10px !important; text-align: center; background: #FFFFFF; }
  td.diagram-cell svg { max-width: 100%; max-height: 170px; }
  td.diagram-legend { background: #F4F6FA; font-size: 7.5pt; color: #4A5263; text-align: center; padding: 4px !important; letter-spacing: .03em; }

  /* ─── MATERIALES (sub-tablas) ─── */
  table.matsub { width: 100%; border-collapse: collapse; margin-bottom: 5px; border: 1px solid #C8D0E0; table-layout: fixed; }
  table.matsub > thead > tr.matsub-hdr > td {
    padding: 7px 10px; font-size: 8.5pt; font-weight: 800; color: #FFFFFF;
    text-transform: uppercase; letter-spacing: .03em;
  }
  table.matsub.perfiles  thead tr.matsub-hdr > td { background: #3B5BA9; }
  table.matsub.vidrio    thead tr.matsub-hdr > td { background: #1F8A4C; }
  table.matsub.acc       thead tr.matsub-hdr > td { background: #6E4AA5; }
  table.matsub.total54   thead tr.matsub-hdr > td { background: #C68900; }

  table.matsub > thead > tr.cols > td {
    background: #ECF1F9; color: #1F2D52;
    font-size: 6.5pt; font-weight: 800; padding: 5px 3px;
    text-transform: uppercase; letter-spacing: 0;
    border-bottom: 1px solid #C8D0E0; text-align: left;
    white-space: nowrap;
  }
  table.matsub > thead > tr.cols > td.num { text-align: right; }
  table.matsub > thead > tr.cols > td.center { text-align: center; }

  table.matsub > tbody > tr > td {
    padding: 3px 4px; font-size: 7.5pt;
    border-bottom: 1px solid #ECF1F9; vertical-align: middle;
    word-wrap: break-word; overflow-wrap: break-word;
    line-height: 1.25;
  }
  table.matsub > tbody > tr > td.num { text-align: right; font-weight: 600; white-space: nowrap; padding-left: 2px; padding-right: 4px; }
  table.matsub > tbody > tr > td.center { text-align: center; white-space: nowrap; padding-left: 2px; padding-right: 2px; }
  table.matsub > tbody > tr:last-child > td { border-bottom: 0; }

  table.matsub > tfoot > tr > td {
    padding: 5px 4px; background: #ECF1F9; font-size: 7.5pt; font-weight: 800;
    color: #1F2D52; text-transform: uppercase; letter-spacing: .02em;
    border-top: 1px solid #1F2D52;
  }
  table.matsub > tfoot > tr > td.num { text-align: right; white-space: nowrap; padding-left: 2px; padding-right: 4px; }

  table.matsub.vidrio thead tr.cols td { background: #D9F5DE; color: #1F8A4C; }
  table.matsub.vidrio tfoot tr td       { background: #D9F5DE; color: #1F8A4C; }
  table.matsub.acc    thead tr.cols td  { background: #E7DDF7; color: #6E4AA5; }
  table.matsub.acc    tfoot tr td       { background: #E7DDF7; color: #6E4AA5; }
  table.matsub.total54 tbody tr td      { background: #FFFBE8; }
  table.matsub.total54 tbody tr:last-child td {
    background: #FFF1B8; color: #6B5400; font-weight: 800; border-top: 1px solid #C68900;
  }

  /* ─── RESUMEN ECONÓMICO ─── */
  table.econ { width: 100%; border-collapse: separate; border-spacing: 0 4px; margin-top: 0; table-layout: fixed; }
  table.econ > tbody > tr > td {
    padding: 9px 11px; font-size: 9pt; font-weight: 800;
    text-transform: uppercase; letter-spacing: .02em;
    border: 1px solid transparent;
  }
  table.econ > tbody > tr > td.k { font-size: 8.5pt; width: 62%; }
  table.econ > tbody > tr > td.v { text-align: right; font-size: 9.5pt; font-weight: 900; white-space: nowrap; }

  tr.materiales > td   { background: #3B5BA9; color: #FFFFFF; }
  tr.mo > td           { background: #FFF1B8; color: #6B5400; border-color: #FBC841 !important; }
  tr.utilidad > td     { background: #FFF1B8; color: #6B5400; border-color: #FBC841 !important; }
  tr.subtotal > td     { background: #1F2D52; color: #FFFFFF; }
  tr.iva > td          { background: #1F2D52; color: #FFFFFF; }
  tr.sininst > td      { background: #2EBA6A; color: #FFFFFF; }
  tr.sininst > td.v    { font-size: 11pt; }
  tr.instalacion > td  { background: #FFFBE8; color: #C68900; border-color: #FBC841 !important; }
  tr.instalacion > td.v { color: #C68900; }
  tr.totalfinal > td   { background: #1F2D52; color: #FFFFFF; padding: 10px 11px; }
  tr.totalfinal > td.v { font-size: 11pt; }
  tr.transporte > td   { background: #D63B3B; color: #FFFFFF; border: 2px solid #D63B3B !important; }
  tr.proyecto > td     { background: #1F8A4C; color: #FFFFFF; padding: 12px 11px; }
  tr.proyecto > td.v   { font-size: 12pt; }

  /* ─── NOTAS ─── */
  table.notas { width: 100%; border-collapse: collapse; border: 1px solid #C8D0E0; margin-top: 6px; table-layout: fixed; }
  table.notas > thead > tr > td {
    padding: 6px 10px; background: #FFFFFF;
    font-size: 8.5pt; font-weight: 800; color: #1F2D52;
    text-transform: uppercase; letter-spacing: .06em;
    border-bottom: 1px solid #C8D0E0;
  }
  table.notas > tbody > tr > td {
    padding: 5px 10px 6px 22px; font-size: 8pt; color: #3D4456;
    line-height: 1.45; position: relative; background: #FFFFFF;
    word-wrap: break-word;
  }
  table.notas > tbody > tr > td:before {
    content: '•'; position: absolute; left: 10px; top: 5px;
    color: #3B5BA9; font-weight: 700; font-size: 9pt;
  }

  /* ─── FOOTER strip ─── */
  table.ftr { width: 100%; border-collapse: separate; border-spacing: 4px 0; margin-top: 6px; background: #ECF1F9; padding: 4px; table-layout: fixed; }
  table.ftr > tbody > tr > td {
    background: #FFFFFF; border: 1px solid #DCE0E8;
    padding: 6px 10px; vertical-align: middle; width: 20%;
  }
  table.ftr .ico {
    display: inline-block; background: #1F2D52; color: #FFFFFF;
    width: 18px; height: 18px; line-height: 18px;
    text-align: center; font-size: 9pt;
    margin-right: 6px; vertical-align: middle;
  }
  table.ftr .ico svg { width: 11px; height: 11px; fill: #FFFFFF; vertical-align: middle; }
  table.ftr .k { display: inline-block; font-size: 7pt; color: #6B7280; text-transform: uppercase; letter-spacing: .03em; font-weight: 700; margin-right: 5px; vertical-align: middle; }
  table.ftr .v { display: inline-block; font-size: 8.5pt; color: #1A2233; font-weight: 800; vertical-align: middle; }

  .page { width: 100%; page-break-after: always; }
  .page:last-child { page-break-after: auto; }

  /* ─── Página de RESUMEN ECONÓMICO (la última) ──────────────────────────
   * Tiene más contenido en col 2 (Parámetros + Transportes + Materiales
   * por Ventana) que en cualquier página de ventana. Para que el footer
   * strip no se desborde a una página extra, compactamos sutilmente los
   * paddings — pero mantenemos los font-sizes intactos para no perder
   * legibilidad. */
  .page-proyecto table.sec > thead > tr > td.sec-hdr { padding: 5px 10px; }
  .page-proyecto table.sec > tbody > tr > td { padding: 4px 10px; }
  .page-proyecto .sec table td.param-note { padding: 2px 10px 3px !important; line-height: 1.2; }
  .page-proyecto table.sec { margin-bottom: 4px; }

  .page-proyecto table.econ { border-spacing: 0 3px; }
  .page-proyecto table.econ > tbody > tr > td { padding: 4.5px 11px; }
  .page-proyecto table.econ > tbody > tr.totalfinal > td { padding: 5.5px 11px; }
  .page-proyecto table.econ > tbody > tr.proyecto > td { padding: 6px 11px; }

  .page-proyecto table.notas { margin-top: 5px; }
  .page-proyecto table.notas > thead > tr > td { padding: 5px 10px; }
  .page-proyecto table.notas > tbody > tr > td { padding: 3px 10px 3px 22px; line-height: 1.3; }

  .page-proyecto table.ftr { margin-top: 4px; padding: 3px; }
  .page-proyecto table.ftr > tbody > tr > td { padding: 5px 10px; }
`;

// ── Helpers de iconos ─────────────────────────────────────────────────────
const ICONS = {
  ventana: '<svg viewBox="0 0 24 24"><path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z"/></svg>',
  truck:   '<svg viewBox="0 0 24 18"><path d="M0 0h14v13H0V0zm15 4h5l3 4v5h-8V4zM4 14a2 2 0 100 4 2 2 0 000-4zm14 0a2 2 0 100 4 2 2 0 000-4z"/></svg>',
  doc:     '<svg viewBox="0 0 24 24"><path d="M5 2h11l5 5v15H5V2zm10 1v5h5l-5-5zM7 11h10v2H7v-2zm0 4h10v2H7v-2zm0-8h7v2H7V7z"/></svg>',
  scale:   '<svg viewBox="0 0 24 24"><path d="M11 2h2v20h-2V2zM3 7l4 8h-4l4-8H3zm14 0l4 8h-4l4-8h-4z"/></svg>',
  shape:   '<svg viewBox="0 0 24 24"><path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z"/></svg>',
};

// ═══ Página de UNA ventana — SOLO datos de esa ventana ═════════════════════
function _buildVentanaPage(w, idx, totalVentanas, ctx) {
  const { quotationInfo, customer } = ctx;
  const fecha    = fmtFecha(quotationInfo.fecha);
  const cotNum   = quotationInfo.numero;
  const cliente  = customer.nombre;

  // Medidas: el builder entrega width/height en METROS. Mostramos en la unidad
  // de la ventana (cm o mm), nunca en m.
  const ancho_m = (w.dimensions?.width  || parseFloat(w.ancho) || 0);
  const alto_m  = (w.dimensions?.height || parseFloat(w.alto)  || 0);
  const perim_m = ancho_m * 2 + alto_m * 2;
  const area_vidrio = (w.glasses || []).reduce((s,g) => s + (parseFloat(g.areaTotal)||0), 0);

  const uMed = (w.unidad || 'cm').toLowerCase() === 'mm' ? 'mm' : 'cm';
  const factorMed = uMed === 'mm' ? 1000 : 100;
  const anchoEnU = ancho_m * factorMed;
  const altoEnU  = alto_m  * factorMed;
  const decU = uMed === 'mm' ? 1 : 2;

  // Materiales de ESTA ventana (sin recargo, sin MO, sin IVA)
  const totalProfiles = (w.totals?.profiles) || (w.profiles||[]).reduce((s,p)=>s+(parseFloat(p.subtotal)||0),0);
  const totalGlasses  = (w.totals?.glasses)  || (w.glasses ||[]).reduce((s,g)=>s+(parseFloat(g.subtotal)||0),0);
  const totalAcc      = (w.totals?.accessories) || (w.accessories||[]).reduce((s,a)=>s+(parseFloat(a.subtotal)||0),0);
  const matVentana    = totalProfiles + totalGlasses + totalAcc;

  // ── HEADER ──
  const head = `
    <table class="hdr">
      <tr>
        <td class="hdr-brand">
          <div class="row">
            <div class="ico-cell"><img class="ic-img" src="${LOGO_EMBLEMA}" alt="CorteAlum"/></div>
            <div class="t">
              <h1>COTIZADOR PROFESIONAL</h1>
              <h2>VENTANAS DE ALUMINIO</h2>
              <p>Detalle de Ventana ${idx+1} de ${totalVentanas}</p>
            </div>
          </div>
        </td>
        <td class="hdr-meta-wrap">
          <table class="hdr-meta">
            <tr>
              <td><div class="lbl">FECHA</div><div class="val">${esc(fecha)}</div></td>
              <td><div class="lbl">COTIZACIÓN N°</div><div class="val">${esc(cotNum)}</div></td>
              <td><div class="lbl">CLIENTE</div><div class="val">${esc(cliente)}</div></td>
              <td><div class="lbl">VENTANA</div><div class="val">${esc(w.name || 'V'+(idx+1))} · ${esc(w.line || w.perfil || '')} ${esc(w.design || w.diseno || '')}</div></td>
            </tr>
          </table>
        </td>
        <td class="hdr-total">
          <div class="lbl">MATERIALES VENTANA</div>
          <div class="val">${fmtCOP(matVentana)}</div>
          <div class="note">SIN RECARGO NI IVA</div>
        </td>
      </tr>
    </table>`;

  // ── COL 1: SELECCIÓN + MEDIDAS ──
  const col1 = `
    <table class="sec">
      <thead><tr><td class="sec-hdr">1. Selección de Ventana</td></tr></thead>
      <tbody>
        <tr><td><table style="width:100%"><tr><td class="k">Sistema</td><td class="v">${esc(w.system || w.sistema || '—')}</td></tr></table></td></tr>
        <tr><td><table style="width:100%"><tr><td class="k">Perfil</td><td class="v">${esc(w.line || w.perfil || '—')}</td></tr></table></td></tr>
        <tr><td><table style="width:100%"><tr><td class="k">Diseño</td><td class="v">${esc(w.design || w.diseno || '—')}</td></tr></table></td></tr>
        <tr><td><table style="width:100%"><tr><td class="k">Tipo de Vidrio</td><td class="v">${esc(w.glassType || w.tipo_vidrio || w.vidrio || '5MM')}</td></tr></table></td></tr>
      </tbody>
    </table>
    <table class="sec grow">
      <thead><tr><td class="sec-hdr blue">2. Medidas</td></tr></thead>
      <tbody>
        <tr><td><table style="width:100%"><tr><td class="k">Ancho (${uMed})</td><td class="v">${fmtNum(anchoEnU, decU)}</td></tr></table></td></tr>
        <tr><td><table style="width:100%"><tr><td class="k">Alto (${uMed})</td><td class="v">${fmtNum(altoEnU, decU)}</td></tr></table></td></tr>
        <tr><td><table style="width:100%"><tr><td class="k">Perímetro Total</td><td class="v">${fmtNum(perim_m, 2)} m</td></tr></table></td></tr>
        <tr><td><table style="width:100%"><tr><td class="k">Área Total Vidrio</td><td class="v">${fmtNum(area_vidrio, 2)} m²</td></tr></table></td></tr>
      </tbody>
    </table>`;

  // ── COL 2: VISTA + RESUMEN DEL DISEÑO ──
  // El builder entrega width/height en METROS — pasarlos directos.
  // La unidad de cota es la de la ventana.
  const svg = w.svg || buildVentanaSVG(w.design || w.diseno || 'XX', ancho_m, alto_m, w.unidad || 'cm');
  const dis = (w.design || w.diseno || '').toUpperCase();
  const totalHojas    = dis.replace(/[^XO]/gi,'').length || 0;
  const hojasMoviles  = (dis.match(/X/gi) || []).length;
  const hojasFijas    = (dis.match(/O/gi) || []).length;
  const cerraduras    = hojasMoviles > 0 ? Math.max(1, Math.floor(hojasMoviles / 2)) : 0;
  const rodamientos   = hojasMoviles * 2;

  const col2 = `
    <table class="sec">
      <thead><tr><td class="sec-hdr blue">Vista del Diseño Seleccionado</td></tr></thead>
      <tbody>
        <tr><td class="diagram-cell">${svg}</td></tr>
        <tr><td class="diagram-legend">F: Fija &nbsp;·&nbsp; ↔ Móvil</td></tr>
      </tbody>
    </table>
    <table class="sec grow">
      <thead><tr><td class="sec-hdr">Resumen del Diseño</td></tr></thead>
      <tbody>
        <tr><td><table style="width:100%"><tr><td class="k">Total Hojas</td><td class="v">${totalHojas}</td></tr></table></td></tr>
        <tr><td><table style="width:100%"><tr><td class="k">Hojas Móviles</td><td class="v">${hojasMoviles}</td></tr></table></td></tr>
        <tr><td><table style="width:100%"><tr><td class="k">Hojas Fijas</td><td class="v">${hojasFijas}</td></tr></table></td></tr>
        <tr><td><table style="width:100%"><tr><td class="k">Rodamientos Req.</td><td class="v">${rodamientos}</td></tr></table></td></tr>
        <tr><td><table style="width:100%"><tr><td class="k">Cerraduras</td><td class="v">${cerraduras}</td></tr></table></td></tr>
      </tbody>
    </table>`;

  // ── COL 3: PERFILES + VIDRIO ──
  const perfRows = (w.profiles || []).length === 0
    ? '<tr><td colspan="5" style="text-align:center;color:#8C939B;padding:5px;font-style:italic">Sin perfiles</td></tr>'
    : (w.profiles || []).map(p => `
        <tr>
          <td>${esc(p.name)}</td>
          <td class="num">${p.pieces != null ? fmtNum(p.pieces, 0) + ' und' : fmtNum(p.quantity, 1)}</td>
          <td class="num">${fmtNum(p.quantity, 1)} ${esc(p.unit||'cm')}</td>
          <td class="num">${fmtCOP(p.price)}</td>
          <td class="num">${fmtCOP(p.subtotal)}</td>
        </tr>`).join('');

  const vidRows = (w.glasses || []).length === 0
    ? '<tr><td colspan="4" style="text-align:center;color:#8C939B;padding:5px;font-style:italic">Sin vidrios</td></tr>'
    : (w.glasses || []).map(g => `
        <tr>
          <td>${esc(g.tipo || g.description || 'Vidrio')}</td>
          <td class="center">${g.quantity || g.count || 1}</td>
          <td class="num">${fmtNum(g.areaTotal, 2)} m²</td>
          <td class="num">${fmtCOP(g.priceM2 || g.pricePerM2 || 0)}</td>
        </tr>`).join('');

  const col3 = `
    <table class="matsub perfiles grow">
      <colgroup>
        <col style="width:30%"/>
        <col style="width:12%"/>
        <col style="width:16%"/>
        <col style="width:20%"/>
        <col style="width:22%"/>
      </colgroup>
      <thead>
        <tr class="matsub-hdr"><td colspan="5">5.1 Perfiles de Aluminio</td></tr>
        <tr class="cols">
          <td>Descripción</td>
          <td class="num">Cálc.</td>
          <td class="num">Usado</td>
          <td class="num">Precio</td>
          <td class="num">Total</td>
        </tr>
      </thead>
      <tbody>${perfRows}</tbody>
      <tfoot><tr><td colspan="4">Total Perfiles</td><td class="num">${fmtCOP(totalProfiles)}</td></tr></tfoot>
    </table>
    <table class="matsub vidrio">
      <colgroup>
        <col style="width:46%"/>
        <col style="width:10%"/>
        <col style="width:20%"/>
        <col style="width:24%"/>
      </colgroup>
      <thead>
        <tr class="matsub-hdr"><td colspan="4">5.2 Vidrio</td></tr>
        <tr class="cols">
          <td>Descripción</td>
          <td class="center">Cant.</td>
          <td class="num">m²</td>
          <td class="num">Precio m²</td>
        </tr>
      </thead>
      <tbody>${vidRows}</tbody>
      <tfoot><tr><td colspan="3">Total Vidrio</td><td class="num">${fmtCOP(totalGlasses)}</td></tr></tfoot>
    </table>`;

  // ── COL 4: ACCESORIOS + TOTAL MATERIALES ──
  const accRows = (w.accessories || []).length === 0
    ? '<tr><td colspan="5" style="text-align:center;color:#8C939B;padding:5px;font-style:italic">Sin accesorios</td></tr>'
    : (w.accessories || []).map(a => `
        <tr>
          <td>${esc(a.name)}</td>
          <td class="num">${fmtNum(a.quantity, 1)}</td>
          <td class="center">${esc(fmtUnidad(a.unit))}</td>
          <td class="num">${fmtCOP(a.price)}</td>
          <td class="num">${fmtCOP(a.subtotal)}</td>
        </tr>`).join('');

  const col4 = `
    <table class="matsub acc grow">
      <colgroup>
        <col style="width:32%"/>
        <col style="width:11%"/>
        <col style="width:13%"/>
        <col style="width:22%"/>
        <col style="width:22%"/>
      </colgroup>
      <thead>
        <tr class="matsub-hdr"><td colspan="5">5.3 Accesorios</td></tr>
        <tr class="cols">
          <td>Descripción</td>
          <td class="num">Cant.</td>
          <td class="center">Unid.</td>
          <td class="num">Precio</td>
          <td class="num">Total</td>
        </tr>
      </thead>
      <tbody>${accRows}</tbody>
      <tfoot><tr><td colspan="4">Total Accesorios</td><td class="num">${fmtCOP(totalAcc)}</td></tr></tfoot>
    </table>
    <table class="matsub total54">
      <colgroup>
        <col style="width:60%"/>
        <col style="width:40%"/>
      </colgroup>
      <thead><tr class="matsub-hdr"><td colspan="2">5.4 Total Materiales (Ventana)</td></tr></thead>
      <tbody>
        <tr><td>Perfiles</td><td class="num">${fmtCOP(totalProfiles)}</td></tr>
        <tr><td>Vidrio</td><td class="num">${fmtCOP(totalGlasses)}</td></tr>
        <tr><td>Accesorios</td><td class="num">${fmtCOP(totalAcc)}</td></tr>
        <tr><td><strong>Subtotal Materiales</strong></td><td class="num"><strong>${fmtCOP(matVentana)}</strong></td></tr>
      </tbody>
    </table>`;

  // ── FOOTER ──
  const footerStrip = `
    <table class="ftr">
      <tr>
        <td><span class="ico">${ICONS.shape}</span><span class="k">Sistema</span><span class="v">${esc(w.line || w.perfil || '')} ${esc((w.system || w.sistema || '').toUpperCase())}</span></td>
        <td><span class="ico">${ICONS.ventana}</span><span class="k">Diseño</span><span class="v">${esc(w.design || w.diseno || '')}</span></td>
        <td><span class="ico">${ICONS.scale}</span><span class="k">Medidas</span><span class="v">${fmtNum(anchoEnU, decU)} × ${fmtNum(altoEnU, decU)} ${uMed}</span></td>
        <td><span class="ico">${ICONS.ventana}</span><span class="k">Vidrio</span><span class="v">${esc(w.glassType || w.tipo_vidrio || w.vidrio || '5MM')}</span></td>
        <td><span class="ico">${ICONS.doc}</span><span class="k">Página</span><span class="v">Ventana ${idx+1}/${totalVentanas}</span></td>
      </tr>
    </table>`;

  return `
    <div class="page">
      ${head}
      <table class="body">
        <tr>
          <td class="c1"><div class="cflex">${col1}</div></td>
          <td class="c2"><div class="cflex">${col2}</div></td>
          <td class="c3"><div class="cflex">${col3}</div></td>
          <td class="c4"><div class="cflex">${col4}</div></td>
        </tr>
      </table>
      ${footerStrip}
    </div>`;
}

// ═══ Página final del PROYECTO ═════════════════════════════════════════════
function _buildProyectoPage(ctx) {
  const { quotationInfo, customer, projectInfo, totals, globalCosts, windows } = ctx;

  const fecha    = fmtFecha(quotationInfo.fecha);
  const cotNum   = quotationInfo.numero;
  const cliente  = customer.nombre;
  const proyecto = projectInfo.nombre;

  // Mano de obra
  const dias    = globalCosts.diasManoObra || globalCosts.diasProyectados || 0;
  const pers    = globalCosts.personas || globalCosts.cantidadPersonas || 1;
  const moTotal = parseFloat(globalCosts.costoManoObraTotal || globalCosts.manoObra || 0);
  const utilVal = parseFloat(globalCosts.utilidad || globalCosts.utilidadValor || 0);
  const utilPct = globalCosts.utilidadPct || 30;
  const valorDiaOficial = (dias > 0 && pers > 0) ? Math.round(moTotal / dias / pers / 1.5) : 0;
  const recargoTransp   = Math.round(valorDiaOficial * 0.5);
  const valorDiaReal    = valorDiaOficial + recargoTransp;

  // Transportes + Instalación
  const transpEst   = parseFloat(globalCosts.transporteEstructuras || 0);
  const transpPers  = parseFloat(globalCosts.transportePersonal || 0);
  const subTransp   = transpEst + transpPers;
  const instalacion = parseFloat(globalCosts.instalacion || 0);

  // Totales
  const matProyectoConR = parseFloat(totals.materialesConRecargo || globalCosts.subtotalMaterialesRecargo || 0);
  const moProyecto      = parseFloat(totals.manoObra || moTotal);
  const utilProyecto    = parseFloat(totals.utilidad || utilVal);
  const subtotal        = parseFloat(totals.subtotal || (matProyectoConR + moProyecto + utilProyecto));
  const ivaPct          = globalCosts.ivaPct || 19;
  const ivaVal          = parseFloat(totals.iva || globalCosts.ivaValor || (subtotal * ivaPct / 100));
  const totalSinIns     = parseFloat(totals.totalSinInstalacion || (subtotal + ivaVal));
  const totalConIns     = parseFloat(totals.totalConInstalacion || (totalSinIns + instalacion));
  // totalProyecto = "Total Final con todo aparte" = totalConInstalacion + transportes
  // Antes leía totals.totalFinal primero (que ahora vale totalConInstalacion sin
  // transportes), por eso el header mostraba un valor inconsistente con la suma
  // de la cascada económica.
  const totalProyecto   = parseFloat(totals.totalConTransporte || (totalConIns + subTransp));

  const head = `
    <table class="hdr">
      <tr>
        <td class="hdr-brand">
          <div class="row">
            <div class="ico-cell"><img class="ic-img" src="${LOGO_EMBLEMA}" alt="CorteAlum"/></div>
            <div class="t">
              <h1>COTIZADOR PROFESIONAL</h1>
              <h2>VENTANAS DE ALUMINIO</h2>
              <p>Resumen Económico del Proyecto</p>
            </div>
          </div>
        </td>
        <td class="hdr-meta-wrap">
          <table class="hdr-meta">
            <tr>
              <td><div class="lbl">FECHA</div><div class="val">${esc(fecha)}</div></td>
              <td><div class="lbl">COTIZACIÓN N°</div><div class="val">${esc(cotNum)}</div></td>
              <td><div class="lbl">CLIENTE</div><div class="val">${esc(cliente)}</div></td>
              <td><div class="lbl">PROYECTO</div><div class="val">${esc(proyecto)}</div></td>
            </tr>
          </table>
        </td>
        <td class="hdr-total">
          <div class="lbl">TOTAL PROYECTO</div>
          <div class="val">${fmtCOP(totalProyecto)}</div>
          <div class="note">${subTransp > 0 ? 'IVA + INSTALACIÓN + TRANSPORTES' : 'IVA + INSTALACIÓN APARTE'}</div>
        </td>
      </tr>
    </table>`;

  // ── COL 1: MANO DE OBRA + INSTALACIÓN ──
  const col1 = `
    <table class="sec grow">
      <thead><tr><td class="sec-hdr">3. Mano de Obra (Proyecto)</td></tr></thead>
      <tbody>
        <tr><td><table style="width:100%"><tr><td class="k">Días de Trabajo</td><td class="v">${fmtNum(dias, 0)}</td></tr></table></td></tr>
        <tr><td><table style="width:100%"><tr><td class="k">N° de Personas</td><td class="v">${fmtNum(pers, 0)}</td></tr></table></td></tr>
        <tr><td><table style="width:100%"><tr><td class="k">Valor Día Oficial</td><td class="v">${fmtCOP(valorDiaOficial)}</td></tr></table></td></tr>
        <tr><td><table style="width:100%"><tr><td class="k">Recargo Transp. (50%)</td><td class="v">${fmtCOP(recargoTransp)}</td></tr></table></td></tr>
        <tr><td><table style="width:100%"><tr><td class="k">Valor Día Real</td><td class="v">${fmtCOP(valorDiaReal)}</td></tr></table></td></tr>
        <tr><td><table style="width:100%"><tr><td class="k">Total Mano de Obra</td><td class="v">${fmtCOP(moTotal)}</td></tr></table></td></tr>
        <tr><td><table style="width:100%"><tr><td class="k">Utilidad (${fmtNum(utilPct,0)}% MO)</td><td class="v">${fmtCOP(utilVal)}</td></tr></table></td></tr>
      </tbody>
    </table>
    <table class="sec yellow">
      <thead><tr><td class="sec-hdr yellow">4. Instalación (Aparte)</td></tr></thead>
      <tbody>
        <tr><td><table style="width:100%"><tr><td class="k">Valor Instalación</td><td class="v">${fmtCOP(instalacion)}</td></tr></table></td></tr>
      </tbody>
    </table>`;

  // ── COL 2: PARÁMETROS + TRANSPORTES + RESUMEN VENTANAS ──
  const recargoPct = globalCosts.recargoMaterialesPct || globalCosts.recargoPct || 25;

  const ventanasResumen = (windows || []).map((w, i) => {
    const matVent = ((w.totals?.profiles||0) + (w.totals?.glasses||0) + (w.totals?.accessories||0));
    const label = `V${i+1} · ${(w.line||w.perfil||'') + ((w.design||w.diseno) ? ' '+(w.design||w.diseno) : '')}`;
    return `<tr><td><table style="width:100%"><tr><td class="k">${esc(label)}</td><td class="v">${fmtCOP(matVent)}</td></tr></table></td></tr>`;
  }).join('');

  const col2 = `
    <table class="sec">
      <thead><tr><td class="sec-hdr">Parámetros Generales</td></tr></thead>
      <tbody>
        <tr><td><table style="width:100%"><tr><td class="k">Recargo Materiales</td><td class="v">${fmtNum(recargoPct, 0)}%</td></tr></table></td></tr>
        <tr><td class="param-note">16% desperdicio · 9% costos indirectos</td></tr>
        <tr><td><table style="width:100%"><tr><td class="k">Utilidad sobre MO</td><td class="v">${fmtNum(utilPct, 0)}%</td></tr></table></td></tr>
        <tr><td class="param-note">Margen del especialista sobre la mano de obra</td></tr>
        <tr><td><table style="width:100%"><tr><td class="k">Recargo Transporte MO</td><td class="v">50%</td></tr></table></td></tr>
        <tr><td class="param-note">Traslados, cotizaciones y compras de material</td></tr>
        <tr><td><table style="width:100%"><tr><td class="k">IVA</td><td class="v">${fmtNum(ivaPct, 0)}%</td></tr></table></td></tr>
        <tr><td class="param-note">Sobre subtotal (materiales + MO + utilidad)</td></tr>
      </tbody>
    </table>
    <table class="sec red">
      <thead><tr><td class="sec-hdr red">7. Transportes Generales (Aparte)</td></tr></thead>
      <tbody>
        <tr><td><table style="width:100%"><tr><td class="k">Estructuras (ida)</td><td class="v">${fmtCOP(transpEst)}</td></tr></table></td></tr>
        <tr><td><table style="width:100%"><tr><td class="k">Personal / herramientas</td><td class="v">${fmtCOP(transpPers)}</td></tr></table></td></tr>
        <tr class="total-row"><td><table style="width:100%"><tr><td class="k">Subtotal Transportes</td><td class="v">${fmtCOP(subTransp)}</td></tr></table></td></tr>
      </tbody>
    </table>
    ${windows && windows.length > 1 ? `
    <table class="sec">
      <thead><tr><td class="sec-hdr">Materiales por Ventana</td></tr></thead>
      <tbody>${ventanasResumen}</tbody>
    </table>` : ''}`;

  // ── COL 3: RESUMEN ECONÓMICO ──
  const col3 = `
    <table class="econ grow">
      <tr class="materiales"><td class="k">Total Materiales</td><td class="v">${fmtCOP(matProyectoConR)}</td></tr>
      <tr class="mo"><td class="k">Total Mano de Obra</td><td class="v">${fmtCOP(moProyecto)}</td></tr>
      <tr class="utilidad"><td class="k">Utilidad (${fmtNum(utilPct,0)}% MO)</td><td class="v">${fmtCOP(utilProyecto)}</td></tr>
      <tr class="subtotal"><td class="k">Subtotal</td><td class="v">${fmtCOP(subtotal)}</td></tr>
      <tr class="iva"><td class="k">IVA (${fmtNum(ivaPct,0)}%)</td><td class="v">${fmtCOP(ivaVal)}</td></tr>
      <tr class="sininst"><td class="k">Total sin Instalación</td><td class="v">${fmtCOP(totalSinIns)}</td></tr>
      <tr class="instalacion"><td class="k">Instalación (Aparte)</td><td class="v">${fmtCOP(instalacion)}</td></tr>
      <tr class="totalfinal"><td class="k">Total Final${subTransp > 0 ? ' (Sin Transp.)' : ''}</td><td class="v">${fmtCOP(totalConIns)}</td></tr>
      ${subTransp > 0 ? `<tr class="transporte"><td class="k">Transportes (Aparte)</td><td class="v">${fmtCOP(subTransp)}</td></tr>` : ''}
      <tr class="proyecto"><td class="k">Total Proyecto</td><td class="v">${fmtCOP(totalProyecto)}</td></tr>
    </table>`;

  // ── COL 4: NOTAS ──
  const subtotalMatPlano = parseFloat(globalCosts.subtotalMateriales || 0);
  const recargoMatVal = matProyectoConR - subtotalMatPlano;

  const col4 = `
    <table class="notas">
      <thead><tr><td>Notas</td></tr></thead>
      <tbody>
        <tr><td>Precios sujetos a cambios sin previo aviso.</td></tr>
        <tr><td>Cotización válida ${quotationInfo.validez_dias || 15} días.</td></tr>
        <tr><td>Materiales calculados según medidas y diseño seleccionado.</td></tr>
        <tr><td>Instalación y transportes <strong>no incluidos</strong> en el Total Final.</td></tr>
        <tr><td>Mano de obra, IVA y porcentajes son a nivel <strong>proyecto</strong> (no por ventana).</td></tr>
        ${quotationInfo.notas ? '<tr><td>' + esc(quotationInfo.notas) + '</td></tr>' : ''}
      </tbody>
    </table>
    <table class="notas grow">
      <thead><tr><td>Resumen General</td></tr></thead>
      <tbody>
        <tr><td>Total ventanas: <strong>${(windows||[]).length}</strong></td></tr>
        <tr><td>Materiales (sin recargo): <strong>${fmtCOP(subtotalMatPlano)}</strong></td></tr>
        <tr><td>Recargo (${fmtNum(recargoPct, 0)}%): <strong>${fmtCOP(recargoMatVal)}</strong></td></tr>
        <tr><td>Total a pagar: <strong>${fmtCOP(totalProyecto)}</strong></td></tr>
      </tbody>
    </table>`;

  // ── FOOTER ──
  const footerStrip = `
    <table class="ftr">
      <tr>
        <td><span class="ico">${ICONS.shape}</span><span class="k">Total Ventanas</span><span class="v">${(windows||[]).length}</span></td>
        <td><span class="ico">${ICONS.scale}</span><span class="k">IVA</span><span class="v">${fmtNum(ivaPct,0)}%</span></td>
        <td><span class="ico">${ICONS.doc}</span><span class="k">Validez</span><span class="v">${quotationInfo.validez_dias || 15} días</span></td>
        <td><span class="ico">${ICONS.ventana}</span><span class="k">Versión</span><span class="v">v${quotationInfo.version || 1}${quotationInfo.es_oficial ? ' · OFICIAL' : ''}</span></td>
        <td><span class="ico">${ICONS.doc}</span><span class="k">Cotización N°</span><span class="v">${esc(cotNum)}</span></td>
      </tr>
    </table>`;

  return `
    <div class="page page-proyecto">
      ${head}
      <table class="body">
        <tr>
          <td class="c1"><div class="cflex">${col1}</div></td>
          <td class="c2"><div class="cflex">${col2}</div></td>
          <td class="c3"><div class="cflex">${col3}</div></td>
          <td class="c4"><div class="cflex">${col4}</div></td>
        </tr>
      </table>
      ${footerStrip}
    </div>`;
}

// ═══ RENDER PRINCIPAL ═══════════════════════════════════════════════════════
function renderHTML(pq) {
  const { projectInfo, customer, quotationInfo, windows, globalCosts, totals } = pq;
  const ctx = { quotationInfo, customer, projectInfo, totals, globalCosts, windows };

  const ventanaPages = (windows || []).map((w, i) =>
    _buildVentanaPage(w, i, windows.length, ctx)
  ).join('');

  const proyectoPage = _buildProyectoPage(ctx);

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <title>${esc(quotationInfo.numero)} — ${esc(projectInfo.nombre)}</title>
  <style>${CSS}</style>
</head>
<body>
  ${ventanaPages}
  ${proyectoPage}
</body>
</html>`;
}

module.exports = { renderHTML, buildVentanaSVG };
