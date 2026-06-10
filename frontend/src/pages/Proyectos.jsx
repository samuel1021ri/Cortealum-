import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Search, FolderOpen, Trash2, Copy,
  Share2, MoreVertical, X, User, Hash,
  Calendar, ChevronDown
} from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import DuplicarModal from '../components/common/DuplicarModal';
import CompartirModal from '../components/common/CompartirModal';
import { useConfirmDelete } from '../hooks/useConfirmDelete';

const ESTADOS = ['todos','en progreso','completado','cancelado','en pausa'];

const BADGE_STYLES = {
  'en progreso': { bg:'#EFF4FF', color:'#3B5BDB', dot:'#3B5BDB' },
  'completado':  { bg:'#F0F4F0', color:'#2D6A4F', dot:'#2D6A4F' },
  'cancelado':   { bg:'#F5F0F0', color:'#7D3030', dot:'#7D3030' },
  'en pausa':    { bg:'#F5F3EE', color:'#6B5B3E', dot:'#6B5B3E' },
};

function StatusBadge({ estado }) {
  const s = BADGE_STYLES[estado] || { bg:'#EFF4FF', color:'#3B5BDB', dot:'#3B5BDB' };
  return (
    <span style={{
      display:'inline-flex', alignItems:'center',
      background: s.bg, color: s.color,
      padding:'3px 10px', borderRadius:4,
      fontSize:'.65rem', fontWeight:700,
      textTransform:'uppercase', letterSpacing:'.06em',
      border:`1px solid ${s.dot}30`,
    }}>
      {estado}
    </span>
  );
}

