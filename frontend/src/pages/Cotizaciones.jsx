import { useEffect, useState } from 'react';
import api from '../api/client';
import toast from 'react-hot-toast';
import { FileText, FileDown, Search, X, Loader, Trash2, ChevronDown } from 'lucide-react';
import { useConfirmDelete } from '../hooks/useConfirmDelete';

const fmt = (n) => new Intl.NumberFormat('es-CO', { style:'currency', currency:'COP', maximumFractionDigits:0 }).format(n || 0);

function DetalleCotizacion({ cot, onClose }) {
  const [detalle, setDetalle] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/cotizaciones/${cot.id_cotizacion}`)
      .then(r => setDetalle(r.data))
      .catch(() => toast.error('Error al cargar detalle'))
      .finally(() => setLoading(false));
  }, [cot.id_cotizacion]);

  const [generatingPDF, setGeneratingPDF] = useState(false);

  const handlePDF = async () => {
    if (!detalle?.id_cotizacion) return;
    setGeneratingPDF(true);
    try {
      const res = await api.get(`/cotizaciones/${detalle.id_cotizacion}/pdf`, {
        responseType: 'blob',
        validateStatus: (s) => s >= 200 && s < 600,
      });

      // Error 4xx/5xx: leer mensaje del backend
      if (res.status >= 400) {
        let mensaje = `Error ${res.status} al generar el PDF`;
        try {
          const text = await res.data.text();
          const j = JSON.parse(text);
          mensaje = j.error + (j.detalle ? `: ${j.detalle}` : '');
          console.error('[handlePDF] server error:', j);
        } catch (e) { console.error('[handlePDF] error no-json:', e); }
        toast.error(mensaje, { duration: 10000 });
        return;
      }

      // Validar magic bytes "%PDF-"
      const head = await res.data.slice(0, 5).text();
      if (!head.startsWith('%PDF-')) {
        console.error('[handlePDF] respuesta no es PDF. head=', head);
        let mensaje = 'El servidor no devolvió un PDF válido';
        try {
          const text = await res.data.text();
          try {
            const j = JSON.parse(text);
            mensaje = j.error + (j.detalle ? `: ${j.detalle}` : '');
          } catch {
            mensaje += ` (respuesta: "${text.slice(0, 200)}")`;
          }
        } catch {}
        toast.error(mensaje, { duration: 10000 });
        return;
      }

      // OK: descargar
      const cotNum = String(detalle.id_cotizacion).padStart(4, '0');
      const filename = `COT-${new Date().getFullYear()}-${cotNum}.pdf`;
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);

      toast.success('PDF generado correctamente');
    } catch (err) {
      console.error('[handlePDF] excepción:', err);
      toast.error('Error al generar el PDF: ' + (err.message || 'desconocido'));
    } finally {
      setGeneratingPDF(false);
    }
  };


  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth:680 }} onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 style={{ fontWeight:700 }}>Cotización #{cot.id_cotizacion} · v{cot.version}</h2>
            <p style={{ fontSize:'.8rem', color:'var(--gray-500)' }}>{cot.nombre_proyecto}</p>
          </div>
          <button className="btn btn-outline btn-sm" onClick={onClose}><X size={16}/></button>
        </div>
        <div className="modal-body">
          {loading ? <div style={{ textAlign:'center', padding:'2rem' }}><div className="spinner" style={{ margin:'0 auto' }}/></div>
          : !detalle ? <p>Error al cargar</p>
          : (<>
            <div style={{ background:'var(--success-light)', color:'var(--success)', padding:'1.25rem', borderRadius:12, marginBottom:'1.25rem', textAlign:'center' }}>
              <div style={{ fontSize:'.85rem', fontWeight:600 }}>Total</div>
              <div style={{ fontSize:'2.25rem', fontWeight:900 }}>{fmt(detalle.total_final)}</div>
            </div>
            {detalle.detalles?.length > 0 && (<>
              <p style={{ fontSize:'.78rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'var(--gray-500)', marginBottom:8 }}>Materiales</p>
              <div style={{ overflowX:'auto', marginBottom:'1.25rem' }}>
                <table>
                  <thead><tr><th>Material</th><th>Cantidad</th><th>Precio</th><th>Subtotal</th></tr></thead>
                  <tbody>
                    {detalle.detalles.map((d,i)=>(
                      <tr key={i}>
                        <td style={{ fontSize:'.83rem' }}>{d.nombre_material}</td>
                        <td style={{ fontSize:'.83rem' }}>{parseFloat(d.cantidad_total).toFixed(4)} m</td>
                        <td style={{ fontSize:'.83rem' }}>{fmt(d.precio_unitario_snapshot)}</td>
                        <td style={{ fontWeight:600, fontSize:'.83rem' }}>{fmt(d.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>)}
            <table>
              <tbody>
                <tr><td style={{ color:'var(--gray-600)' }}>Subtotal Materiales</td><td style={{ textAlign:'right' }}>{fmt(detalle.subtotal_materiales)}</td></tr>
                <tr><td style={{ color:'var(--gray-600)' }}>Recargo ({detalle.recargo_materiales_pct}%)</td><td style={{ textAlign:'right' }}>{fmt(detalle.subtotal_materiales_con_recargo - detalle.subtotal_materiales)}</td></tr>
                <tr><td style={{ fontWeight:700 }}>Subtotal c/Recargo</td><td style={{ textAlign:'right', fontWeight:700 }}>{fmt(detalle.subtotal_materiales_con_recargo)}</td></tr>
                <tr><td style={{ color:'var(--gray-600)' }}>Mano de Obra ({detalle.dias_proyectados} días)</td><td style={{ textAlign:'right' }}>{fmt(detalle.subtotal_mano_obra)}</td></tr>
                <tr><td style={{ color:'var(--gray-600)' }}>Utilidad ({detalle.utilidad_pct}%)</td><td style={{ textAlign:'right' }}>{fmt(detalle.utilidad_valor)}</td></tr>
                <tr><td style={{ color:'var(--gray-600)' }}>IVA ({detalle.iva_pct}%)</td><td style={{ textAlign:'right' }}>{fmt(detalle.iva_valor)}</td></tr>
                <tr style={{ borderTop:'2px solid var(--gray-200)' }}>
                  <td style={{ fontWeight:800, fontSize:'1rem' }}>TOTAL FINAL</td>
                  <td style={{ textAlign:'right', fontWeight:800, fontSize:'1rem', color:'var(--success)' }}>{fmt(detalle.total_final)}</td>
                </tr>
              </tbody>
            </table>
          </>)}
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Cerrar</button>
          <button className="btn btn-outline" onClick={handlePDF} style={{ color:'var(--primary)', borderColor:'var(--primary)' }} disabled={loading || generatingPDF}>
            {generatingPDF ? (<><Loader size={16} className="spin"/> Generando PDF…</>) : (<><FileDown size={16}/> Descargar PDF</>)}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Cotizaciones() {
  const [cots, setCots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [filtroFecha, setFiltroFecha] = useState({ desde: '', hasta: '' });

  // Responsive: en celular la tabla (9 columnas) se desliza con ancho mínimo.
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 820);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 820);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const { confirm: confirmDelete, modal: deleteModal } = useConfirmDelete();

  useEffect(() => {
    api.get('/cotizaciones').then(r => setCots(r.data)).catch(() => toast.error('Error')).finally(() => setLoading(false));
  }, []);

  const filtered = cots.filter(c => {
    const matchSearch = (c.nombre_proyecto||'').toLowerCase().includes(search.toLowerCase()) ||
      (c.nombre_cliente||'').toLowerCase().includes(search.toLowerCase());
    const matchEstado = filtroEstado === 'todos' || (c.estado_proyecto||'') === filtroEstado;
    const fechaRaw = c.fecha_cotizacion || c.fecha_creacion;
    const fecha = fechaRaw ? new Date(fechaRaw) : null;
    const matchDesde = !filtroFecha.desde || (fecha && fecha >= new Date(filtroFecha.desde));
    const matchHasta = !filtroFecha.hasta || (fecha && fecha <= new Date(filtroFecha.hasta + 'T23:59:59'));
    return matchSearch && matchEstado && matchDesde && matchHasta;
  });
  const totalFiltrado = filtered.reduce((s, c) => s + parseFloat(c.total_final||0), 0);

  const handleEliminar = (e, cot) => {
    e.stopPropagation();
    confirmDelete({
      itemLabel: `la cotización v${cot.version || 1} de ${cot.nombre_proyecto || 'proyecto'}`,
      warningText: 'Se borrarán todos los detalles, materiales y parámetros guardados.',
      onConfirm: async (password) => {
        await api.delete(`/cotizaciones/${cot.id_cotizacion}`, { data: { password } });
        toast.success('Cotización eliminada');
        setCots(prev => prev.filter(c => c.id_cotizacion !== cot.id_cotizacion));
        if (selected?.id_cotizacion === cot.id_cotizacion) setSelected(null);
      },
    });
  };

  const estadoStyle = (e) => ({
    'en progreso': { bg:'var(--info-light)',    color:'var(--info)',    border:'#AECBF0' },
    completado:    { bg:'var(--success-light)', color:'var(--success)', border:'#A7D9B8' },
    cancelado:     { bg:'var(--danger-light)',  color:'var(--danger)',  border:'#F1B3AE' },
    'en pausa':    { bg:'var(--warning-light)', color:'var(--warning)', border:'#E8C170' },
  }[e] || { bg:'var(--info-light)', color:'var(--info)', border:'#AECBF0' });

  // Workflow de cotización: 6 estados con sus colores
  const workflowStyle = (w) => ({
    borrador:   { bg:'#F1F5F9', color:'#475569', border:'#CBD5E1', label:'Borrador' },
    enviada:    { bg:'#DBEAFE', color:'#1E40AF', border:'#93C5FD', label:'Enviada' },
    aceptada:   { bg:'#D1FAE5', color:'#047857', border:'#86EFAC', label:'Aceptada' },
    rechazada:  { bg:'#FEE2E2', color:'#B91C1C', border:'#FCA5A5', label:'Rechazada' },
    convertida: { bg:'#E9D5FF', color:'#6B21A8', border:'#C4B5FD', label:'Producción' },
    cancelada:  { bg:'#F3F4F6', color:'#6B7280', border:'#D1D5DB', label:'Cancelada' },
  }[w] || { bg:'#F1F5F9', color:'#475569', border:'#CBD5E1', label:w || 'Borrador' });

  // ─── Transiciones de estado permitidas (espejo del backend) ────────────────
  // Mostrar SOLO los estados a los que la cotización puede pasar desde el
  // estado actual, evitando que el usuario reciba 400 "Transición inválida".
  // Estados finales (rechazada, convertida, cancelada) NO se pueden cambiar.
  const TRANSICIONES_COT = {
    borrador:   ['enviada', 'cancelada'],
    enviada:    ['aceptada', 'rechazada', 'cancelada', 'borrador'],
    aceptada:   ['convertida', 'cancelada'],
    rechazada:  [],
    convertida: [],
    cancelada:  [],
  };
  // Estados que NO se pueden modificar (visualmente deshabilitados)
  const esEstadoFinal = (estado) =>
    ['rechazada', 'convertida', 'cancelada'].includes(estado);

  // Cambiar estado del workflow (llama al PATCH /cotizaciones/:id/estado)
  const handleCambiarEstado = async (e, cot, nuevoEstado) => {
    e.stopPropagation();
    const actual = cot.estado_workflow || 'borrador';
    if (actual === nuevoEstado) return;
    // Validar transición localmente antes de pegar al backend
    const permitidos = TRANSICIONES_COT[actual] || [];
    if (!permitidos.includes(nuevoEstado)) {
      toast.error(`No se puede pasar de "${workflowStyle(actual).label}" a "${workflowStyle(nuevoEstado).label}"`);
      return;
    }
    try {
      await api.patch(`/cotizaciones/${cot.id_cotizacion}/estado`, { estado: nuevoEstado });
      toast.success(`Estado: ${workflowStyle(nuevoEstado).label}`);
      // Refrescar la lista
      const r = await api.get('/cotizaciones');
      setCots(r.data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo cambiar el estado');
    }
  };

  const totalFiltradoStr = fmt(totalFiltrado);
  const totalGeneral = cots.reduce((s,c)=>s+parseFloat(c.total_final||0),0);

  return (
    <div>
      {/* ── HEADER BAR (Layout C v4: título + KPIs en una sola barra) ── */}
      <div style={{
        background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)',
        padding:'14px 18px', marginBottom:14, boxShadow:'var(--shadow)',
        display:'flex', alignItems:'center', gap:16, flexWrap:'wrap',
      }}>
        <div style={{ width:38,height:38,borderRadius:9,background:'var(--steel-100)',border:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
          <FileText size={18} style={{ color:'var(--primary)' }}/>
        </div>
        <div style={{ flex:'1 1 220px', minWidth:0 }}>
          <h1 style={{ fontFamily:'var(--font-display)', fontSize:'1.35rem', letterSpacing:'-.01em', lineHeight:1.1 }}>Cotizaciones</h1>
          <p style={{ color:'var(--text-muted)', fontSize:'.8rem', marginTop:2 }}>
            {filtered.length} resultado{filtered.length!==1?'s':''} · <span style={{ color:'var(--primary)', fontWeight:700 }}>{totalFiltradoStr}</span>
          </p>
        </div>
        <div style={{ width:1, height:38, background:'var(--border)', flexShrink:0 }}/>
        <div style={{ textAlign:'center', padding:'0 6px', whiteSpace:'nowrap' }}>
          <div style={{ fontFamily:'var(--font-body)', fontSize:'.6rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:3 }}>Cotizaciones</div>
          <div style={{ fontFamily:'var(--font-display)', fontSize:'1.45rem', fontWeight:800, color:'var(--text-primary)', letterSpacing:'-.01em' }}>{cots.length}</div>
        </div>
        <div style={{ width:1, height:38, background:'var(--border)', flexShrink:0 }}/>
        <div style={{ textAlign:'center', padding:'0 6px', whiteSpace:'nowrap' }}>
          <div style={{ fontFamily:'var(--font-body)', fontSize:'.6rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:3 }}>Total general</div>
          <div style={{ fontFamily:'var(--font-body)', fontSize:'1.05rem', fontWeight:700, color:'var(--success)' }}>{fmt(totalGeneral)}</div>
        </div>
      </div>

      {/* ── FILTROS ── */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', padding:'14px 16px', marginBottom:14, boxShadow:'var(--shadow)' }}>
        <div style={{ position:'relative', marginBottom:10 }}>
          <Search size={14} style={{ position:'absolute',left:11,top:'50%',transform:'translateY(-50%)',color:'var(--text-muted)' }}/>
          <input placeholder="Buscar por proyecto o cliente…" value={search} onChange={e=>setSearch(e.target.value)}
            style={{ paddingLeft:36, paddingRight:search?34:12, width:'100%', boxSizing:'border-box' }}/>
          {search && <button onClick={()=>setSearch('')} style={{ position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'var(--text-muted)',display:'flex',alignItems:'center' }}><X size={13}/></button>}
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
          {/* Select estado — fondo claro corregido + chevron lucide */}
          <div style={{ position:'relative', flex:'1 1 180px' }}>
            <select value={filtroEstado} onChange={e=>setFiltroEstado(e.target.value)}
              style={{
                width:'100%', fontFamily:'var(--font-body)', fontSize:'.83rem', padding:'7px 30px 7px 10px',
                borderRadius:7, background:'var(--bg)', border:'1px solid var(--border)', color:'var(--text-primary)',
                cursor:'pointer', outline:'none', appearance:'none', WebkitAppearance:'none', MozAppearance:'none',
              }}>
              <option value="todos">Todos los estados</option>
              <option value="en progreso">En progreso</option>
              <option value="completado">Completado</option>
              <option value="en pausa">En pausa</option>
              <option value="cancelado">Cancelado</option>
            </select>
            <ChevronDown size={14} style={{ position:'absolute', right:9, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)', pointerEvents:'none' }}/>
          </div>
          <div style={{ display:'flex',alignItems:'center',gap:6,flex:'1 1 180px',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:7,padding:'4px 10px' }}>
            <span style={{ fontFamily:'var(--font-body)',fontSize:'.58rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.08em',whiteSpace:'nowrap' }}>Desde</span>
            <input type="date" value={filtroFecha.desde} onChange={e=>setFiltroFecha(f=>({...f,desde:e.target.value}))}
              style={{ flex:1,border:'none',background:'transparent',fontSize:'.83rem',color:'var(--text-primary)',outline:'none',minWidth:0 }}/>
          </div>
          <div style={{ display:'flex',alignItems:'center',gap:6,flex:'1 1 180px',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:7,padding:'4px 10px' }}>
            <span style={{ fontFamily:'var(--font-body)',fontSize:'.58rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.08em',whiteSpace:'nowrap' }}>Hasta</span>
            <input type="date" value={filtroFecha.hasta} onChange={e=>setFiltroFecha(f=>({...f,hasta:e.target.value}))}
              style={{ flex:1,border:'none',background:'transparent',fontSize:'.83rem',color:'var(--text-primary)',outline:'none',minWidth:0 }}/>
          </div>
          {(filtroEstado!=='todos'||filtroFecha.desde||filtroFecha.hasta) && (
            <button onClick={()=>{setFiltroEstado('todos');setFiltroFecha({desde:'',hasta:''});}} style={{
              display:'flex',alignItems:'center',gap:5,background:'none',border:'1px solid var(--border)',
              borderRadius:7,padding:'6px 12px',cursor:'pointer',fontSize:'.8rem',color:'var(--text-muted)',fontFamily:'var(--font-body)',
            }}><X size={12}/> Limpiar</button>
          )}
        </div>
      </div>

      {/* ── TABLA ── */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', overflow:'hidden', boxShadow:'var(--shadow)' }}>
        {loading ? (
          <div style={{ textAlign:'center',padding:'3rem' }}><div className="spinner" style={{ margin:'0 auto' }}/></div>
        ) : filtered.length===0 ? (
          <div className="empty-state" style={{ padding:'4rem' }}>
            <FileText size={44}/><p>{search||filtroEstado!=='todos'?'Sin resultados':'No hay cotizaciones aún'}</p>
          </div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', minWidth: isMobile ? 820 : undefined, borderCollapse:'collapse', tableLayout:'fixed' }}>
              <colgroup>
                <col style={{ width:'17%' }}/><col style={{ width:'12%' }}/><col style={{ width:'14%' }}/>
                <col style={{ width:'7%' }}/><col style={{ width:'10%' }}/><col style={{ width:'9%' }}/>
                <col style={{ width:'13%' }}/><col style={{ width:'9%' }}/><col style={{ width:'9%' }}/>
              </colgroup>
              <thead>
                <tr style={{ borderBottom:'2px solid var(--border)' }}>
                  {[
                    {label:'Proyecto',   align:'left'},
                    {label:'Cliente',    align:'left'},
                    {label:'Estado',     align:'left'},
                    {label:'Ver.',       align:'center'},
                    {label:'Materiales', align:'right'},
                    {label:'M.O.',       align:'right'},
                    {label:'Total',      align:'right'},
                    {label:'Fecha',      align:'right'},
                    {label:'Acciones',   align:'center'},
                  ].map((col,i)=>(
                    <th key={i} style={{
                      padding:'10px 12px', textAlign:col.align,
                      fontFamily:'var(--font-body)', fontSize:'.72rem', fontWeight:700,
                      textTransform:'uppercase', letterSpacing:'.08em',
                      color:'var(--text-muted)', background:'var(--bg-deep)',
                      borderBottom:'1px solid var(--border)', whiteSpace:'nowrap',
                    }}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c,idx)=>{
                  const est = estadoStyle(c.estado_proyecto);
                  const fecha = (c.fecha_cotizacion||c.fecha_creacion) ? new Date(c.fecha_cotizacion||c.fecha_creacion).toLocaleDateString('es-CO') : '—';
                  return (
                    <tr key={c.id_cotizacion} onClick={()=>setSelected(c)}
                      style={{ cursor:'pointer', borderBottom:'1px solid var(--border)', background:idx%2===0?'var(--surface)':'var(--surface-2)', transition:'background .12s' }}
                      onMouseEnter={e=>e.currentTarget.style.background='#EEF3FA'}
                      onMouseLeave={e=>e.currentTarget.style.background=idx%2===0?'var(--surface)':'var(--surface-2)'}
                    >
                      <td style={{ padding:'11px 12px', fontWeight:700, fontSize:'.88rem', color:'var(--primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.nombre_proyecto}</td>
                      <td style={{ padding:'11px 12px', fontSize:'.83rem', color:'var(--text-secondary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.nombre_cliente||'—'}</td>
                      <td style={{ padding:'11px 12px' }}>
                        <span style={{ display:'inline-flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--font-body)',fontSize:'.7rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',background:est.bg,color:est.color,border:`1px solid ${est.border}`,borderRadius:4,padding:'2px 8px',whiteSpace:'nowrap' }}>
                          {c.estado_proyecto||'—'}
                        </span>
                        {/* Workflow badge + dropdown — solo muestra transiciones permitidas */}
                        {(() => {
                          const estadoActual = c.estado_workflow || 'borrador';
                          const wfStyle = workflowStyle(estadoActual);
                          const transicionesValidas = TRANSICIONES_COT[estadoActual] || [];
                          const esFinal = esEstadoFinal(estadoActual);
                          const opciones = [estadoActual, ...transicionesValidas];
                          return (
                            <div style={{ marginTop:5 }} onClick={e=>e.stopPropagation()}>
                              <select
                                value={estadoActual}
                                onChange={e=>handleCambiarEstado(e, c, e.target.value)}
                                disabled={esFinal}
                                title={esFinal
                                  ? `Estado final "${wfStyle.label}" — no se puede cambiar`
                                  : 'Cambiar estado de la cotización'}
                                style={{
                                  fontFamily:'var(--font-body)', fontSize:'.7rem', fontWeight:700,
                                  textTransform:'uppercase', letterSpacing:'.04em',
                                  background:wfStyle.bg, color:wfStyle.color,
                                  border:`1px solid ${wfStyle.border}`, borderRadius:4,
                                  padding:'3px 6px',
                                  cursor: esFinal ? 'not-allowed' : 'pointer',
                                  opacity: esFinal ? 0.75 : 1,
                                  maxWidth:'100%',
                                  appearance:'none', WebkitAppearance:'none',
                                  backgroundImage: esFinal ? 'none' : `linear-gradient(45deg, transparent 50%, ${wfStyle.color} 50%), linear-gradient(135deg, ${wfStyle.color} 50%, transparent 50%)`,
                                  backgroundPosition:`calc(100% - 12px) 55%, calc(100% - 8px) 55%`,
                                  backgroundSize:'4px 4px, 4px 4px',
                                  backgroundRepeat:'no-repeat',
                                  paddingRight: esFinal ? 6 : 18,
                                }}
                              >
                                {opciones.map(estado => (
                                  <option key={estado} value={estado}>
                                    {workflowStyle(estado).label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          );
                        })()}
                      </td>
                      <td style={{ padding:'11px 12px', textAlign:'center' }}>
                        <span style={{ fontFamily:'var(--font-body)',fontSize:'.68rem',fontWeight:600,background:'var(--steel-100)',color:'var(--steel-600)',border:'1px solid var(--border)',borderRadius:4,padding:'2px 8px',display:'inline-block',textAlign:'center' }}>
                          V{c.version}
                        </span>
                      </td>
                      <td style={{ padding:'11px 12px', textAlign:'right', fontFamily:'var(--font-body)', fontSize:'.8rem', color:'var(--text-muted)', whiteSpace:'nowrap' }}>{fmt(c.subtotal_materiales_con_recargo)}</td>
                      <td style={{ padding:'11px 12px', textAlign:'right', fontFamily:'var(--font-body)', fontSize:'.8rem', color:'var(--text-muted)', whiteSpace:'nowrap' }}>{fmt(c.subtotal_mano_obra)}</td>
                      <td style={{ padding:'11px 12px', textAlign:'right' }}>
                        <span style={{ fontFamily:'var(--font-body)',fontSize:'.88rem',fontWeight:700,color:'var(--text-primary)',whiteSpace:'nowrap' }}>{fmt(c.total_final)}</span>
                      </td>
                      <td style={{ padding:'11px 12px', textAlign:'right', fontFamily:'var(--font-body)', fontSize:'.72rem', color:'var(--text-muted)', whiteSpace:'nowrap' }}>{fecha}</td>
                      <td style={{ padding:'11px 12px' }}>
                        <div style={{ display:'flex',gap:5,justifyContent:'center' }}>
                          <button onClick={e=>{e.stopPropagation();setSelected(c);}} title="Ver detalle / PDF" style={{
                            display:'flex',alignItems:'center',justifyContent:'center',width:30,height:30,borderRadius:6,cursor:'pointer',
                            background:'var(--steel-100)',border:'1px solid var(--border)',color:'var(--steel-600)',transition:'all .12s',
                          }}
                            onMouseEnter={e=>{e.currentTarget.style.background='var(--primary)';e.currentTarget.style.color='#fff';e.currentTarget.style.borderColor='var(--primary)';}}
                            onMouseLeave={e=>{e.currentTarget.style.background='var(--steel-100)';e.currentTarget.style.color='var(--steel-600)';e.currentTarget.style.borderColor='var(--border)';}}
                          ><FileDown size={13}/></button>
                          <button onClick={e=>handleEliminar(e,c)} title="Eliminar" style={{
                            display:'flex',alignItems:'center',justifyContent:'center',width:30,height:30,borderRadius:6,cursor:'pointer',
                            background:'var(--danger-light)',border:'1px solid #F1B3AE',color:'var(--danger)',transition:'all .12s',
                          }}
                            onMouseEnter={e=>{e.currentTarget.style.background='var(--danger)';e.currentTarget.style.color='#fff';}}
                            onMouseLeave={e=>{e.currentTarget.style.background='var(--danger-light)';e.currentTarget.style.color='var(--danger)';}}
                          ><Trash2 size={13}/></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading && filtered.length>0 && (
          <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 16px',background:'var(--bg-deep)',borderTop:'1px solid var(--border)' }}>
            <span style={{ fontFamily:'var(--font-body)',fontSize:'.68rem',color:'var(--text-muted)' }}>
              {filtered.length} cotización{filtered.length!==1?'es':''} mostrada{filtered.length!==1?'s':''}
            </span>
            <div style={{ display:'flex',alignItems:'center',gap:8 }}>
              <span style={{ fontFamily:'var(--font-body)',fontSize:'.68rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.06em' }}>Total:</span>
              <span style={{ fontFamily:'var(--font-body)',fontSize:'.9rem',fontWeight:700,color:'var(--text-primary)' }}>{totalFiltradoStr}</span>
            </div>
          </div>
        )}
      </div>

      {selected && <DetalleCotizacion cot={selected} onClose={()=>setSelected(null)}/>}
      {deleteModal}
    </div>
  );
}
