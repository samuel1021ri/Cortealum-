import { useEffect, useState, useRef } from 'react';
import api from '../api/client';
import toast from 'react-hot-toast';
import { Plus, Edit, Trash2, Package, X, Search, AlertTriangle, TrendingDown, ArrowUpDown, History, Upload, Image as ImageIcon, Camera } from 'lucide-react';
import { useConfirmDelete } from '../hooks/useConfirmDelete';

// `descripcion` e `imagen_url` agregados — el material ahora tiene descripción
// libre y una foto de referencia subida por el usuario.
const empty = { nombre_material:'', unidad_medida:'ml', proveedor:'', stock_disponible:0, stock_minimo:0, costo_unitario:'', descripcion:'', imagen_url:'' };
const UNITS = ['ml','m','cm','un','kg','lt','par','gl'];
const fmt = n => new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(n||0);
const fmtDate = d => d ? new Date(d).toLocaleString('es-CO',{dateStyle:'short',timeStyle:'short'}) : '—';

// Para mostrar imagen: en dev el backend está en :3001 o :5000, las URLs vienen
// como '/uploads/materiales/X.jpg'. Construimos la URL absoluta usando el base
// del API client (sin '/api' al final).
const API_BASE = (api.defaults.baseURL || '').replace(/\/api\/?$/, '');
const imgUrl = (relPath) => relPath ? (API_BASE + relPath) : '';

