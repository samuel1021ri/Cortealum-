import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, Calculator, DollarSign, Trash2, CheckCircle,
  History, ChevronDown, ChevronUp, Edit, FileDown, Settings, X, Copy, Lock, AlertTriangle, Eye,
  Search, LayoutGrid, Filter, Scissors
} from 'lucide-react';
import api, { descargarReportePdf } from '../api/client';
import LOGO_EMBLEMA from '../assets/logoEmblema';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import VentanaModal from '../components/common/VentanaModal';
import SimulacionModal from '../components/common/SimulacionModal';
import CotizacionModal from '../components/common/CotizacionModal';
import OptimizacionProyectoModal from '../components/optimizacion/OptimizacionProyectoModal';
import DuplicarModal from '../components/common/DuplicarModal';
import ConfirmarEstadoModal from '../components/common/ConfirmarEstadoModal';
import { useConfirmDelete } from '../hooks/useConfirmDelete';
import { fmtMedida, fmtNumMedida } from '../utils/unidades';

const ESTADOS = ['en progreso','completado','cancelado','en pausa'];
const BADGE = { 'en progreso':'blue', completado:'green', cancelado:'red', 'en pausa':'yellow' };
const fmt = (n) => new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(n||0);

// Transiciones válidas — misma lógica que el backend
const TRANSICIONES = {
  'en progreso': ['completado', 'cancelado', 'en pausa'],
  'en pausa':    ['en progreso', 'cancelado'],
  'completado':  [],
  'cancelado':   [],
};


// Banner invitado solo lectura
function BannerSoloLectura({ nombre_creador }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 16px', borderRadius:8,
      background:'#eff6ff', color:'#2563eb', fontWeight:600, fontSize:'.875rem', marginBottom:'1rem',
      border:'1px solid #93c5fd' }}>
      <Eye size={16}/> Solo lectura — este proyecto es de <strong>{nombre_creador}</strong>. Puedes ver pero no modificar.
    </div>
  );
}

// Banner de estado bloqueado
function BannerBloqueo({ estado }) {
  const msgs = {
    completado: { icon: <CheckCircle size={16}/>, color: '#16a34a', bg: '#f0fdf4', text: 'Proyecto completado — puedes generar la cotización final. No se pueden agregar ni editar ventanas.' },
    cancelado:  { icon: <AlertTriangle size={16}/>, color: '#dc2626', bg: '#fef2f2', text: 'Proyecto cancelado — no se pueden realizar cambios ni generar cotizaciones.' },
    'en pausa': { icon: <Lock size={16}/>, color: '#d97706', bg: '#fffbeb', text: 'Proyecto en pausa — las ventanas y cotizaciones están bloqueadas. Reactívalo para continuar.' },
  };
  const m = msgs[estado];
  if (!m) return null;
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 16px', borderRadius:8,
      background: m.bg, color: m.color, fontWeight:600, fontSize:'.875rem', marginBottom:'1rem',
      border:`1px solid ${m.color}40` }}>
      {m.icon} {m.text}
    </div>
  );
}

// Modal para editar datos del proyecto (estado, cliente, etc)
function EditProyectoModal({ proyecto, onClose, onSaved }) {
  const estadosPermitidos = [proyecto.estado, ...(TRANSICIONES[proyecto.estado] || [])];
  const [form, setForm] = useState({
    nombre_proyecto: proyecto.nombre_proyecto,
    nombre_cliente: proyecto.nombre_cliente || '',
    fecha_inicio: proyecto.fecha_inicio?.split('T')[0] || '',
    fecha_fin: proyecto.fecha_fin?.split('T')[0] || '',
    estado: proyecto.estado,
    observaciones: proyecto.observaciones || '',
    unidad_default: proyecto.unidad_default || 'cm',   // ← unidad activa
  });
  const [saving, setSaving] = useState(false);
  const [confirmarEstado, setConfirmarEstado] = useState(null);

  const doSave = async () => {
    setSaving(true);
    try {
      await api.put(`/proyectos/${proyecto.id_proyecto}`, form);
      toast.success('Proyecto actualizado');
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar');
    } finally { setSaving(false); }
  };

  const handleSave = async () => {
    if (form.estado !== proyecto.estado &&
        (form.estado === 'completado' || form.estado === 'cancelado')) {
      setConfirmarEstado(form.estado);
      return;
    }
    doSave();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{maxWidth:500}} onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{fontWeight:700}}>Editar Proyecto</h2>
          <button className="btn btn-outline btn-sm" onClick={onClose}><X size={16}/></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>Nombre del Proyecto *</label>
            <input value={form.nombre_proyecto} onChange={e=>setForm({...form,nombre_proyecto:e.target.value})}/>
          </div>
          <div className="form-group">
            <label>Cliente</label>
            <input value={form.nombre_cliente} onChange={e=>setForm({...form,nombre_cliente:e.target.value})} placeholder="Nombre del cliente..."/>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label>Fecha Inicio *</label>
              <input type="date" value={form.fecha_inicio} onChange={e=>setForm({...form,fecha_inicio:e.target.value})}/>
            </div>
            <div className="form-group">
              <label>Fecha Fin</label>
              <input type="date" value={form.fecha_fin} onChange={e=>setForm({...form,fecha_fin:e.target.value})}/>
            </div>
          </div>
          <div className="form-group">
            <label>Observaciones</label>
            <textarea
              rows={3}
              placeholder="Detalles especiales, condiciones del cliente, notas internas..."
              value={form.observaciones}
              onChange={e=>setForm({...form,observaciones:e.target.value})}
              style={{resize:'vertical'}}
            />
          </div>
          {/* ── TOGGLE UNIDAD DEFAULT del proyecto ─────────────────────── */}
          {/* Cuando el usuario cambia esta unidad, todos los PDF, fórmulas */}
          {/* y cálculos de m² se generan automáticamente en esa unidad.    */}
          <div className="form-group">
            <label>Unidad de medida del proyecto</label>
            <div style={{ display:'flex', gap:8 }}>
              {['cm', 'mm'].map(u => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setForm({ ...form, unidad_default: u })}
                  style={{
                    flex:1, padding:'10px 14px', borderRadius:8,
                    border: `2px solid ${form.unidad_default === u ? '#1A56DB' : '#CBD5E1'}`,
                    background: form.unidad_default === u ? '#EFF6FF' : '#fff',
                    color: form.unidad_default === u ? '#1E40AF' : '#475569',
                    fontWeight: 700,
                    fontSize: '.92rem',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    transition: 'all .12s',
                  }}
                >
                  {u === 'cm' ? 'Centímetros (cm)' : 'Milímetros (mm)'}
                </button>
              ))}
            </div>
            <p style={{ fontSize:'.72rem', color:'var(--gray-400)', marginTop:6, lineHeight:1.45 }}>
              Las fórmulas internas siempre se almacenan en CM. Al cambiar a MM,
              las constantes se convierten automáticamente (×10) en cotizaciones,
              PDF y cálculos de vidrio (m²).
            </p>
          </div>
          <div className="form-group">
            <label>Estado</label>
            {estadosPermitidos.length <= 1 ? (
              <div style={{ padding:'8px 12px', borderRadius:6, background:'var(--gray-100)',
                color:'var(--gray-500)', fontSize:'.875rem', display:'flex', alignItems:'center', gap:6 }}>
                <Lock size={14}/> Estado final — no se puede cambiar
              </div>
            ) : (
              <select value={form.estado} onChange={e=>setForm({...form,estado:e.target.value})}>
                {estadosPermitidos.map(e=><option key={e} value={e}>{e.charAt(0).toUpperCase()+e.slice(1)}</option>)}
              </select>
            )}
            {form.estado !== proyecto.estado && (
              <p style={{ fontSize:'.78rem', color:'var(--gray-400)', marginTop:4 }}>
                ⚠️ Cambio de estado: "{proyecto.estado}" → "{form.estado}"
                {form.estado === 'completado' && ' — se registrará fecha de cierre automáticamente.'}
                {form.estado === 'cancelado' && ' — acción irreversible.'}
              </p>
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>
      {confirmarEstado && (
        <ConfirmarEstadoModal
          proyecto={proyecto}
          estadoNuevo={confirmarEstado}
          onClose={() => setConfirmarEstado(null)}
          onConfirmar={() => { setConfirmarEstado(null); doSave(); }}
        />
      )}
    </div>
  );
}