// Menú 3 puntos por tarjeta
function CardMenu({ proyecto, onDuplicar, onCompartir, onEliminar, puedeEliminar }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const items = [
    { label:'Duplicar',  icon:Copy,   fn: onDuplicar, color:'var(--t2)' },
    ...(proyecto.mi_rol === 'dueno'
      ? [{ label:'Compartir', icon:Share2, fn: onCompartir, color:'var(--blue)' }]
      : []),
    ...(puedeEliminar
      ? [{ label:'Eliminar',  icon:Trash2, fn: onEliminar,  color:'var(--red)', sep:true }]
      : []),
  ];

  return (
    <div ref={ref} style={{position:'relative'}} onClick={e=>e.stopPropagation()}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width:30, height:30, borderRadius:8,
          background: open ? 'var(--bg-2)' : 'transparent',
          border:'1px solid ' + (open ? 'var(--border-2)' : 'transparent'),
          display:'flex', alignItems:'center', justifyContent:'center',
          color:'var(--t3)', cursor:'pointer', transition:'all .15s',
        }}
        onMouseEnter={e=>{e.currentTarget.style.background='var(--bg-2)';e.currentTarget.style.borderColor='var(--border)';}}
        onMouseLeave={e=>{if(!open){e.currentTarget.style.background='transparent';e.currentTarget.style.borderColor='transparent';}}}
      >
        <MoreVertical size={15}/>
      </button>

      {open && (
        <div style={{
          position:'absolute', top:'calc(100% + 6px)', right:0,
          background:'var(--surface)', border:'1px solid var(--border)',
          borderRadius:10, minWidth:155,
          boxShadow:'0 8px 28px rgba(13,17,23,.14), 0 2px 6px rgba(13,17,23,.06)',
          zIndex:100, overflow:'hidden', animation:'fadeIn .12s ease',
        }}>
          {items.map((item, i) => (
            <div key={i}>
              {item.sep && <div style={{height:1, background:'var(--border)', margin:'2px 0'}}/>}
              <button
                onClick={() => { setOpen(false); item.fn(); }}
                style={{
                  display:'flex', alignItems:'center', gap:9,
                  width:'100%', padding:'9px 14px',
                  background:'none', border:'none',
                  color:item.color, fontSize:'.83rem', fontWeight:600,
                  cursor:'pointer', textAlign:'left', transition:'background .1s',
                }}
                onMouseEnter={e=>e.currentTarget.style.background='var(--bg)'}
                onMouseLeave={e=>e.currentTarget.style.background='none'}
              >
                <item.icon size={14}/>{item.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Tarjeta individual de proyecto
function ProyectoCard({ p, onDuplicar, onCompartir, onEliminar, puedeEliminar, onClick }) {
  const [hov, setHov] = useState(false);

  const acceso = p.mi_rol === 'dueno' ? 'Dueño'
    : p.mi_permiso === 'edicion' ? 'Edición' : 'Lectura';

  const accesoColor = p.mi_rol === 'dueno' ? '#92702A'
    : p.mi_permiso === 'edicion' ? '#1A56DB' : '#6B7280';

  const accesoTag = p.mi_rol === 'dueno'
    ? { bg:'#F0EDE6', border:'#D5CFC5', color:'#5C4E35' }
    : p.mi_permiso === 'edicion'
    ? { bg:'#EDF1F8', border:'#C5D0E6', color:'#2C3E6B' }
    : { bg:'#EEECE8', border:'#D5CFC5', color:'#4B5563' };

  const BADGE = BADGE_STYLES[p.estado] || BADGE_STYLES['en progreso'];

  return (
    <div
      onClick={onClick}
      onMouseEnter={()=>setHov(true)}
      onMouseLeave={()=>setHov(false)}
      style={{
        background: hov ? '#F0EEE9' : '#EDEAE4',
        border:'1px solid ' + (hov ? '#B0A89E' : '#D5CFC5'),
        borderRadius:16,
        cursor:'pointer',
        transition:'all .2s ease',
        boxShadow: hov
          ? '0 12px 36px rgba(13,17,23,.14), 0 3px 8px rgba(13,17,23,.07)'
          : '0 2px 6px rgba(13,17,23,.07)',
        transform: hov ? 'translateY(-3px)' : 'none',
        position:'relative',
        display:'flex', flexDirection:'column',
        overflow:'hidden',
      }}
    >
      {/* Barra superior gris oscuro */}
      <div style={{height:4, background:'linear-gradient(90deg, #4B5563, #9CA3AF)'}}/>

      {/* Cuerpo */}
      <div style={{padding:'1.1rem 1.1rem .9rem', display:'flex', flexDirection:'column', gap:0, flex:1}}>

        {/* Header: nombre + 3 puntos */}
        <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8, marginBottom:'1rem'}}>
          <div style={{flex:1, minWidth:0}}>
            {/* Número de ventanas flotante sobre el nombre */}
            <div style={{
              display:'flex', alignItems:'center', gap:6, marginBottom:6,
            }}>
              <span style={{
                background:'rgba(75,85,99,.10)', color:'#374151',
                fontSize:'.65rem', fontWeight:700, padding:'2px 8px',
                borderRadius:4, letterSpacing:'.05em', textTransform:'uppercase',
                border:'1px solid rgba(75,85,99,.15)',
              }}>
                {p.total_ventanas} ventana{p.total_ventanas!==1?'s':''}
              </span>
              <StatusBadge estado={p.estado}/>
            </div>
            <div style={{
              fontWeight:900, fontSize:'1.05rem', color:'#0D1117',
              lineHeight:1.25,
              overflow:'hidden', textOverflow:'ellipsis',
              display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical',
              letterSpacing:'-.01em',
            }}>
              {p.nombre_proyecto}
            </div>
          </div>
          <CardMenu
            proyecto={p}
            onDuplicar={onDuplicar}
            onCompartir={onCompartir}
            onEliminar={onEliminar}
            puedeEliminar={puedeEliminar}
          />
        </div>

        {/* Separador decorativo con puntos */}
        <div style={{
          display:'flex', alignItems:'center', gap:6, marginBottom:'1rem',
        }}>
          <div style={{flex:1, height:1, background:'linear-gradient(90deg, #C8C2B8, transparent)'}}/>
          <div style={{width:3, height:3, borderRadius:'50%', background:'#B0A89E'}}/>
          <div style={{width:3, height:3, borderRadius:'50%', background:'#B0A89E'}}/>
          <div style={{width:3, height:3, borderRadius:'50%', background:'#B0A89E'}}/>
        </div>

        {/* Datos: cliente y creador */}
        <div style={{display:'flex', flexDirection:'column', gap:9, flex:1}}>
          <DataRow label="Cliente"  value={p.nombre_cliente || '—'} bold />
          <DataRow label="Creador"  value={p.creador} />
          <DataRow label="Fecha"    value={new Date(p.fecha_creacion).toLocaleDateString('es-CO')} />
        </div>
      </div>

      {/* Footer oscuro con acceso */}
      <div style={{
        background:'rgba(13,17,23,.055)',
        borderTop:'1px solid rgba(13,17,23,.09)',
        padding:'.65rem 1.1rem',
        display:'flex', alignItems:'center', justifyContent:'space-between',
      }}>
        <span style={{fontSize:'.7rem', color:'#6B7280', fontWeight:600, letterSpacing:'.05em', textTransform:'uppercase'}}>
          Acceso
        </span>
        <span style={{
          background: accesoTag.bg,
          border:`1px solid ${accesoTag.border}`,
          color: accesoTag.color,
          fontSize:'.7rem', fontWeight:800,
          padding:'2px 10px', borderRadius:5,
          letterSpacing:'.04em',
        }}>
          {acceso}
        </span>
      </div>
    </div>
  );
}

function DataRow({ label, value, bold }) {
  return (
    <div style={{display:'flex', alignItems:'baseline', gap:6}}>
      <span style={{
        fontSize:'.68rem', color:'#6B7280', fontWeight:700,
        textTransform:'uppercase', letterSpacing:'.06em',
        minWidth:52, flexShrink:0,
      }}>
        {label}
      </span>
      <div style={{flex:1, height:1, borderBottom:'1px dashed #C8C2B8', margin:'0 4px', marginBottom:2}}/>
      <span style={{
        fontSize:'.83rem', color: bold ? '#0D1117' : '#374151',
        fontWeight: bold ? 700 : 600,
        maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
        textAlign:'right',
      }}>
        {value}
      </span>
    </div>
  );
}

export default function Proyectos() {
  const { isAdmin, user } = useAuth();
  const navigate = useNavigate();
  const [proyectos, setProyectos] = useState([]);
  const [search, setSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [loading, setLoading] = useState(true);
  const [modalDuplicar, setModalDuplicar] = useState(null);
  const [modalCompartir, setModalCompartir] = useState(null);
  const [filtroOpen, setFiltroOpen] = useState(false);
  const filtroRef = useRef();

  useEffect(() => {
    const h = e => { if (filtroRef.current && !filtroRef.current.contains(e.target)) setFiltroOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const load = async () => {
    try {
      const { data } = await api.get('/proyectos');
      setProyectos(data);
    } catch { toast.error('Error al cargar proyectos'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = proyectos.filter(p => {
    const q = search.toLowerCase();
    const matchSearch =
      p.nombre_proyecto.toLowerCase().includes(q) ||
      (p.nombre_cliente||'').toLowerCase().includes(q);
    const matchEstado = filtroEstado === 'todos' || p.estado === filtroEstado;
    return matchSearch && matchEstado;
  });

  const counts = proyectos.reduce((acc, p) => {
    acc[p.estado] = (acc[p.estado]||0) + 1; return acc;
  }, {});

  const { confirm: confirmDelete, modal: deleteModal } = useConfirmDelete();

  const handleDelete = (proyecto) => {
    confirmDelete({
      itemLabel: `el proyecto "${proyecto.nombre_proyecto || ''}"`,
      warningText: 'Se borrarán todas sus ventanas, cotizaciones y datos asociados.',
      onConfirm: async (password) => {
        await api.delete(`/proyectos/${proyecto.id_proyecto}`, { data: { password } });
        toast.success('Proyecto eliminado');
        load();
      },
    });
  };

  const handleDuplicar = async (nombreNuevo) => {
    if (!modalDuplicar) return;
    try {
      const { data } = await api.post(`/proyectos/${modalDuplicar.id_proyecto}/duplicar`, { nombre_nuevo: nombreNuevo });
      toast.success(`Proyecto duplicado con ${data.ventanas_copiadas} ventana(s)`);
      setModalDuplicar(null);
      navigate(`/proyectos/${data.id_proyecto}`);
    } catch (err) { toast.error(err.response?.data?.error || 'Error al duplicar'); }
  };

  const filtroLabel = filtroEstado === 'todos'
    ? 'Todos los estados'
    : filtroEstado.charAt(0).toUpperCase() + filtroEstado.slice(1);

  return (
    <div>
      {/* Header */}
      <div className="page-header" style={{marginBottom:'1.5rem'}}>
        <div>
          <h1 style={{fontSize:'2rem', fontWeight:900, letterSpacing:'-.02em'}}>Proyectos</h1>
          <p style={{color:'var(--t3)', fontSize:'.875rem', marginTop:3}}>
            {proyectos.length} proyecto{proyectos.length!==1?'s':''}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/proyectos/nuevo')}>
          <Plus size={16}/> Nuevo Proyecto
        </button>
      </div>

      {/* Barra de búsqueda + filtro de estado */}
      <div style={{
        display:'flex', gap:10, marginBottom:'1.75rem', alignItems:'stretch', flexWrap:'wrap',
      }}>
        {/* Búsqueda */}
        <div style={{position:'relative', flex:1, minWidth:200}}>
          <Search size={15} style={{
            position:'absolute', left:13, top:'50%', transform:'translateY(-50%)',
            color:'var(--t3)', pointerEvents:'none',
          }}/>
          <input
            placeholder="Buscar proyecto o cliente..."
            value={search}
            onChange={e=>setSearch(e.target.value)}
            style={{
              paddingLeft:40, height:44,
              background:'var(--surface)', border:'1.5px solid var(--border)',
              borderRadius:10, width:'100%', fontSize:'.875rem',
            }}
          />
          {search && (
            <button onClick={()=>setSearch('')} style={{
              position:'absolute', right:10, top:'50%', transform:'translateY(-50%)',
              background:'none', border:'none', cursor:'pointer', color:'var(--t3)',
              display:'flex', alignItems:'center',
            }}>
              <X size={14}/>
            </button>
          )}
        </div>

        {/* Filtro de estado — dropdown */}
        <div ref={filtroRef} style={{position:'relative', flexShrink:0}}>
          <button
            onClick={()=>setFiltroOpen(o=>!o)}
            style={{
              height:44, padding:'0 16px',
              background:'var(--surface)', border:'1.5px solid var(--border)',
              borderRadius:10, display:'flex', alignItems:'center', gap:8,
              fontSize:'.85rem', fontWeight:700,
              cursor:'pointer', transition:'all .15s', whiteSpace:'nowrap',
              borderColor: filtroEstado!=='todos' ? 'var(--blue)' : 'var(--border)',
              color: filtroEstado!=='todos' ? 'var(--blue)' : 'var(--t2)',
            }}
          >

            {filtroLabel}
            <ChevronDown size={14} style={{transform: filtroOpen ? 'rotate(180deg)' : 'none', transition:'transform .2s'}}/>
          </button>

          {filtroOpen && (
            <div style={{
              position:'absolute', top:'calc(100% + 6px)', right:0,
              background:'var(--surface)', border:'1px solid var(--border)',
              borderRadius:10, minWidth:180,
              boxShadow:'0 8px 28px rgba(13,17,23,.14)',
              zIndex:50, overflow:'hidden', animation:'fadeIn .12s ease',
            }}>
              {ESTADOS.map(e => {
                const s = BADGE_STYLES[e];
                const active = filtroEstado === e;
                return (
                  <button
                    key={e}
                    onClick={()=>{ setFiltroEstado(e); setFiltroOpen(false); }}
                    style={{
                      display:'flex', alignItems:'center', gap:9,
                      width:'100%', padding:'9px 14px',
                      background: active ? 'var(--blue-pastel, #EFF6FF)' : 'none',
                      border:'none', cursor:'pointer', textAlign:'left',
                      fontSize:'.83rem', fontWeight: active ? 800 : 600,
                      color: active ? 'var(--blue)' : 'var(--t2)',
                      transition:'background .1s',
                    }}
                    onMouseEnter={ev=>{ if(!active) ev.currentTarget.style.background='var(--bg)'; }}
                    onMouseLeave={ev=>{ if(!active) ev.currentTarget.style.background='none'; }}
                  >

                    <span style={{flex:1}}>
                      {e === 'todos' ? 'Todos' : e.charAt(0).toUpperCase()+e.slice(1)}
                    </span>
                    <span style={{
                      fontSize:'.68rem', fontWeight:800, color:'var(--t4)',
                      background:'var(--bg-2, #E6E2DA)', borderRadius:99,
                      padding:'1px 7px', minWidth:24, textAlign:'center',
                    }}>
                      {e === 'todos' ? proyectos.length : (counts[e]||0)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Grid de tarjetas */}
      {loading ? (
        <div style={{textAlign:'center', padding:'4rem'}}>
          <div className="spinner" style={{margin:'0 auto'}}/>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state" style={{padding:'4rem'}}>
          <FolderOpen size={48}/>
          <p>{search || filtroEstado !== 'todos' ? 'Sin resultados para esta búsqueda' : 'No hay proyectos. ¡Crea el primero!'}</p>
          {(search || filtroEstado !== 'todos') && (
            <button className="btn btn-outline btn-sm" style={{marginTop:'1rem'}}
              onClick={()=>{ setSearch(''); setFiltroEstado('todos'); }}>
              Limpiar filtros
            </button>
          )}
        </div>
      ) : (
        <>
          <div style={{
            display:'grid',
            gridTemplateColumns:'repeat(auto-fill, minmax(290px, 1fr))',
            gap:'1.1rem',
          }}>
            {filtered.map(p => (
              <ProyectoCard
                key={p.id_proyecto}
                p={p}
                onClick={() => navigate(`/proyectos/${p.id_proyecto}`)}
                onDuplicar={() => setModalDuplicar(p)}
                onCompartir={() => setModalCompartir(p)}
                onEliminar={() => handleDelete(p)}
                puedeEliminar={isAdmin || p.id_usuario_creador == user?.id}
              />
            ))}
          </div>
          <div style={{textAlign:'right', marginTop:'.75rem', fontSize:'.78rem', color:'var(--t4)'}}>
            {filtered.length} de {proyectos.length} proyectos
          </div>
        </>
      )}

      {/* Modales */}
      {modalDuplicar && (
        <DuplicarModal
          proyecto={modalDuplicar}
          onClose={() => setModalDuplicar(null)}
          onDuplicar={handleDuplicar}
        />
      )}
      {modalCompartir && (
        <CompartirModal
          proyecto={modalCompartir}
          onClose={() => { setModalCompartir(null); load(); }}
        />
      )}
      {deleteModal}
    </div>
  );
}
