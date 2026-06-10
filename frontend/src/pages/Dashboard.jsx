import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FolderOpen, FileText, Package, Plus, CheckCircle,
  Clock, AlertTriangle, FileSearch, TrendingUp, ArrowRight,
  PauseCircle, XCircle, Timer, BarChart2, ChevronDown, ChevronUp
} from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';


// ── Sección desplegable ──────────────────────────────────
function RecientesSection({ title, icon: Icon, items, empty, verTodosLabel, onVerTodos, renderItem }) {
  const storageKey = `recientes-open-${title}`;
  const [open, setOpen] = useState(() => {
    const saved = localStorage.getItem(storageKey);
    return saved === null ? true : saved === 'true';
  });
  const toggle = () => {
    const next = !open;
    setOpen(next);
    localStorage.setItem(storageKey, String(next));
  };
  return (
    <div style={{
      background:'var(--surface)', border:'1px solid var(--border)',
      borderRadius:'var(--radius-lg)', marginBottom:'1rem',
      boxShadow:'var(--shadow)', overflow:'hidden',
    }}>
      {/* Header — siempre visible, click para abrir/cerrar */}
      <div
        onClick={toggle}
        style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'1rem 1.25rem', cursor:'pointer',
          transition:'background .12s',
          background: open ? 'var(--surface-2)' : 'var(--surface)',
          borderBottom: open ? '1px solid var(--border)' : 'none',
        }}
        onMouseEnter={e => e.currentTarget.style.background='var(--surface-2)'}
        onMouseLeave={e => e.currentTarget.style.background = open ? 'var(--surface-2)' : 'var(--surface)'}
      >
        <div style={{display:'flex',alignItems:'center',gap:9}}>
          <div style={{width:32,height:32,borderRadius:8,background:'var(--primary-light)',display:'flex',alignItems:'center',justifyContent:'center'}}>
            <Icon size={15} style={{color:'var(--primary)'}}/>
          </div>
          <span style={{fontFamily:'var(--font-display)',fontWeight:800,fontSize:'.95rem',letterSpacing:'.01em'}}>
            {title}
          </span>
          <span style={{
            background:'var(--primary-light)',color:'var(--primary)',
            fontSize:'.68rem',fontWeight:800,padding:'1px 7px',borderRadius:99,
          }}>
            {items.length}
          </span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <button
            className="btn btn-outline btn-sm"
            onClick={e => { e.stopPropagation(); onVerTodos(); }}
            style={{fontSize:'.72rem'}}
          >
            {verTodosLabel} <ArrowRight size={11}/>
          </button>
          {open
            ? <ChevronUp size={16} style={{color:'var(--text-muted)'}}/>
            : <ChevronDown size={16} style={{color:'var(--text-muted)'}}/>
          }
        </div>
      </div>

      {/* Body — solo cuando open */}
      {open && (
        <div style={{padding:'1rem 1.25rem 0.5rem'}}>
          {items.length === 0
            ? <div className="empty-state" style={{padding:'1.25rem'}}><p style={{fontSize:'.85rem'}}>{empty}</p></div>
            : items.map(renderItem)
          }
        </div>
      )}
    </div>
  );
}


