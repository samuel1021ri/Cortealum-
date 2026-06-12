import { useState, useEffect } from 'react';
import {
  X, DollarSign, Loader, FileDown, Plus, Trash2,
  ChevronRight, ChevronLeft, CheckCircle, Users, Truck,
  Wrench, Package, ChevronDown, ChevronUp, Edit3
} from 'lucide-react';
import { calcGlass, validateGlass, fmtCOP as fmtCOPGlass, fmtNum as fmtNumGlass } from '../../utils/glassMath';
import { fmtNumMedida, unitLabel } from '../../utils/unidades';
import api from '../../api/client';
import toast from 'react-hot-toast';

const fmt = n => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0);
const pct = (base, p) => base * p / 100;
const STEPS = ['Parámetros', 'Materiales', 'Resultado'];

// ─── Cobro de accesorios ──────────────────────────────────────────────────────
// FELPA y EMPAQUE se cobran por METRO LINEAL (ml). El motor entrega su longitud
// en cm, así que para el cobro se divide ÷100 y el precio se entiende por metro.
// El backend (cotizacionesController PASO 5) aplica exactamente esta misma regla,
// por eso el preview del modal debe usarla también: así el número en pantalla
// coincide con lo que se guarda y con el PDF. El resto de accesorios cobra
// cantidad × precio tal cual. Esto NO altera la unidad cm/mm de medidas ni perfiles.
const esAccLongitud    = (a) => /felpa|empaque/i.test(a?.descripcion || '');
const accCantidadCobro = (a) => esAccLongitud(a) ? (a.cantidad || 0) / 100 : (a.cantidad || 0);
const accUnidadCobro   = (a) => esAccLongitud(a) ? 'ml' : (a.unidad || 'und');
const accSubtotal      = (a) => accCantidadCobro(a) * (a.precio || 0);

// ─── Catálogo Alumfer Feb 2026 ────────────────────────────────────────────────
// Indexado por sistema → nombre perfil → precios por color
const CATALOGO = {
  // SISTEMA 50-20 TRADICIONAL
  'CABEZAL-2-1':    { ref:'ALNA 144', Natural:71400,  Champagne:74400,  Anolock:73200,  Blanco:55200,  Negro:null   },
  'TRASLAPE-2-1':   { ref:'ALNA 192', Natural:34200,  Champagne:48000,  Anolock:46800,  Blanco:34200,  Negro:null   },
  'JAMBA-2-1':      { ref:'ALNA 193', Natural:70200,  Champagne:72600,  Anolock:72000,  Blanco:70800,  Negro:null   },
  'SILLAR-2-1':     { ref:'ALNA 194', Natural:77400,  Champagne:79800,  Anolock:79200,  Blanco:63000,  Negro:null   },
  'HORIZONTAL INF-2-1': { ref:'ALNA 349', Natural:72000, Champagne:74400, Anolock:73800, Blanco:72600, Negro:null   },
  'ENGANCHE-2-1':   { ref:'ALNB 147', Natural:60600,  Champagne:63000,  Anolock:62400,  Blanco:50400,  Negro:null   },
  // SISTEMA 50-20 LINEA90/HIBRIDA
  'ENGANCHE-2-3':   { ref:'ALN 634',  Natural:58200,  Champagne:null,   Anolock:null,   Blanco:73200,  Negro:null   },
  'TRASLAPE-2-3':   { ref:'ALN 632',  Natural:95400,  Champagne:null,   Anolock:null,   Blanco:78000,  Negro:null   },
  'JAMBA-2-3':      { ref:'ALN 880',  Natural:79800,  Champagne:null,   Anolock:null,   Blanco:80400,  Negro:null   },
  'CABEZAL-2-3':    { ref:'ALNA 392', Natural:81000,  Champagne:84000,  Anolock:84000,  Blanco:81000,  Negro:84000  },
  'SILLAR-2-3':     { ref:'ALNA 387', Natural:76800,  Champagne:79800,  Anolock:79800,  Blanco:76800,  Negro:79800  },
  // SISTEMA 744 TRADICIONAL
  'ADAPTADOR-1-1':  { ref:'ALN 403',  Natural:36600,  Champagne:38400,  Anolock:38400,  Blanco:36600,  Negro:38400  },
  'SILLAR-1-1':     { ref:'ALNA 387', Natural:76800,  Champagne:79800,  Anolock:79800,  Blanco:76800,  Negro:79800  },
  'TRASLAPE-1-1':   { ref:'ALNA 388', Natural:76800,  Champagne:79800,  Anolock:79800,  Blanco:76800,  Negro:79800  },
  'HORIZONTAL SUP-1-1': { ref:'ALNA 389', Natural:53400, Champagne:55800, Anolock:55800, Blanco:53400, Negro:55800  },
  'ENGANCHE-1-1':   { ref:'ALNA 391', Natural:69000,  Champagne:72000,  Anolock:72000,  Blanco:69000,  Negro:72000  },
  'CABEZAL-1-1':    { ref:'ALNA 392', Natural:81000,  Champagne:84000,  Anolock:84000,  Blanco:81000,  Negro:84000  },
  'HORIZONTAL INF-1-1': { ref:'ALNB 390', Natural:68400, Champagne:71400, Anolock:71400, Blanco:68400, Negro:71400  },
  'JAMBA-1-1':      { ref:'ALNB 393', Natural:66000,  Champagne:69000,  Anolock:69000,  Blanco:66000,  Negro:69000  },
  // SISTEMA 744 LINEA 90
  'TRASLAPE-1-2':   { ref:'ALN 1766', Natural:62400,  Champagne:78600,  Anolock:78600,  Blanco:75600,  Negro:78600  },
  'ENGANCHE-1-2':   { ref:'ALN 1767', Natural:67200,  Champagne:84000,  Anolock:84000,  Blanco:80400,  Negro:84000  },
  'ADAPTADOR-1-2':  { ref:'ALN 1785', Natural:58200,  Champagne:null,   Anolock:null,   Blanco:null,   Negro:null   },
  // SISTEMA 8025 TRADICIONAL
  'HORIZONTAL SUP-3-1': { ref:'ALN 156',  Natural:83400,  Champagne:108000, Anolock:106800, Blanco:105000, Negro:107400 },
  'ADAPTADOR-3-1':  { ref:'ALN 158',  Natural:45600,  Champagne:48000,  Anolock:null,   Blanco:46200,  Negro:47400  },
  'TRASLAPE-3-1':   { ref:'ALN 190',  Natural:94200,  Champagne:131000, Anolock:118200, Blanco:126400, Negro:130200 },
  'SILLAR-3-1':     { ref:'ALNA 150', Natural:115800, Champagne:120000, Anolock:118800, Blanco:116400, Negro:119400 },
  'CABEZAL-3-1':    { ref:'ALNA 151', Natural:116400, Champagne:120600, Anolock:108000, Blanco:117000, Negro:120000 },
  'HORIZONTAL INF-3-1': { ref:'ALNA 157', Natural:102000, Champagne:140400, Anolock:139200, Blanco:136200, Negro:139800 },
  'ENGANCHE-3-1':   { ref:'ALNA 191', Natural:97800,  Champagne:129600, Anolock:114000, Blanco:118800, Negro:121800 },
  'JAMBA-3-1':      { ref:'ALNA 841', Natural:112200, Champagne:116400, Anolock:107400, Blanco:116400, Negro:115800 },
  // SISTEMA 8025 LINEA 90
  'ENGANCHE-3-2':   { ref:'ALN 631',  Natural:150000, Champagne:154800, Anolock:153600, Blanco:153600, Negro:153000 },
  'TRASLAPE-3-2':   { ref:'ALN 633',  Natural:100200, Champagne:136800, Anolock:132600, Blanco:100200, Negro:92400  },
  'ADAPTADOR-3-2':  { ref:'ALN 827',  Natural:60000,  Champagne:null,   Anolock:64200,  Blanco:null,   Negro:null   },
  'HORIZONTAL SUP-3-2': { ref:'ALN 874', Natural:78000, Champagne:105000, Anolock:103800, Blanco:78000, Negro:104400 },
  'HORIZONTAL INF-3-2': { ref:'ALN 875', Natural:142800, Champagne:147600, Anolock:146400, Blanco:97200, Negro:100200 },
};

