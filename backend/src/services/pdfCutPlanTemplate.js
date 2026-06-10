/**
 * CorteAlum — PDF Template del PLAN DE CORTE / OPTIMIZACIÓN
 * ─────────────────────────────────────────────────────────────────────────────
 * Documento técnico que el taller usa para cortar las barras.
 *
 * Diseño v24:
 *   - Paleta sistema: primary #1565C0, steel #0D1B2A→#3A424C,
 *     success #1E7B4B, warning #A0660A, danger #C0392B.
 *   - Tipografía sistema: Barlow Condensed (display), Barlow (body),
 *     JetBrains Mono (números, ubicaciones, IDs).
 *   - Estética industrial: alto contraste, mucho espacio en blanco,
 *     bordes finos, sin gradientes "marketing". Pensado para imprimirse.
 *
 * Estructura:
 *   1. Header con marca + datos del proyecto + fecha de generación
 *   2. Resumen ejecutivo (5 KPIs)
 *   3. Inventario de ventanas
 *   4. Plan de corte por PERFIL+COLOR (cards con SVG y tabla de cortes)
 *   5. Pie de página con identificación del documento
 */

// ── Helpers de formato ─────────────────────────────────────────────────────
// Formateador manual estilo es-CO (Node small-icu puede no tener este locale).
// Punto como separador de miles, coma como separador decimal.
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

const fmtCmAdapt = (cm, maxDec = 1) => {
  const v = parseFloat(cm) || 0;
  // Mostrar enteros sin decimales para no llenar de "0,0" innecesariamente.
  const esEntero = Math.abs(v - Math.round(v)) < 1e-9;
  return _formatLatino(v, esEntero ? 0 : maxDec);
};

const fmtPct = (n, maxDec = 1) => {
  return _formatLatino(parseFloat(n) || 0, maxDec) + '%';
};