export default function Materiales() {
  const [mats,        setMats]        = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [modal,       setModal]       = useState(null);
  const [ajusteModal, setAjusteModal] = useState(null);
  const [histModal,   setHistModal]   = useState(null);
  const [historial,   setHistorial]   = useState([]);
  const [histLoading, setHistLoading] = useState(false);
  const [ajuste,      setAjuste]      = useState({ cantidad:'', motivo:'' });
  const [form,        setForm]        = useState(empty);
  const [search,      setSearch]      = useState('');
  const [filter,      setFilter]      = useState('todos');
  const [uploadingImg, setUploadingImg] = useState(false);
  const fileInputRef = useRef(null);

  const load = async () => {
    try { const { data } = await api.get('/materiales'); setMats(data); }
    catch { toast.error('Error al cargar'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openCrear  = () => { setForm(empty); setModal('crear'); };
  const openEditar = (m) => {
    setForm({
      nombre_material:  m.nombre_material,
      unidad_medida:    m.unidad_medida || 'ml',
      proveedor:        m.proveedor || '',
      stock_disponible: m.stock_disponible || 0,
      stock_minimo:     m.stock_minimo || 0,
      costo_unitario:   m.costo_unitario,
      descripcion:      m.descripcion || '',
      imagen_url:       m.imagen_url || '',
    });
    setModal(m);
  };
  const openAjuste = (m) => { setAjuste({ cantidad:'', motivo:'' }); setAjusteModal(m); };
  const openHistorial = async (m) => {
    setHistModal(m); setHistLoading(true); setHistorial([]);
    try { const { data } = await api.get(`/materiales/${m.id_material}/historial-stock`); setHistorial(data); }
    catch { toast.error('Error al cargar historial'); }
    finally { setHistLoading(false); }
  };
  const handleSave = async () => {
    if (!form.nombre_material.trim()) return toast.error('Nombre requerido');
    if (!form.costo_unitario) return toast.error('Costo requerido');
    try {
      if (modal==='crear') { await api.post('/materiales', form); toast.success('Material creado'); }
      else { await api.put(`/materiales/${modal.id_material}`, { ...form, estado:'activo' }); toast.success('Material actualizado'); }
      setModal(null); load();
    } catch(err) { toast.error(err.response?.data?.error||'Error'); }
  };

  // Subir foto del material: en modo CREAR no se puede aún (no hay id),
  // así que solo se habilita en EDITAR. Tras subir, refrescamos la URL local.
  const handleSubirImagen = async (file) => {
    if (!file) return;
    if (modal === 'crear') {
      return toast.error('Guarda el material primero, luego puedes subir su foto');
    }
    if (file.size > 5 * 1024 * 1024) {
      return toast.error('La imagen pesa más de 5 MB');
    }
    setUploadingImg(true);
    try {
      const fd = new FormData();
      fd.append('imagen', file);
      const { data } = await api.post(`/materiales/${modal.id_material}/imagen`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setForm(f => ({ ...f, imagen_url: data.imagen_url }));
      toast.success('Imagen subida');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al subir la imagen');
    } finally {
      setUploadingImg(false);
    }
  };
  const { confirm: confirmDelete, modal: deleteModal } = useConfirmDelete();

  const handleDelete = (material) => {
    confirmDelete({
      itemLabel: `el material "${material.nombre_material || ''}"`,
      warningText: 'Se desactivará del catálogo activo.',
      onConfirm: async (password) => {
        await api.delete(`/materiales/${material.id_material}`, { data: { password } });
        toast.success('Material desactivado');
        load();
      },
    });
  };
  const handleAjuste = async () => {
    if (!ajuste.cantidad||ajuste.cantidad==='0') return toast.error('Ingresa una cantidad distinta de 0');
    if (!ajuste.motivo.trim()) return toast.error('Ingresa el motivo del ajuste');
    try {
      const { data } = await api.post(`/materiales/${ajusteModal.id_material}/ajustar-stock`, { cantidad:parseFloat(ajuste.cantidad), motivo:ajuste.motivo });
      toast.success(`Stock ajustado: ${data.stock_anterior} → ${data.stock_nuevo} ${ajusteModal.unidad_medida}`);
      setAjusteModal(null); load();
    } catch(err) { toast.error(err.response?.data?.error||'Error al ajustar'); }
  };

  const stockBajoCount = mats.filter(m => parseFloat(m.stock_disponible) < Math.max(parseFloat(m.stock_minimo)||0,1)).length;
  const filtered = mats
    .filter(m => filter==='stock_bajo' ? parseFloat(m.stock_disponible)<Math.max(parseFloat(m.stock_minimo)||0,1) : true)
    .filter(m => m.nombre_material.toLowerCase().includes(search.toLowerCase())||(m.proveedor||'').toLowerCase().includes(search.toLowerCase()));

  const COLS = [
    { label:'Material',       w:'auto'  },
    { label:'Unidad',         w:72      },
    { label:'Proveedor',      w:140     },
    { label:'Stock',          w:110     },
    { label:'Mín.',           w:90      },
    { label:'Costo Unitario', w:130     },
    { label:'Acciones',       w:120     },
  ];

  return (
    <div>
      {/* Header */}
      <div className="page-header" style={{ marginBottom:'1.25rem' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:38,height:38,borderRadius:9,background:'var(--steel-100)',border:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'center' }}>
            <Package size={18} style={{ color:'var(--primary)' }}/>
          </div>
          <div>
            <h1 style={{ fontFamily:'var(--font-display)', fontSize:'1.5rem', letterSpacing:'-.01em' }}>Materiales</h1>
            <p style={{ color:'var(--text-muted)', fontSize:'.82rem', marginTop:1 }}>
              {mats.length} activos
              {stockBajoCount>0 && <span style={{ color:'var(--warning)', fontWeight:700 }}> · {stockBajoCount} con stock bajo</span>}
            </p>
          </div>
        </div>
        <button className="btn btn-primary" onClick={openCrear} style={{ display:'flex',alignItems:'center',gap:6,fontSize:'.82rem' }}>
          <Plus size={14}/> Nuevo Material
        </button>
      </div>

      {/* Alerta stock bajo */}
      {stockBajoCount>0 && (
        <div style={{ background:'var(--warning-light)',border:'1px solid #E8C170',borderRadius:9,padding:'10px 16px',marginBottom:14,display:'flex',alignItems:'center',gap:10 }}>
          <AlertTriangle size={15} style={{ color:'var(--warning)',flexShrink:0 }}/>
          <span style={{ fontSize:'.83rem',fontWeight:600,color:'var(--warning)',flex:1 }}>
            {stockBajoCount} material{stockBajoCount>1?'es tienen':'tiene'} stock bajo el mínimo
          </span>
          <button onClick={()=>setFilter(f=>f==='stock_bajo'?'todos':'stock_bajo')} style={{
            fontFamily:'var(--font-body)',fontSize:'.75rem',fontWeight:700,padding:'4px 12px',
            background:'var(--warning)',color:'#fff',border:'none',borderRadius:6,cursor:'pointer',
          }}>{filter==='stock_bajo'?'Ver todos':'Ver solo stock bajo'}</button>
        </div>
      )}

      {/* Filtros */}
      <div style={{ background:'var(--surface)',border:'1px solid var(--border)',borderRadius:9,padding:'12px 14px',marginBottom:14,display:'flex',gap:10,flexWrap:'wrap',alignItems:'center',boxShadow:'var(--shadow)' }}>
        <div style={{ position:'relative',flex:1,minWidth:200 }}>
          <Search size={14} style={{ position:'absolute',left:11,top:'50%',transform:'translateY(-50%)',color:'var(--text-muted)' }}/>
          <input placeholder="Buscar por nombre o proveedor…" value={search} onChange={e=>setSearch(e.target.value)} style={{ paddingLeft:36,width:'100%',boxSizing:'border-box' }}/>
        </div>
        <div style={{ display:'flex',gap:5 }}>
          {[['todos','Todos'],['stock_bajo','Stock Bajo']].map(([v,l])=>(
            <button key={v} onClick={()=>setFilter(v)} style={{
              fontFamily:'var(--font-body)',fontSize:'.8rem',fontWeight:filter===v?700:500,
              padding:'6px 14px',borderRadius:6,cursor:'pointer',
              background:filter===v?'var(--primary)':'var(--steel-100)',
              color:filter===v?'#fff':'var(--text-secondary)',
              border:`1px solid ${filter===v?'var(--primary)':'var(--border)'}`,
              transition:'all .12s',
            }}>{l}</button>
          ))}
        </div>
      </div>

      {/* Tabla */}
      <div style={{ background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',overflow:'hidden',boxShadow:'var(--shadow)' }}>
        {loading ? (
          <div style={{ textAlign:'center',padding:'3rem' }}><div className="spinner" style={{ margin:'0 auto' }}/></div>
        ) : filtered.length===0 ? (
          <div className="empty-state"><Package size={44}/><p>{search||filter!=='todos'?'Sin resultados':'No hay materiales'}</p></div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%',borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ borderBottom:'2px solid var(--border)' }}>
                  {COLS.map((col,i)=>(
                    <th key={i} style={{
                      padding:'10px 14px',textAlign:i>=3&&i<=5?'right':i===6?'center':'left',
                      fontFamily:'var(--font-body)',fontSize:'.72rem',fontWeight:700,
                      textTransform:'uppercase',letterSpacing:'.08em',
                      color:'var(--text-muted)',background:'var(--bg-deep)',
                      borderBottom:'1px solid var(--border)',whiteSpace:'nowrap',
                      width:col.w,minWidth:col.w==='auto'?undefined:col.w,
                    }}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((m,idx)=>{
                  const bajo = parseFloat(m.stock_disponible)<Math.max(parseFloat(m.stock_minimo)||0,1);
                  const warn = !bajo && parseFloat(m.stock_disponible)<(parseFloat(m.stock_minimo)||0)*1.5;
                  return (
                    <tr key={m.id_material} style={{ borderBottom:'1px solid var(--border)',background:idx%2===0?'var(--surface)':'var(--surface-2)',transition:'background .12s' }}
                      onMouseEnter={e=>e.currentTarget.style.background='#EEF3FA'}
                      onMouseLeave={e=>e.currentTarget.style.background=idx%2===0?'var(--surface)':'var(--surface-2)'}
                    >
                      <td style={{ padding:'12px 16px' }}>
                        <div style={{ display:'flex',alignItems:'center',gap:10 }}>
                          {/* Mini thumbnail si el material tiene foto */}
                          {m.imagen_url ? (
                            <img
                              src={imgUrl(m.imagen_url)}
                              alt=""
                              style={{
                                width:34, height:34, objectFit:'cover',
                                borderRadius:5, border:'1px solid var(--border)',
                                flexShrink:0,
                              }}
                            />
                          ) : (
                            <div style={{
                              width:34, height:34, borderRadius:5,
                              background:'var(--steel-100)', border:'1px solid var(--border)',
                              display:'flex',alignItems:'center',justifyContent:'center',
                              color:'var(--text-muted)', flexShrink:0,
                            }}>
                              <ImageIcon size={14}/>
                            </div>
                          )}
                          <div style={{ minWidth:0, flex:1 }}>
                            <div style={{ display:'flex',alignItems:'center',gap:7 }}>
                              {bajo && <TrendingDown size={13} style={{ color:'var(--danger)',flexShrink:0 }}/>}
                              <span style={{ fontFamily:'var(--font-body)',fontWeight:600,fontSize:'.88rem',color:'var(--text-primary)' }}>{m.nombre_material}</span>
                            </div>
                            {m.descripcion && (
                              <div
                                title={m.descripcion}
                                style={{
                                  fontSize:'.72rem', color:'var(--text-muted)',
                                  marginTop:2, lineHeight:1.3,
                                  overflow:'hidden', textOverflow:'ellipsis',
                                  whiteSpace:'nowrap', maxWidth:320,
                                }}
                              >
                                {m.descripcion}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding:'12px 16px' }}>
                        <span style={{ fontFamily:'var(--font-mono)',fontSize:'.7rem',fontWeight:600,background:'var(--steel-100)',color:'var(--steel-600)',border:'1px solid var(--border)',borderRadius:4,padding:'2px 0',minWidth:36,display:'inline-block',textAlign:'center' }}>
                          {m.unidad_medida}
                        </span>
                      </td>
                      <td style={{ padding:'12px 16px',fontSize:'.83rem',color:'var(--text-secondary)' }}>{m.proveedor||'—'}</td>
                      <td style={{ padding:'12px 16px',textAlign:'right' }}>
                        <span style={{
                          fontFamily:'var(--font-mono)',fontSize:'.75rem',fontWeight:600,padding:'3px 0',borderRadius:4,minWidth:72,display:'inline-block',textAlign:'center',
                          background:bajo?'var(--danger-light)':warn?'var(--warning-light)':'var(--success-light)',
                          color:bajo?'var(--danger)':warn?'var(--warning)':'var(--success)',
                          border:`1px solid ${bajo?'#F1B3AE':warn?'#E8C170':'#A7D9B8'}`,
                        }}>{parseFloat(m.stock_disponible).toLocaleString('es-CO')} {m.unidad_medida}</span>
                      </td>
                      <td style={{ padding:'12px 16px',textAlign:'right',fontFamily:'var(--font-mono)',fontSize:'.75rem',color:'var(--text-muted)' }}>{m.stock_minimo||0} {m.unidad_medida}</td>
                      <td style={{ padding:'12px 16px',textAlign:'right',fontFamily:'var(--font-mono)',fontSize:'.82rem',fontWeight:600,color:'var(--text-primary)' }}>{fmt(m.costo_unitario)}</td>
                      <td style={{ padding:'12px 16px' }}>
                        <div style={{ display:'flex',gap:4,justifyContent:'center' }}>
                          {[
                            { I:ArrowUpDown,t:'Ajustar stock',fn:()=>openAjuste(m),  cl:'outline' },
                            { I:History,    t:'Historial',    fn:()=>openHistorial(m),cl:'outline' },
                            { I:Edit,       t:'Editar',       fn:()=>openEditar(m),   cl:'outline' },
                            { I:Trash2,     t:'Eliminar',     fn:()=>handleDelete(m), cl:'danger' },
                          ].map((btn,i)=>(
                            <button key={i} onClick={btn.fn} title={btn.t} style={{
                              display:'flex',alignItems:'center',justifyContent:'center',
                              width:30,height:30,borderRadius:6,cursor:'pointer',border:'1px solid var(--border)',
                              background: btn.cl==='danger'?'var(--danger-light)':'var(--steel-100)',
                              color: btn.cl==='danger'?'var(--danger)':'var(--steel-600)',
                              transition:'all .12s',
                            }}
                              onMouseEnter={e=>{ e.currentTarget.style.background=btn.cl==='danger'?'var(--danger)':'var(--primary)'; e.currentTarget.style.color='#fff'; e.currentTarget.style.border=`1px solid ${btn.cl==='danger'?'var(--danger)':'var(--primary)'}`; }}
                              onMouseLeave={e=>{ e.currentTarget.style.background=btn.cl==='danger'?'var(--danger-light)':'var(--steel-100)'; e.currentTarget.style.color=btn.cl==='danger'?'var(--danger)':'var(--steel-600)'; e.currentTarget.style.border='1px solid var(--border)'; }}
                            ><btn.I size={12}/></button>
                          ))}
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
          <div style={{ padding:'9px 16px',background:'var(--bg-deep)',borderTop:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center' }}>
            <span style={{ fontFamily:'var(--font-mono)',fontSize:'.68rem',color:'var(--text-muted)' }}>{filtered.length} de {mats.length} materiales</span>
          </div>
        )}
      </div>

      {/* Modal crear/editar */}
      {modal&&(
        <div className="modal-overlay" onClick={()=>setModal(null)}>
          <div className="modal" style={{ maxWidth:540, maxHeight:'90vh', overflowY:'auto' }} onClick={e=>e.stopPropagation()}>
            <div className="modal-header"><div style={{ display:'flex',alignItems:'center',gap:8 }}><Package size={17} style={{ color:'var(--primary)' }}/><h2 style={{ fontWeight:800 }}>{modal==='crear'?'Nuevo Material':'Editar Material'}</h2></div><button className="btn btn-ghost btn-sm" onClick={()=>setModal(null)}><X size={16}/></button></div>
            <div className="modal-body">
              <div className="form-group"><label>Nombre del material *</label><input value={form.nombre_material} onChange={e=>setForm({...form,nombre_material:e.target.value})} placeholder="Ej: CABEZAL ALN387"/></div>
              <div className="grid-2">
                <div className="form-group"><label>Unidad de Medida</label><select value={form.unidad_medida} onChange={e=>setForm({...form,unidad_medida:e.target.value})}>{UNITS.map(u=><option key={u} value={u}>{u}</option>)}</select></div>
                <div className="form-group"><label>Costo Unitario ($) *</label><input type="number" min="0" step="1" value={form.costo_unitario} onChange={e=>setForm({...form,costo_unitario:e.target.value})} placeholder="Ej: 5500"/></div>
              </div>
              <div className="grid-2">
                <div className="form-group"><label>Stock Disponible</label><input type="number" min="0" step="0.01" value={form.stock_disponible} onChange={e=>setForm({...form,stock_disponible:e.target.value})}/></div>
                <div className="form-group"><label>Stock Mínimo</label><input type="number" min="0" step="0.01" value={form.stock_minimo} onChange={e=>setForm({...form,stock_minimo:e.target.value})}/></div>
              </div>
              <div className="form-group"><label>Proveedor</label><input value={form.proveedor} onChange={e=>setForm({...form,proveedor:e.target.value})} placeholder="Nombre del proveedor"/></div>

              {/* Descripción libre */}
              <div className="form-group">
                <label>Descripción</label>
                <textarea
                  value={form.descripcion}
                  onChange={e=>setForm({...form,descripcion:e.target.value})}
                  placeholder="Notas, ficha técnica, observaciones del proveedor, equivalencias, etc."
                  rows={3}
                  style={{
                    width:'100%', resize:'vertical', minHeight:64, padding:'8px 10px',
                    border:'1px solid var(--border)', borderRadius:6, fontFamily:'inherit',
                    fontSize:'.85rem', boxSizing:'border-box',
                  }}
                />
              </div>

              {/* Foto del material — solo en modo editar (necesita id) */}
              <div className="form-group">
                <label style={{display:'flex',alignItems:'center',gap:6}}>
                  <ImageIcon size={14}/> Foto del material
                </label>
                <div style={{
                  border:'2px dashed var(--border)', borderRadius:8, padding:12,
                  display:'flex', gap:14, alignItems:'center',
                  background: form.imagen_url ? '#F8FAFC' : '#FAFAF9',
                }}>
                  {form.imagen_url ? (
                    <img
                      src={imgUrl(form.imagen_url)}
                      alt="Foto del material"
                      style={{ width:88, height:88, objectFit:'cover', borderRadius:6, border:'1px solid var(--border)' }}
                    />
                  ) : (
                    <div style={{
                      width:88, height:88, borderRadius:6, background:'#E5E7EB',
                      display:'flex', alignItems:'center', justifyContent:'center', color:'#9CA3AF',
                    }}>
                      <Camera size={28}/>
                    </div>
                  )}
                  <div style={{flex:1, minWidth:0}}>
                    {modal === 'crear' ? (
                      <p style={{ fontSize:'.78rem', color:'var(--text-muted)', lineHeight:1.4, margin:0 }}>
                        Para agregar foto:<br/>guarda primero el material y vuelve a editar.
                      </p>
                    ) : (
                      <>
                        <p style={{ fontSize:'.8rem', color:'var(--text-primary)', marginBottom:6, fontWeight:600 }}>
                          {form.imagen_url ? 'Foto guardada' : 'Sin foto'}
                        </p>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
                          style={{ display:'none' }}
                          onChange={e => handleSubirImagen(e.target.files?.[0])}
                        />
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploadingImg}
                          style={{ display:'inline-flex', alignItems:'center', gap:6 }}
                        >
                          <Upload size={13}/> {uploadingImg ? 'Subiendo...' : (form.imagen_url ? 'Cambiar foto' : 'Subir foto')}
                        </button>
                        {form.imagen_url && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setForm(f => ({ ...f, imagen_url:'' }))}
                            style={{ marginLeft:6, color:'#DC2626', fontSize:'.75rem' }}
                          >
                            Quitar
                          </button>
                        )}
                        <p style={{ fontSize:'.7rem', color:'var(--text-muted)', marginTop:6 }}>
                          JPG / PNG / WebP — máx 5 MB
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer"><button className="btn btn-outline" onClick={()=>setModal(null)}>Cancelar</button><button className="btn btn-primary" onClick={handleSave}><Plus size={14}/> Guardar</button></div>
          </div>
        </div>
      )}

      {/* Modal ajuste */}
      {ajusteModal&&(
        <div className="modal-overlay" onClick={()=>setAjusteModal(null)}>
          <div className="modal" style={{ maxWidth:420 }} onClick={e=>e.stopPropagation()}>
            <div className="modal-header"><div style={{ display:'flex',alignItems:'center',gap:8 }}><ArrowUpDown size={17} style={{ color:'var(--primary)' }}/><h2 style={{ fontWeight:800 }}>Ajustar Stock</h2></div><button className="btn btn-ghost btn-sm" onClick={()=>setAjusteModal(null)}><X size={16}/></button></div>
            <div className="modal-body">
              <p style={{ fontSize:'.875rem',marginBottom:'1rem',color:'var(--text-muted)' }}><strong style={{ color:'var(--text-primary)' }}>{ajusteModal.nombre_material}</strong> — Stock actual: <strong>{parseFloat(ajusteModal.stock_disponible).toLocaleString('es-CO')} {ajusteModal.unidad_medida}</strong></p>
              <div className="form-group"><label>Cantidad a ajustar</label><input type="number" step="0.01" placeholder="Positivo para sumar, negativo para restar" value={ajuste.cantidad} onChange={e=>setAjuste({...ajuste,cantidad:e.target.value})}/>
                {ajuste.cantidad&&!isNaN(ajuste.cantidad)&&<small style={{ color:parseFloat(ajuste.cantidad)>=0?'var(--success)':'var(--danger)',fontWeight:700 }}>Resultado: {(parseFloat(ajusteModal.stock_disponible)+parseFloat(ajuste.cantidad)).toFixed(2)} {ajusteModal.unidad_medida}</small>}
              </div>
              <div className="form-group"><label>Motivo del ajuste *</label><input placeholder="Ej: Ingreso de mercancía…" value={ajuste.motivo} onChange={e=>setAjuste({...ajuste,motivo:e.target.value})}/></div>
            </div>
            <div className="modal-footer"><button className="btn btn-outline" onClick={()=>setAjusteModal(null)}>Cancelar</button><button className="btn btn-primary" onClick={handleAjuste}><ArrowUpDown size={14}/> Aplicar Ajuste</button></div>
          </div>
        </div>
      )}

      {/* Modal historial */}
      {histModal&&(
        <div className="modal-overlay" onClick={()=>setHistModal(null)}>
          <div className="modal" style={{ maxWidth:600 }} onClick={e=>e.stopPropagation()}>
            <div className="modal-header"><div style={{ display:'flex',alignItems:'center',gap:8 }}><History size={17} style={{ color:'var(--primary)' }}/><h2 style={{ fontWeight:800 }}>Historial — {histModal.nombre_material}</h2></div><button className="btn btn-ghost btn-sm" onClick={()=>setHistModal(null)}><X size={16}/></button></div>
            <div className="modal-body" style={{ maxHeight:400,overflowY:'auto' }}>
              {histLoading?<div style={{ textAlign:'center',padding:'2rem' }}><div className="spinner" style={{ margin:'0 auto' }}/></div>
              :historial.length===0?<div className="empty-state" style={{ padding:'2rem' }}><History size={32}/><p style={{ marginTop:8,color:'var(--text-muted)' }}>Sin movimientos registrados</p></div>
              :<table><thead><tr><th>Fecha</th><th>Tipo</th><th>Cantidad</th><th>Anterior</th><th>Nuevo</th><th>Motivo</th><th>Usuario</th></tr></thead>
                <tbody>{historial.map((h,i)=>{const s=parseFloat(h.cantidad)>0;return(<tr key={i}><td style={{ fontSize:'.78rem',whiteSpace:'nowrap' }}>{fmtDate(h.fecha)}</td><td><span className={`badge ${h.tipo==='ajuste_manual'?'badge-blue':'badge-gray'}`} style={{ fontSize:'.72rem' }}>{h.tipo?.replace('_',' ')}</span></td><td style={{ fontWeight:700,color:s?'var(--success)':'var(--danger)' }}>{s?'+':''}{parseFloat(h.cantidad).toLocaleString('es-CO')}</td><td style={{ color:'var(--text-muted)',fontSize:'.83rem' }}>{parseFloat(h.stock_anterior).toLocaleString('es-CO')}</td><td style={{ fontWeight:600,fontSize:'.83rem' }}>{parseFloat(h.stock_nuevo).toLocaleString('es-CO')}</td><td style={{ fontSize:'.8rem',color:'var(--text-muted)' }}>{h.motivo||'—'}</td><td style={{ fontSize:'.78rem' }}>{h.nombre_usuario||'—'}</td></tr>);})}</tbody>
              </table>}
            </div>
            <div className="modal-footer"><button className="btn btn-outline" onClick={()=>setHistModal(null)}>Cerrar</button></div>
          </div>
        </div>
      )}
      {deleteModal}
    </div>
  );
}