// Busca en catálogo: nombre perfil + id_perfil + id_sistema
// Fallback: solo nombre + id_perfil, luego solo nombre
const buscarCatalogo = (nombre, id_perfil, id_sistema) => {
  const n = nombre.trim().toUpperCase()
    .replace('HORIZONTAL SUPERIOR','HORIZONTAL SUP')
    .replace('HORIZONTAL INFERIOR','HORIZONTAL INF');
  return CATALOGO[`${n}-${id_perfil}-${id_sistema}`]
      || CATALOGO[`${n}-${id_perfil}-1`]
      || CATALOGO[`${n}-${id_perfil}-2`]
      || CATALOGO[`${n}-${id_perfil}-3`]
      || null;
};

const COLORES = ['Natural', 'Champagne', 'Anolock', 'Blanco', 'Negro'];
const COLOR_HEX  = { Natural:'#C9A96E', Champagne:'#F0D9A0', Anolock:'#8B9E7A', Blanco:'#E8E8E2', Negro:'#2C2C2C' };
const COLOR_TEXT = { Natural:'#5C3D11', Champagne:'#6B4C1A', Anolock:'#2D3B22', Blanco:'#3A3A3A', Negro:'#F5F5F5' };

const ColorBtn = ({ c, selected, onChange }) => (
  <button onClick={() => onChange(c)} style={{
    padding:'3px 10px', borderRadius:99, fontSize:'.7rem', fontWeight:700, cursor:'pointer',
    border: selected ? '2px solid var(--primary)' : '1.5px solid var(--border)',
    background: selected ? COLOR_HEX[c] : '#fff',
    color: selected ? COLOR_TEXT[c] : '#64748b',
    display:'flex', alignItems:'center', gap:4,
    boxShadow: selected ? 'var(--shadow-blue)' : 'none',
  }}>
    <span style={{ width:7, height:7, borderRadius:'50%', background:COLOR_HEX[c], border:'1px solid rgba(0,0,0,.15)', display:'inline-block' }}/>
    {c}
  </button>
);

const StatCard = ({ label, value, sub, color }) => (
  <div style={{ background:'rgba(255,255,255,.06)', borderRadius:10, padding:'10px 12px', borderTop:`2px solid ${color}` }}>
    <div style={{ fontSize:'.5rem', fontWeight:800, textTransform:'uppercase', letterSpacing:'.1em', color:'rgba(255,255,255,.35)', marginBottom:3 }}>{label}</div>
    <div style={{ fontWeight:900, fontSize:'.95rem', color, lineHeight:1 }}>{value}</div>
    {sub && <div style={{ fontSize:'.6rem', color:'rgba(255,255,255,.3)', marginTop:3 }}>{sub}</div>}
  </div>
);