const fmt  = (n) => new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(n||0);
const BADGE = { 'en progreso':'blue', completado:'green', cancelado:'red', 'en pausa':'yellow' };

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [metricas, setMetricas] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [p, c2, m, rep, met, sb, pend] = await Promise.all([
          api.get('/proyectos').catch(() => ({ data: [] })),
          api.get('/cotizaciones').catch(err => { console.error('[Dashboard] /cotizaciones falló:', err?.response?.data || err.message); return { data: [] }; }),
          api.get('/materiales').catch(() => ({ data: [] })),
          api.get('/ventanas/reportes').catch(() => ({ data: [] })),
          api.get('/proyectos/metricas').catch(() => ({ data: null })),
          api.get('/materiales/stock-bajo').catch(() => ({ data: [] })),
          api.get('/ventanas/pendientes').catch(() => ({ data: [] })),
        ]);
        const proyectos = Array.isArray(p.data) ? p.data : [];
        const cotizaciones = Array.isArray(c2.data) ? c2.data : [];
        const materiales = Array.isArray(m.data) ? m.data : [];
        const reportes = Array.isArray(rep.data) ? rep.data : [];
        const stockBajo = Array.isArray(sb.data) ? sb.data : [];
        const totalCotizado = cotizaciones.reduce((s,c) => s + parseFloat(c.total_final||0), 0);
        setMetricas(met.data);
        setData({
          proyectos, cotizaciones, materiales, stockBajo, reportes, ventanasPendientes: pend.data || [],
          stats: {
            totalProyectos: proyectos.length,
            enProgreso:     proyectos.filter(p=>p.estado==='en progreso').length,
            enPausa:        proyectos.filter(p=>p.estado==='en pausa').length,
            completados:    proyectos.filter(p=>p.estado==='completado').length,
            cancelados:     proyectos.filter(p=>p.estado==='cancelado').length,
            totalCotizaciones: cotizaciones.length,
            totalCotizado,
            totalReportes: reportes.length,
            ventanasSinReporte: (pend.data||[]).reduce((s,pp)=>s+parseInt(pp.sin_reporte||0),0),
          }
        });
      } catch(err) { console.error('Dashboard error:', err); }
      finally { setLoading(false); }
    })();
  }, []);

  // ── Banner slider — hooks SIEMPRE antes de cualquier return condicional ──
  const BANNER_IMGS = [
    '/banner-principal.jpg',
    '/banner-stats.jpg',
    '/banner-metricas.jpg',
    '/banner-valores.jpg',
  ];
  const [slide, setSlide] = useState(0);
  const [fading, setFading] = useState(false);
  const timerRef = useRef(null);

  const goTo = useCallback((idx) => {
    setFading(true);
    setTimeout(() => {
      setSlide(idx);
      setFading(false);
    }, 400);
  }, []);

  const next = useCallback(() => {
    goTo((slide + 1) % BANNER_IMGS.length);
  }, [slide, goTo, BANNER_IMGS.length]);

  // Auto-avance cada 5 segundos
  useEffect(() => {
    timerRef.current = setInterval(next, 5000);
    return () => clearInterval(timerRef.current);
  }, [next]);

  const manualGo = (idx) => {
    clearInterval(timerRef.current);
    goTo(idx);
    timerRef.current = setInterval(next, 5000);
  };

  if (loading) return <div style={{textAlign:'center',padding:'4rem'}}><div className="spinner" style={{margin:'0 auto'}}/></div>;

  const { stats, proyectos, cotizaciones, stockBajo } = data || {};

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Buenos días' : hour < 18 ? 'Buenas tardes' : 'Buenas noches';

  // Contenido de cada slide: slide 0 = saludo, 1 = visión, 2 = misión, 3 = valores
  const SLIDE_CONTENT = [
    {
      tag: null,
      title: `${greeting}, ${user?.nombre?.split(' ')[0] || 'usuario'}`,
      text: 'Precisión en cada corte, eficiencia en cada proyecto.',
    },
    {
      tag: 'Nuestra Visión',
      title: 'Líderes en automatización de aluminio',
      text: 'Ser la empresa de referencia en soluciones de corte y carpintería de aluminio, innovando con tecnología para construir el futuro.',
    },
    {
      tag: 'Nuestra Misión',
      title: 'Calidad y precisión en cada obra',
      text: 'Ofrecer a nuestros clientes sistemas de gestión y corte de aluminio con los más altos estándares de calidad, exactitud y servicio.',
    },
    {
      tag: 'Nuestros Valores',
      title: 'Lo que nos define',
      text: 'Excelencia · Compromiso · Innovación · Confianza · Trabajo en equipo',
    },
  ];

  return (
<div>
      {/* Banner slider — ocupa todo el ancho */}
      <div className="dashboard-banner" style={{
        position: 'relative',
        overflow: 'hidden',
        marginBottom: '1.75rem',
        marginLeft: '-2.5rem',
        marginRight: '-2.5rem',
        marginTop: '-5rem',
        height: 360,
        boxShadow: '0 4px 20px rgba(13,71,161,.18)',
      }}>
        {/* Imagen activa con fade */}
        <img
          key={slide}
          src={BANNER_IMGS[slide]}
          alt=""
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            objectFit: 'cover', objectPosition: 'center center',
            transition: 'opacity .4s ease',
            opacity: fading ? 0 : 1,
          }}
        />
        {/* Overlay gris oscuro */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(100deg, rgba(15,20,28,.85) 0%, rgba(30,42,58,.72) 55%, rgba(15,20,28,.60) 100%)',
        }}/>

        {/* Flecha izquierda */}
        <button
          onClick={() => manualGo((slide - 1 + BANNER_IMGS.length) % BANNER_IMGS.length)}
          style={{
            position:'absolute', left:16, top:'50%', transform:'translateY(-50%)',
            zIndex:2, width:38, height:38, borderRadius:'50%',
            background:'rgba(255,255,255,.15)', border:'1px solid rgba(255,255,255,.25)',
            color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:18, transition:'background .15s',
          }}
          onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,.28)'}
          onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,.15)'}
        >‹</button>

        {/* Flecha derecha */}
        <button
          onClick={() => manualGo((slide + 1) % BANNER_IMGS.length)}
          style={{
            position:'absolute', right:16, top:'50%', transform:'translateY(-50%)',
            zIndex:2, width:38, height:38, borderRadius:'50%',
            background:'rgba(255,255,255,.15)', border:'1px solid rgba(255,255,255,.25)',
            color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:18, transition:'background .15s',
          }}
          onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,.28)'}
          onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,.15)'}
        >›</button>

        {/* Puntos indicadores */}
        <div style={{
          position:'absolute', bottom:16, left:'50%', transform:'translateX(-50%)',
          zIndex:2, display:'flex', gap:8,
        }}>
          {BANNER_IMGS.map((_, i) => (
            <button
              key={i}
              onClick={() => manualGo(i)}
              style={{
                width: i === slide ? 24 : 8,
                height: 8, borderRadius: 99,
                background: i === slide ? '#fff' : 'rgba(255,255,255,.4)',
                border: 'none', cursor: 'pointer',
                transition: 'all .3s ease', padding: 0,
              }}
            />
          ))}
        </div>

        {/* Texto centrado */}
        <div style={{
          position:'absolute', inset:0, zIndex:1,
          display:'flex', flexDirection:'column',
          alignItems:'center', justifyContent:'center',
          textAlign:'center', padding:'2rem 3rem',
          transition: 'opacity .4s ease',
          opacity: fading ? 0 : 1,
        }}>
          {SLIDE_CONTENT[slide]?.tag && (
            <div style={{
              display:'inline-block', marginBottom:12,
              background:'rgba(255,255,255,.15)',
              border:'1px solid rgba(255,255,255,.30)',
              borderRadius:4, padding:'3px 14px',
              fontSize:'.72rem', fontWeight:700,
              letterSpacing:'.12em', textTransform:'uppercase', color:'rgba(255,255,255,.9)',
            }}>
              {SLIDE_CONTENT[slide].tag}
            </div>
          )}
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(1.6rem,3.5vw,2.4rem)',
            fontWeight: 900, color: '#fff',
            lineHeight: 1.15, marginBottom: 12,
            letterSpacing: '-.02em',
            textShadow: '0 2px 12px rgba(0,0,0,.4)',
          }}>
            {SLIDE_CONTENT[slide]?.title}
          </h1>
          <p style={{
            color: 'rgba(255,255,255,.82)',
            fontSize: '1rem', fontWeight: 500,
            maxWidth: 560, lineHeight: 1.6,
            textShadow: '0 1px 6px rgba(0,0,0,.3)',
          }}>
            {SLIDE_CONTENT[slide]?.text}
          </p>
        </div>
      </div>



      {/* Stats — Estado general */}
      <div style={{
        background:'var(--surface)',
        border:'1px solid var(--border)',
        borderRadius:16,
        marginBottom:'1.75rem',
        boxShadow:'var(--shadow)',
        overflow:'hidden',
      }}>
        {/* Cabecera */}
        <div style={{
          padding:'.75rem 1.5rem',
          borderBottom:'1px solid var(--border)',
          background:'var(--surface-2)',
          display:'flex', alignItems:'center', gap:8,
        }}>
          <BarChart2 size={14} color='var(--primary)'/>
          <span style={{fontSize:'.68rem',fontWeight:800,letterSpacing:'.1em',textTransform:'uppercase',color:'var(--text-muted)'}}>
            Estado General
          </span>
        </div>
        {/* Fila de stats separados por líneas */}
        <div style={{
          display:'flex',
          flexWrap:'wrap',
          padding:'.25rem 0',
        }}>
          {[
            {label:'En Progreso',  value:stats?.enProgreso,        icon:Clock,       to:'/proyectos'},
            {label:'En Pausa',     value:stats?.enPausa,           icon:PauseCircle, to:'/proyectos'},
            {label:'Completados',  value:stats?.completados,       icon:CheckCircle, to:'/proyectos'},
            {label:'Cancelados',   value:stats?.cancelados,        icon:XCircle,     to:'/proyectos'},
            {label:'Cotizaciones', value:stats?.totalCotizaciones, icon:FileText,    to:'/cotizaciones'},
            {label:'Reportes',     value:stats?.totalReportes,     icon:FileSearch,  to:'/reportes'},
            ...(isAdmin?[{label:'Materiales', value:data?.materiales?.length, icon:Package, to:'/materiales'}]:[]),
          ].map(({label,value,icon:Icon,to}, idx, arr) => (
            <div
              key={label}
              onClick={()=>navigate(to)}
              style={{
                flex:'1 1 120px',
                display:'flex', flexDirection:'column', alignItems:'center',
                justifyContent:'center', gap:6,
                padding:'1.25rem .75rem',
                cursor:'pointer',
                borderRight: 'none',
                transition:'background .15s',
                position:'relative',
              }}
              onMouseEnter={e=>e.currentTarget.style.background='var(--bg)'}
              onMouseLeave={e=>e.currentTarget.style.background='transparent'}
            >
              <Icon size={20} color='var(--primary)'/>
              <div style={{
                fontSize:'.65rem', fontWeight:700,
                textTransform:'uppercase', letterSpacing:'.08em',
                color:'var(--primary)', textAlign:'center', lineHeight:1.2,
              }}>
                {label}
              </div>
              <div style={{
                fontSize:'2.1rem', fontWeight:900,
                color:'var(--text-primary)', lineHeight:1,
                fontFamily:'var(--font-display)',
              }}>
                {value ?? 0}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Métricas de producción real — solo proyectos completados */}
      {metricas && (parseInt(metricas.total_completados)||0) > 0 && (
        <div style={{position:'relative',borderRadius:14,padding:'1.25rem 1.75rem',marginBottom:'1.75rem',overflow:'hidden'}}>
          {/* BANNER MÉTRICAS — reemplazar: frontend/public/banner-metricas.jpg */}
          <img src="/banner-metricas.jpg" alt="" style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover',filter:'grayscale(80%) brightness(.25)',zIndex:0}}/>
          <div style={{position:'absolute',inset:0,background:'linear-gradient(135deg,rgba(26,29,33,.92),rgba(46,52,60,.88))',zIndex:0}}/>
          <div style={{position:'relative',zIndex:1}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:'1rem'}}>
            <BarChart2 size={18} style={{color:'#fff'}}/>
            <span style={{fontWeight:800,color:'#fff',fontSize:'.9rem',textTransform:'uppercase',letterSpacing:'.05em'}}>
              Producción real — proyectos completados
            </span>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:'1rem'}}>
            {[
              {label:'Proyectos terminados', value: metricas.total_completados, color:'#fff'},
              {label:'Ventanas producidas',  value: metricas.ventanas_producidas||0, color:'#fff'},
              {label:'Duración promedio',    value: metricas.duracion_promedio_dias ? `${metricas.duracion_promedio_dias} días` : '—', color:'#fff'},
              {label:'Total cotizado',       value: fmt(stats?.totalCotizado), color:'#fff'},
            ].map(({label,value,color})=>(
              <div key={label} style={{background:'rgba(255,255,255,.06)',borderRadius:10,padding:'12px 14px'}}>
                <div style={{fontSize:'.7rem',color:'rgba(255,255,255,.4)',textTransform:'uppercase',letterSpacing:'.06em',fontWeight:700,marginBottom:4}}>{label}</div>
                <div style={{fontSize:'1.5rem',fontWeight:900,color}}>{value}</div>
              </div>
            ))}
          </div>
          </div>
        </div>
      )}

      {/* Total cotizado banner — cuando no hay completados todavía */}
      {(stats?.totalCotizado||0) > 0 && !(parseInt(metricas?.total_completados)||0) && (
        <div style={{position:'relative',borderRadius:14,padding:'1.25rem 1.75rem',marginBottom:'1.75rem',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12,overflow:'hidden'}}>
          <img src="/banner-metricas.jpg" alt="" style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover',filter:'grayscale(80%) brightness(.25)',zIndex:0}}/>
          <div style={{position:'absolute',inset:0,background:'linear-gradient(135deg,rgba(26,29,33,.92),rgba(46,52,60,.88))',zIndex:0}}/>
          <div style={{position:'relative',zIndex:1,display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12,width:'100%'}}>
          <div style={{display:'flex',alignItems:'center',gap:14}}>
            <div style={{width:46,height:46,borderRadius:12,background:'rgba(194,98,45,.25)',display:'flex',alignItems:'center',justifyContent:'center'}}>
              <TrendingUp size={22} style={{color:'#fff'}}/>
            </div>
            <div>
              <div style={{fontSize:'.72rem',color:'rgba(255,255,255,.45)',fontWeight:700,textTransform:'uppercase',letterSpacing:'.08em'}}>Total Cotizado (acumulado)</div>
              <div style={{fontSize:'1.75rem',fontWeight:900,color:'#fff',lineHeight:1.1}}>{fmt(stats?.totalCotizado)}</div>
            </div>
          </div>
          <button className="btn btn-outline btn-sm" style={{color:'rgba(255,255,255,.7)',borderColor:'rgba(255,255,255,.15)'}} onClick={()=>navigate('/cotizaciones')}>
            Ver cotizaciones <ArrowRight size={13}/>
          </button>
          </div>
        </div>
      )}

      {/* Proyectos activos vs pausados */}
      {(stats?.enPausa||0) > 0 && (
        <div style={{background:'#fffbeb',border:'1.5px solid #fcd34d',borderRadius:12,padding:'10px 16px',marginBottom:'1.25rem',display:'flex',alignItems:'center',gap:10,fontSize:'.875rem',color:'#92400e',fontWeight:600}}>
          <PauseCircle size={16}/>
          Tienes {stats.enPausa} proyecto{stats.enPausa>1?'s':''} en pausa — las cotizaciones y ventanas están bloqueadas.
          <button className="btn btn-outline btn-sm" style={{marginLeft:'auto',color:'#92400e',borderColor:'#fbbf24'}} onClick={()=>navigate('/proyectos')}>
            Ver proyectos
          </button>
        </div>
      )}

      <RecientesSection
        title="Proyectos Recientes"
        icon={FolderOpen}
        items={proyectos?.slice(0,6) || []}
        empty="Sin proyectos aún"
        verTodosLabel="Ver todos"
        onVerTodos={() => navigate('/proyectos')}
        renderItem={p => (
          <div key={p.id_proyecto}
            style={{display:'flex',alignItems:'center',gap:12,padding:'9px 12px',borderRadius:9,cursor:'pointer',border:'1px solid var(--border)',transition:'background .12s',marginBottom:6}}
            onClick={()=>navigate(`/proyectos/${p.id_proyecto}`)}
            onMouseEnter={e=>e.currentTarget.style.background='var(--bg)'}
            onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
            <div style={{width:34,height:34,borderRadius:8,background:'var(--primary-light)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <FolderOpen size={15} style={{color:'var(--primary)'}}/>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:700,fontSize:'.85rem',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{p.nombre_proyecto}</div>
              <div style={{fontSize:'.73rem',color:'var(--text-muted)'}}>{p.nombre_cliente||'Sin cliente'} · {p.total_ventanas} ventana{p.total_ventanas!==1?'s':''}</div>
            </div>
            <span className={`badge badge-${BADGE[p.estado]||'blue'}`} style={{fontSize:'.65rem',whiteSpace:'nowrap'}}>{p.estado}</span>
            <ArrowRight size={13} style={{color:'var(--text-muted)',flexShrink:0}}/>
          </div>
        )}
      />

      <RecientesSection
        title="Cotizaciones Recientes"
        icon={FileText}
        items={cotizaciones?.slice(0,6) || []}
        empty="Sin cotizaciones aún"
        verTodosLabel="Ver todas"
        onVerTodos={() => navigate('/cotizaciones')}
        renderItem={cot => (
          <div key={cot.id_cotizacion}
            style={{display:'flex',alignItems:'center',gap:12,padding:'9px 12px',borderRadius:9,cursor:'pointer',border:'1px solid var(--border)',transition:'background .12s',marginBottom:6}}
            onClick={()=>navigate('/cotizaciones')}
            onMouseEnter={e=>e.currentTarget.style.background='var(--bg)'}
            onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
            <div style={{width:34,height:34,borderRadius:8,background:'var(--primary-light)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <FileText size={15} style={{color:'var(--primary)'}}/>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:700,fontSize:'.85rem',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{cot.nombre_proyecto||'—'}</div>
              <div style={{fontSize:'.73rem',color:'var(--text-muted)'}}>{cot.nombre_cliente||'Sin cliente'}</div>
            </div>
            <div style={{fontWeight:800,fontSize:'.82rem',color:'var(--success)',whiteSpace:'nowrap'}}>{fmt(cot.total_final)}</div>
            <ArrowRight size={13} style={{color:'var(--text-muted)',flexShrink:0}}/>
          </div>
        )}
      />
    </div>
  );
}
