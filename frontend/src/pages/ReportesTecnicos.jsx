import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import toast from 'react-hot-toast';
import { FileText, Search, Eye, Trash2, Lock, CheckCircle, XCircle, PauseCircle, Clock, X } from 'lucide-react';

const fmt = n => new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(n||0);

const ESTADO_CFG = {
  'en progreso': { bg:'var(--info-light)',    color:'var(--info)',    border:'#AECBF0', Icon:Clock        },
  completado:    { bg:'var(--success-light)', color:'var(--success)', border:'#A7D9B8', Icon:CheckCircle  },
  cancelado:     { bg:'var(--danger-light)',  color:'var(--danger)',  border:'#F1B3AE', Icon:XCircle      },
  'en pausa':    { bg:'var(--warning-light)', color:'var(--warning)', border:'#E8C170', Icon:PauseCircle  },
};

const puedeEliminar = e => e==='en progreso';

export default function ReportesTecnicos() {
  const navigate = useNavigate();
  const [reportes,     setReportes]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [filtroEstado, setFiltroEstado] = useState('todos');

  useEffect(() => {
    api.get('/ventanas/reportes').then(r=>setReportes(r.data)).catch(()=>toast.error('Error al cargar reportes')).finally(()=>setLoading(false));
  }, []);

  const estados = ['todos','en progreso','completado','en pausa','cancelado'];
  const counts  = reportes.reduce((a,r)=>{ a[r.estado_proyecto]=(a[r.estado_proyecto]||0)+1; return a; },{});
  const filtered = reportes.filter(r=>{
    const q = search.toLowerCase();
    const match = (r.nombre_proyecto||'').toLowerCase().includes(q)||(r.nombre_cliente||'').toLowerCase().includes(q)||(r.sistema||'').toLowerCase().includes(q)||(r.diseno||'').toLowerCase().includes(q);
    return match && (filtroEstado==='todos'||r.estado_proyecto===filtroEstado);
  });

  const handleEliminar = async (e,r) => {
    e.stopPropagation();
    if (!puedeEliminar(r.estado_proyecto)) { toast.error(`No se puede eliminar: proyecto "${r.estado_proyecto}"`); return; }
    if (!window.confirm(`¿Eliminar reporte V#${r.id_ventana}?`)) return;
    try { await api.delete(`/ventanas/${r.id_ventana}/reporte`); toast.success('Reporte eliminado'); setReportes(p=>p.filter(x=>x.id_ventana!==r.id_ventana)); }
    catch(err) { toast.error(err.response?.data?.error||'Error'); }
  };

  const completadas = reportes.filter(r=>r.estado_proyecto==='completado');

  const COLS = [
    { label:'#',        w:52  },
    { label:'Proyecto', w:'auto' },
    { label:'Cliente',  w:120 },
    { label:'Estado',   w:120 },
    { label:'Sistema',  w:100 },
    { label:'Perfil',   w:70  },
    { label:'Diseño',   w:80  },
    { label:'Medidas',  w:90  },
    { label:'Mat.',     w:60  },
    { label:'Costo',    w:120 },
    { label:'',         w:70  },
  ];

  return (
    <div>
      {/* Header */}
      <div className="page-header" style={{ marginBottom:'1.25rem' }}>
        <div style={{ display:'flex',alignItems:'center',gap:12 }}>
          <div style={{ width:38,height:38,borderRadius:9,background:'var(--steel-100)',border:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'center' }}>
            <FileText size={18} style={{ color:'var(--primary)' }}/>
          </div>
          <div>
            <h1 style={{ fontFamily:'var(--font-display)',fontSize:'1.5rem',letterSpacing:'-.01em' }}>Reportes Técnicos</h1>
            <p style={{ color:'var(--text-muted)',fontSize:'.82rem',marginTop:1 }}>Historial de todas las ventanas con reporte generado</p>
          </div>
        </div>
        {completadas.length>0 && (
          <div style={{ background:'var(--success-light)',border:'1px solid #A7D9B8',borderRadius:8,padding:'8px 16px',textAlign:'right' }}>
            <div style={{ fontFamily:'var(--font-mono)',fontSize:'.62rem',color:'var(--success)',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:2 }}>Producción confirmada</div>
            <div style={{ fontFamily:'var(--font-mono)',fontSize:'.82rem',fontWeight:600,color:'var(--success)' }}>
              {completadas.length} ventana{completadas.length!==1?'s':''}
              {completadas.reduce((s,r)=>s+parseFloat(r.costo_total_materiales||0),0)>0 &&
                <span style={{ marginLeft:8 }}>· {fmt(completadas.reduce((s,r)=>s+parseFloat(r.costo_total_materiales||0),0))}</span>}
            </div>
          </div>
        )}
      </div>

      {/* Filtros */}
      <div style={{ background:'var(--surface)',border:'1px solid var(--border)',borderRadius:9,padding:'12px 14px',marginBottom:14,boxShadow:'var(--shadow)' }}>
        <div style={{ display:'flex',gap:5,flexWrap:'wrap',marginBottom:10 }}>
          {estados.map(e=>{
            const active=filtroEstado===e;
            const cfg=ESTADO_CFG[e];
            return (
              <button key={e} onClick={()=>setFiltroEstado(e)} style={{
                display:'flex',alignItems:'center',gap:4,
                fontFamily:'var(--font-body)',fontSize:'.78rem',fontWeight:active?700:500,
                padding:'4px 12px',borderRadius:5,cursor:'pointer',
                background:active?'var(--primary)':'var(--steel-100)',
                color:active?'#fff':'var(--text-secondary)',
                border:`1px solid ${active?'var(--primary)':'var(--border)'}`,
                transition:'all .12s',
              }}>
                {e==='todos'?`Todos (${reportes.length})`:`${e} (${counts[e]||0})`}
              </button>
            );
          })}
        </div>
        <div style={{ position:'relative' }}>
          <Search size={14} style={{ position:'absolute',left:11,top:'50%',transform:'translateY(-50%)',color:'var(--text-muted)' }}/>
          <input placeholder="Buscar por proyecto, cliente, sistema o diseño…" value={search} onChange={e=>setSearch(e.target.value)} style={{ paddingLeft:36,paddingRight:search?34:12,width:'100%',boxSizing:'border-box' }}/>
          {search&&<button onClick={()=>setSearch('')} style={{ position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'var(--text-muted)',display:'flex',alignItems:'center' }}><X size={13}/></button>}
        </div>
      </div>

      {/* Tabla */}
      <div style={{ background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',overflow:'hidden',boxShadow:'var(--shadow)' }}>
        {loading ? (
          <div style={{ textAlign:'center',padding:'3rem' }}><div className="spinner" style={{ margin:'0 auto' }}/></div>
        ) : filtered.length===0 ? (
          <div className="empty-state" style={{ padding:'4rem' }}><FileText size={44}/><p>{search||filtroEstado!=='todos'?'Sin resultados':'No hay reportes técnicos generados aún'}</p></div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%',borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ borderBottom:'2px solid var(--border)' }}>
                  {COLS.map((col,i)=>(
                    <th key={i} style={{
                      padding:'10px 12px',textAlign:i>=8&&i<=9?'right':i===10?'center':'left',
                      fontFamily:'var(--font-body)',fontSize:'.72rem',fontWeight:700,
                      textTransform:'uppercase',letterSpacing:'.08em',
                      color:'var(--text-muted)',background:'var(--bg-deep)',
                      borderBottom:'1px solid var(--border)',whiteSpace:'nowrap',
                      width:col.w, minWidth:col.w==='auto'?undefined:col.w,
                    }}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r,idx)=>{
                  const cfg=ESTADO_CFG[r.estado_proyecto]||ESTADO_CFG['en progreso'];
                  const EI=cfg.Icon;
                  return (
                    <tr key={r.id_ventana} style={{ borderBottom:'1px solid var(--border)',background:idx%2===0?'var(--surface)':'var(--surface-2)',transition:'background .12s' }}
                      onMouseEnter={e=>e.currentTarget.style.background='#EEF3FA'}
                      onMouseLeave={e=>e.currentTarget.style.background=idx%2===0?'var(--surface)':'var(--surface-2)'}
                    >
                      <td style={{ padding:'11px 12px',fontFamily:'var(--font-mono)',fontSize:'.75rem',fontWeight:600,color:'var(--primary)',whiteSpace:'nowrap' }}>#{r.id_ventana}</td>
                      <td style={{ padding:'11px 12px',fontWeight:600,fontSize:'.85rem',color:'var(--primary)',cursor:'pointer' }} onClick={()=>navigate(`/proyectos/${r.id_proyecto}`)}>{r.nombre_proyecto}</td>
                      <td style={{ padding:'11px 12px',fontSize:'.82rem',color:'var(--text-secondary)' }}>{r.nombre_cliente||'—'}</td>
                      <td style={{ padding:'11px 12px' }}>
                        <span style={{ display:'inline-flex',alignItems:'center',justifyContent:'center',gap:4,fontFamily:'var(--font-body)',fontSize:'.72rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',padding:'3px 0',borderRadius:4,background:cfg.bg,color:cfg.color,border:`1px solid ${cfg.border}`,minWidth:100,whiteSpace:'nowrap' }}>
                          <EI size={9}/>{r.estado_proyecto||'—'}
                        </span>
                      </td>
                      <td style={{ padding:'11px 12px',fontSize:'.82rem',color:'var(--text-secondary)' }}>{r.sistema}</td>
                      <td style={{ padding:'11px 12px' }}>
                        <span style={{ fontFamily:'var(--font-mono)',fontSize:'.68rem',fontWeight:600,background:'var(--steel-100)',color:'var(--steel-600)',border:'1px solid var(--border)',borderRadius:4,padding:'2px 0',minWidth:44,display:'inline-block',textAlign:'center' }}>{r.perfil}</span>
                      </td>
                      <td style={{ padding:'11px 12px',fontWeight:600,fontSize:'.83rem',color:'var(--text-primary)' }}>{r.diseno}</td>
                      <td style={{ padding:'11px 12px',fontFamily:'var(--font-mono)',fontSize:'.75rem',color:'var(--text-muted)',whiteSpace:'nowrap' }}>{r.ancho_vano}×{r.alto_vano}</td>
                      <td style={{ padding:'11px 12px',textAlign:'right',fontFamily:'var(--font-mono)',fontSize:'.78rem',color:'var(--text-secondary)' }}>{r.num_materiales||0}</td>
                      <td style={{ padding:'11px 12px',textAlign:'right',fontFamily:'var(--font-mono)',fontSize:'.8rem',fontWeight:600,color:'var(--text-primary)' }}>{r.costo_total_materiales?fmt(r.costo_total_materiales):'—'}</td>
                      <td style={{ padding:'11px 12px' }}>
                        <div style={{ display:'flex',gap:4,justifyContent:'center' }}>
                          <button onClick={()=>navigate(`/proyectos/${r.id_proyecto}`)} title="Ver proyecto" style={{ display:'flex',alignItems:'center',justifyContent:'center',width:30,height:30,borderRadius:6,cursor:'pointer',background:'var(--steel-100)',border:'1px solid var(--border)',color:'var(--steel-600)',transition:'all .12s' }}
                            onMouseEnter={e=>{e.currentTarget.style.background='var(--primary)';e.currentTarget.style.color='#fff';e.currentTarget.style.borderColor='var(--primary)';}}
                            onMouseLeave={e=>{e.currentTarget.style.background='var(--steel-100)';e.currentTarget.style.color='var(--steel-600)';e.currentTarget.style.borderColor='var(--border)';}}
                          ><Eye size={12}/></button>
                          {puedeEliminar(r.estado_proyecto) ? (
                            <button onClick={e=>handleEliminar(e,r)} title="Eliminar reporte" style={{ display:'flex',alignItems:'center',justifyContent:'center',width:30,height:30,borderRadius:6,cursor:'pointer',background:'var(--danger-light)',border:'1px solid #F1B3AE',color:'var(--danger)',transition:'all .12s' }}
                              onMouseEnter={e=>{e.currentTarget.style.background='var(--danger)';e.currentTarget.style.color='#fff';}}
                              onMouseLeave={e=>{e.currentTarget.style.background='var(--danger-light)';e.currentTarget.style.color='var(--danger)';}}
                            ><Trash2 size={12}/></button>
                          ) : (
                            <span title={`Bloqueado — ${r.estado_proyecto}`} style={{ display:'flex',alignItems:'center',justifyContent:'center',width:30,height:30,color:'var(--steel-200)' }}><Lock size={12}/></span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading&&filtered.length>0&&(
          <div style={{ padding:'9px 16px',background:'var(--bg-deep)',borderTop:'1px solid var(--border)',display:'flex',justifyContent:'space-between' }}>
            <span style={{ fontFamily:'var(--font-mono)',fontSize:'.68rem',color:'var(--text-muted)' }}>{filtered.length} de {reportes.length} reportes</span>
          </div>
        )}
      </div>
    </div>
  );
}