// ── Tarjeta de ventana ──────────────────────────────────────
function VentanaCard({ v, idx, permisos, proyecto, onSimular, onEditar, onEliminar }) {
  const [hov, setHov] = useState(false);
  const tieneReporte = v.reporte_generado;
  // FIX (clarificación del usuario): cada ventana puede tener SU PROPIA unidad
  // (cm o mm), independiente del default del proyecto. Si V-154 se creó en mm
  // pero el proyecto está por default en cm, la card debe mostrar mm.
  // Prioridad: unidad de la ventana > default del proyecto > 'cm'.
  const unidad = String(v.ancho_unidad || v.alto_unidad || proyecto?.unidad_default || 'cm').toLowerCase() === 'mm' ? 'mm' : 'cm';

  return (
    <div
      onMouseEnter={()=>setHov(true)}
      onMouseLeave={()=>setHov(false)}
      style={{
        background: hov ? '#F0EEE9' : '#EDEAE4',
        border:'1px solid ' + (hov ? '#B0A89E' : '#D5CFC5'),
        borderRadius:14,
        transition:'all .18s ease',
        boxShadow: hov ? '0 8px 24px rgba(13,17,23,.12)' : '0 1px 4px rgba(13,17,23,.06)',
        transform: hov ? 'translateY(-2px)' : 'none',
        overflow:'hidden',
        display:'flex', flexDirection:'column',
      }}
    >
      {/* Barra top: gris si pendiente, azul si tiene reporte */}
      <div style={{
        height:3,
        background: tieneReporte
          ? 'linear-gradient(90deg,#1A56DB,#166534)'
          : 'linear-gradient(90deg,#6B7280,#9CA3AF)',
      }}/>

      <div style={{padding:'1rem 1rem .85rem', flex:1, display:'flex', flexDirection:'column', gap:'.85rem'}}>
        {/* Header */}
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:8}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:5}}>
              <span style={{
                background:'rgba(26,86,219,.09)', color:'#1A56DB',
                fontSize:'.62rem', fontWeight:800, padding:'2px 8px',
                borderRadius:4, letterSpacing:'.05em', textTransform:'uppercase',
                border:'1px solid rgba(26,86,219,.15)',
              }}>
                V-{v.id_ventana}
              </span>
              <span style={{
                background: tieneReporte ? '#F0F9F4' : '#F5F3EE',
                color: tieneReporte ? '#166534' : '#6B5B3E',
                border: `1px solid ${tieneReporte ? '#A7D7B8' : '#D5CFC5'}`,
                fontSize:'.62rem', fontWeight:700, padding:'2px 8px',
                borderRadius:4, letterSpacing:'.04em', textTransform:'uppercase',
              }}>
                {tieneReporte ? 'Reporte ✓' : 'Pendiente'}
              </span>
            </div>
            <div style={{
              fontWeight:900, fontSize:'1rem', color:'#0D1117',
              lineHeight:1.2, letterSpacing:'-.01em',
            }}>
              {v.sistema}
            </div>
          </div>
          {/* Botón calculadora */}
          <button
            onClick={onSimular}
            title="Ver cálculo y generar reporte"
            style={{
              width:34, height:34, borderRadius:9, flexShrink:0,
              background:'#1A56DB', border:'none',
              display:'flex', alignItems:'center', justifyContent:'center',
              color:'#fff', cursor:'pointer',
              boxShadow:'0 2px 8px rgba(26,86,219,.35)',
              transition:'all .15s',
            }}
            onMouseEnter={e=>e.currentTarget.style.background='#1239A6'}
            onMouseLeave={e=>e.currentTarget.style.background='#1A56DB'}
          >
            <Calculator size={15}/>
          </button>
        </div>

        {/* Separador */}
        <div style={{display:'flex',alignItems:'center',gap:5}}>
          <div style={{flex:1,height:1,background:'linear-gradient(90deg,#C8C2B8,transparent)'}}/>
          <div style={{width:3,height:3,borderRadius:'50%',background:'#B0A89E'}}/>
          <div style={{width:3,height:3,borderRadius:'50%',background:'#B0A89E'}}/>
          <div style={{width:3,height:3,borderRadius:'50%',background:'#B0A89E'}}/>
        </div>

        {/* Datos */}
        <div style={{display:'flex',flexDirection:'column',gap:7}}>
          <VDataRow label="Perfil"  value={v.perfil}/>
          <VDataRow label="Diseño"  value={v.diseno} bold/>
          <VDataRow label="Ancho"   value={fmtMedida(v.ancho_vano, unidad)}/>
          <VDataRow label="Alto"    value={fmtMedida(v.alto_vano,  unidad)}/>
        </div>
      </div>

      {/* Footer con acciones */}
      <div style={{
        borderTop:'1px solid rgba(13,17,23,.09)',
        background:'rgba(13,17,23,.04)',
        padding:'.55rem 1rem',
        display:'flex', alignItems:'center', justifyContent:'flex-end', gap:6,
      }}>
        {permisos.editarVentanas ? (
          <>
            <button
              onClick={onEditar}
              style={{
                height:30, padding:'0 10px', borderRadius:7,
                background:'transparent', border:'1px solid #C8C2B8',
                display:'flex', alignItems:'center', gap:5,
                color:'#374151', fontSize:'.74rem', fontWeight:700,
                cursor:'pointer', transition:'all .15s',
              }}
              onMouseEnter={e=>{e.currentTarget.style.background='#E5E7EB';}}
              onMouseLeave={e=>{e.currentTarget.style.background='transparent';}}
            >
              <Edit size={12}/> Editar
            </button>
            <button
              onClick={onEliminar}
              style={{
                height:30, padding:'0 10px', borderRadius:7,
                background:'transparent', border:'1px solid #FECACA',
                display:'flex', alignItems:'center', gap:5,
                color:'#B91C1C', fontSize:'.74rem', fontWeight:700,
                cursor:'pointer', transition:'all .15s',
              }}
              onMouseEnter={e=>{e.currentTarget.style.background='#FEE2E2';}}
              onMouseLeave={e=>{e.currentTarget.style.background='transparent';}}
            >
              <Trash2 size={12}/> Eliminar
            </button>
          </>
        ) : (
          <span style={{color:'#9CA3AF',fontSize:'.72rem',display:'flex',alignItems:'center',gap:4}}>
            <Lock size={12}/> {proyecto.estado}
          </span>
        )}
      </div>
    </div>
  );
}

