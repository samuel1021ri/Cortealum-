/**
 * CorteAlum — Modal de Optimización del Proyecto Completo
 * ─────────────────────────────────────────────────────────────────────────────
 * Hermano mayor de SimulacionModal:
 *   - SimulacionModal: optimiza UNA ventana
 *   - OptimizacionProyectoModal: optimiza TODAS las ventanas del proyecto
 *
 * Comparte el lenguaje visual (DM Mono, chips industriales, paleta beige/azul).
 *
 * Flujo:
 *   1. Se abre desde el botón "Optimizar cortes" en ProyectoDetalle.
 *   2. Llama POST /api/optimizacion/proyecto/:id (modo borrador, no toca BD).
 *   3. Muestra: KPIs globales + por perfil (lista de barras con cortes + sobrantes).
 *   4. Botón "♻ Confirmar plan" → POST /confirmar → transacción atómica:
 *        ▸ Consume residuos usados del banco
 *        ▸ Crea nuevos residuos por los sobrantes ≥ 20cm
 *        ▸ Guarda el plan en historial
 *   5. Cierra el modal con resumen.
 */

import { useState, useEffect, useMemo } from 'react';
import { X, Loader, RefreshCw, Recycle, Scissors, AlertTriangle, CheckCircle, ChevronDown, ChevronRight, Save, Package, TrendingDown, FileDown } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/client';
import { fmtCmAdapt } from '../../utils/unidades';

// Reutilizamos el theme del SimulacionModal para coherencia visual total
const T = {
  bg:'#F5F3EE', surface:'#EDEAE4', surfaceAlt:'#E6E2DA',
  border:'rgba(75,85,99,0.14)', borderMd:'rgba(75,85,99,0.22)', borderSt:'rgba(75,85,99,0.35)',
  blue:'#1A56DB', blueLt:'#3B82F6', bluePale:'#DBEAFE', blueDark:'#1239A6',
  green:'#166534', greenPale:'#DCFCE7', greenLt:'#22C55E',
  orange:'#92400E', orangePale:'#FEF3C7',
  red:'#B91C1C', redPale:'#FEE2E2',
  textPri:'#111827', textSec:'#374151', textMut:'#6B7280', textDim:'#9CA3AF',
  font:"'DM Mono','Fira Code','Courier New',monospace",
  fontSans:"'DM Sans','Segoe UI',system-ui,sans-serif",
};

const SEC_BG  = { 'MARCO':'#EDF1F8','MARCO 744':'#EDF1F8','NAVE MÓVIL':'#F0EDE6','NAVE MOVIL':'#F0EDE6','NAVE FIJA':'#EDF1F8','ADAPTADOR':'#EDEAE4', 'DEFAULT':'#EDEAE4' };
const SEC_CLR = { 'MARCO':'#1A56DB','MARCO 744':'#1A56DB','NAVE MÓVIL':'#6B5B3E','NAVE MOVIL':'#6B5B3E','NAVE FIJA':'#1239A6','ADAPTADOR':'#374151', 'DEFAULT':'#475569' };