// ─── Componente por ventana ───────────────────────────────────────────────────
function VentanaCotizacion({ ventana, idx, onUpdate }) {
  const [expanded,   setExpanded]   = useState(idx === 0);
  const [loading,    setLoading]    = useState(false);
  const [perfiles,   setPerfiles]   = useState(null); // [{nombre,ref,cantidad,color,cat,esPersonalizado}]
  const [vidrios,    setVidrios]    = useState(null);
  const [accesorios, setAccesorios] = useState(null);

  const cargarPiezas = async () => {
    setLoading(true);
    try {
      const { data } = await api.post('/ventanas/simular', { id_ventana: ventana.id_ventana });

      // Perfiles: agrupar por ubicacion+seccion, sumar piezas
      const grupoMap = {};
      for (const p of data.piezas.filter(x => !x.es_vidrio && !x.es_accesorio && x.resultado !== null)) {
        const key = `${p.ubicacion}||${p.seccion}`;
        if (!grupoMap[key]) grupoMap[key] = { nombre: p.ubicacion, seccion: p.seccion, cantidad: 0 };
        grupoMap[key].cantidad += p.cantidad;
      }

      const nuevosPerfiles = Object.values(grupoMap).map(g => {
        const cat = buscarCatalogo(g.nombre, ventana.id_perfil, ventana.id_sistema);
        return {
          nombre:          g.nombre,
          seccion:         g.seccion,
          ref:             cat?.ref || '',
          cantidad:        g.cantidad,
          color:           'Natural',
          cat:             cat || null,
          precio:          cat?.Natural ?? 0,
          esPersonalizado: false,
        };
      });

      setPerfiles(nuevosPerfiles);
      const vidriosReales = data.vidrios || [];
      const accesoriosReales = data.accesorios || [];
      setVidrios(vidriosReales);
      setAccesorios(accesoriosReales);
      // Notificar al padre con TODOS los datos cargados (no solo perfiles).
      // Sin esto, si el usuario no toca precios, accesorios y vidrios nunca
      // llegan a ventanasData → quedan vacíos en el PDF.
      notify(nuevosPerfiles, vidriosReales, accesoriosReales);
    } catch {
      toast.error('Error al cargar piezas de la ventana');
    } finally {
      setLoading(false);
    }
  };

  const notify = (perf, vid, acc) => onUpdate(idx, perf, vid||vidrios||[], acc||accesorios||[]);

  const handleExpand = () => {
    if (!perfiles && !loading) cargarPiezas();
    setExpanded(e => !e);
  };

  const updatePerfil = (i, changes) => {
    setPerfiles(prev => {
      const next = prev.map((f, x) => {
        if (x !== i) return f;
        const updated = { ...f, ...changes };
        // Si cambia el color y tiene catálogo, actualiza el precio
        if (changes.color !== undefined && !updated.esPersonalizado && updated.cat) {
          updated.precio = updated.cat[changes.color] ?? updated.cat.Natural ?? 0;
        }
        return updated;
      });
      notify(next);
      return next;
    });
  };

  const addPerfil = () => {
    const next = [...(perfiles||[]), {
      nombre:'Material adicional', seccion:'PERSONALIZADO', ref:'',
      cantidad:1, color:'Natural', cat:null, precio:0, esPersonalizado:true,
    }];
    setPerfiles(next);
    notify(next);
  };

  const removePerfil = (i) => {
    const next = (perfiles||[]).filter((_,x) => x !== i);
    setPerfiles(next);
    notify(next);
  };

  // ── Vidrios cobrados por m² (helper centralizado en glassMath.js) ──
  const glassSub  = (v) => calcGlass(v).subtotal;
  const glassArea = (v) => calcGlass(v).area_m2_total;

  const subtotalPerfiles   = (perfiles||[]).reduce((s,f) => s + f.cantidad*(f.precio||0), 0);
  const subtotalVidrios    = (vidrios||[]).reduce((s,v) => s + glassSub(v), 0);
  const subtotalAccesorios = (accesorios||[]).reduce((s,a) => s + accSubtotal(a), 0);
  const subtotalVentana    = subtotalPerfiles + subtotalVidrios + subtotalAccesorios;
  const subtotal = subtotalVentana;

  return (
    <div style={{ border:'1px solid var(--border)', borderRadius:12, overflow:'hidden', marginBottom:12, background:'var(--surface)' }}>

      {/* Header */}
      <div onClick={handleExpand} style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'10px 14px', cursor:'pointer',
        background: expanded ? 'linear-gradient(90deg,var(--steel-900),var(--steel-800))' : 'var(--bg-deep)',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{
            width:30, height:30, borderRadius:7, flexShrink:0,
            background: expanded ? 'var(--primary)' : 'var(--steel-100)',
            display:'flex', alignItems:'center', justifyContent:'center',
            fontWeight:900, fontSize:'.78rem', color: expanded ? '#fff' : 'var(--text-muted)',
          }}>V{idx+1}</div>
          <div>
            <div style={{ fontWeight:800, fontSize:'.85rem', color: expanded ? '#fff' : 'var(--text-primary)' }}>
              {ventana.sistema}
              {ventana.perfil && <span style={{ fontWeight:400, color: expanded ? 'rgba(255,255,255,.5)' : '#64748b' }}> · {ventana.perfil}</span>}
              {ventana.diseno && <span style={{ fontWeight:400, color: expanded ? 'rgba(255,255,255,.5)' : '#64748b' }}> · {ventana.diseno}</span>}
            </div>
            <div style={{ fontSize:'.68rem', color: expanded ? 'rgba(255,255,255,.4)' : 'var(--text-muted)', marginTop:1 }}>
              {fmtNumMedida(ventana.ancho_vano, ventana.ancho_unidad || 'cm')} × {fmtNumMedida(ventana.alto_vano, ventana.ancho_unidad || 'cm')} {unitLabel(ventana.ancho_unidad || 'cm')}
              {perfiles && subtotal > 0 && <span style={{ marginLeft:8, color: expanded ? '#93C5FD' : 'var(--primary)', fontWeight:700 }}>→ {fmt(subtotal)}</span>}
            </div>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {loading && <Loader size={13} color="rgba(255,255,255,.5)" />}
          {expanded ? <ChevronUp size={15} color="rgba(255,255,255,.5)" /> : <ChevronDown size={15} color="#64748b" />}
        </div>
      </div>

      {expanded && (
        <div style={{ padding:'14px 16px' }}>

          {/* Info ventana */}
          <div style={{ display:'flex', flexWrap:'wrap', gap:16, marginBottom:14, background:'var(--bg-deep)', borderRadius:8, padding:'10px 14px', border:'1px solid var(--border)' }}>
            {[
              ['Sistema',ventana.sistema],
              ['Perfil',ventana.perfil],
              ['Diseño',ventana.diseno],
              ['Vano',`${fmtNumMedida(ventana.ancho_vano, ventana.ancho_unidad || 'cm')} × ${fmtNumMedida(ventana.alto_vano, ventana.ancho_unidad || 'cm')} ${unitLabel(ventana.ancho_unidad || 'cm')}`],
            ].filter(([,v])=>v).map(([l,v])=>(
              <div key={l}>
                <div style={{ fontSize:'.48rem', fontWeight:800, textTransform:'uppercase', color:'#0369a1' }}>{l}</div>
                <div style={{ fontWeight:700, fontSize:'.82rem', color:'#0f172a', marginTop:1 }}>{v}</div>
              </div>
            ))}
          </div>

          {loading && (
            <div style={{ textAlign:'center', padding:'20px', color:'#64748b' }}>
              <Loader size={18} style={{ margin:'0 auto 8px', display:'block' }} /> Cargando piezas...
            </div>
          )}

          {perfiles && !loading && (
            <>
              {/* ── PERFILES ── */}
              <div style={{ fontSize:'.6rem', fontWeight:800, textTransform:'uppercase', color:'#0f172a', marginBottom:6 }}>🔩 Perfiles</div>
              <div style={{ borderRadius:8, overflow:'hidden', border:'1px solid var(--border)', marginBottom:14 }}>
                <div style={{ overflowX:'auto', WebkitOverflowScrolling:'touch' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'.78rem' }}>
                  <thead>
                    <tr style={{ background:'var(--steel-800)' }}>
                      {['Ref.','Perfil','Cant.','Color','Precio unit.','Subtotal',''].map(h => (
                        <th key={h} style={{ padding:'7px 9px', textAlign:'left', fontSize:'.46rem', fontWeight:800, textTransform:'uppercase', color:'rgba(255,255,255,.45)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {perfiles.map((f, i) => {
                      const sub = f.cantidad * f.precio;
                      const noDisp = !f.esPersonalizado && f.cat && f.cat[f.color] === null;
                      return (
                        <tr key={i} style={{ borderBottom:'1px solid #f1f5f9', background: noDisp ? 'var(--danger-light)' : i%2===0 ? 'var(--surface)' : 'var(--surface-2)' }}>
                          {/* REF */}
                          <td style={{ padding:'6px 9px', fontFamily:'var(--font-mono)', fontSize:'.7rem', color:'var(--primary)', fontWeight:700 }}>
                            {f.esPersonalizado
                              ? <input value={f.ref} onChange={e=>updatePerfil(i,{ref:e.target.value})}
                                  style={{ padding:'3px 6px', borderRadius:4, border:'1px solid var(--border)', fontSize:'.7rem', width:70 }}/>
                              : (f.ref || '—')}
                          </td>
                          {/* NOMBRE */}
                          <td style={{ padding:'6px 9px' }}>
                            {f.esPersonalizado
                              ? <input value={f.nombre} onChange={e=>updatePerfil(i,{nombre:e.target.value})}
                                  style={{ padding:'3px 6px', borderRadius:4, border:'1px solid var(--border)', fontSize:'.78rem', width:130 }}/>
                              : <div>
                                  <span style={{ fontWeight:700, color:'#0f172a' }}>{f.nombre}</span>
                                  <span style={{ marginLeft:6, fontSize:'.62rem', color:'#94a3b8' }}>{f.seccion}</span>
                                </div>}
                          </td>
                          {/* CANTIDAD */}
                          <td style={{ padding:'6px 9px' }}>
                            <input type="number" min="0" step="1" value={f.cantidad}
                              onChange={e=>updatePerfil(i,{cantidad:parseInt(e.target.value)||0})}
                              style={{ padding:'5px 7px', borderRadius:5, border:'1px solid var(--border)', fontSize:'.82rem', width:60, fontWeight:700, textAlign:'center' }}/>
                          </td>
                          {/* COLOR — selector individual por perfil */}
                          <td style={{ padding:'6px 9px' }}>
                            <div style={{ display:'flex', flexWrap:'wrap', gap:3 }}>
                              {COLORES.map(c => {
                                const noHay = f.cat && f.cat[c] === null;
                                return (
                                  <button key={c} onClick={()=>!noHay && updatePerfil(i,{color:c})}
                                    title={noHay ? `No disponible en ${c}` : c}
                                    style={{
                                      width:18, height:18, borderRadius:'50%', border: f.color===c ? '2.5px solid #b45309' : '1.5px solid #d1d5db',
                                      background: COLOR_HEX[c], cursor: noHay ? 'not-allowed' : 'pointer',
                                      opacity: noHay ? 0.25 : 1, flexShrink:0,
                                    }}/>
                                );
                              })}
                            </div>
                            <div style={{ fontSize:'.58rem', color: noDisp ? '#dc2626' : '#64748b', marginTop:2, fontWeight: noDisp ? 700 : 400 }}>
                              {noDisp ? `No hay en ${f.color}` : f.color}
                            </div>
                          </td>
                          {/* PRECIO */}
                          <td style={{ padding:'6px 9px' }}>
                            <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                              <input type="number" min="0" step="100" value={f.precio}
                                onChange={e=>updatePerfil(i,{precio:parseFloat(e.target.value)||0})}
                                style={{ padding:'5px 7px', borderRadius:5, border:'1px solid var(--border)', fontSize:'.78rem', width:95, fontWeight:600, textAlign:'right' }}/>
                              <Edit3 size={10} color="#94a3b8"/>
                            </div>
                          </td>
                          {/* SUBTOTAL */}
                          <td style={{ padding:'6px 9px', fontWeight:800, color: sub>0 ? 'var(--success)' : 'var(--text-muted)', fontSize:'.82rem', whiteSpace:'nowrap' }}>
                            {sub > 0 ? fmt(sub) : '—'}
                          </td>
                          {/* BORRAR */}
                          <td style={{ padding:'6px 9px' }}>
                            <button onClick={()=>removePerfil(i)} style={{ padding:'4px 6px', borderRadius:5, border:'1px solid #fee2e2', background:'#fef2f2', color:'#dc2626', cursor:'pointer', display:'flex', alignItems:'center' }}>
                              <Trash2 size={11}/>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </div>

              {/* ── VIDRIOS (tabla profesional con fórmulas visibles) ── */}
              {vidrios && vidrios.length > 0 && (
                <>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                    <div style={{ fontSize:'.6rem', fontWeight:800, textTransform:'uppercase', color:'#1d4ed8' }}>🪟 Vidrios</div>
                    <div style={{ fontSize:'.62rem', color:'#64748b', fontStyle:'italic' }}>
                      Fórmulas internas en cm · Medidas mostradas en {unitLabel(ventana.ancho_unidad || 'cm')} · Área en m² · Precio por m²
                    </div>
                  </div>

                  <div style={{ borderRadius:8, overflow:'hidden', border:'1px solid #bfdbfe', marginBottom:14 }}>
                    <div style={{ overflowX:'auto', WebkitOverflowScrolling:'touch' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'.74rem' }}>
                      <thead>
                        <tr style={{ background:'var(--steel-800)' }}>
                          {[
                            { l:'Tipo / Fórmulas',  a:'left'   },
                            { l:'Cant.',            a:'center' },
                            { l:`Ancho (${unitLabel(ventana.ancho_unidad || 'cm')})`, a:'right'  },
                            { l:`Alto (${unitLabel(ventana.ancho_unidad || 'cm')})`,  a:'right'  },
                            { l:'Área Unit. (m²)',  a:'right'  },
                            { l:'Área Total (m²)',  a:'right'  },
                            { l:'Precio m² (COP)',  a:'right'  },
                            { l:'Subtotal',         a:'right'  },
                          ].map(h => (
                            <th key={h.l} style={{ padding:'7px 9px', textAlign:h.a, fontSize:'.48rem', fontWeight:800, textTransform:'uppercase', color:'rgba(255,255,255,.5)', letterSpacing:'.06em' }}>{h.l}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {vidrios.map((v,i)=>{
                          const g = calcGlass(v);
                          const val = validateGlass(v);
                          const rowErr = !val.valid;
                          const u = ventana.ancho_unidad || 'cm';
                          return (
                            <tr key={i} style={{
                              borderBottom:'1px solid #e0f2fe',
                              background: rowErr ? '#fef2f2' : (i%2===0 ? 'var(--bg-deep)' : 'var(--surface)'),
                            }}>
                              {/* TIPO + FÓRMULAS */}
                              <td style={{ padding:'8px 9px' }}>
                                <div style={{ fontWeight:700, color:'#1e40af', marginBottom:3 }}>{v.ubicacion}</div>
                                {(v.formula_ancho || v.formula_alto) && (
                                  <div style={{ display:'flex', flexDirection:'column', gap:1, fontSize:'.64rem', color:'#64748b', fontFamily:'monospace' }}>
                                    {v.formula_ancho && <div>↔ Ancho: <span style={{ color:'#0f2942', fontWeight:700 }}>{v.formula_ancho}</span></div>}
                                    {v.formula_alto  && <div>↕ Alto:  <span style={{ color:'#0f2942', fontWeight:700 }}>{v.formula_alto}</span></div>}
                                  </div>
                                )}
                                <div style={{ marginTop:3, fontSize:'.64rem', color:'#94a3b8' }}>
                                  Ref. <span style={{ fontFamily:'monospace', color:'#475569', fontWeight:700 }}>{v.ref_vidrio||'5MM'}</span>
                                </div>
                              </td>

                              {/* CANT */}
                              <td style={{ padding:'8px 9px', textAlign:'center', fontWeight:800, fontSize:'.95rem', color:'#0f2942' }}>
                                {g.cantidad}
                              </td>

                              {/* ANCHO en la unidad de la ventana */}
                              <td style={{ padding:'8px 9px', textAlign:'right', fontWeight:800, color:'var(--primary)', fontVariantNumeric:'tabular-nums' }}>
                                {fmtNumMedida(g.ancho_cm, u)}
                              </td>

                              {/* ALTO en la unidad de la ventana */}
                              <td style={{ padding:'8px 9px', textAlign:'right', fontWeight:800, color:'var(--primary)', fontVariantNumeric:'tabular-nums' }}>
                                {fmtNumMedida(g.alto_cm, u)}
                              </td>

                              {/* ÁREA UNIT m² */}
                              <td style={{ padding:'8px 9px', textAlign:'right', fontWeight:700, color:'#0369a1', fontVariantNumeric:'tabular-nums', fontSize:'.78rem' }}>
                                {fmtNumGlass(g.area_m2_unit, 4)}
                              </td>

                              {/* ÁREA TOTAL m² */}
                              <td style={{ padding:'8px 9px', textAlign:'right', fontWeight:800, color:'#0369a1', fontVariantNumeric:'tabular-nums', fontSize:'.84rem' }}>
                                {fmtNumGlass(g.area_m2_total, 4)}
                              </td>

                              {/* PRECIO m² (input) */}
                              <td style={{ padding:'8px 9px', textAlign:'right' }}>
                                <input type="number" min="0" step="1000" value={v.precio||0}
                                  onChange={e=>{
                                    const next=[...vidrios];
                                    next[i]={...next[i],precio:parseFloat(e.target.value)||0};
                                    setVidrios(next);
                                    notify(perfiles, next, accesorios);
                                  }}
                                  style={{ padding:'5px 8px', borderRadius:5, border:'1.5px solid #bfdbfe', fontSize:'.78rem', width:110, fontWeight:700, textAlign:'right', fontVariantNumeric:'tabular-nums' }}/>
                              </td>

                              {/* SUBTOTAL */}
                              <td style={{ padding:'8px 9px', textAlign:'right', fontWeight:900, color:g.subtotal>0?'var(--success)':'var(--text-muted)', whiteSpace:'nowrap', fontSize:'.84rem' }}>
                                {g.subtotal>0 ? fmtCOPGlass(g.subtotal) : '—'}
                              </td>
                            </tr>
                          );
                        })}

                        {/* FILA TOTAL VIDRIOS */}
                        <tr style={{ background:'linear-gradient(135deg, #0f2942, #1e3a5f)' }}>
                          <td colSpan={5} style={{ padding:'8px 9px', color:'#fff', fontWeight:700, fontSize:'.74rem', textTransform:'uppercase', letterSpacing:'.08em' }}>
                            Total m² de vidrio
                          </td>
                          <td style={{ padding:'8px 9px', textAlign:'right', color:'#34d399', fontWeight:900, fontVariantNumeric:'tabular-nums', fontSize:'.86rem' }}>
                            {fmtNumGlass(vidrios.reduce((s,v)=>s+calcGlass(v).area_m2_total,0), 4)}
                          </td>
                          <td style={{ padding:'8px 9px', textAlign:'right', color:'#cbd5e1', fontSize:'.66rem', textTransform:'uppercase', letterSpacing:'.05em' }}>
                            Subtotal vidrios →
                          </td>
                          <td style={{ padding:'8px 9px', textAlign:'right', color:'#34d399', fontWeight:900, fontSize:'.92rem' }}>
                            {fmtCOPGlass(vidrios.reduce((s,v)=>s+calcGlass(v).subtotal,0))}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    </div>
                  </div>

                  {/* MENSAJES DE VALIDACIÓN */}
                  {vidrios.some(v => !validateGlass(v).valid) && (
                    <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:6, padding:'8px 12px', marginTop:-10, marginBottom:14, fontSize:'.72rem', color:'#991b1b' }}>
                      <strong>⚠ Atención:</strong> Algunas piezas de vidrio tienen valores inválidos. Revisa medidas y cantidades.
                    </div>
                  )}
                </>
              )}

              {/* ── ACCESORIOS ── */}
              {accesorios && accesorios.length > 0 && (
                <>
                  <div style={{ fontSize:'.6rem', fontWeight:800, textTransform:'uppercase', color:'#059669', marginBottom:6 }}>🔧 Accesorios</div>
                  <div style={{ borderRadius:8, overflow:'hidden', border:'1px solid #bbf7d0', marginBottom:14 }}>
                    <div style={{ overflowX:'auto', WebkitOverflowScrolling:'touch' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'.78rem' }}>
                      <thead>
                        <tr style={{ background:'var(--steel-800)' }}>
                          {['Accesorio','Cant.','Unidad','Precio unit. (COP)','Subtotal'].map(h=>(
                            <th key={h} style={{ padding:'6px 9px', textAlign:'left', fontSize:'.46rem', fontWeight:800, textTransform:'uppercase', color:'rgba(255,255,255,.5)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {accesorios.map((a,i)=>(
                          <tr key={i} style={{ borderBottom:'1px solid #dcfce7', background: i%2===0 ? 'var(--bg-deep)' : 'var(--surface)' }}>
                            <td style={{ padding:'6px 9px', fontWeight:700, color:'#14532d' }}>{a.descripcion}</td>
                            <td style={{ padding:'6px 9px', textAlign:'center', fontWeight:800 }}>{esAccLongitud(a) ? fmtNumGlass(accCantidadCobro(a)) : a.cantidad}</td>
                            <td style={{ padding:'6px 9px', color:'#64748b', fontSize:'.72rem' }}>{accUnidadCobro(a)}</td>
                            <td style={{ padding:'6px 9px' }}>
                              <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                                <input type="number" min="0" step="100" value={a.precio||0}
                                  onChange={e=>{
                                    const next=[...accesorios];
                                    next[i]={...next[i],precio:parseFloat(e.target.value)||0};
                                    setAccesorios(next);
                                    notify(perfiles, vidrios, next);
                                  }}
                                  style={{ padding:'4px 7px', borderRadius:5, border:'1.5px solid #bbf7d0', fontSize:'.78rem', width:95, fontWeight:600, textAlign:'right' }}/>
                                <Edit3 size={10} color="#94a3b8"/>
                              </div>
                            </td>
                            <td style={{ padding:'6px 9px', fontWeight:800, color:(a.precio||0)>0?'var(--success)':'var(--text-muted)', whiteSpace:'nowrap' }}>
                              {(a.precio||0)>0 ? fmt(accSubtotal(a)) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  </div>
                </>
              )}

              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <button onClick={addPerfil} style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 13px', borderRadius:7, border:'1.5px dashed var(--border-strong)', background:'var(--surface)', color:'var(--text-secondary)', fontWeight:600, fontSize:'.75rem', cursor:'pointer' }}>
                  <Plus size={12}/> Agregar perfil manual
                </button>
                <div style={{ fontWeight:800, fontSize:'.9rem', color: subtotal>0 ? 'var(--primary)' : 'var(--text-muted)' }}>
                  Subtotal V{idx+1}: {fmt(subtotal)}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Modal principal ──────────────────────────────────────────────────────────
export default function CotizacionModal({
  idProyecto, nombreProyecto, nombreCliente,
  fechaInicio, fechaFin, ventanas = [],
  onClose, onSaved,
}) {
  const [step,        setStep]        = useState(1);
  const [ventanasData,setVentanasData]= useState({});
  const [resultado,   setResultado]   = useState(null);
  const [loading,     setLoading]     = useState(false);

  // Responsive: en celular las rejillas de 4/3 columnas se apilan a 2/1.
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 700);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 700);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const calcDias = (a,b) => (!a||!b) ? 1 : Math.max(1, Math.round((new Date(b)-new Date(a))/86400000));

  const [form, setForm] = useState({
    cantidad_personas:              1,
    transporte_estructuras:         '',
    transporte_personal:            '',
    instalacion:                    '',
    valor_diario_mano_obra_oficial: '',
    mano_obra_pct_adicional:        50,
    dias_proyectados:               calcDias(fechaInicio, fechaFin),
    recargo_materiales_pct:         25,
    utilidad_pct:                   30,
    iva_pct:                        19,
    notas:                          '',
  });
  const setF = (k,v) => setForm(f=>({...f,[k]:v}));

  const handleVentanaUpdate = (idx, perfiles, vidrios, accesorios) => {
    setVentanasData(prev => ({ ...prev, [idx]: { perfiles, vidrios: vidrios||[], accesorios: accesorios||[] } }));
  };

  // Vidrios cobrados por m² (centralizado, mismo cálculo que en VentanaCotizacion)
  const glassSub  = (v) => calcGlass(v).subtotal;
  const glassArea = (v) => calcGlass(v).area_m2_total;

  // Totales
  const subtotalPorVentana = ventanas.map((_,i) => {
    const d = ventanasData[i];
    if (!d) return 0;
    const sp = (d.perfiles||[]).reduce((s,f) => s + f.cantidad*(f.precio||0), 0);
    const sv = (d.vidrios||[]).reduce((s,v) => s + glassSub(v), 0);
    const sa = (d.accesorios||[]).reduce((s,a) => s + accSubtotal(a), 0);
    return sp + sv + sa;
  });
  const subtotalMat = subtotalPorVentana.reduce((a,b) => a+b, 0);
  const rmPct      = parseFloat(form.recargo_materiales_pct||0);
  const conRecargo = subtotalMat * (1 + rmPct/100);
  const vd         = parseFloat(form.valor_diario_mano_obra_oficial||0);
  const moPct      = parseFloat(form.mano_obra_pct_adicional||0);
  const personas   = Math.max(1, parseInt(form.cantidad_personas||1));
  const dias       = parseInt(form.dias_proyectados||0);
  const subtotalMO = vd * (1 + moPct/100) * dias * personas;
  const transpEst  = parseFloat(form.transporte_estructuras||0);
  const transpPers = parseFloat(form.transporte_personal||0);
  const instalacionVal = parseFloat(form.instalacion||0);
  const base       = conRecargo + subtotalMO + transpEst + transpPers;
  const utilidad   = pct(base, parseFloat(form.utilidad_pct||0));
  const iva        = pct(base + utilidad, parseFloat(form.iva_pct||0));
  const total      = base + utilidad + iva;

  const handleGenerar = async () => {
    setLoading(true);
    try {
      const materiales = [];
      ventanas.forEach((v,i) => {
        const d = ventanasData[i] || {};
        (d.perfiles||[]).forEach(f => {
          if (f.cantidad > 0) materiales.push({
            id_material:null, nombre:`[V${i+1}] ${f.nombre}`,
            cantidad_m:f.cantidad, precio_unitario:f.precio||0,
            color_perfil:f.color, id_ventana_idx:i, tipo_item:'perfil',
          });
        });
        (d.vidrios||[]).forEach(v => {
          // Guardar TODOS los vidrios (con o sin precio) para que aparezcan en el PDF.
          // calcGlass es la ÚNICA fuente de verdad: area_m2_total = (a_cm*h_cm/10000)*cant
          if ((v.cantidad||0) > 0) {
            const g = calcGlass(v);
            materiales.push({
              id_material:null, nombre:`[V${i+1}] ${v.ubicacion} (vidrio)`,
              cantidad_m: g.area_m2_total,       // m² totales (ya con cantidad)
              precio_unitario: g.precio_m2,      // COP por m² (puede ser 0)
              color_perfil:null, id_ventana_idx:i, tipo_item:'vidrio',
            });
          }
        });
        (d.accesorios||[]).forEach(a => {
          // Guardar TODOS los accesorios (con o sin precio) para que aparezcan en el PDF
          if ((a.cantidad||0) > 0) materiales.push({
            id_material:null, nombre:`[V${i+1}] ${a.descripcion} (accesorio)`,
            cantidad_m:a.cantidad, precio_unitario:a.precio||0,
            color_perfil:null, id_ventana_idx:i, tipo_item:'accesorio',
          });
        });
      });
      const { data } = await api.post(`/cotizaciones/proyecto/${idProyecto}`, {
        ...form,
        materiales_override:    materiales,
        transporte_estructuras: transpEst,
        transporte_personal:    transpPers,
        cantidad_personas:      personas,
      });
      setResultado(data);
      setStep(3);
    } catch(e) {
      const data = e.response?.data;
      const msg = data?.detalle
        ? `${data.error}: ${data.detalle}`
        : (data?.error || 'Error al generar cotización');
      toast.error(msg, { duration: 8000 });
      console.error('[Cotización error]', data);
    } finally {
      setLoading(false);
    }
  };

  const [generatingPDF, setGeneratingPDF] = useState(false);

  const handlePDF = async () => {
    if (!resultado?.id_cotizacion) return;
    setGeneratingPDF(true);
    try {
      const res = await api.get(`/cotizaciones/${resultado.id_cotizacion}/pdf`, {
        responseType: 'blob',
        // Aceptar todos los 2xx Y 4xx/5xx para poder leer el error del cuerpo
        validateStatus: (s) => s >= 200 && s < 600,
      });

      // Si el servidor respondió error (4xx/5xx), el blob trae JSON con el mensaje
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

      // Validar que el blob ES realmente un PDF (magic bytes "%PDF-")
      const ct = res.headers?.['content-type'] || res.data.type || '';
      const head = await res.data.slice(0, 5).text();
      if (!head.startsWith('%PDF-')) {
        console.error('[handlePDF] respuesta no es PDF. content-type=', ct, 'head=', head);
        let mensaje = 'El servidor no devolvió un PDF válido';
        try {
          const text = await res.data.text();
          // intentar parsear como JSON de error
          try {
            const j = JSON.parse(text);
            mensaje = j.error + (j.detalle ? `: ${j.detalle}` : '');
          } catch {
            // No es JSON: mostrar primeros chars del texto plano
            mensaje += ` (respuesta inesperada: "${text.slice(0, 200)}")`;
          }
        } catch {}
        toast.error(mensaje, { duration: 10000 });
        return;
      }

      // OK: descargar
      const cotNum = String(resultado.id_cotizacion).padStart(4, '0');
      const filename = `COT-${new Date().getFullYear()}-${cotNum}.pdf`;
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success('PDF generado correctamente');
    } catch (err) {
      console.error('[handlePDF] excepción:', err);
      toast.error('Error al generar el PDF: ' + (err.message || 'desconocido'));
    } finally {
      setGeneratingPDF(false);
    }
  };


  const S = { padding:'8px 18px', borderRadius:8, border:'none', fontWeight:800, fontSize:'.82rem', cursor:'pointer', display:'flex', alignItems:'center', gap:6 };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{
        maxWidth:980, width:'98vw', maxHeight:'95vh',
        display:'flex', flexDirection:'column', overflow:'hidden',
        borderRadius:16, boxShadow:'0 24px 64px rgba(0,0,0,.45)',
      }}>

        {/* Header */}
        <div style={{ background:'linear-gradient(135deg,var(--steel-900),var(--steel-800))', padding:'18px 22px', flexShrink:0, display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid rgba(255,255,255,.07)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:36, height:36, background:'linear-gradient(135deg,var(--steel-800),var(--steel-700))', borderRadius:9, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <DollarSign size={18} color="#fff"/>
            </div>
            <div>
              <div style={{ fontWeight:900, fontSize:'.98rem', color:'#fff', lineHeight:1 }}>
                {step===1?'Nueva Cotización':step===2?`Materiales — ${ventanas.length} ventana${ventanas.length!==1?'s':''}`:`Cotización v${resultado?.version}`}
              </div>
              <div style={{ fontSize:'.68rem', color:'rgba(255,255,255,.4)', marginTop:2 }}>
                {nombreProyecto}{nombreCliente&&` · ${nombreCliente}`}
              </div>
            </div>
          </div>
          <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:10 }}>
            <button onClick={onClose} style={{ background:'rgba(255,255,255,.08)', color:'rgba(255,255,255,.6)', border:'1px solid rgba(255,255,255,.12)', borderRadius:8, padding:'6px 8px', cursor:'pointer', display:'flex', alignItems:'center' }}>
              <X size={15}/>
            </button>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              {STEPS.map((l,i)=>(
                <div key={i} style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                    <div style={{ width:22, height:22, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', background: step>i+1?'var(--success)':step===i+1?'var(--primary)':'rgba(255,255,255,.1)', fontSize:'.6rem', fontWeight:900, color:'rgba(255,255,255,.8)' }}>
                      {step>i+1?<CheckCircle size={11}/>:i+1}
                    </div>
                    {!isMobile && (
                      <span style={{ fontSize:'.52rem', fontWeight:700, color:step===i+1?'rgba(255,255,255,.9)':'rgba(255,255,255,.3)', textTransform:'uppercase', letterSpacing:'.06em' }}>{l}</span>
                    )}
                  </div>
                  {i<STEPS.length-1&&<div style={{ width:14, height:1, background:'rgba(255,255,255,.12)' }}/>}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex:1, overflowY:'auto', background:'var(--bg)', padding:'20px 22px' }}>

          {/* STEP 1 — Parámetros */}
          {step===1 && (
            <div>
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden', marginBottom:14 }}>
                <div style={{ background:'linear-gradient(90deg,var(--steel-800),var(--steel-700))', padding:'10px 14px', display:'flex', alignItems:'center', gap:8 }}>
                  <Users size={13} color="rgba(255,255,255,.6)"/>
                  <span style={{ fontSize:'.58rem', fontWeight:800, textTransform:'uppercase', color:'rgba(255,255,255,.7)' }}>Personal y Transporte</span>
                </div>
                <div style={{ padding:'14px 16px', display:'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap:14 }}>
                  {[
                    {key:'cantidad_personas',      Icon:Users,  label:'Personas en el proyecto',            ph:'1',          hint:'Número de trabajadores'},
                    {key:'transporte_estructuras', Icon:Truck,  label:'Transporte estructuras (COP)',        ph:'Ej: 150000', hint:'Flete de perfiles y vidrios'},
                    {key:'transporte_personal',    Icon:Wrench, label:'Transporte personal / herramientas', ph:'Ej: 80000',  hint:'Movilización del equipo'},
                    {key:'instalacion',            Icon:Package,label:'Instalación (COP)',                  ph:'Ej: 300000', hint:'Valor cobrado por instalación'},
                  ].map(({key,Icon,label,ph,hint})=>(
                    <div key={key} style={{ display:'flex', flexDirection:'column', gap:4 }}>
                      <label style={{ fontSize:'.58rem', fontWeight:800, textTransform:'uppercase', color:'#475569', display:'flex', alignItems:'center', gap:5 }}>
                        <Icon size={10}/> {label}
                      </label>
                      <input type="number" placeholder={ph} value={form[key]} onChange={e=>setF(key,e.target.value)}
                        style={{ padding:'9px 12px', borderRadius:8, border:'1px solid var(--border)', fontSize:'.9rem', fontWeight:600, outline:'none', background:'var(--bg)' }}
                        onFocus={e=>e.target.style.borderColor='var(--primary)'} onBlur={e=>e.target.style.borderColor='var(--border)'}/>
                      <span style={{ fontSize:'.55rem', color:'#94a3b8' }}>{hint}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden', marginBottom:14 }}>
                <div style={{ background:'linear-gradient(90deg,var(--steel-800),var(--steel-700))', padding:'10px 14px', display:'flex', alignItems:'center', gap:8 }}>
                  <Package size={13} color="rgba(255,255,255,.6)"/>
                  <span style={{ fontSize:'.58rem', fontWeight:800, textTransform:'uppercase', color:'rgba(255,255,255,.7)' }}>Mano de Obra y Financiero</span>
                </div>
                <div style={{ padding:'14px 16px', display:'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3,1fr)', gap:14 }}>
                  {[
                    {key:'valor_diario_mano_obra_oficial', label:'Valor diario M.O. Oficial (COP) *', ph:'Ej: 98000'},
                    {key:'mano_obra_pct_adicional',        label:'Incremento mano de obra (%)',       ph:'50'},
                    {key:'dias_proyectados',               label:'Días proyectados',                  ph:'1', badge: fechaInicio&&fechaFin?'📅 auto':null},
                    {key:'recargo_materiales_pct',         label:'Recargo materiales (%)',            ph:'25'},
                    {key:'utilidad_pct',                   label:'Utilidad (%)',                      ph:'30'},
                    {key:'iva_pct',                        label:'IVA (%)',                           ph:'19'},
                  ].map(({key,label,ph,badge})=>(
                    <div key={key} style={{ display:'flex', flexDirection:'column', gap:4 }}>
                      <label style={{ fontSize:'.58rem', fontWeight:800, textTransform:'uppercase', color:'#475569', display:'flex', alignItems:'center', gap:6 }}>
                        {label}
                        {badge&&<span style={{ background:'var(--info-light)', color:'var(--primary)', padding:'1px 6px', borderRadius:4, fontSize:'.52rem', fontWeight:800 }}>{badge}</span>}
                      </label>
                      <input type="number" placeholder={ph} value={form[key]} onChange={e=>setF(key,e.target.value)}
                        style={{ padding:'9px 12px', borderRadius:8, border:'1px solid var(--border)', fontSize:'.9rem', fontWeight:600, outline:'none', background:'var(--bg)' }}
                        onFocus={e=>e.target.style.borderColor='var(--primary)'} onBlur={e=>e.target.style.borderColor='var(--border)'}/>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display:'flex', flexDirection:'column', gap:5, marginBottom:14 }}>
                <label style={{ fontSize:'.58rem', fontWeight:800, textTransform:'uppercase', color:'#475569' }}>Notas (opcional)</label>
                <textarea rows={2} value={form.notas} onChange={e=>setF('notas',e.target.value)}
                  placeholder="Observaciones, condiciones, garantías..."
                  style={{ padding:'9px 12px', borderRadius:8, border:'1px solid var(--border)', fontSize:'.88rem', outline:'none', resize:'vertical', fontFamily:'inherit', background:'var(--bg)' }}/>
              </div>

              {vd>0&&(
                <div style={{ background:'linear-gradient(135deg,var(--steel-900),var(--steel-800))', borderRadius:12, padding:'14px 16px' }}>
                  <div style={{ fontSize:'.55rem', fontWeight:800, textTransform:'uppercase', color:'rgba(255,255,255,.35)', marginBottom:10 }}>Vista previa</div>
                  <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap:8 }}>
                    <StatCard label="M. de obra"   value={fmt(subtotalMO)}             sub={`${dias}d · ${personas}p`} color="#60a5fa"/>
                    <StatCard label="Transporte"   value={fmt(transpEst+transpPers)}   sub="est. + personal"            color="#a78bfa"/>
                    <StatCard label="Instalación"  value={instalacionVal>0?fmt(instalacionVal):'—'} sub="aparte"        color="#fbbf24"/>
                    <StatCard label="Total est."   value={fmt(total)}                   sub="IVA incluido"               color="#fb923c"/>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 2 — Materiales */}
          {step===2 && (
            <div>
              <div style={{ marginBottom:14 }}>
                <div style={{ fontWeight:800, fontSize:'.9rem', color:'#0f172a' }}>Materiales por ventana</div>
                <div style={{ fontSize:'.72rem', color:'#64748b', marginTop:2 }}>
                  Cada ventana carga sus perfiles automáticamente. Elige el color de cada perfil individualmente.
                </div>
              </div>

              {ventanas.length===0 ? (
                <div style={{ background:'var(--surface)', border:'1.5px dashed var(--border)', borderRadius:12, padding:'40px', textAlign:'center', color:'#94a3b8' }}>
                  <Package size={36} style={{ margin:'0 auto 12px', display:'block', opacity:0.35 }}/>
                  <div style={{ fontWeight:700 }}>No hay ventanas en este proyecto.</div>
                </div>
              ) : ventanas.map((v,i) => (
                <VentanaCotizacion key={v.id_ventana||i} ventana={v} idx={i} onUpdate={handleVentanaUpdate}/>
              ))}

              {ventanas.length>0&&(
                <div style={{ background:'linear-gradient(135deg,var(--steel-900),var(--steel-800))', borderRadius:12, padding:'16px 18px', marginTop:8 }}>
                  <div style={{ fontSize:'.55rem', fontWeight:800, textTransform:'uppercase', color:'rgba(255,255,255,.35)', marginBottom:10 }}>Resumen</div>
                  <div style={{ marginBottom:10, borderBottom:'1px solid rgba(255,255,255,.08)', paddingBottom:10 }}>
                    {ventanas.map((_,i)=>(
                      <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:'.76rem', marginBottom:4 }}>
                        <span style={{ color:'rgba(255,255,255,.45)' }}>V{i+1} — {ventanas[i].sistema}</span>
                        <span style={{ fontWeight:700, color: subtotalPorVentana[i]>0?'#fb923c':'rgba(255,255,255,.2)' }}>{fmt(subtotalPorVentana[i])}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:'5px 24px' }}>
                    {[
                      ['Subtotal materiales', fmt(subtotalMat), 'rgba(255,255,255,.5)'],
                      [`Recargo (${form.recargo_materiales_pct}%)`, fmt(conRecargo-subtotalMat), 'rgba(255,255,255,.5)'],
                      ['Mat. c/recargo', fmt(conRecargo), '#fff'],
                      [`M.O. (${dias}d · ${personas}p)`, fmt(subtotalMO), '#60a5fa'],
                      transpEst>0  ? ['Transp. estructuras', fmt(transpEst),  '#a78bfa'] : null,
                      transpPers>0 ? ['Transp. personal',    fmt(transpPers), '#a78bfa'] : null,
                      instalacionVal>0 ? ['Instalación', fmt(instalacionVal), '#fbbf24'] : null,
                      [`Utilidad (${form.utilidad_pct}%)`, fmt(utilidad), '#4ade80'],
                      [`IVA (${form.iva_pct}%)`, fmt(iva), '#fbbf24'],
                    ].filter(Boolean).map(([l,v,c])=>(
                      <div key={l} style={{ display:'flex', justifyContent:'space-between', fontSize:'.78rem' }}>
                        <span style={{ color:'rgba(255,255,255,.4)' }}>{l}</span>
                        <span style={{ fontWeight:700, color:c }}>{v}</span>
                      </div>
                    ))}
                    <div style={{ gridColumn:'1/-1', borderTop:'1px solid rgba(255,255,255,.12)', paddingTop:10, marginTop:6, display:'flex', justifyContent:'space-between' }}>
                      <span style={{ fontWeight:800, fontSize:'.9rem', color:'#fff' }}>TOTAL FINAL</span>
                      <span style={{ fontWeight:900, fontSize:'1.3rem', color:'#93C5FD' }}>{fmt(total)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 3 — Resultado */}
          {step===3&&resultado&&(
            <div>
              <div style={{ background:'linear-gradient(135deg,var(--steel-900),var(--steel-800))', borderRadius:14, padding:'20px 22px', marginBottom:16 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
                  <div>
                    <div style={{ fontSize:'.58rem', fontWeight:800, textTransform:'uppercase', color:'rgba(255,255,255,.35)', marginBottom:4 }}>
                      Cotización #{resultado.id_cotizacion} · v{resultado.version}
                    </div>
                    <div style={{ fontSize:'2.4rem', fontWeight:900, color:'#93C5FD', lineHeight:1 }}>{fmt(resultado.total_final||total)}</div>
                    <div style={{ fontSize:'.72rem', color:'rgba(255,255,255,.35)', marginTop:6 }}>{nombreProyecto} · {ventanas.length} ventanas</div>
                  </div>
                  <div style={{ background:'var(--success-light)', color:'var(--success)', padding:'5px 14px', borderRadius:99, fontSize:'.72rem', fontWeight:800, display:'flex', alignItems:'center', gap:6 }}>
                    <CheckCircle size={12}/> Guardada
                  </div>
                </div>
                <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap:8 }}>
                  <StatCard label="Materiales" value={fmt(conRecargo)}             color="#94a3b8"/>
                  <StatCard label="M. de Obra" value={fmt(subtotalMO)}             color="#60a5fa"/>
                  <StatCard label="Transporte" value={fmt(transpEst+transpPers)}   color="#a78bfa"/>
                  <StatCard label="Utilidad"   value={fmt(utilidad)}               color="#4ade80"/>
                </div>
              </div>

              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
                <div style={{ background:'var(--bg-deep)', padding:'9px 14px', borderBottom:'1px solid #e2e8f0', fontSize:'.58rem', fontWeight:800, textTransform:'uppercase', color:'#64748b' }}>Desglose financiero</div>
                {[
                  ['Subtotal materiales',         fmt(subtotalMat),              false,'#64748b'],
                  [`Recargo (${form.recargo_materiales_pct}%)`, fmt(conRecargo-subtotalMat), false,'#64748b'],
                  ['Subtotal c/recargo',           fmt(conRecargo),               true, '#0f172a'],
                  [`M. de Obra (${dias}d·${personas}p)`, fmt(subtotalMO),        false,'#1d4ed8'],
                  transpEst>0  ? ['Transporte estructuras',    fmt(transpEst),  false,'#7c3aed'] : null,
                  transpPers>0 ? ['Transporte personal',       fmt(transpPers), false,'#7c3aed'] : null,
                  instalacionVal>0 ? [`Instalación`,           fmt(instalacionVal), false,'#b45309'] : null,
                  [`Utilidad (${form.utilidad_pct}%)`, fmt(utilidad),           false,'#059669'],
                  [`IVA (${form.iva_pct}%)`,          fmt(iva),                 false,'#d97706'],
                ].filter(Boolean).map(([l,v,bold,c],i)=>(
                  <div key={i} style={{ padding:'9px 14px', borderBottom:'1px solid #f1f5f9', display:'flex', justifyContent:'space-between', background:bold?'var(--bg-deep)':'var(--surface)' }}>
                    <span style={{ fontSize:'.82rem', color:bold?'#0f172a':'#64748b', fontWeight:bold?800:500 }}>{l}</span>
                    <span style={{ fontWeight:bold?900:700, fontSize:bold?'.9rem':'.82rem', color:c }}>{v}</span>
                  </div>
                ))}
                <div style={{ padding:'12px 14px', background:'var(--steel-900)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontWeight:900, fontSize:'1rem', color:'#fff' }}>TOTAL FINAL</span>
                  <span style={{ fontWeight:900, fontSize:'1.3rem', color:'#93C5FD' }}>{fmt(resultado.total_final||total)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ background:'var(--surface)', borderTop:'1px solid var(--border)', padding:'11px 20px', flexShrink:0, display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
          <button onClick={onClose} style={{...S, background:'var(--surface)', border:'1px solid var(--border)', color:'var(--text-secondary)'}}>Cerrar</button>
          <div style={{ display:'flex', gap:8 }}>
            {step===2&&<button onClick={()=>setStep(1)} style={{...S, background:'var(--surface)', border:'1px solid var(--border)', color:'var(--text-secondary)'}}><ChevronLeft size={14}/> Atrás</button>}
            {step===3&&<button onClick={handlePDF} disabled={generatingPDF} style={{...S, background:'var(--bg)', border:'1.5px solid var(--border-strong)', color:'var(--text-secondary)', opacity:generatingPDF?.6:1}}>{generatingPDF ? <><Loader size={14} className="spin"/> Generando…</> : <><FileDown size={14}/> Descargar PDF</>}</button>}
            {step===3&&<button onClick={onSaved} style={{...S, background:'linear-gradient(135deg,var(--success),#0e6b40)', color:'#fff'}}><CheckCircle size={14}/> Ver Cotizaciones</button>}
            {step===2&&<button onClick={handleGenerar} disabled={loading} style={{...S, background:'linear-gradient(135deg,var(--steel-800),var(--steel-700))', color:'#fff', opacity:loading?.6:1}}>
              {loading?<><Loader size={14}/> Guardando...</>:<><DollarSign size={14}/> Guardar Cotización</>}
            </button>}
            {step===1&&<button onClick={()=>{ if(!form.valor_diario_mano_obra_oficial) return toast.error('Ingrese el valor diario de mano de obra'); setStep(2); }}
              style={{...S, background:'linear-gradient(135deg,var(--primary),var(--primary-dark))', color:'#fff'}}>
              <ChevronRight size={14}/> Cotizar Materiales
            </button>}
          </div>
        </div>
      </div>
    </div>
  );
}