function VDataRow({ label, value, bold }) {
  return (
    <div style={{display:'flex',alignItems:'baseline',gap:6}}>
      <span style={{fontSize:'.67rem',color:'#6B7280',fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',minWidth:48,flexShrink:0}}>
        {label}
      </span>
      <div style={{flex:1,height:1,borderBottom:'1px dashed #C8C2B8',margin:'0 4px',marginBottom:2}}/>
      <span style={{fontSize:'.83rem',color:bold?'#0D1117':'#374151',fontWeight:bold?800:600,maxWidth:130,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',textAlign:'right'}}>
        {value}
      </span>
    </div>
  );
}

export default function ProyectoDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [proyecto, setProyecto] = useState(null);
  const [ventanas, setVentanas] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showVentanaModal, setShowVentanaModal] = useState(false);
  const [editVentana, setEditVentana] = useState(null);    // ventana to edit
  const [showSimulacion, setShowSimulacion] = useState(null);
  const [showCotizacion, setShowCotizacion] = useState(false);
  const [showOptimizacion, setShowOptimizacion] = useState(false);
  const [showEditProyecto, setShowEditProyecto] = useState(false);
  const [showHistorial, setShowHistorial] = useState(false);
  const [searchHistorial, setSearchHistorial] = useState('');
  const [catData, setCatData] = useState({ sistemas:[], perfiles:[], disenos:[] });
  const [showDuplicarModal, setShowDuplicarModal] = useState(false);
  const [searchVentana, setSearchVentana] = useState('');
  const [filtroDiseno,  setFiltroDiseno]  = useState('todos');
  const [filtroSistema, setFiltroSistema] = useState('todos');
  const [filtroPerfil,  setFiltroPerfil]  = useState('todos');

  const load = useCallback(async () => {
    try {
      // Cargar proyecto primero para detectar 404/403 antes de las demás peticiones
      const p = await api.get(`/proyectos/${id}`);
      setProyecto(p.data);

      // El resto en paralelo; historial no es crítico y no debe bloquear la vista
      const [v, sis, perf, dis, hist] = await Promise.all([
        api.get(`/ventanas/proyecto/${id}`),
        api.get('/sistemas'),
        api.get('/perfiles'),
        api.get('/disenos'),
        api.get(`/proyectos/${id}/historial`).catch(() => ({ data: [] })),
      ]);
      setVentanas(v.data);
      setCatData({ sistemas:sis.data, perfiles:perf.data, disenos:dis.data });
      setHistorial(hist.data);
    } catch (err) {
      const status = err.response?.status;
      const msg    = err.response?.data?.error;
      if (status === 404) {
        toast.error(msg || 'Proyecto no encontrado');
        navigate('/proyectos');
      } else if (status === 403) {
        toast.error(msg || 'No tienes acceso a este proyecto');
        navigate('/proyectos');
      } else {
        toast.error(msg || 'Error al cargar proyecto');
      }
    }
    finally { setLoading(false); }
  }, [id, navigate]);

  // Hook de confirmación con contraseña — patrón consistente con Cotizaciones/Materiales.
  const { confirm: confirmDelete, modal: deleteModal } = useConfirmDelete();

  useEffect(() => { load(); }, [load]);

  const handleDeleteVentana = (vid) => {
    confirmDelete({
      itemLabel: `la ventana #${vid}`,
      warningText: 'Esto eliminará la ventana y todos sus materiales calculados. No afecta los residuos ya guardados en el banco.',
      onConfirm: async (password) => {
        await api.delete(`/ventanas/${vid}`, { data: { password } });
        toast.success('Ventana eliminada');
        load();
      },
    });
  };

  const handleDuplicar = () => setShowDuplicarModal(true);

  const handleDuplicarConfirmar = async (nombreNuevo) => {
    try {
      const { data } = await api.post(`/proyectos/${id}/duplicar`, { nombre_nuevo: nombreNuevo });
      toast.success(`✅ Proyecto duplicado con ${data.ventanas_copiadas} ventana(s)`);
      setShowDuplicarModal(false);
      navigate(`/proyectos/${data.id_proyecto}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al duplicar');
    }
  };

  // Generate consolidated PDF report for all windows
  const handleReporteConsolidado = async () => {
    if (ventanas.length === 0) return toast.error('No hay ventanas en este proyecto');
    toast('Calculando todas las ventanas...', { icon: '⚙️' });
    // FIX v32: respetar la unidad ORIGINAL de cada ventana (no usar una sola
    // unidad global). Antes era `const unidad = proyecto?.unidad_default || 'cm'`
    // y se pasaba a TODAS las ventanas. Resultado: si V140 fue creada en mm
    // pero la unidad del proyecto era cm, V140 salía en cm. Ahora cada ventana
    // se renderiza en SU unidad (ventana.ancho_unidad / alto_unidad), mismo
    // criterio que la cotización y la simulación individual (v31).
    // `unidadProyecto` se mantiene SOLO como fallback si una ventana legacy
    // no tiene unidad guardada.
    const unidadProyecto = proyecto?.unidad_default || 'cm';
    try {
      const calculos = await Promise.all(
        ventanas.map(v => api.post('/ventanas/simular', {
          id_sistema: v.id_sistema, id_perfil: v.id_perfil,
          id_diseno: (v.id_diseno||v.id_diseño), ancho_vano: v.ancho_vano, alto_vano: v.alto_vano
        }).then(r => ({ ventana: v, calculo: r.data })).catch(() => null))
      );
      const validos = calculos.filter(Boolean);
      const fecha = new Date().toLocaleDateString('es-CO', { year:'numeric', month:'long', day:'numeric' });

      // ── SVG builder ──
      // FIX v71: los paneles se derivan SIEMPRE del NOMBRE del diseño (v.diseno),
      // nunca del id_diseno numérico de la BD. El id de BD no tiene relación con
      // el patrón de paneles → antes OXXO dibujaba la ventana de otro diseño.
      // Misma tabla y lógica (match exacto → prefijo más largo) que el backend
      // (buildVentanaSVG en pdfTemplate.js). Normaliza 0→O por si llega "0XX0".
      const PANEL_MAP = {
        'XX':[{m:true},{m:true}],
        'OX':[{m:false},{m:true}],
        'XO':[{m:true},{m:false}],
        'XOX':[{m:true},{m:false},{m:true}],
        'OXXO':[{m:false},{m:true},{m:true},{m:false}],
        'OXX':[{m:false},{m:true},{m:true}],
        'XXO':[{m:true},{m:true},{m:false}],
        'XXX':[{m:true},{m:true},{m:true}],
        'OXO':[{m:false},{m:true},{m:false}],
        'OXXXO':[{m:false},{m:true},{m:true},{m:true},{m:false}],
        'XOXO':[{m:true},{m:false},{m:true},{m:false}],
        'OXOX':[{m:false},{m:true},{m:false},{m:true}],
      };
      function getPanels(disenoNombre){
        const upper=String(disenoNombre||'').toUpperCase().replace(/0/g,'O').replace(/\s+/g,'');
        let panels=PANEL_MAP[upper];
        if(!panels){
          const keys=Object.keys(PANEL_MAP).sort((a,b)=>b.length-a.length);
          const k=keys.find(key=>upper.startsWith(key));
          panels=PANEL_MAP[k||'XX'];
        }
        return panels;
      }
      function buildSVG(disenoNombre, awCm, ahCm, unidadView){
        // aw/ah llegan en CM (del motor). Si la unidad activa es 'mm',
        // multiplicamos ×10 para mostrar. Helper local: misma lógica que fmtMedida.
        const showAw = unidadView === 'mm' ? (awCm * 10).toFixed(0) : awCm;
        const showAh = unidadView === 'mm' ? (ahCm * 10).toFixed(0) : ahCm;
        const unitLbl = unidadView === 'mm' ? 'mm' : 'cm';
        const panels=getPanels(disenoNombre);
        const W=280,H=190,ML=28,MR=16,MT=13,MB=28;
        const fw=W-ML-MR,fh=H-MT-MB,OUTER=6,INNER=5;
        const ox=ML,oy=MT,ix=ox+OUTER,iy=oy+OUTER;
        const iw=fw-OUTER*2,ih=fh-OUTER*2,pw=iw/panels.length;
        const panel=(i,mv)=>{
          const px=ix+pw*i,gx=px+INNER,gy=iy+INNER,gw=pw-INNER*2,gh=ih-INNER*2;
          const cx=px+pw/2,cy=iy+ih/2;
          return `<rect x='${px}' y='${iy}' width='${pw}' height='${ih}' fill='${mv?'#1565C0':'#4A5568'}' rx='1.5'/>
<rect x='${gx}' y='${gy}' width='${gw}' height='${gh}' fill='${mv?'rgba(147,197,225,.42)':'rgba(180,210,228,.2)'}' rx='1'/>
<rect x='${gx+2}' y='${gy+2}' width='${gw*.36}' height='${gh*.2}' fill='rgba(255,255,255,.16)' rx='1'/>
${mv?`<line x1='${cx-9}' y1='${cy}' x2='${cx+9}' y2='${cy}' stroke='rgba(255,255,255,.42)' stroke-width='1.4'/>
<polygon points='${cx-9},${cy} ${cx-6},${cy-2.5} ${cx-6},${cy+2.5}' fill='rgba(255,255,255,.42)'/>
<polygon points='${cx+9},${cy} ${cx+6},${cy-2.5} ${cx+6},${cy+2.5}' fill='rgba(255,255,255,.42)'/>`:
`<line x1='${gx+gw*.5}' y1='${gy+4}' x2='${gx+gw*.5}' y2='${gy+gh-4}' stroke='rgba(255,255,255,.1)' stroke-width='1' stroke-dasharray='3,3'/>`}
<text x='${cx}' y='${iy+ih-8}' text-anchor='middle' font-size='6.5' fill='rgba(255,255,255,.45)' font-weight='700'>${mv?'MÓVIL':'FIJO'}</text>
${i>0?`<rect x='${px-1.5}' y='${iy}' width='3' height='${ih}' fill='#5A6A7A' rx='1'/>`:''}`;
        };
        return `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}' viewBox='0 0 ${W} ${H}'>
<rect width='${W}' height='${H}' fill='#111820' rx='8'/>
<rect x='${ox}' y='${oy}' width='${fw}' height='${fh}' fill='#2E343C' rx='2'/>
<rect x='${ix}' y='${iy}' width='${iw}' height='${ih}' fill='#111820' rx='1'/>
<line x1='${ix}' y1='${iy+3}' x2='${ix+iw}' y2='${iy+3}' stroke='#5A6A7A' stroke-width='1.2' opacity='.45'/>
<line x1='${ix}' y1='${iy+ih-3}' x2='${ix+iw}' y2='${iy+ih-3}' stroke='#5A6A7A' stroke-width='1.2' opacity='.45'/>
${panels.map((p,i)=>panel(i,p.m)).join('')}
<line x1='${ox}' y1='${oy+fh+6}' x2='${ox+fw}' y2='${oy+fh+6}' stroke='#1565C0' stroke-width='.8'/>
<line x1='${ox}' y1='${oy+fh+3}' x2='${ox}' y2='${oy+fh+9}' stroke='#1565C0' stroke-width='.8'/>
<line x1='${ox+fw}' y1='${oy+fh+3}' x2='${ox+fw}' y2='${oy+fh+9}' stroke='#1565C0' stroke-width='.8'/>
<text x='${ox+fw/2}' y='${oy+fh+18}' text-anchor='middle' font-size='7' fill='#1565C0' font-weight='700'>${showAw} ${unitLbl}</text>
<line x1='${ox-6}' y1='${oy}' x2='${ox-6}' y2='${oy+fh}' stroke='#1565C0' stroke-width='.8'/>
<line x1='${ox-9}' y1='${oy}' x2='${ox-3}' y2='${oy}' stroke='#1565C0' stroke-width='.8'/>
<line x1='${ox-9}' y1='${oy+fh}' x2='${ox-3}' y2='${oy+fh}' stroke='#1565C0' stroke-width='.8'/>
<text x='${ox-17}' y='${oy+fh/2}' text-anchor='middle' font-size='7' fill='#1565C0' font-weight='700' transform='rotate(-90,${ox-17},${oy+fh/2})'>${showAh} ${unitLbl}</text>
</svg>`;
      }

      const accColors = ['#2563EB','#1565C0','#16A34A','#7C3AED','#BE185D','#0891B2','#B45309','#0F766E'];

      const ventanasHtml = validos.map(({ ventana: v, calculo: c }, idx) => {
        // FIX v32: unidad POR ventana. Si la ventana tiene unidad guardada
        // (ancho_unidad/alto_unidad), úsala; si no, cae al fallback del proyecto.
        const unidadV = String(v.ancho_unidad || v.alto_unidad || unidadProyecto).toLowerCase() === 'mm' ? 'mm' : 'cm';
        const anchoV = c.A ?? c.ancho_ventana ?? '?';
        const altoV  = c.H ?? c.alto_ventana  ?? '?';
        const perfiles   = c.piezas?.filter(p => !p.es_vidrio && !p.es_accesorio && p.resultado !== null && p.resultado !== undefined) || [];
        const accesorios = c.piezas?.filter(p => p.es_accesorio) || (c.accesorios || []);
        const vidrios    = c.piezas?.filter(p => p.es_vidrio) || (c.vidrios || []);
        const svg = buildSVG(v.diseno, anchoV, altoV, unidadV);
        const accCards = accesorios.map((a, i) => {
          const col = accColors[i % accColors.length];
          const lbl = a.descripcion || a.ubicacion || '';
          // FIX v37: felpa y empaque son accesorios por LONGITUD. La BD los
          // guarda en cm (canónico), pero en el PDF deben mostrarse en la
          // unidad de la ventana (cm o mm). Misma regla que aplica el builder
          // del backend (projectQuotationBuilder.js) para el PDF de cotización.
          // El resto de accesorios (und, par, etc.) NO se convierten.
          const nombreLow = String(a.descripcion || a.nombre_item || a.ubicacion || '').toLowerCase();
          const esLongitud = /felpa|empaque/i.test(nombreLow);
          const unidadOrig = String(a.unidad || '').toLowerCase();
          const esCm = unidadOrig === 'cm' || unidadOrig === '';
          const cantNum = typeof a.cantidad === 'number' ? a.cantidad : parseFloat(a.cantidad);

          let qty, qtyUnit;
          if (esLongitud && esCm && !isNaN(cantNum) && unidadV === 'mm') {
            qty = (cantNum * 10).toFixed(1);
            qtyUnit = 'mm';
          } else if (!isNaN(cantNum)) {
            qty = cantNum.toFixed(1);
            qtyUnit = a.unidad || 'un';
          } else {
            qty = a.cantidad !== null && a.cantidad !== undefined ? a.cantidad : '—';
            qtyUnit = a.unidad || 'un';
          }
          return `<div class='ac' style='border-left:3px solid ${col}'><div class='al'>${lbl}</div><div class='av' style='color:${col}'>${qty}<span class='au'> ${qtyUnit}</span></div></div>`;
        }).join('');
        // Vidrios: las medidas vienen en CM del motor. Las mostramos en la
        // unidad de ESTA ventana (mm o cm), no hardcoded a cm como antes.
        const vidRows = vidrios.map((vv,i)=>`<tr style='background:${i%2===0?"#fff":"#f0f6ff"}'><td style='padding:4px 8px;font-size:.76rem;font-weight:600'>${vv.ubicacion||''}</td><td style='padding:4px 8px;text-align:center;color:#6b7280;font-size:.7rem'>${vv.ref_vidrio||'5MM'}</td><td style='padding:4px 8px;text-align:center;font-weight:800'>${vv.cantidad}</td><td style='padding:4px 8px;text-align:center;font-weight:800;color:#1565C0'>${typeof vv.ancho==='number'?fmtNumMedida(vv.ancho, unidadV):'—'}</td><td style='padding:4px 8px;text-align:center;font-weight:800;color:#1565C0'>${typeof vv.alto==='number'?fmtNumMedida(vv.alto, unidadV):'—'}</td><td style='padding:4px 8px;font-size:.68rem;color:#6b7280;font-family:monospace'>${vv.formula_ancho||''}</td><td style='padding:4px 8px;font-size:.68rem;color:#6b7280;font-family:monospace'>${vv.formula_alto||''}</td></tr>`).join('');

        return `
<div class='vblock'>
  <div class='vhdr'>
    <div class='vnum'>V-${v.id_ventana}</div>
    <div class='vmeta'>
      <div class='vtit'>${v.sistema} &nbsp;&middot;&nbsp; Perfil ${v.perfil} &nbsp;&middot;&nbsp; Diseño ${v.diseno}</div>
      <div class='vsub'>Vano ${fmtMedida(v.ancho_vano, unidadV)} &times; ${fmtMedida(v.alto_vano, unidadV)} &nbsp;&nbsp;|&nbsp;&nbsp; Ventana ${fmtMedida(anchoV, unidadV)} &times; ${fmtMedida(altoV, unidadV)}</div>
    </div>
    <div class='vrep ${v.reporte_generado?'ok':'pend'}'>${v.reporte_generado?'REPORTE ✓':'PENDIENTE'}</div>
  </div>
  <div class='vbody'>
    <div class='vtop'>
    <div class='vcol-svg'>
      <div class='svgbox'>${svg}</div>
      <div class='leg'>
        <span class='ld' style='background:#1565C0'></span>Hoja móvil
        <span class='ld' style='background:#4A5568;margin-left:10px'></span>Hoja fija
      </div>
    </div>
    <div class='vcol-perfil'>
      <div class='st2'>Piezas de perfil — ${perfiles.length} referencias</div>
      <table>
        <thead><tr><th>#</th><th>Sección</th><th>Pieza</th><th>Cant.</th><th>Fórmula</th><th>Resultado</th><th>∠</th></tr></thead>
        <tbody>${perfiles.map((p,i)=>{
          const secCols={'MARCO':'#374151','MARCO 744':'#374151','NAVE MÓVIL':'#1565C0','NAVE MOVIL':'#1565C0','NAVE FIJA':'#2563EB','ADAPTADOR':'#7C3AED'};
          const sc=secCols[p.seccion]||'#374151';
          const isAng=p.angulo && p.angulo!==90;
          // Resultado en CM (del motor) → mostrar en la unidad de la ventana
          const resStr = typeof p.resultado==='number' ? fmtMedida(p.resultado, unidadV) : `${p.resultado} ${unidadV}`;
          return `<tr>
            <td class='muted'>${i+1}</td>
            <td><span style='background:${sc};color:#fff;font-size:.5rem;font-weight:800;padding:1px 5px;border-radius:3px;text-transform:uppercase;white-space:nowrap'>${p.seccion||''}</span></td>
            <td style='font-weight:600;font-size:.78rem'>${p.ubicacion}</td>
            <td class='ctr'>${p.cantidad}</td>
            <td class='fml'>${p.formula||''}</td>
            <td class='nm'>${resStr}</td>
            <td style='text-align:center'>${isAng?`<span style='background:#fef3c7;color:#92400e;font-weight:800;padding:1px 6px;border-radius:4px;font-size:.7rem'>∠${p.angulo}°</span>`:`<span style='color:#D1D5DB;font-size:.7rem'>90°</span>`}</td>
          </tr>`;
        }).join('')}
        </tbody>
      </table>
    </div>
    </div>
    <div class='vfull'>
      ${accesorios.length > 0 ? `
      <div class='st2' style='margin-top:10px'>Accesorios — ${accesorios.length} tipos</div>
      <div class='acgrid'>${accCards}</div>` : ''}
      ${vidrios.length > 0 ? `
      <div class='st2' style='margin-top:10px;color:#1e3a5f;border-bottom-color:#2563EB'>🪟 Vidrios — ${vidrios.length} tipo${vidrios.length>1?'s':''}</div>
      <table style='margin-top:6px;border:1.5px solid #2563EB;border-radius:4px'><thead><tr style='background:#1e3a5f'><th style='color:rgba(255,255,255,.7)'>Descripción</th><th style='color:rgba(255,255,255,.7)'>Ref.</th><th style='color:rgba(255,255,255,.7);text-align:center'>Cant.</th><th style='color:rgba(255,255,255,.7);text-align:center'>Ancho ${unidadV}</th><th style='color:rgba(255,255,255,.7);text-align:center'>Alto ${unidadV}</th><th style='color:rgba(255,255,255,.7)'>F. Ancho</th><th style='color:rgba(255,255,255,.7)'>F. Alto</th></tr></thead><tbody>${vidRows}</tbody></table>` : ''}
    </div>
  </div>
</div>`;
      }).join('');

      const html = `<!DOCTYPE html>
<html lang='es'><head><meta charset='UTF-8'/>
<title>Reporte Consolidado — ${proyecto.nombre_proyecto}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;600;700;800&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'DM Sans',Arial,sans-serif;background:#fff;color:#0f172a;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pg{max-width:1100px;margin:0 auto;background:#fff}
.hdr{background:linear-gradient(135deg,#0f2d52,#1e3a8a);border-radius:10px;padding:10px 18px;display:flex;justify-content:space-between;align-items:center;color:#fff}
.hlogo{display:flex;align-items:center;gap:11px}
.hlogo img{height:38px;display:block}
.br{font-size:17px;font-weight:800;letter-spacing:.04em;line-height:1.05;color:#fff}
.brs{font-size:8px;font-weight:600;color:rgba(255,255,255,.65);text-transform:uppercase;letter-spacing:.1em;font-family:'DM Mono',monospace;margin-top:2px}
.mt{text-align:right;font-size:9px;color:rgba(255,255,255,.85);line-height:1.7;font-family:'DM Mono',monospace}
.mt strong{color:#fff;font-weight:700}
.bdg{display:inline-block;background:#2563eb;color:#fff;font-size:9px;font-weight:700;padding:2px 10px;border-radius:6px;letter-spacing:.05em;margin-bottom:3px;font-family:'DM Mono',monospace}
.bd{padding:14px 22px}
.pbox{display:flex;flex-wrap:wrap;gap:16px;margin-bottom:14px}
.plbl{font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8}
.pval{font-size:15px;font-weight:800;color:#0f2d52}
.stats{display:flex;gap:9px;margin-bottom:14px;flex-wrap:wrap}
.stat{background:#0f2d52;border-radius:8px;padding:9px 16px;text-align:center;min-width:90px}
.sn{font-size:20px;font-weight:800;color:#60a5fa;font-family:'DM Mono',monospace}
.sl{font-size:8px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:rgba(255,255,255,.55);margin-top:2px}
.stitle{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#64748b;padding-bottom:6px;border-bottom:2px solid #0f2d52;margin-bottom:13px}
.vblock{border:1px solid #e2e8f0;border-radius:11px;margin-bottom:16px;overflow:hidden;box-shadow:0 1px 6px rgba(15,45,82,.06);page-break-inside:avoid}
.vhdr{background:linear-gradient(135deg,#1e293b,#0f2d52);padding:10px 16px;display:flex;align-items:center;gap:12px}
.vnum{background:#2563eb;color:#fff;font-family:'DM Mono',monospace;font-size:15px;font-weight:800;padding:5px 13px;border-radius:8px;flex-shrink:0}
.vmeta{flex:1;min-width:0}
.vtit{font-size:13px;font-weight:700;color:#fff}
.vsub{font-size:9px;color:rgba(255,255,255,.6);margin-top:2px;font-family:'DM Mono',monospace}
.vrep{font-size:9px;font-weight:700;padding:4px 12px;border-radius:20px;flex-shrink:0}
.ok{background:#dcfce7;color:#16a34a}
.pend{background:#fee2e2;color:#b91c1c}
.vbody{}
.vtop{display:grid;grid-template-columns:300px 1fr;gap:14px;padding:13px}
.vcol-svg{display:flex;flex-direction:column;gap:7px}
.svgbox{background:#f0f6ff;border:1px solid #dbeafe;border-radius:8px;overflow:hidden;line-height:0;padding:8px}
.svgbox svg{display:block;width:100%;height:auto;border-radius:5px}
.leg{display:flex;align-items:center;gap:5px;font-size:8px;font-weight:600;color:#64748b}
.ld{display:inline-block;width:9px;height:9px;border-radius:2px;flex-shrink:0}
.vcol-perfil{min-width:0}
.vfull{padding:0 13px 13px}
.st2{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#0f2d52;margin-bottom:6px}
table{width:100%;border-collapse:collapse;font-size:10px;font-family:'DM Mono',monospace}
thead tr{background:#f1f5f9}
th{padding:4px 8px;text-align:left;font-size:8px;font-weight:600;letter-spacing:.04em;color:#64748b}
td{padding:4px 8px;border-bottom:1px solid #f1f5f9}
tbody tr:nth-child(even) td{background:#f8fafc}
.nm{font-weight:800;color:#0f2d52;font-family:'DM Mono',monospace;font-size:11px}
.fml{color:#94a3b8;font-size:8.5px;font-family:'DM Mono',monospace}
.muted{color:#cbd5e1;font-size:9px;font-family:'DM Mono',monospace}
.ctr{font-weight:700;text-align:center}
.acgrid{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}
.ac{background:#fff;border:1px solid #e2e8f0;border-radius:7px;padding:6px 9px}
.al{font-size:7.5px;font-weight:600;color:#64748b;margin-bottom:2px;line-height:1.25}
.av{font-size:13px;font-weight:800;font-family:'DM Mono',monospace;line-height:1}
.au{font-size:8px;font-weight:600;color:#94a3b8}
.ft{padding:11px 22px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:9px;color:#94a3b8;font-family:'DM Mono',monospace}
.ft strong{color:#0f2d52}
@media print{body{background:#fff}.pg{max-width:100%}@page{size:A4 landscape;margin:8mm}
.hdr{padding:8px 16px}.brs{font-size:7.5px}.mt{font-size:8.5px;line-height:1.55}
.pbox{display:none}.stats{display:none}.ft{display:none}
.bd{padding:10px 14px}
.stitle{margin:0 0 9px;font-size:10px}
.vblock{page-break-inside:avoid;break-inside:avoid;margin-bottom:10px;box-shadow:none}
.vtop{grid-template-columns:285px 1fr;gap:12px;padding:11px;align-items:start;page-break-inside:avoid;break-inside:avoid}
.vhdr{page-break-inside:avoid;break-inside:avoid}
.svgbox{page-break-inside:avoid;break-inside:avoid}
thead{display:table-header-group}
tr{page-break-inside:avoid;break-inside:avoid}
.acgrid{gap:5px}.ac{page-break-inside:avoid;break-inside:avoid}}
.acgrid{gap:4px}.ac{page-break-inside:avoid;break-inside:avoid;padding:4px 9px}.av{font-size:.95rem}}
</style></head><body>
<div class='pg'>
<div class='hdr'>
  <div class='hlogo'><img src="${LOGO_EMBLEMA}" alt="CorteAlum"/><div><div class='br'>CORTEALUM</div><div class='brs'>Reporte Consolidado de Ventanería</div></div></div>
  <div class='mt'>
    <span class='bdg'>${proyecto.nombre_proyecto}</span><br>
    ${proyecto.nombre_cliente?`Cliente: <strong>${proyecto.nombre_cliente}</strong> &middot; `:''}${fecha}<br>
    <span style='opacity:.7'>${ventanas.length} ventana${ventanas.length!==1?'s':''} &middot; ${validos.length} calculada${validos.length!==1?'s':''} &middot; ${ventanas.filter(v=>!v.reporte_generado).length} pendiente${ventanas.filter(v=>!v.reporte_generado).length!==1?'s':''}</span>
  </div>
</div>
<div class='bd'>
  <div class='pbox'>
    <div><div class='plbl'>Proyecto</div><div class='pval'>${proyecto.nombre_proyecto}</div></div>
    ${proyecto.nombre_cliente?`<div><div class='plbl'>Cliente</div><div class='pval'>${proyecto.nombre_cliente}</div></div>`:''}
    <div><div class='plbl'>Estado</div><div class='pval'>${proyecto.estado}</div></div>
  </div>
  <div class='stats'>
    <div class='stat'><div class='sn'>${ventanas.length}</div><div class='sl'>Total ventanas</div></div>
    <div class='stat'><div class='sn'>${ventanas.filter(v=>v.reporte_generado).length}</div><div class='sl'>Con reporte</div></div>
    <div class='stat'><div class='sn'>${ventanas.filter(v=>!v.reporte_generado).length}</div><div class='sl'>Pendientes</div></div>
    <div class='stat'><div class='sn'>${validos.length}</div><div class='sl'>Calculadas</div></div>
  </div>
  <div class='stitle'>Ventanas — Cálculo técnico detallado &nbsp;·&nbsp; ${ventanas.length} ventana${ventanas.length!==1?'s':''} &nbsp;·&nbsp; ${validos.length} calculada${validos.length!==1?'s':''} &nbsp;·&nbsp; ${ventanas.filter(v=>!v.reporte_generado).length} pendiente${ventanas.filter(v=>!v.reporte_generado).length!==1?'s':''}</div>
  ${ventanasHtml}
</div>
<div class='ft'>
  <span><strong>CorteAlu</strong> — Sistema de Gestión de Ventanería de Aluminio</span>
  <span>Generado el ${fecha}</span>
</div>
</div></body></html>`;

      await descargarReportePdf(html, `ReporteConsolidado_${proyecto.nombre_proyecto.replace(/\s+/g,'_')}`);
      toast.success(`Reporte consolidado en PDF — ${validos.length} ventanas`);
    } catch(err) {
      toast.error('Error al generar reporte consolidado');
    }
  };

  const filteredHistorial = historial.filter(h =>
    (h.accion||'').toLowerCase().includes(searchHistorial.toLowerCase())
  );

  if (loading) return <div style={{textAlign:'center',padding:'4rem'}}><div className="spinner" style={{margin:'0 auto'}}/></div>;
  if (!proyecto) return (
    <div style={{textAlign:"center",padding:"4rem"}}>
      <p style={{color:"var(--gray-500)",marginBottom:"1rem"}}>Proyecto no encontrado o sin acceso.</p>
      <button className="btn btn-outline" onClick={()=>navigate("/proyectos")}>← Volver a proyectos</button>
    </div>
  );

  // Si es invitado con permiso de solo lectura, bloquear TODAS las acciones
  const esSoloLectura = proyecto.mi_permiso === 'lectura' && proyecto.mi_rol === 'invitado';
  const permisosBase = proyecto.permisos || { editarProyecto:true, agregarVentanas:true, editarVentanas:true, generarCotizacion:true, generarReporte:true };
  const permisos = esSoloLectura
    ? { editarProyecto:false, agregarVentanas:false, editarVentanas:false, generarCotizacion:false, generarReporte:false }
    : permisosBase;
  const conReporte = ventanas.filter(v=>v.reporte_generado).length;
  const totalVentanas = ventanas.length;
  const esEstadoFinal = proyecto.estado === 'completado' || proyecto.estado === 'cancelado';

  return (
    <div>
      {/* Header */}
      <div className="page-header" style={{flexWrap:'wrap', gap:12}}>
        <div style={{display:'flex', alignItems:'center', gap:10, flexWrap:'wrap'}}>
          <button className="btn btn-outline btn-sm" onClick={()=>navigate('/proyectos')}>
            <ArrowLeft size={16}/>
          </button>
          <div>
            <div style={{display:'flex', alignItems:'center', gap:8, flexWrap:'wrap'}}>
              <h1 style={{fontSize:'clamp(1.1rem,3vw,1.4rem)', fontWeight:800}}>{proyecto.nombre_proyecto}</h1>
              <span className={`badge badge-${BADGE[proyecto.estado]||'blue'}`}>{proyecto.estado}</span>
              {esEstadoFinal && <Lock size={14} style={{color:'var(--gray-400)'}} title="Estado final — solo lectura"/>}
            </div>
            {proyecto.nombre_cliente && <p style={{color:'var(--gray-500)',fontSize:'.82rem',marginTop:2}}>{proyecto.nombre_cliente}</p>}
          </div>
        </div>
        <div style={{display:'flex', gap:7, flexWrap:'wrap', alignItems:'center'}}>
          {permisos.editarProyecto && (
            <button
              onClick={()=>setShowEditProyecto(true)}
              title="Editar proyecto"
              style={{
                height:36, width:36, borderRadius:8, cursor:'pointer',
                background:'rgba(75,85,99,.10)', border:'1px solid #D1D5DB',
                display:'flex', alignItems:'center', justifyContent:'center',
                color:'#4B5563', transition:'all .15s',
              }}
              onMouseEnter={e=>{e.currentTarget.style.background='#E5E7EB';}}
              onMouseLeave={e=>{e.currentTarget.style.background='rgba(75,85,99,.10)';}}
            >
              <Settings size={15}/>
            </button>
          )}
          <button
            onClick={()=>setShowHistorial(!showHistorial)}
            style={{
              height:36, padding:'0 12px', borderRadius:8, cursor:'pointer',
              background:'rgba(75,85,99,.10)', border:'1px solid #D1D5DB',
              display:'flex', alignItems:'center', gap:6,
              color:'#4B5563', fontSize:'.8rem', fontWeight:700, transition:'all .15s',
            }}
            onMouseEnter={e=>{e.currentTarget.style.background='#E5E7EB';}}
            onMouseLeave={e=>{e.currentTarget.style.background='rgba(75,85,99,.10)';}}
          >
            <History size={14}/> Historial {showHistorial ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
          </button>
          <button
            onClick={handleDuplicar}
            style={{
              height:36, padding:'0 14px', borderRadius:8, cursor:'pointer',
              background:'#1F2937', border:'1px solid #374151',
              display:'flex', alignItems:'center', gap:6,
              color:'#F9FAFB', fontSize:'.8rem', fontWeight:700, transition:'all .15s',
            }}
            onMouseEnter={e=>{e.currentTarget.style.background='#374151';}}
            onMouseLeave={e=>{e.currentTarget.style.background='#1F2937';}}
          >
            <Copy size={14}/> Duplicar
          </button>
          {permisos.generarReporte && (
            <button
              onClick={handleReporteConsolidado}
              style={{
                height:36, padding:'0 14px', borderRadius:8, cursor:'pointer',
                background:'#374151', border:'1px solid #4B5563',
                display:'flex', alignItems:'center', gap:6,
                color:'#F9FAFB', fontSize:'.8rem', fontWeight:700, transition:'all .15s',
              }}
              onMouseEnter={e=>{e.currentTarget.style.background='#4B5563';}}
              onMouseLeave={e=>{e.currentTarget.style.background='#374151';}}
            >
              <FileDown size={14}/> PDF
            </button>
          )}
          {permisos.generarCotizacion && (
            <button
              onClick={()=>setShowOptimizacion(true)}
              style={{
                height:36, padding:'0 16px', borderRadius:8, cursor:'pointer',
                background:'#065F46', border:'1px solid #047857',
                display:'flex', alignItems:'center', gap:6,
                color:'#D1FAE5', fontSize:'.8rem', fontWeight:700, transition:'all .15s',
              }}
              onMouseEnter={e=>{e.currentTarget.style.background='#047857';}}
              onMouseLeave={e=>{e.currentTarget.style.background='#065F46';}}
              title="Optimización 1D de cortes con reutilización de residuos"
            >
              <Scissors size={14}/> Optimizar cortes
            </button>
          )}
          {permisos.generarCotizacion && (
            <button
              onClick={()=>setShowCotizacion(true)}
              style={{
                height:36, padding:'0 16px', borderRadius:8, cursor:'pointer',
                background:'#1E3A5F', border:'1px solid #2D5A8E',
                display:'flex', alignItems:'center', gap:6,
                color:'#E0EEFF', fontSize:'.8rem', fontWeight:700, transition:'all .15s',
              }}
              onMouseEnter={e=>{e.currentTarget.style.background='#2D4F7C';}}
              onMouseLeave={e=>{e.currentTarget.style.background='#1E3A5F';}}
            >
              <DollarSign size={14}/> Cotización
            </button>
          )}
          {permisos.agregarVentanas && (
            <button
              onClick={()=>setShowVentanaModal(true)}
              style={{
                height:36, padding:'0 16px', borderRadius:8, cursor:'pointer',
                background:'#1A56DB', border:'none',
                display:'flex', alignItems:'center', gap:6,
                color:'#fff', fontSize:'.8rem', fontWeight:700,
                boxShadow:'0 2px 8px rgba(26,86,219,.35)', transition:'all .15s',
              }}
              onMouseEnter={e=>{e.currentTarget.style.background='#1239A6';}}
              onMouseLeave={e=>{e.currentTarget.style.background='#1A56DB';}}
            >
              <Plus size={15}/> Ventana
            </button>
          )}
        </div>
      </div>

      {/* Banner solo lectura (invitado) */}
      {esSoloLectura && <BannerSoloLectura nombre_creador={proyecto.creador} />}
      {/* Banner de bloqueo por estado */}
      {!esSoloLectura && <BannerBloqueo estado={proyecto.estado} />}

      {/* Stats — estilo dashboard */}
      <div style={{
        background:'var(--surface)', border:'1px solid var(--border)',
        borderRadius:14, marginBottom:'1.25rem', overflow:'hidden',
        boxShadow:'0 1px 4px rgba(13,17,23,.07)',
      }}>
        {/* Header stats */}
        <div style={{
          padding:'.65rem 1.25rem', borderBottom:'1px solid var(--border)',
          background:'var(--surface-2)',
          display:'flex', alignItems:'center', justifyContent:'space-between',
        }}>
          <div style={{display:'flex',alignItems:'center',gap:7}}>
            <LayoutGrid size={13} color='var(--primary)'/>
            <span style={{fontSize:'.67rem',fontWeight:800,letterSpacing:'.1em',textTransform:'uppercase',color:'var(--text-muted)'}}>
              Resumen del Proyecto
            </span>
          </div>
          {totalVentanas > 0 && (
            <span style={{fontSize:'.75rem',fontWeight:800,color:'var(--primary)'}}>
              {conReporte}/{totalVentanas} reportes
            </span>
          )}
        </div>
        {/* Fila de stats */}
        <div style={{display:'flex', flexWrap:'wrap'}}>
          {[
            { label:'Total Ventanas', value:totalVentanas,           color:'#1A56DB' },
            { label:'Con Reporte',    value:conReporte,              color:'#166534' },
            { label:'Pendientes',     value:totalVentanas-conReporte,color:'#374151' },
          ].map(({label,value,color},i,arr)=>(
            <div key={label} style={{
              flex:'1 1 100px', textAlign:'center',
              padding:'1.1rem .5rem',
              borderRight: i<arr.length-1 ? '1px solid var(--border)' : 'none',
            }}>
              <div style={{fontSize:'.65rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'.08em',color:'var(--text-muted)',marginBottom:6}}>{label}</div>
              <div style={{fontSize:'2.2rem',fontWeight:900,color,lineHeight:1}}>{value}</div>
            </div>
          ))}
          {/* Barra de progreso integrada */}
          {totalVentanas > 0 && (
            <div style={{
              width:'100%', padding:'.75rem 1.25rem',
              borderTop:'1px solid var(--border)',
              background:'var(--surface-2)',
              display:'flex', alignItems:'center', gap:12,
            }}>
              <div style={{flex:1,background:'var(--border)',borderRadius:99,height:6,overflow:'hidden'}}>
                <div style={{
                  background:'linear-gradient(90deg,#1A56DB,#166534)',
                  height:'100%',
                  width:`${(conReporte/totalVentanas)*100}%`,
                  borderRadius:99, transition:'width .5s ease',
                }}/>
              </div>
              <span style={{fontSize:'.72rem',fontWeight:800,color:'var(--text-muted)',whiteSpace:'nowrap'}}>
                {Math.round((conReporte/totalVentanas)*100)}%
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Historial collapsible */}
      {showHistorial && (
        <div className="card" style={{marginBottom:'1.25rem'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1rem',flexWrap:'wrap',gap:8}}>
            <h2 style={{fontSize:'.95rem',fontWeight:700}}>Historial del Proyecto</h2>
            <div style={{position:'relative',flex:1,maxWidth:280}}>
              <input
                placeholder="Buscar en historial..."
                value={searchHistorial}
                onChange={e=>setSearchHistorial(e.target.value)}
                style={{paddingLeft:12,fontSize:'.85rem'}}
              />
            </div>
          </div>
          {filteredHistorial.length === 0 ? (
            <p style={{color:'var(--gray-400)',fontSize:'.85rem',textAlign:'center',padding:'1rem'}}>Sin registros</p>
          ) : (
            <div style={{maxHeight:260,overflowY:'auto'}}>
              {filteredHistorial.map((h,i) => (
                <div key={h.id_historial||i} style={{display:'flex',gap:12,padding:'8px 0',borderBottom:'1px solid var(--gray-100)',alignItems:'flex-start'}}>
                  <div style={{width:8,height:8,borderRadius:'50%',background:'var(--primary)',marginTop:6,flexShrink:0}}/>
                  <div style={{flex:1}}>
                    <div style={{fontSize:'.85rem',color:'var(--gray-700)',fontWeight:500}}>{h.accion}</div>
                    <div style={{fontSize:'.75rem',color:'var(--gray-400)',marginTop:2}}>
                      {new Date(h.fecha).toLocaleString('es-CO',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}
                      {h.version && <span style={{marginLeft:8,background:'var(--primary-light)',color:'var(--primary)',padding:'1px 6px',borderRadius:4,fontSize:'.7rem'}}>v{h.version}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Ventanas */}
      <div>
        {/* Header + búsqueda + filtro */}
        <div style={{marginBottom:'1rem'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'.85rem',flexWrap:'wrap',gap:8}}>
            <div>
              <h2 style={{fontSize:'1.05rem',fontWeight:800,color:'var(--text-primary)'}}>Ventanas del Proyecto</h2>
              <p style={{fontSize:'.75rem',color:'var(--text-muted)',marginTop:2}}>
                Clic en la calculadora para ver el cálculo y gestionar el reporte técnico
              </p>
            </div>
          </div>
          {ventanas.length > 0 && (
            <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
              {/* Búsqueda */}
              <div style={{position:'relative',flex:1,minWidth:200}}>
                <Search size={13} style={{position:'absolute',left:11,top:'50%',transform:'translateY(-50%)',color:'var(--text-muted)',pointerEvents:'none'}}/>
                <input
                  placeholder="Buscar ventana..."
                  value={searchVentana}
                  onChange={e=>setSearchVentana(e.target.value)}
                  style={{paddingLeft:34,height:38,fontSize:'.82rem',borderRadius:9,background:'var(--surface)',border:'1.5px solid var(--border)',width:'100%'}}
                />
              </div>
              {/* Filtros agrupados: sistema + perfil + diseño */}
              <div style={{display:'flex',borderRadius:9,overflow:'hidden',border:'1.5px solid var(--border)',flexShrink:0}}>
                <select
                  value={filtroSistema}
                  onChange={e=>setFiltroSistema(e.target.value)}
                  style={{height:36,fontSize:'.82rem',background:filtroSistema!=='todos'?'#EFF6FF':'var(--surface)',border:'none',borderRight:'1px solid var(--border)',color:filtroSistema!=='todos'?'var(--blue)':'var(--text-secondary)',padding:'0 10px',minWidth:110,cursor:'pointer',fontWeight:filtroSistema!=='todos'?700:400,outline:'none'}}
                >
                  <option value="todos">Sistema</option>
                  {[...new Set(ventanas.map(v=>v.sistema).filter(Boolean))].sort().map(s=>(
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <select
                  value={filtroPerfil}
                  onChange={e=>setFiltroPerfil(e.target.value)}
                  style={{height:36,fontSize:'.82rem',background:filtroPerfil!=='todos'?'#EFF6FF':'var(--surface)',border:'none',borderRight:'1px solid var(--border)',color:filtroPerfil!=='todos'?'var(--blue)':'var(--text-secondary)',padding:'0 10px',minWidth:90,cursor:'pointer',fontWeight:filtroPerfil!=='todos'?700:400,outline:'none'}}
                >
                  <option value="todos">Perfil</option>
                  {[...new Set(ventanas.map(v=>v.perfil).filter(Boolean))].sort().map(p=>(
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <select
                  value={filtroDiseno}
                  onChange={e=>setFiltroDiseno(e.target.value)}
                  style={{height:36,fontSize:'.82rem',background:filtroDiseno!=='todos'?'#EFF6FF':'var(--surface)',border:'none',color:filtroDiseno!=='todos'?'var(--blue)':'var(--text-secondary)',padding:'0 10px',minWidth:90,cursor:'pointer',fontWeight:filtroDiseno!=='todos'?700:400,outline:'none'}}
                >
                  <option value="todos">Diseño</option>
                  {[...new Set(ventanas.map(v=>v.diseno).filter(Boolean))].sort().map(d=>(
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              {/* Limpiar filtros */}
              {(filtroSistema!=='todos'||filtroPerfil!=='todos'||filtroDiseno!=='todos'||searchVentana) && (
                <button
                  onClick={()=>{setFiltroSistema('todos');setFiltroPerfil('todos');setFiltroDiseno('todos');setSearchVentana('');}}
                  style={{height:38,padding:'0 12px',borderRadius:9,background:'transparent',border:'1.5px solid var(--border-2)',fontSize:'.78rem',fontWeight:700,color:'var(--text-muted)',cursor:'pointer',whiteSpace:'nowrap',transition:'all .15s'}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--red)';e.currentTarget.style.color='var(--red)';}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border-2)';e.currentTarget.style.color='var(--text-muted)';}}
                >
                  × Limpiar
                </button>
              )}
            </div>
          )}
        </div>

        {ventanas.length === 0 ? (
          <div className="empty-state" style={{padding:'3rem',background:'var(--surface)',borderRadius:14,border:'1px solid var(--border)'}}>
            <p>No hay ventanas. ¡Agrega la primera!</p>
          </div>
        ) : (() => {
          const filtradas = ventanas.filter(v => {
            const q = searchVentana.toLowerCase();
            const matchQ = !q ||
              (v.sistema||'').toLowerCase().includes(q) ||
              (v.perfil||'').toLowerCase().includes(q) ||
              (v.diseno||'').toLowerCase().includes(q);
            const matchD = filtroDiseno  === 'todos' || v.diseno  === filtroDiseno;
            const matchS = filtroSistema === 'todos' || v.sistema === filtroSistema;
            const matchP = filtroPerfil  === 'todos' || v.perfil  === filtroPerfil;
            return matchQ && matchD && matchS && matchP;
          });

          if (filtradas.length === 0) return (
            <div className="empty-state" style={{padding:'2.5rem',background:'var(--surface)',borderRadius:14,border:'1px solid var(--border)'}}>
              <p>Sin resultados para esa búsqueda</p>
            </div>
          );

          return (
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(270px,1fr))',gap:'1rem'}}>
              {filtradas.map((v,i) => (
                <VentanaCard
                  key={v.id_ventana}
                  v={v} idx={i}
                  permisos={permisos}
                  proyecto={proyecto}
                  onSimular={()=>setShowSimulacion(v)}
                  onEditar={()=>setEditVentana(v)}
                  onEliminar={()=>handleDeleteVentana(v.id_ventana)}
                />
              ))}
            </div>
          );
        })()}
      </div>

      {/* Modals */}
      {showVentanaModal && (
        <VentanaModal
          idProyecto={id}
          catData={catData}
          unidadProyecto={proyecto?.unidad_default || 'cm'}
          onClose={()=>setShowVentanaModal(false)}
          onSaved={()=>{setShowVentanaModal(false);load();}}
        />
      )}
      {editVentana && (
        <VentanaModal
          idProyecto={id}
          catData={catData}
          ventanaEdit={editVentana}
          unidadProyecto={proyecto?.unidad_default || 'cm'}
          onClose={()=>setEditVentana(null)}
          onSaved={()=>{setEditVentana(null);load();}}
        />
      )}
      {showSimulacion && (
        <SimulacionModal
          key={showSimulacion.id_ventana}
          ventana={showSimulacion}
          onClose={()=>setShowSimulacion(null)}
          onReporteGenerado={()=>{setShowSimulacion(null);load();}}
        />
      )}
      {showCotizacion && (
        <CotizacionModal
          idProyecto={id}
          nombreProyecto={proyecto.nombre_proyecto}
          nombreCliente={proyecto.nombre_cliente}
          fechaInicio={proyecto.fecha_inicio}
          fechaFin={proyecto.fecha_fin}
          ventanas={ventanas}
          onClose={()=>setShowCotizacion(false)}
          onSaved={()=>{setShowCotizacion(false);navigate('/cotizaciones');}}
        />
      )}
      <OptimizacionProyectoModal
        open={showOptimizacion}
        idProyecto={id}
        nombreProyecto={proyecto?.nombre_proyecto || ''}
        onClose={(confirmado) => {
          setShowOptimizacion(false);
          if (confirmado) load();  // recargar proyecto si se confirmó plan
        }}
      />
      {showEditProyecto && (
        <EditProyectoModal
          proyecto={proyecto}
          onClose={()=>setShowEditProyecto(false)}
          onSaved={()=>{setShowEditProyecto(false);load();}}
        />
      )}
      {showDuplicarModal && (
        <DuplicarModal
          proyecto={proyecto}
          onClose={()=>setShowDuplicarModal(false)}
          onDuplicar={handleDuplicarConfirmar}
        />
      )}
      {/* Modal local de confirmación con contraseña — patrón useConfirmDelete */}
      {deleteModal}
    </div>
  );
}