const STYLE = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=DM+Sans:wght@300;400;500;600;700&display=swap');
  .op-ov{position:fixed;inset:0;z-index:1100;background:rgba(15,23,42,0.62);backdrop-filter:blur(22px) saturate(0.8);display:flex;align-items:center;justify-content:center;padding:10px;animation:op-fi .18s ease}
  @keyframes op-fi{from{opacity:0}to{opacity:1}}
  @keyframes op-si{from{opacity:0;transform:translateY(18px) scale(0.97)}to{opacity:1;transform:none}}
  @keyframes op-spin{to{transform:rotate(360deg)}}
  .op-modal{width:98vw;max-width:1440px;max-height:96vh;display:flex;flex-direction:column;border-radius:22px;overflow:hidden;background:${T.bg};border:1px solid ${T.borderMd};box-shadow:0 0 0 1px rgba(37,99,235,.05),0 40px 90px rgba(15,23,42,.25),0 8px 32px rgba(37,99,235,.08);animation:op-si .26s cubic-bezier(.16,1,.3,1);font-family:${T.fontSans};color:${T.textPri}}
  .op-scroll::-webkit-scrollbar{width:6px}.op-scroll::-webkit-scrollbar-track{background:${T.surfaceAlt}}.op-scroll::-webkit-scrollbar-thumb{background:${T.borderMd};border-radius:99px}
  .op-spin{animation:op-spin 1s linear infinite}

  /* Tabs */
  .op-tabs{display:flex;gap:0;background:${T.surface};border-bottom:1px solid ${T.borderMd};padding:0 18px}
  .op-tab{padding:11px 18px;background:transparent;border:0;cursor:pointer;font-family:${T.fontSans};font-size:.78rem;font-weight:600;color:${T.textMut};letter-spacing:.04em;display:flex;align-items:center;gap:8px;border-bottom:2px solid transparent;transition:all .14s}
  .op-tab:hover{color:${T.textPri}}
  .op-tab.active{color:${T.blue};border-bottom-color:${T.blue};background:${T.bg}}
  .op-tab .badge{background:${T.bluePale};color:${T.blueDark};font-size:.62rem;font-weight:800;padding:1px 7px;border-radius:99px;font-family:${T.font}}

  /* KPIs */
  .op-kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;padding:14px 18px;background:${T.surfaceAlt};border-bottom:1px solid ${T.border}}
  .op-kpi{background:${T.bg};border:1px solid ${T.border};border-radius:10px;padding:10px 14px;display:flex;align-items:center;gap:10px}
  .op-kpi .ic{width:38px;height:38px;border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .op-kpi .lbl{font-family:${T.font};font-size:.55rem;text-transform:uppercase;letter-spacing:.1em;color:${T.textMut};font-weight:700}
  .op-kpi .val{font-family:${T.font};font-size:1.4rem;font-weight:500;color:${T.textPri};line-height:1.1;margin-top:1px}
  .op-kpi .sub{font-size:.7rem;color:${T.textMut};margin-top:1px}

  /* Tarjeta de grupo (perfil) */
  .op-grp{background:${T.surface};border:1px solid ${T.borderMd};border-radius:14px;margin-bottom:14px;overflow:hidden}
  .op-grp-head{padding:11px 16px;background:linear-gradient(135deg, #0F1E36, #1E3A5F);color:#fff;cursor:pointer;display:flex;align-items:center;gap:12px}
  .op-grp-head .arrow{opacity:.6;transition:transform .15s}
  .op-grp-head.expanded .arrow{transform:rotate(90deg)}
  .op-grp-head .title{flex:1;font-family:${T.font};font-size:.95rem;font-weight:500;letter-spacing:.02em}
  .op-grp-head .chip{background:rgba(255,255,255,.13);padding:3px 9px;border-radius:6px;font-family:${T.font};font-size:.7rem;font-weight:500}
  .op-grp-head .chip.green{background:${T.greenLt};color:#fff}
  .op-grp-body{padding:14px 18px;background:${T.bg}}

  /* Chip de corte (estilo SimulacionModal) */
  .op-cut{display:inline-flex;flex-direction:column;background:${T.bg};border:1px solid;border-top-width:3px;border-radius:7px;padding:6px 9px;font-family:${T.font};margin:2px;min-width:78px;box-shadow:0 1px 4px rgba(0,0,0,.05)}
  .op-cut .sec{font-size:.5rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:${T.textMut};margin-bottom:2px;display:flex;align-items:center;gap:3px}
  .op-cut .ub{font-size:.66rem;font-weight:600;color:${T.textSec};margin-bottom:2px}
  .op-cut .len{font-size:.78rem;font-weight:500;color:${T.textPri};letter-spacing:-.02em}
  .op-cut .vlbl{font-size:.5rem;color:${T.blue};font-weight:600;margin-top:1px}

  /* Sobrante chip */
  .op-cut.sob{border-color:${T.textDim};border-top-color:${T.textDim};border-style:dashed}
  .op-cut.sob .sec{color:${T.textMut}}
  .op-cut.sob .len{color:${T.textMut}}
  .op-cut.sob.ok{border-color:${T.greenLt};border-top-color:${T.greenLt}}
  .op-cut.sob.ok .sec{color:${T.green}}
  .op-cut.sob.ok .len{color:${T.green}}

  /* Residuo del banco (reutilizado) */
  .op-cut.banco{border-color:${T.orange};border-top-color:${T.orange};background:#FFFBEB}
  .op-cut.banco .sec{color:${T.orange}}

  /* Barra row */
  .op-bar-row{display:flex;align-items:stretch;gap:10px;padding:9px;border:1px solid ${T.border};border-radius:9px;background:${T.bg};margin-bottom:8px}
  .op-bar-row.banco{background:#FFFBEB;border-color:${T.orange}44}
  .op-bar-label{font-family:${T.font};display:flex;flex-direction:column;justify-content:center;min-width:80px;padding:0 6px}
  .op-bar-label .id{font-size:.95rem;font-weight:500;color:${T.textPri}}
  .op-bar-label .meta{font-size:.55rem;text-transform:uppercase;letter-spacing:.06em;color:${T.textMut};margin-top:2px}
  .op-bar-svg{flex:1;display:flex;align-items:center}

  .op-footer{padding:14px 18px;background:${T.surfaceAlt};border-top:1px solid ${T.borderMd};display:flex;gap:10px;justify-content:flex-end;align-items:center}
  .op-btn{padding:9px 16px;border-radius:8px;border:1px solid ${T.borderMd};cursor:pointer;font-family:${T.fontSans};font-weight:600;font-size:.82rem;display:inline-flex;align-items:center;gap:7px;transition:all .14s;background:${T.bg};color:${T.textPri}}
  .op-btn:hover:not(:disabled){background:${T.surface}}
  .op-btn:disabled{opacity:.5;cursor:not-allowed}
  .op-btn.primary{background:${T.green};color:#fff;border-color:${T.green}}
  .op-btn.primary:hover:not(:disabled){background:${T.greenLt}}
  .op-btn.blue{background:${T.blue};color:#fff;border-color:${T.blue}}
  .op-btn.blue:hover:not(:disabled){background:${T.blueLt}}
`;

// ── Pequeño SVG de barra (versión inline, estilo SimulacionModal) ───────────
// Cada rect tiene `<title>` con contexto completo (tooltip nativo del navegador):
// "MARCO · V1 (Sala) · 3500 TRADICIONAL · XOX · 87,5 cm"
function BarraInline({ longitud_total_cm, cortes, sobrante_cm, esBanco }) {
  const W = 720, H = 36;
  const padX = 4;
  const escala = (W - padX*2) / longitud_total_cm;
  let cursor = padX;
  const partes = [];
  cortes.forEach((c, i) => {
    const w = c.longitud_cm * escala;
    const ubic = String(c.etiqueta || c.ubicacion || '').toUpperCase();
    const bg = SEC_BG[ubic] || SEC_BG.DEFAULT;
    const fg = SEC_CLR[ubic] || SEC_CLR.DEFAULT;

    // Contexto completo para tooltip (hover en cualquier navegador)
    const ventanaTxt = c.nombre_ventana
      ? `${c.ventana_label} (${c.nombre_ventana})`
      : (c.ventana_label || '—');
    const sistemaTxt = c.sistema_nombre || '';
    const disenoTxt  = c.diseno_nombre  || '';
    const sistemaDisenoTxt = [sistemaTxt, disenoTxt].filter(Boolean).join(' · ');
    const tooltip = [
      `Pieza: ${ubic}`,
      `Ventana: ${ventanaTxt}`,
      sistemaDisenoTxt && `Sistema · Diseño: ${sistemaDisenoTxt}`,
      `Largo: ${fmtCmAdapt(c.longitud_cm)} cm`,
    ].filter(Boolean).join('\n');

    partes.push(
      <g key={i}>
        <rect x={cursor} y={0} width={w} height={H} fill={bg} stroke={fg} strokeWidth={0.7}>
          <title>{tooltip}</title>
        </rect>
        {w > 30 && <text x={cursor + w/2} y={H/2 - 2} textAnchor="middle"
            fontFamily="'DM Mono',monospace" fontSize={w>80?9:7} fontWeight="700" fill={fg}
            style={{ pointerEvents:'none' }}>
            {ubic.substring(0, w>100?12:8)}
        </text>}
        {w > 50 && <text x={cursor + w/2} y={H/2 + 9} textAnchor="middle"
            fontFamily="'DM Mono',monospace" fontSize="7" fill={fg} opacity="0.75"
            style={{ pointerEvents:'none' }}>
            {fmtCmAdapt(c.longitud_cm)}cm
        </text>}
      </g>
    );
    cursor += w + 0.3 * escala; // kerf
  });
  // Sobrante
  if (sobrante_cm > 0.5) {
    const w = sobrante_cm * escala;
    const reut = sobrante_cm >= 20;
    partes.push(
      <g key="sob">
        <pattern id={`hatch-${reut?'ok':'no'}`} patternUnits="userSpaceOnUse" width="5" height="5">
          <rect width="5" height="5" fill={reut ? '#DCFCE7' : '#FEE2E2'}/>
          <path d="M 0 5 L 5 0" stroke={reut ? '#16A34A' : '#DC2626'} strokeWidth="0.6"/>
        </pattern>
        <rect x={cursor} y={0} width={w} height={H} fill={`url(#hatch-${reut?'ok':'no'})`} stroke={reut?'#16A34A':'#DC2626'} strokeWidth="0.7" strokeDasharray="2 2"/>
        {w > 30 && <text x={cursor + w/2} y={H/2 + 3} textAnchor="middle"
            fontFamily="'DM Mono',monospace" fontSize="8" fontWeight="700" fill={reut?'#16A34A':'#DC2626'}>
            {reut?'♻':'✕'} {fmtCmAdapt(sobrante_cm)}cm
        </text>}
      </g>
    );
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', height:'auto', borderRadius:5,
      border: esBanco ? `1.5px dashed ${T.orange}` : `1px solid ${T.borderMd}` }}>
      {partes}
    </svg>
  );
}

// ── Lista detallada de cortes (con contexto: ventana / sistema / diseño) ───
// Permite al usuario VER claramente de qué ventana viene cada corte.
// Crítico para taller: el operario tiene que saber a qué ventana corresponde
// cada pieza al sacar la barra de la sierra.
function ListaCortesDetalle({ cortes }) {
  const [open, setOpen] = useState(false);
  if (!cortes || !cortes.length) return null;

  return (
    <div style={{ marginTop:6 }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          background:'transparent', border:'none', cursor:'pointer',
          fontFamily:T.font, fontSize:'.62rem', fontWeight:700,
          color:T.textMut, padding:'4px 0',
          display:'flex', alignItems:'center', gap:4,
          textTransform:'uppercase', letterSpacing:'.06em',
        }}
      >
        {open ? <ChevronDown size={11}/> : <ChevronRight size={11}/>}
        {open ? 'Ocultar detalle' : `Ver detalle de ${cortes.length} corte${cortes.length>1?'s':''}`}
      </button>
      {open && (
        <table style={{
          width:'100%', marginTop:6, borderCollapse:'collapse',
          fontFamily:T.font, fontSize:'.68rem',
        }}>
          <thead>
            <tr style={{ background:T.surfaceAlt, color:T.textMut }}>
              <th style={{ padding:'5px 8px', textAlign:'left',  fontWeight:700, fontSize:'.58rem', textTransform:'uppercase', letterSpacing:'.06em' }}>#</th>
              <th style={{ padding:'5px 8px', textAlign:'left',  fontWeight:700, fontSize:'.58rem', textTransform:'uppercase', letterSpacing:'.06em' }}>Pieza</th>
              <th style={{ padding:'5px 8px', textAlign:'left',  fontWeight:700, fontSize:'.58rem', textTransform:'uppercase', letterSpacing:'.06em' }}>Ventana</th>
              <th style={{ padding:'5px 8px', textAlign:'left',  fontWeight:700, fontSize:'.58rem', textTransform:'uppercase', letterSpacing:'.06em' }}>Sistema · Diseño</th>
              <th style={{ padding:'5px 8px', textAlign:'right', fontWeight:700, fontSize:'.58rem', textTransform:'uppercase', letterSpacing:'.06em' }}>Largo</th>
            </tr>
          </thead>
          <tbody>
            {cortes.map((c, i) => {
              const ubic = String(c.etiqueta || c.ubicacion || '—').toUpperCase();
              const fg   = SEC_CLR[ubic] || SEC_CLR.DEFAULT;
              const bg   = SEC_BG[ubic]  || SEC_BG.DEFAULT;
              return (
                <tr key={i} style={{ borderBottom:`1px solid ${T.border}` }}>
                  <td style={{ padding:'5px 8px', color:T.textDim }}>{String(i+1).padStart(2,'0')}</td>
                  <td style={{ padding:'5px 8px' }}>
                    <span style={{
                      background:bg, color:fg, padding:'2px 6px',
                      borderRadius:4, fontWeight:700, fontSize:'.62rem',
                    }}>{ubic}</span>
                  </td>
                  <td style={{ padding:'5px 8px', color:T.textPri, fontWeight:500 }}>
                    {c.ventana_label || '—'}
                    {c.nombre_ventana && (
                      <span style={{ color:T.textMut, fontWeight:400 }}> · {c.nombre_ventana}</span>
                    )}
                  </td>
                  <td style={{ padding:'5px 8px', color:T.textSec, fontSize:'.66rem' }}>
                    {[c.sistema_nombre, c.diseno_nombre].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td style={{ padding:'5px 8px', textAlign:'right', color:T.blueDark, fontWeight:600 }}>
                    {fmtCmAdapt(c.longitud_cm)} cm
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── KPI Card ────────────────────────────────────────────────────────────────
function Kpi({ icon: Icon, label, value, sub, color = T.textPri, bgIcon = T.bluePale, fgIcon = T.blue }) {
  return (
    <div className="op-kpi">
      <div className="ic" style={{ background: bgIcon, color: fgIcon }}>
        <Icon size={18}/>
      </div>
      <div>
        <div className="lbl">{label}</div>
        <div className="val" style={{ color }}>{value}</div>
        {sub && <div className="sub">{sub}</div>}
      </div>
    </div>
  );
}

// ── Tarjeta de grupo de perfil ──────────────────────────────────────────────
function GrupoCard({ grupo, kerfCm, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  const { plan, referencia_perfil, color_perfil, barraEstandarCm, residuosDisponiblesAlInicio, comparacion } = grupo;
  const { barrasNuevas, residuosUsados, estadisticas, cortesNoAsignados } = plan;

  return (
    <div className="op-grp">
      <div className={`op-grp-head ${open ? 'expanded' : ''}`} onClick={() => setOpen(!open)}>
        <ChevronRight className="arrow" size={18}/>
        <div className="title">
          {referencia_perfil}
          <span style={{ marginLeft: 10, padding:'2px 8px', borderRadius:6, background:'rgba(255,255,255,.13)', fontSize:'.68rem' }}>
            {color_perfil}
          </span>
          <span style={{ marginLeft: 8, fontSize:'.65rem', opacity:.6, fontWeight:400 }}>
            · barra estándar {barraEstandarCm}cm · {residuosDisponiblesAlInicio} en banco
          </span>
        </div>
        <div className="chip">{estadisticas.barrasNuevasUsadas} barras nuevas</div>
        {estadisticas.residuosReutilizados > 0 && (
          <div className="chip green">♻ {estadisticas.residuosReutilizados} reutilizados</div>
        )}
      </div>

      {open && (
        <div className="op-grp-body">
          {comparacion && comparacion.barrasAhorradas > 0 && (
            <div style={{
              background: `linear-gradient(135deg, ${T.green}, ${T.greenLt})`,
              color:'#fff', padding:'8px 14px', borderRadius:8, marginBottom:12,
              display:'flex', alignItems:'center', gap:10, fontFamily: T.font, fontSize:'.75rem',
            }}>
              <Recycle size={16}/>
              <span style={{ flex:1 }}>
                Sin residuos del banco hubieras necesitado <strong>{comparacion.barrasAhorradas} barra(s) adicional(es)</strong>
              </span>
              <strong style={{ fontSize:'.9rem' }}>♻ Ahorro {fmtCmAdapt(comparacion.longitudAhorradaCm, 0)}cm</strong>
            </div>
          )}

          {/* Residuos del banco usados (con sello de origen) */}
          {residuosUsados.length > 0 && (
            <>
              <div style={{
                fontFamily:T.font, fontSize:'.65rem', fontWeight:700,
                textTransform:'uppercase', letterSpacing:'.1em',
                color:T.orange, marginBottom:6, marginTop:4,
                display:'flex', alignItems:'center', gap:6,
              }}>
                <Recycle size={12}/>
                Residuos del Banco Aprovechados ({residuosUsados.length})
              </div>
              {residuosUsados.map((r, i) => (
                <div key={i} className="op-bar-row banco">
                  <div className="op-bar-label">
                    <div className="id">♻ #{r.id_residuo}</div>
                    <div className="meta">{r.longitud_original_cm}cm</div>
                  </div>
                  <div className="op-bar-svg">
                    <BarraInline
                      longitud_total_cm={r.longitud_original_cm}
                      cortes={[r.corte]}
                      sobrante_cm={r.sobrante_cm}
                      esBanco
                    />
                  </div>
                </div>
              ))}
            </>
          )}

          {/* Barras nuevas */}
          {barrasNuevas.length > 0 && (
            <>
              <div style={{
                fontFamily:T.font, fontSize:'.65rem', fontWeight:700,
                textTransform:'uppercase', letterSpacing:'.1em',
                color:T.blueDark, marginBottom:6, marginTop:residuosUsados.length?12:4,
                display:'flex', alignItems:'center', gap:6,
              }}>
                <Scissors size={12}/>
                Barras Nuevas Necesarias ({barrasNuevas.length})
              </div>
              {barrasNuevas.map((b, i) => (
                <div key={i} className="op-bar-row" style={{ flexDirection:'column', alignItems:'stretch' }}>
                  <div style={{ display:'flex', alignItems:'stretch', gap:10 }}>
                    <div className="op-bar-label">
                      <div className="id">Barra {String(b.id).padStart(2,'0')}</div>
                      <div className="meta">
                        {b.cortes.length} cortes
                        <br/>
                        <span style={{ color: b.sobrante_cm >= 20 ? T.green : T.textDim }}>
                          sobra {fmtCmAdapt(b.sobrante_cm)}cm
                        </span>
                      </div>
                    </div>
                    <div className="op-bar-svg">
                      <BarraInline
                        longitud_total_cm={b.longitud_total_cm}
                        cortes={b.cortes}
                        sobrante_cm={b.sobrante_cm}
                      />
                    </div>
                  </div>
                  {/* Detalle expandible: qué ventana / sistema / diseño es cada corte */}
                  <ListaCortesDetalle cortes={b.cortes}/>
                </div>
              ))}
            </>
          )}

          {/* Cortes no asignados */}
          {cortesNoAsignados.length > 0 && (
            <div style={{
              background:T.redPale, border:`1px solid ${T.red}33`, borderRadius:7,
              padding:10, marginTop:10, display:'flex', gap:8, alignItems:'flex-start',
            }}>
              <AlertTriangle size={16} color={T.red}/>
              <div style={{ fontSize:'.75rem' }}>
                <strong style={{ color:T.red }}>{cortesNoAsignados.length} corte(s) no caben en barra estándar</strong>
                <div style={{ fontSize:'.7rem', color:'#7F1D1D', marginTop:2 }}>
                  Estos cortes son más largos que {barraEstandarCm}cm.
                  Revisa medidas o configura una barra más larga en el catálogo.
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export default function OptimizacionProyectoModal({ open, onClose, idProyecto, nombreProyecto }) {
  const [tab,    setTab]    = useState('plan'); // 'plan' | 'banco'
  const [data,   setData]   = useState(null);
  const [loading,setLoading]= useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmado, setConfirmado] = useState(false);

  // Cargar plan al abrir
  useEffect(() => {
    if (!open || !idProyecto) return;
    setData(null);
    setConfirmado(false);
    cargarPlan();
    // eslint-disable-next-line
  }, [open, idProyecto]);

  const cargarPlan = async () => {
    setLoading(true);
    try {
      const { data: res } = await api.post(`/optimizacion/proyecto/${idProyecto}`, {
        guardar: false, comparar: true,
      });
      setData(res);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al calcular plan');
    } finally { setLoading(false); }
  };

  /**
   * Descarga el PDF del plan de corte.
   * El endpoint devuelve un Buffer PDF — lo bajamos como blob para que
   * abra en una nueva pestaña + ofrezca guardar.
   */
  const descargarPDF = async (idP) => {
    const tId = toast.loading('Generando PDF del plan…');
    try {
      const res = await api.get(`/optimizacion/proyecto/${idP}/plan-pdf`, {
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      // Abrir en pestaña nueva (el navegador muestra el PDF + permite guardar)
      const win = window.open(url, '_blank');
      // Fallback si el popup fue bloqueado: descarga directa
      if (!win) {
        const a = document.createElement('a');
        a.href = url;
        a.download = `Plan_Corte_${nombreProyecto || 'proyecto'}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      toast.success('PDF generado', { id: tId });
    } catch (err) {
      // El error vuelve como Blob — hay que parsearlo a JSON para leer el mensaje
      let mensaje = 'Error al generar PDF';
      try {
        if (err.response?.data instanceof Blob) {
          const text = await err.response.data.text();
          const j = JSON.parse(text);
          mensaje = j.error || mensaje;
        } else {
          mensaje = err.response?.data?.error || mensaje;
        }
      } catch { /* keep default */ }
      toast.error(mensaje, { id: tId });
    }
  };

  const handleConfirmar = async () => {
    if (!data || !data.grupos?.length) return;
    const ok = window.confirm(
      `¿Confirmar el plan de corte?\n\n` +
      `Esto va a:\n` +
      `  • Consumir ${data.kpisGlobales.residuosReutilizadosTotales} residuo(s) del banco\n` +
      `  • Guardar ${data.kpisGlobales.residuosNuevosGenerados} sobrante(s) nuevo(s) ≥ 20cm\n\n` +
      `Esta acción es irreversible.`
    );
    if (!ok) return;
    setConfirming(true);
    try {
      const { data: res } = await api.post(`/optimizacion/proyecto/${idProyecto}/confirmar`);
      toast.success(res.mensaje || 'Plan confirmado');
      setConfirmado(true);
      // Recargar para mostrar el nuevo estado del banco
      setTimeout(() => onClose?.(true), 1500);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al confirmar');
    } finally { setConfirming(false); }
  };

  // KPIs derivados
  const kpis = data?.kpisGlobales;
  const totales = useMemo(() => {
    if (!data?.grupos) return { cortesTotales: 0, sobrantesGuardables: 0, sobrantesDescartables: 0 };
    let cortes = 0, sg = 0, sd = 0;
    for (const g of data.grupos) {
      cortes += g.plan.estadisticas.cortesTotales;
      for (const b of g.plan.barrasNuevas) {
        if (b.sobrante_cm >= 20) sg++;
        else if (b.sobrante_cm > 0.5) sd++;
      }
    }
    return { cortesTotales: cortes, sobrantesGuardables: sg, sobrantesDescartables: sd };
  }, [data]);

  if (!open) return null;

  return (
    <>
      <style>{STYLE}</style>
      <div className="op-ov" onClick={(e) => { if (e.target.classList.contains('op-ov')) onClose?.(); }}>
        <div className="op-modal">
          {/* HEADER */}
          <div style={{
            padding:'14px 18px', background:'#0B1422', color:'#fff',
            display:'flex', alignItems:'center', gap:12, borderBottom:`1px solid ${T.borderMd}`,
          }}>
            <Scissors size={20} color="#93C5FD"/>
            <div style={{ flex:1 }}>
              <div style={{ fontFamily:T.font, fontSize:'.95rem', fontWeight:500, letterSpacing:'.03em' }}>
                Plan de Corte del Proyecto
              </div>
              <div style={{ fontFamily:T.font, fontSize:'.65rem', color:'#93C5FD', textTransform:'uppercase', letterSpacing:'.1em', marginTop:2 }}>
                {nombreProyecto} · Optimización 1D · FFD + Best Fit
              </div>
            </div>
            <button onClick={() => onClose?.()}
              style={{ background:'rgba(255,255,255,.08)', border:0, padding:7, borderRadius:7, color:'#fff', cursor:'pointer' }}>
              <X size={16}/>
            </button>
          </div>

          {/* TABS */}
          <div className="op-tabs">
            <button className={`op-tab ${tab==='plan'?'active':''}`} onClick={()=>setTab('plan')}>
              <Scissors size={13}/> Plan de Corte
              {data?.grupos && <span className="badge">{data.grupos.length}</span>}
            </button>
            <button className={`op-tab ${tab==='banco'?'active':''}`} onClick={()=>setTab('banco')}>
              <Recycle size={13}/> Banco de Residuos
              {kpis && <span className="badge">{kpis.residuosReutilizadosTotales}/{kpis.residuosNuevosGenerados}</span>}
            </button>
          </div>

          {/* KPIs */}
          {kpis && (
            <div className="op-kpi-grid">
              <Kpi icon={Scissors} label="Barras nuevas"
                value={kpis.barrasNuevasTotales}
                sub={`${data.grupos.length} perfiles`}
                bgIcon={T.bluePale} fgIcon={T.blue}/>
              <Kpi icon={Recycle} label="Reutilizados"
                value={kpis.residuosReutilizadosTotales}
                sub={kpis.residuosReutilizadosTotales > 0 ? 'del banco' : 'sin matches'}
                color={kpis.residuosReutilizadosTotales > 0 ? T.green : T.textPri}
                bgIcon="#FEF3C7" fgIcon={T.orange}/>
              <Kpi icon={TrendingDown} label="% Desperdicio"
                value={`${fmtCmAdapt(kpis.porcentajeDesperdicioGlobal)}%`}
                sub={kpis.porcentajeDesperdicioGlobal < 8 ? 'Óptimo' : kpis.porcentajeDesperdicioGlobal < 15 ? 'Aceptable' : 'Revisar'}
                color={kpis.porcentajeDesperdicioGlobal < 8 ? T.green : kpis.porcentajeDesperdicioGlobal < 15 ? '#D97706' : T.red}
                bgIcon={T.redPale} fgIcon={T.red}/>
              <Kpi icon={Package} label="Sobrantes ≥ 20cm"
                value={kpis.residuosNuevosGenerados}
                sub="al banco"
                bgIcon={T.greenPale} fgIcon={T.green}/>
            </div>
          )}

          {/* BODY */}
          <div className="op-scroll" style={{ flex:1, overflowY:'auto', padding:'14px 18px' }}>
            {loading && (
              <div style={{ textAlign:'center', padding:'60px 20px' }}>
                <Loader size={32} className="op-spin" color={T.blue}/>
                <div style={{ marginTop:12, color:T.textMut, fontFamily:T.font, fontSize:'.75rem' }}>
                  CALCULANDO PLAN ÓPTIMO...
                </div>
              </div>
            )}

            {!loading && data?.grupos?.length === 0 && (
              <div style={{
                background:T.orangePale, border:`1px solid ${T.orange}33`,
                borderRadius:10, padding:20,
              }}>
                <div style={{ textAlign:'center', marginBottom: data?.errores?.length ? 14 : 0 }}>
                  <AlertTriangle size={28} color={T.orange} style={{ margin:'0 auto 8px' }}/>
                  <div style={{ fontSize:'.95rem', fontWeight:700, color:T.orange }}>
                    {data?.mensaje || 'El proyecto no tiene ventanas con cortes'}
                  </div>
                  {data?.total_ventanas != null && (
                    <div style={{ fontSize:'.75rem', color:'#78350F', marginTop:4 }}>
                      Ventanas en el proyecto: <strong>{data.total_ventanas}</strong>
                      {data.errores?.length ? ` · Fallidas: ${data.errores.length}` : ''}
                    </div>
                  )}
                </div>

                {/* Detalle por ventana fallida — UX crítica: el usuario debe saber qué arreglar */}
                {data?.errores?.length > 0 && (
                  <div style={{
                    background:'#fff', border:`1px solid ${T.orange}55`,
                    borderRadius:8, padding:12, marginTop:8,
                  }}>
                    <div style={{
                      fontFamily:T.font, fontSize:'.65rem', fontWeight:700,
                      textTransform:'uppercase', letterSpacing:'.08em',
                      color:T.orange, marginBottom:8,
                    }}>
                      Ventanas que no se pudieron calcular
                    </div>
                    {data.errores.map((e, i) => (
                      <div key={i} style={{
                        display:'flex', alignItems:'center', gap:10,
                        padding:'7px 10px', borderRadius:6,
                        background: i % 2 === 0 ? T.bg : 'transparent',
                        fontFamily:T.font, fontSize:'.72rem',
                      }}>
                        <span style={{
                          background:T.orange, color:'#fff',
                          padding:'2px 7px', borderRadius:4,
                          fontWeight:700, fontSize:'.65rem',
                        }}>{e.ventana_label}</span>
                        <span style={{ color:T.textPri, fontWeight:500 }}>
                          {e.nombre_ventana || `Ventana #${e.id_ventana}`}
                        </span>
                        <span style={{ color:T.textSec, fontSize:'.7rem', flex:1 }}>
                          {e.razon}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {!loading && data?.grupos?.length > 0 && tab === 'plan' && (
              <>
                {data.grupos.map(g => (
                  <GrupoCard key={`${g.id_perfil}|${g.color_perfil}`} grupo={g} kerfCm={data.configuracion.kerfCm}/>
                ))}
                <div style={{
                  marginTop:14, padding:'10px 14px', background:T.surface,
                  borderRadius:8, fontSize:'.7rem', color:T.textSec, fontFamily:T.font,
                  border:`1px solid ${T.border}`,
                }}>
                  <strong style={{ color:T.textPri }}>CONFIGURACIÓN APLICADA:</strong>{' '}
                  Kerf = {data.configuracion.kerfCm}cm · Mín. reutilizable = {data.configuracion.minResiduoCm}cm
                </div>
              </>
            )}

            {!loading && data?.grupos?.length > 0 && tab === 'banco' && (
              <BancoTab data={data}/>
            )}
          </div>

          {/* FOOTER */}
          <div className="op-footer">
            {confirmado ? (
              <div style={{ flex:1, display:'flex', alignItems:'center', gap:8, color:T.green, fontWeight:700, fontFamily:T.font }}>
                <CheckCircle size={18}/> Plan confirmado · Banco actualizado
              </div>
            ) : (
              <div style={{ flex:1, fontSize:'.72rem', color:T.textMut, fontFamily:T.font }}>
                {!data ? 'Calculando…' :
                 totales.cortesTotales > 0
                  ? `${totales.cortesTotales} cortes · ${totales.sobrantesGuardables} sobrantes guardables`
                  : 'Sin cortes para optimizar'}
              </div>
            )}
            <button className="op-btn" onClick={cargarPlan} disabled={loading || confirming}>
              <RefreshCw size={14}/> Recalcular
            </button>
            <button className="op-btn"
              onClick={() => descargarPDF(idProyecto)}
              disabled={loading || confirming || !data?.grupos?.length}
              title="Descarga el plan de corte en PDF (para llevar al taller)">
              <FileDown size={14}/> Descargar PDF
            </button>
            <button className="op-btn primary"
              onClick={handleConfirmar}
              disabled={loading || confirming || confirmado || !data?.grupos?.length}
              title="Aplica el plan al banco de residuos">
              {confirming ? <Loader size={14} className="op-spin"/> : <Save size={14}/>}
              Confirmar plan
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Tab "Banco de Residuos" ─────────────────────────────────────────────────
function BancoTab({ data }) {
  // Recopilar todos los residuos usados + nuevos sobrantes con su perfil
  const usados = [];
  const nuevos = [];
  for (const g of data.grupos) {
    for (const r of g.plan.residuosUsados) {
      usados.push({
        ...r,
        referencia_perfil: g.referencia_perfil,
        color_perfil: g.color_perfil,
      });
    }
    for (const b of g.plan.barrasNuevas) {
      if (b.sobrante_cm >= 20) {
        nuevos.push({
          barra_id: b.id,
          longitud_cm: b.sobrante_cm,
          referencia_perfil: g.referencia_perfil,
          color_perfil: g.color_perfil,
        });
      }
    }
  }

  return (
    <>
      {/* Resumen */}
      <div style={{
        display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14,
      }}>
        <div style={{
          background:'#FFFBEB', border:`1px solid ${T.orange}33`, borderRadius:10, padding:12,
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
            <Recycle size={16} color={T.orange}/>
            <span style={{ fontFamily:T.font, fontSize:'.7rem', fontWeight:700, color:T.orange, textTransform:'uppercase', letterSpacing:'.08em' }}>
              Residuos a Consumir
            </span>
          </div>
          <div style={{ fontFamily:T.font, fontSize:'1.5rem', fontWeight:500, color:T.textPri }}>
            {usados.length}
          </div>
          <div style={{ fontSize:'.7rem', color:T.textMut }}>
            Al confirmar, salen del banco
          </div>
        </div>
        <div style={{
          background:T.greenPale, border:`1px solid ${T.green}33`, borderRadius:10, padding:12,
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
            <Package size={16} color={T.green}/>
            <span style={{ fontFamily:T.font, fontSize:'.7rem', fontWeight:700, color:T.green, textTransform:'uppercase', letterSpacing:'.08em' }}>
              Sobrantes a Guardar
            </span>
          </div>
          <div style={{ fontFamily:T.font, fontSize:'1.5rem', fontWeight:500, color:T.textPri }}>
            {nuevos.length}
          </div>
          <div style={{ fontSize:'.7rem', color:T.textMut }}>
            Al confirmar, entran al banco
          </div>
        </div>
      </div>

      {/* Lista de usados */}
      {usados.length > 0 && (
        <>
          <div style={{
            fontFamily:T.font, fontSize:'.7rem', fontWeight:700,
            textTransform:'uppercase', letterSpacing:'.1em',
            color:T.orange, marginBottom:8, marginTop:8,
          }}>
            🔻 Saldrán del banco ({usados.length})
          </div>
          {usados.map((r, i) => (
            <div key={i} style={{
              display:'flex', alignItems:'center', gap:10,
              padding:'8px 12px', background:'#FFFBEB',
              border:`1px solid ${T.orange}22`, borderLeft:`3px solid ${T.orange}`,
              borderRadius:6, marginBottom:5, fontFamily:T.font,
            }}>
              <div style={{ fontSize:'.78rem', fontWeight:500, color:T.textPri }}>
                ♻ Residuo #{r.id_residuo}
              </div>
              <div style={{ fontSize:'.7rem', color:T.textMut }}>
                {r.referencia_perfil} · {r.color_perfil}
              </div>
              <div style={{ flex:1, textAlign:'right', fontSize:'.7rem', color:T.textSec }}>
                {fmtCmAdapt(r.longitud_original_cm)}cm → {fmtCmAdapt(r.corte.longitud_cm)}cm ({r.corte.etiqueta}{r.corte.ventana_label?` ${r.corte.ventana_label}`:''})
                {r.sobrante_cm >= 20 && <span style={{ color:T.green, marginLeft:6 }}>queda {fmtCmAdapt(r.sobrante_cm)}cm ♻</span>}
              </div>
            </div>
          ))}
        </>
      )}

      {/* Lista de nuevos */}
      {nuevos.length > 0 && (
        <>
          <div style={{
            fontFamily:T.font, fontSize:'.7rem', fontWeight:700,
            textTransform:'uppercase', letterSpacing:'.1em',
            color:T.green, marginBottom:8, marginTop:14,
          }}>
            🔺 Entrarán al banco ({nuevos.length})
          </div>
          {nuevos.map((n, i) => (
            <div key={i} style={{
              display:'flex', alignItems:'center', gap:10,
              padding:'8px 12px', background:T.greenPale,
              border:`1px solid ${T.green}22`, borderLeft:`3px solid ${T.green}`,
              borderRadius:6, marginBottom:5, fontFamily:T.font,
            }}>
              <div style={{ fontSize:'.78rem', fontWeight:500, color:T.textPri }}>
                + Sobrante de Barra #{n.barra_id}
              </div>
              <div style={{ fontSize:'.7rem', color:T.textMut }}>
                {n.referencia_perfil} · {n.color_perfil}
              </div>
              <div style={{ flex:1, textAlign:'right', fontFamily:T.font, fontSize:'.85rem', fontWeight:500, color:T.green }}>
                {fmtCmAdapt(n.longitud_cm)} cm
              </div>
            </div>
          ))}
        </>
      )}

      {usados.length === 0 && nuevos.length === 0 && (
        <div style={{
          textAlign:'center', padding:30, color:T.textMut, fontFamily:T.font, fontSize:'.78rem',
        }}>
          Sin movimientos en el banco para este plan.
        </div>
      )}
    </>
  );
}