const fmtFecha = (iso) => {
  try {
    const d = iso ? new Date(iso) : new Date();
    return d.toLocaleDateString('es-CO', { day:'2-digit', month:'2-digit', year:'numeric' }) +
           ' ' + d.toLocaleTimeString('es-CO', { hour:'2-digit', minute:'2-digit' });
  } catch { return '—'; }
};

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ── Paleta de ubicaciones (mantiene variedad para distinguir piezas a simple
//    vista, pero ajustada a tonos compatibles con la paleta del sistema) ────
const SEC_COLOR_BG = {
  'MARCO':           '#E3F2FD', // primary-light
  'MARCO 744':       '#D6E9FB',
  'NAVE MOVIL':      '#FEF3DC', // warning-light
  'NAVE MÓVIL':      '#FEF3DC',
  'NAVE FIJA':       '#E3EEFF', // info-light
  'ADAPTADOR':       '#E8EAED', // steel-100
  'TRASLAPE':        '#FEF3DC',
  'ENGANCHE':        '#FDECEA', // danger-light
  'JAMBA':           '#E8F5EE', // success-light
  'CABEZAL':         '#E3F2FD',
  'SILLAR':          '#E3F2FD',
  'HORIZONTAL':      '#FEF3DC',
  'HORIZONTAL SUP':  '#FEF3DC',
  'HORIZONTAL INF':  '#FEF3DC',
  'VERTICAL':        '#FDECEA',
  'DEFAULT':         '#E8EAED',
};
const SEC_COLOR_FG = {
  'MARCO':           '#0D47A1', // primary-dark
  'MARCO 744':       '#0D47A1',
  'NAVE MOVIL':      '#A0660A', // warning
  'NAVE MÓVIL':      '#A0660A',
  'NAVE FIJA':       '#1565C0', // primary
  'ADAPTADOR':       '#3A424C', // steel-600
  'TRASLAPE':        '#A0660A',
  'ENGANCHE':        '#C0392B', // danger
  'JAMBA':           '#1E7B4B', // success
  'CABEZAL':         '#0D47A1',
  'SILLAR':          '#0D47A1',
  'HORIZONTAL':      '#A0660A',
  'HORIZONTAL SUP':  '#A0660A',
  'HORIZONTAL INF':  '#A0660A',
  'VERTICAL':        '#C0392B',
  'DEFAULT':         '#3A424C',
};
const bg = (u) => SEC_COLOR_BG[String(u || '').toUpperCase()] || SEC_COLOR_BG.DEFAULT;
const fg = (u) => SEC_COLOR_FG[String(u || '').toUpperCase()] || SEC_COLOR_FG.DEFAULT;

// ── Renderiza una BARRA como SVG inline con sus cortes ─────────────────────
function renderBarraSVG(barra, kerfCm = 0.3) {
  // Defensa: si la barra viene sin datos básicos, devolvemos un placeholder
  // en vez de generar un SVG roto que rompa el render del PDF.
  if (!barra || typeof barra !== 'object') {
    return '<div style="padding:8px;color:#8C939B;font-size:7pt">Barra sin datos</div>';
  }
  const W = 740, H = 32;
  const padX = 4;
  const total = parseFloat(barra.longitud_total_cm) || 0;
  if (total <= 0) {
    return '<div style="padding:8px;color:#8C939B;font-size:7pt">Barra con longitud 0</div>';
  }
  const cortes = Array.isArray(barra.cortes) ? barra.cortes : [];
  const escala = (W - padX*2) / total;
  let cursor = padX;
  const piezas = [];

  for (const c of cortes) {
    if (!c || c.longitud_cm == null) continue;
    const w = parseFloat(c.longitud_cm) * escala;
    const ubic = String(c.etiqueta || c.ubicacion || '').toUpperCase();
    // FIX overlap labels: el texto SVG en <text> no se clipea al rect,
    // así que en chips angostos se cabalga con el vecino.
    // Estrategia: caracteres permitidos según ancho del chip.
    //   w < 18px → sin label (chip diminuto)
    //   18-34px → 2 caracteres + ellipsis (vertical en muy angostos)
    //   34-60px → 4 caracteres
    //   60-100px → 6-7 caracteres
    //   >100px  → 12 caracteres
    const showLabel = w >= 18;
    const charsAvail = w < 34 ? 2 : w < 60 ? 4 : w < 100 ? 7 : 12;
    const showRotated = w >= 18 && w < 30;  // muy angosto: rotar
    const labelText = ubic.substring(0, charsAvail);
    const fontSize = w > 100 ? 9 : (w > 60 ? 7.5 : 6.5);

    let textBlock = '';
    if (showLabel) {
      if (showRotated) {
        textBlock = `<text x="${cursor + w/2}" y="${H/2 + 2}" text-anchor="middle"
          font-family="'JetBrains Mono',monospace" font-size="${fontSize}" font-weight="600"
          fill="${fg(ubic)}" transform="rotate(-90 ${cursor + w/2} ${H/2})">
          ${esc(labelText)}
        </text>`;
      } else {
        textBlock = `<text x="${cursor + w/2}" y="${H/2 - 1}" text-anchor="middle"
          font-family="'JetBrains Mono',monospace" font-size="${fontSize}" font-weight="600" fill="${fg(ubic)}">
          ${esc(labelText)}
        </text>`;
      }
    }
    // cm solo en chips con espacio suficiente (>50px) y no rotados
    const cmBlock = (w > 50 && !showRotated) ? `<text x="${cursor + w/2}" y="${H/2 + 10}" text-anchor="middle"
      font-family="'JetBrains Mono',monospace" font-size="6.2" fill="${fg(ubic)}" opacity="0.85">
      ${fmtCmAdapt(c.longitud_cm)} cm
    </text>` : '';

    piezas.push(`
      <rect x="${cursor}" y="0" width="${w}" height="${H}" fill="${bg(ubic)}" stroke="${fg(ubic)}" stroke-width="0.7" rx="1"/>
      ${textBlock}
      ${cmBlock}
    `);
    cursor += w + kerfCm * escala;
  }

  // Sobrante al final
  if (barra.sobrante_cm > 0.5) {
    const w = barra.sobrante_cm * escala;
    const reut = barra.sobrante_cm >= 20;
    const fillCol = reut ? '#E8F5EE' : '#FDECEA';
    const strokeCol = reut ? '#1E7B4B' : '#C0392B';
    piezas.push(`
      <rect x="${cursor}" y="0" width="${w}" height="${H}" fill="${fillCol}"
        stroke="${strokeCol}" stroke-width="0.8" stroke-dasharray="3 2" rx="1"/>
      ${w > 28 ? `<text x="${cursor + w/2}" y="${H/2 + 3}" text-anchor="middle"
        font-family="'JetBrains Mono',monospace" font-size="7.5" font-weight="600" fill="${strokeCol}">
        ${reut?'♻':'✕'} ${fmtCmAdapt(barra.sobrante_cm)} cm
      </text>` : ''}
    `);
  }

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="border:1px solid #C4BDB5;border-radius:4px;display:block;background:#FAF9F7">${piezas.join('')}</svg>`;
}

// ── Tabla detallada de cortes de UNA barra ─────────────────────────────────
function renderTablaCortesBarra(barra) {
  const cortes = Array.isArray(barra?.cortes) ? barra.cortes : [];
  if (!cortes.length) {
    return '<div style="padding:8px 10px;color:#8C939B;font-size:7.5pt;font-style:italic">Sin cortes registrados</div>';
  }
  const filas = cortes.map((c, i) => {
    if (!c) return '';
    const ubic = String(c.etiqueta || c.ubicacion || '—').toUpperCase();
    const ventanaTxt = c.nombre_ventana
      ? `${esc(c.ventana_label || '—')} · ${esc(c.nombre_ventana)}`
      : esc(c.ventana_label || '—');
    const sistDis = [c.sistema_nombre, c.diseno_nombre].filter(Boolean).map(esc).join(' · ') || '—';
    return `
      <tr>
        <td class="td-num">${String(i+1).padStart(2,'0')}</td>
        <td><span class="tag" style="background:${bg(ubic)};color:${fg(ubic)};border:1px solid ${fg(ubic)}33">${esc(ubic)}</span></td>
        <td class="td-ventana">${ventanaTxt}</td>
        <td class="td-sist">${sistDis}</td>
        <td class="td-largo">${fmtCmAdapt(c.longitud_cm)} <span class="td-largo-u">cm</span></td>
      </tr>`;
  }).join('');
  return `
    <table class="cortes-tbl">
      <thead>
        <tr>
          <th>#</th><th>Pieza</th><th>Ventana</th><th>Sistema · Diseño</th><th class="th-r">Largo</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>`;
}

// ── HTML completo del plan ─────────────────────────────────────────────────
function buildCutPlanHTML({ proyecto, planData, generadoEn }) {
  const { grupos = [], kpisGlobales = {}, configuracion = {} } = planData || {};
  const kerf = configuracion.kerfCm || 0.3;

  // ─── Recolectar inventario de ventanas únicas ─────────────────────────
  const ventanasUnicas = new Map();
  for (const g of grupos) {
    if (!g) continue;
    const fuente = [
      ...(g.plan?.barrasNuevas || []),
      ...((g.plan?.residuosUsados || []).filter(Boolean).map(r => ({ cortes: [r.corte].filter(Boolean) }))),
    ];
    for (const b of fuente) {
      if (!b) continue;
      for (const c of (b.cortes || [])) {
        if (!c || c.id_ventana == null) continue;
        if (!ventanasUnicas.has(c.id_ventana)) {
          ventanasUnicas.set(c.id_ventana, {
            id: c.id_ventana,
            label: c.ventana_label,
            nombre: c.nombre_ventana,
            sistema: c.sistema_nombre,
            diseno:  c.diseno_nombre,
            ancho:   c.ancho_vano_cm,
            alto:    c.alto_vano_cm,
          });
        }
      }
    }
  }
  const ventanasList = Array.from(ventanasUnicas.values())
    .sort((a,b) => String(a.label).localeCompare(String(b.label), 'es', { numeric:true }));

  // ─── Grupos: render por perfil ────────────────────────────────────────
  const gruposHTML = grupos.filter(Boolean).map((g) => {
    const barrasNuevas   = (g.plan?.barrasNuevas   || []).filter(Boolean);
    const residuosUsados = (g.plan?.residuosUsados || []).filter(Boolean);
    const est = g.plan?.estadisticas || {};
    const comp = g.comparacion || {};

    const barrasNuevasHTML = barrasNuevas.map((b) => {
      // Defensa: si la barra viene malformada, saltarla con un placeholder.
      const cortes = Array.isArray(b?.cortes) ? b.cortes : [];
      const idStr  = String(b?.id ?? '?').padStart(2,'0');
      const longTotal = b?.longitud_total_cm || 0;
      const sobrante  = b?.sobrante_cm || 0;
      const sobranteRecuperable = sobrante >= 20;
      return `
      <div class="barra-card">
        <div class="barra-header">
          <div class="barra-title">
            <span class="barra-id">BARRA ${idStr}</span>
            <span class="barra-meta">
              <span class="meta-item">${cortes.length} corte${cortes.length!==1?'s':''}</span>
              <span class="meta-sep">·</span>
              <span class="meta-item">${fmtCmAdapt(longTotal, 0)} cm total</span>
              <span class="meta-sep">·</span>
              <span class="meta-item">sobra <strong style="color:${sobranteRecuperable?'#1E7B4B':'#8C939B'}">${fmtCmAdapt(sobrante)} cm</strong></span>
              ${sobranteRecuperable ? '<span class="chip-rec">♻ Banco</span>' : ''}
            </span>
          </div>
        </div>
        <div class="barra-svg">${renderBarraSVG({ ...b, cortes }, kerf)}</div>
        ${renderTablaCortesBarra({ ...b, cortes })}
      </div>
    `;}).join('');

    const residuosUsadosHTML = residuosUsados.length ? `
      <div class="seccion-residuos-usados">
        <div class="seccion-titulo">
          <span class="titulo-icon">♻</span>
          Residuos del Banco aprovechados
          <span class="titulo-count">${residuosUsados.length}</span>
        </div>
        ${residuosUsados.map((r) => `
          <div class="barra-card banco">
            <div class="barra-header">
              <div class="barra-title">
                <span class="barra-id">♻ RESIDUO #${r.id_residuo}</span>
                <span class="barra-meta">
                  <span class="meta-item">era ${fmtCmAdapt(r.longitud_original_cm)} cm</span>
                  <span class="meta-sep">·</span>
                  <span class="meta-item">queda <strong>${fmtCmAdapt(r.sobrante_cm)} cm</strong></span>
                </span>
              </div>
            </div>
            <div class="barra-svg">
              ${renderBarraSVG({
                longitud_total_cm: r.longitud_original_cm,
                cortes: [r.corte],
                sobrante_cm: r.sobrante_cm,
              }, kerf)}
            </div>
            ${renderTablaCortesBarra({ cortes: [r.corte] })}
          </div>
        `).join('')}
      </div>
    ` : '';

    return `
      <div class="grupo">
        <div class="grupo-header">
          <div class="grupo-titulo">
            <span class="grupo-num">${esc(g.referencia_perfil)}</span>
            ${g.referencia_aln ? `<span class="grupo-aln">${esc(g.referencia_aln)}</span>` : ''}
            ${g.ubicacion ? `<span class="grupo-ubicacion">${esc(g.ubicacion)}</span>` : ''}
            <span class="grupo-color">${esc(g.color_perfil || '—')}</span>
          </div>
          <div class="grupo-stats">
            <div class="stat">
              <span class="stat-lbl">Barras nuevas</span>
              <span class="stat-val">${est.barrasNuevasUsadas || 0}</span>
            </div>
            <div class="stat">
              <span class="stat-lbl">Reutilizados</span>
              <span class="stat-val rec">${est.residuosReutilizados || 0}</span>
            </div>
            <div class="stat">
              <span class="stat-lbl">% Desperdicio</span>
              <span class="stat-val">${fmtPct(est.porcentajeDesperdicio || 0)}</span>
            </div>
            ${comp.barrasAhorradas > 0 ? `
            <div class="stat">
              <span class="stat-lbl">Ahorro</span>
              <span class="stat-val rec">${comp.barrasAhorradas} barra${comp.barrasAhorradas>1?'s':''}</span>
            </div>` : ''}
          </div>
        </div>
        ${residuosUsadosHTML}
        ${barrasNuevas.length ? `
          <div class="seccion-barras-nuevas">
            <div class="seccion-titulo">
              <span class="titulo-icon">✂</span>
              Barras Nuevas
              <span class="titulo-count">${barrasNuevas.length}</span>
            </div>
            ${barrasNuevasHTML}
          </div>` : ''}
      </div>
    `;
  }).join('');

  // ─── Tabla inventario ventanas ────────────────────────────────────────
  const ventanasHTML = ventanasList.length ? `
    <table class="tabla-ventanas">
      <thead>
        <tr>
          <th>Ventana</th>
          <th>Nombre</th>
          <th>Sistema</th>
          <th>Diseño</th>
          <th class="th-r">Ancho × Alto (cm)</th>
        </tr>
      </thead>
      <tbody>
        ${ventanasList.map(v => `
          <tr>
            <td><span class="vent-tag">${esc(v.label || '—')}</span></td>
            <td>${esc(v.nombre || '—')}</td>
            <td>${esc(v.sistema || '—')}</td>
            <td>${esc(v.diseno  || '—')}</td>
            <td class="td-r"><span class="dim-mono">${fmtCmAdapt(v.ancho)} × ${fmtCmAdapt(v.alto)}</span></td>
          </tr>`).join('')}
      </tbody>
    </table>` : '<div class="empty">Sin ventanas asociadas</div>';

  // KPI clase según desperdicio
  const desp = kpisGlobales.porcentajeDesperdicioGlobal || 0;
  const despClass = desp < 8 ? 'good' : desp < 15 ? 'mid' : 'bad';
  const despLabel = desp < 8 ? 'Óptimo' : desp < 15 ? 'Aceptable' : 'Revisar';

  // ─── HTML final ───────────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<title>Plan de Corte — ${esc(proyecto?.nombre || '')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 14mm 12mm 12mm 12mm; }

  * { box-sizing: border-box; }

  body {
    font-family: 'Barlow', system-ui, -apple-system, sans-serif;
    color: #1A1D21;
    margin: 0;
    font-size: 9.5pt;
    line-height: 1.45;
    background: #fff;
  }

  .mono { font-family: 'JetBrains Mono', monospace; }
  .display { font-family: 'Barlow Condensed', sans-serif; }

  /* ═══════════════ HEADER ═══════════════ */
  .header {
    background: #0D1B2A;
    color: #fff;
    padding: 18px 22px 16px;
    border-radius: 8px;
    border-left: 4px solid #1565C0;
    margin-bottom: 14px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }
  .header .brand-block { flex: 1; }
  .header .brand {
    font-family: 'JetBrains Mono', monospace;
    font-size: 6.8pt;
    color: #C8CDD4;
    text-transform: uppercase;
    letter-spacing: .18em;
    font-weight: 500;
    margin-bottom: 6px;
  }
  .header .brand strong {
    color: #fff;
    font-weight: 600;
  }
  .header .title {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 24pt;
    font-weight: 700;
    line-height: 1;
    letter-spacing: -.01em;
    color: #fff;
    margin-bottom: 6px;
    text-transform: uppercase;
  }
  .header .subtitle {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8pt;
    color: #C8CDD4;
    line-height: 1.5;
  }
  .header .subtitle .lbl {
    color: #8C939B;
    text-transform: uppercase;
    letter-spacing: .08em;
    font-size: 7pt;
    margin-right: 4px;
  }
  .header .meta-block {
    text-align: right;
    padding-left: 18px;
    border-left: 1px solid rgba(255,255,255,.12);
    min-width: 150px;
  }
  .header .meta-block .meta-row {
    margin-bottom: 8px;
  }
  .header .meta-block .meta-row:last-child { margin-bottom: 0; }
  .header .meta-block .lbl {
    display: block;
    font-family: 'JetBrains Mono', monospace;
    font-size: 6.5pt;
    color: #8C939B;
    text-transform: uppercase;
    letter-spacing: .14em;
    margin-bottom: 2px;
  }
  .header .meta-block .val {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9pt;
    color: #fff;
    font-weight: 500;
  }

  /* ═══════════════ KPIs ═══════════════ */
  .kpis {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 8px;
    margin-bottom: 16px;
  }
  .kpi {
    background: #FAF9F7;
    border: 1px solid #DDD9D3;
    border-top: 3px solid #1565C0;
    border-radius: 6px;
    padding: 10px 12px 11px;
  }
  .kpi.good { border-top-color: #1E7B4B; }
  .kpi.mid  { border-top-color: #A0660A; }
  .kpi.bad  { border-top-color: #C0392B; }

  .kpi .lbl {
    font-family: 'JetBrains Mono', monospace;
    font-size: 6.5pt;
    color: #52585F;
    text-transform: uppercase;
    letter-spacing: .12em;
    font-weight: 500;
    margin-bottom: 4px;
  }
  .kpi .val {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 22pt;
    font-weight: 700;
    color: #1A1D21;
    line-height: 1;
    letter-spacing: -.01em;
  }
  .kpi.good .val { color: #1E7B4B; }
  .kpi.mid  .val { color: #A0660A; }
  .kpi.bad  .val { color: #C0392B; }

  .kpi .sub {
    font-family: 'Barlow', sans-serif;
    font-size: 7.5pt;
    color: #8C939B;
    margin-top: 2px;
    font-weight: 500;
  }

  /* ═══════════════ TÍTULO DE SECCIÓN ═══════════════ */
  .h-section {
    background: linear-gradient(to right, #F4F2EF, transparent);
    border-left: 3px solid #1565C0;
    padding: 7px 14px;
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 13pt;
    font-weight: 700;
    color: #0D1B2A;
    text-transform: uppercase;
    letter-spacing: .04em;
    margin: 16px 0 10px 0;
    /* FIX espacios vacíos: el título no debe quedar huérfano al pie de
       página. Forzamos que el siguiente bloque venga pegado. */
    page-break-after: avoid;
    break-after: avoid-page;
  }
  .h-section .h-num {
    display: inline-block;
    background: #1565C0;
    color: #fff;
    font-family: 'JetBrains Mono', monospace;
    font-size: 7.5pt;
    font-weight: 600;
    padding: 2px 7px;
    border-radius: 3px;
    margin-right: 8px;
    vertical-align: 1px;
    letter-spacing: 0;
  }

  /* ═══════════════ TABLA INVENTARIO VENTANAS ═══════════════ */
  .tabla-ventanas {
    width: 100%;
    border-collapse: collapse;
    font-size: 9pt;
    margin-bottom: 8px;
    border: 1px solid #DDD9D3;
    border-radius: 6px;
    overflow: hidden;
  }
  .tabla-ventanas thead th {
    background: #0D1B2A;
    color: #fff;
    padding: 7px 10px;
    text-align: left;
    font-family: 'JetBrains Mono', monospace;
    font-size: 7pt;
    text-transform: uppercase;
    letter-spacing: .1em;
    font-weight: 500;
  }
  .tabla-ventanas tbody tr:nth-child(even) { background: #FAF9F7; }
  .tabla-ventanas tbody td {
    padding: 6px 10px;
    border-bottom: 1px solid #DDD9D3;
    color: #1A1D21;
  }
  .tabla-ventanas tbody tr:last-child td { border-bottom: 0; }
  .vent-tag {
    display: inline-block;
    background: #E3F2FD;
    color: #0D47A1;
    font-family: 'JetBrains Mono', monospace;
    font-size: 8pt;
    font-weight: 600;
    padding: 2px 7px;
    border-radius: 3px;
    border: 1px solid #1565C033;
  }
  .dim-mono {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8.5pt;
    font-weight: 500;
    color: #0D1B2A;
  }
  .th-r { text-align: right; }
  .td-r { text-align: right; }

  /* ═══════════════ GRUPO (PERFIL + COLOR) ═══════════════ */
  .grupo {
    border: 1px solid #C4BDB5;
    border-radius: 8px;
    margin-bottom: 14px;
    overflow: hidden;
    /* FIX espacios vacíos: dejamos que el grupo SE PARTA si no cabe entero,
       pero el header del grupo no debe quedar solo al pie de página. */
    page-break-inside: auto;
    background: #fff;
  }
  .grupo-header {
    background: #0D1B2A;
    color: #fff;
    padding: 10px 14px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 3px solid #1565C0;
    /* el header debe quedarse junto al contenido del grupo */
    page-break-after: avoid;
    break-after: avoid-page;
  }
  .grupo-titulo {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .grupo-titulo .grupo-num {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 16pt;
    font-weight: 700;
    color: #fff;
    letter-spacing: 0;
  }
  .grupo-titulo .grupo-aln {
    background: rgba(251, 191, 36, .18);
    border: 1px solid rgba(251, 191, 36, .45);
    color: #FDE68A;
    padding: 3px 10px;
    border-radius: 4px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9.5pt;
    font-weight: 700;
    letter-spacing: .04em;
  }
  .grupo-titulo .grupo-ubicacion {
    background: rgba(96, 165, 250, .18);
    border: 1px solid rgba(96, 165, 250, .35);
    color: #BFDBFE;
    padding: 3px 10px;
    border-radius: 4px;
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 11pt;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .04em;
  }
  .grupo-titulo .grupo-color {
    background: rgba(255,255,255,.1);
    border: 1px solid rgba(255,255,255,.18);
    color: #C8CDD4;
    padding: 3px 9px;
    border-radius: 4px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 7.5pt;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: .08em;
  }
  .grupo-stats {
    display: flex;
    gap: 18px;
  }
  .grupo-stats .stat {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }
  .grupo-stats .stat-lbl {
    font-family: 'JetBrains Mono', monospace;
    font-size: 6.5pt;
    text-transform: uppercase;
    letter-spacing: .12em;
    color: #8C939B;
    font-weight: 500;
    margin-bottom: 1px;
  }
  .grupo-stats .stat-val {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 14pt;
    font-weight: 700;
    color: #fff;
    line-height: 1;
  }
  .grupo-stats .stat-val.rec { color: #6EE7B7; }

  /* ═══════════════ SUBSECCIÓN dentro de grupo ═══════════════ */
  .seccion-residuos-usados,
  .seccion-barras-nuevas {
    padding: 12px 14px;
    background: #fff;
  }
  .seccion-residuos-usados {
    background: #FEF9EE;
    border-bottom: 1px solid #FCE5B7;
  }
  .seccion-titulo {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 11pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .04em;
    color: #52585F;
    margin-bottom: 9px;
    display: flex;
    align-items: center;
    gap: 6px;
    /* no quedar huérfano del primer card */
    page-break-after: avoid;
    break-after: avoid-page;
  }
  .seccion-residuos-usados .seccion-titulo { color: #A0660A; }
  .seccion-titulo .titulo-icon {
    font-size: 10pt;
  }
  .seccion-titulo .titulo-count {
    background: #1565C0;
    color: #fff;
    font-family: 'JetBrains Mono', monospace;
    font-size: 7pt;
    font-weight: 600;
    padding: 1.5px 6px;
    border-radius: 3px;
    margin-left: 4px;
    letter-spacing: 0;
  }
  .seccion-residuos-usados .seccion-titulo .titulo-count {
    background: #A0660A;
  }

  /* ═══════════════ BARRA CARD ═══════════════ */
  .barra-card {
    background: #fff;
    border: 1px solid #DDD9D3;
    border-radius: 5px;
    padding: 9px 10px;
    margin-bottom: 8px;
    page-break-inside: avoid;
  }
  .barra-card.banco {
    background: #FEF9EE;
    border-color: #FCE5B7;
    border-style: dashed;
  }
  .barra-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }
  .barra-title {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .barra-id {
    font-family: 'JetBrains Mono', monospace;
    font-weight: 600;
    font-size: 9pt;
    color: #0D1B2A;
    letter-spacing: .04em;
  }
  .barra-meta {
    font-family: 'Barlow', sans-serif;
    font-size: 8pt;
    color: #52585F;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .barra-meta .meta-item { white-space: nowrap; }
  .barra-meta .meta-sep { color: #C4BDB5; }
  .chip-rec {
    background: #E8F5EE;
    color: #1E7B4B;
    border: 1px solid #1E7B4B33;
    padding: 1.5px 7px;
    border-radius: 3px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 6.8pt;
    font-weight: 600;
    margin-left: 4px;
    letter-spacing: .04em;
  }
  .barra-svg { margin-bottom: 6px; }

  /* ═══════════════ TABLA DE CORTES (dentro de la barra) ═══════════════ */
  .cortes-tbl {
    width: 100%;
    border-collapse: collapse;
    font-size: 8.5pt;
    margin-top: 4px;
  }
  .cortes-tbl thead th {
    background: #F4F2EF;
    color: #52585F;
    padding: 4px 7px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 6.8pt;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .08em;
    text-align: left;
    border-bottom: 1.5px solid #C4BDB5;
  }
  .cortes-tbl tbody td {
    padding: 4px 7px;
    border-bottom: 1px solid #F4F2EF;
    vertical-align: middle;
  }
  .cortes-tbl tbody tr:last-child td { border-bottom: 0; }
  .cortes-tbl tbody tr:nth-child(even) { background: #FAF9F7; }
  .td-num {
    color: #8C939B;
    font-family: 'JetBrains Mono', monospace;
    font-size: 7.5pt;
    width: 22px;
    font-weight: 500;
  }
  .td-ventana {
    font-weight: 500;
    color: #1A1D21;
  }
  .td-sist {
    color: #52585F;
    font-size: 7.8pt;
  }
  .td-largo {
    font-family: 'JetBrains Mono', monospace;
    font-weight: 600;
    color: #0D47A1;
    text-align: right;
    white-space: nowrap;
    font-size: 9pt;
  }
  .td-largo-u {
    color: #8C939B;
    font-size: 7pt;
    font-weight: 500;
    margin-left: 1px;
  }
  .tag {
    display: inline-block;
    padding: 2px 7px;
    border-radius: 3px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 7pt;
    font-weight: 600;
    letter-spacing: .03em;
  }

  /* ═══════════════ EMPTY STATE ═══════════════ */
  .empty {
    text-align: center;
    color: #8C939B;
    padding: 22px;
    font-style: italic;
    background: #FAF9F7;
    border: 1px dashed #C4BDB5;
    border-radius: 6px;
    font-size: 9pt;
  }

  /* ═══════════════ FOOTER ═══════════════ */
  .footer {
    margin-top: 18px;
    padding: 8px 12px;
    border-top: 2px solid #0D1B2A;
    background: #FAF9F7;
    border-radius: 0 0 6px 6px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 6.8pt;
    color: #52585F;
    display: flex;
    justify-content: space-between;
    align-items: center;
    text-transform: uppercase;
    letter-spacing: .08em;
  }
  .footer strong {
    color: #0D1B2A;
    font-weight: 600;
  }
  .footer .footer-right {
    color: #8C939B;
  }
</style>
</head>
<body>

  <!-- ═══ HEADER ═══ -->
  <div class="header">
    <div class="brand-block">
      <div class="brand"><strong>CORTEALUM</strong> · Sistema de Optimización de Corte de Aluminio</div>
      <div class="title">${esc(proyecto?.nombre || 'Proyecto sin nombre')}</div>
      <div class="subtitle">
        ${proyecto?.cliente ? `<span class="lbl">Cliente:</span> ${esc(proyecto.cliente)}<br>` : ''}
        <span class="lbl">ID Proyecto:</span> #${esc(proyecto?.id || '—')}
      </div>
    </div>
    <div class="meta-block">
      <div class="meta-row">
        <span class="lbl">Generado</span>
        <span class="val">${fmtFecha(generadoEn)}</span>
      </div>
      <div class="meta-row">
        <span class="lbl">Algoritmo</span>
        <span class="val">FFD + Best Fit</span>
      </div>
      <div class="meta-row">
        <span class="lbl">Kerf</span>
        <span class="val">${fmtCmAdapt(kerf)} cm</span>
      </div>
    </div>
  </div>

  <!-- ═══ KPIs GLOBALES ═══ -->
  <div class="kpis">
    <div class="kpi">
      <div class="lbl">Barras nuevas</div>
      <div class="val">${kpisGlobales.barrasNuevasTotales || 0}</div>
      <div class="sub">de aluminio</div>
    </div>
    <div class="kpi good">
      <div class="lbl">Residuos reutilizados</div>
      <div class="val">${kpisGlobales.residuosReutilizadosTotales || 0}</div>
      <div class="sub">${kpisGlobales.residuosReutilizadosTotales > 0 ? 'del banco' : 'sin matches'}</div>
    </div>
    <div class="kpi ${despClass}">
      <div class="lbl">% Desperdicio</div>
      <div class="val">${fmtPct(kpisGlobales.porcentajeDesperdicioGlobal || 0)}</div>
      <div class="sub">${despLabel}</div>
    </div>
    <div class="kpi good">
      <div class="lbl">Sobrantes nuevos</div>
      <div class="val">${kpisGlobales.residuosNuevosGenerados || 0}</div>
      <div class="sub">al banco</div>
    </div>
    <div class="kpi">
      <div class="lbl">Ventanas</div>
      <div class="val">${ventanasList.length}</div>
      <div class="sub">en el proyecto</div>
    </div>
  </div>

  <!-- ═══ INVENTARIO DE VENTANAS ═══ -->
  <div class="h-section"><span class="h-num">01</span>Inventario de Ventanas</div>
  ${ventanasHTML}

  <!-- ═══ PLAN POR PERFIL ═══ -->
  <div class="h-section"><span class="h-num">02</span>Plan de Corte por Perfil</div>
  ${grupos.length > 0 ? gruposHTML : '<div class="empty">Sin grupos de perfiles para optimizar</div>'}

  <!-- ═══ FOOTER ═══ -->
  <div class="footer">
    <div><strong>CorteAlum</strong> · Plan generado por algoritmo FFD (First-Fit Decreasing) + Best Fit en residuos</div>
    <div class="footer-right">Kerf ${fmtCmAdapt(kerf)} cm · Mín. residuo ${configuracion.minResiduoCm || 20} cm</div>
  </div>

</body>
</html>`;
}

module.exports = { buildCutPlanHTML };
