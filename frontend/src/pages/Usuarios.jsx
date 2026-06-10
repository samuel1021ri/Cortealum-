import { useEffect, useState, useCallback, useRef } from 'react';
import api from '../api/client';
import toast from 'react-hot-toast';
import {
  Plus, Edit, X, Search, User, Lock, Eye, EyeOff,
  Shield, CheckCircle, XCircle, Trash2, Upload, Download,
  MoreVertical, UserCheck, UserX, ChevronLeft, ChevronRight,
  ClipboardList, RefreshCw, AlertTriangle, Key,
} from 'lucide-react';
import { useConfirmDelete } from '../hooks/useConfirmDelete';

/* ─── Estado ──────────────────────────────────────────────── */
const EMPTY = {
  nombre_completo:'', nombre_usuario:'', correo_electronico:'',
  telefono:'', documento:'', contraseña:'', id_rol:'',
};

/* ─── Avatar ─────────────────────────────────────────────── */
function Avatar({ nombre, size = 36 }) {
  const ini = (nombre||'?').split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase()||'?';
  return (
    <div style={{
      width:size, height:size, borderRadius:'50%', flexShrink:0,
      background:'linear-gradient(135deg,#1565C0,#0D47A1)',
      display:'flex', alignItems:'center', justifyContent:'center',
      color:'#fff', fontWeight:900, fontSize:size*0.3+'px', userSelect:'none',
    }}>{ini}</div>
  );
}

/* ─── Badge estado ───────────────────────────────────────── */
function Badge({ estado }) {
  const ok = estado === 'activo';
  const Icon = ok ? CheckCircle : XCircle;
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:4,
      background: ok ? '#dcfce7' : '#fee2e2',
      color: ok ? '#15803d' : '#dc2626',
      padding:'3px 9px', borderRadius:99, fontSize:'.63rem', fontWeight:800,
    }}>
      <Icon size={10}/>{ok ? 'ACTIVO' : 'INACTIVO'}
    </span>
  );
}

/* ─── Modal genérico — usa position:fixed SIN portal ────── */
/* La clave: el modal vive en el mismo árbol React que todo  */
/* pero visualmente flota sobre todo con z-index alto        */
function Modal({ onClose, children, maxWidth = 520 }) {
  // Cerrar con Escape
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div
      style={{
        position:'fixed', inset:0, zIndex:9999,
        background:'rgba(0,0,0,.55)',
        display:'flex', alignItems:'center', justifyContent:'center',
        padding:'1rem',
      }}
      // Sólo cierra si el clic es EXACTAMENTE en el fondo oscuro
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background:'var(--surface)', borderRadius:16, width:'100%', maxWidth,
          boxShadow:'0 20px 60px rgba(0,0,0,.3)',
          maxHeight:'90vh', overflowY:'auto',
          // Detener propagación para que el fondo no reciba el clic
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

/* ─── Confirm ────────────────────────────────────────────── */
function Confirm({ titulo, msg, peligroso, onOk, onClose }) {
  return (
    <Modal onClose={onClose} maxWidth={420}>
      <div className="modal-header">
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <AlertTriangle size={20} style={{color:peligroso?'#dc2626':'#f59e0b'}}/>
          <h2 style={{fontWeight:800}}>{titulo}</h2>
        </div>
        <button className="btn btn-outline btn-sm" onClick={onClose}><X size={15}/></button>
      </div>
      <div className="modal-body">
        <p style={{color:'var(--text-secondary)',lineHeight:1.6}}>{msg}</p>
      </div>
      <div className="modal-footer">
        <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
        <button className={`btn ${peligroso?'btn-danger':'btn-primary'}`} onClick={onOk}>Confirmar</button>
      </div>
    </Modal>
  );
}

/* ─── Modal Cambiar Contraseña ───────────────────────────── */
function ModalCambiarPass({ usuario, onClose, onOk }) {
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [ver, setVer] = useState(false);
  const [busy, setBusy] = useState(false);

  const ok = p1.length >= 6 && p1 === p2;

  const guardar = async () => {
    if (!ok) return;
    setBusy(true);
    try {
      await api.put(`/usuarios/${usuario.id_usuario}`, { contraseña: p1 });
      toast.success('Contraseña actualizada ✓');
      onOk();
    } catch(e) { toast.error(e.response?.data?.error||'Error'); }
    finally { setBusy(false); }
  };

  return (
    <Modal onClose={onClose} maxWidth={440}>
      <div className="modal-header">
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <Key size={18} style={{color:'var(--primary)'}}/>
          <div>
            <h2 style={{fontWeight:800}}>Cambiar contraseña</h2>
            <p style={{fontSize:'.78rem',color:'var(--text-muted)'}}>{usuario.nombre_completo}</p>
          </div>
        </div>
        <button className="btn btn-outline btn-sm" onClick={onClose}><X size={15}/></button>
      </div>
      <div className="modal-body" style={{display:'flex',flexDirection:'column',gap:'1rem'}}>
        <div className="form-group">
          <label>Nueva contraseña</label>
          <div style={{position:'relative'}}>
            <input
              type={ver?'text':'password'}
              value={p1}
              placeholder="Mínimo 6 caracteres"
              onChange={e=>setP1(e.target.value)}
              style={{paddingRight:36}}
            />
            <button type="button" onClick={()=>setVer(v=>!v)}
              style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',
                background:'none',border:'none',cursor:'pointer',color:'var(--text-muted)',display:'flex'}}>
              {ver?<EyeOff size={14}/>:<Eye size={14}/>}
            </button>
          </div>
        </div>
        <div className="form-group">
          <label>Confirmar contraseña</label>
          <input
            type={ver?'text':'password'}
            value={p2}
            placeholder="Repetir contraseña"
            onChange={e=>setP2(e.target.value)}
            style={{borderColor: p2 && !ok ? '#dc2626' : p2 && ok ? '#16a34a' : undefined}}
          />
          {p2 && !ok && <small style={{color:'#dc2626',fontSize:'.72rem'}}>No coinciden</small>}
          {p2 && ok  && <small style={{color:'#16a34a',fontSize:'.72rem'}}>✓ Coinciden</small>}
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={guardar} disabled={!ok||busy}>
          {busy?'Guardando…':'Guardar contraseña'}
        </button>
      </div>
    </Modal>
  );
}

/* ─── Modal Usuario (crear/editar) ──────────────────────── */
function ModalUsuario({ modo, usuario, roles, onClose, onOk }) {
  const [form, setForm] = useState(
    modo==='editar'
      ? { nombre_completo:usuario.nombre_completo, nombre_usuario:usuario.nombre_usuario,
          correo_electronico:usuario.correo_electronico||'', telefono:usuario.telefono||'',
          documento:usuario.documento||'', contraseña:'', id_rol:String(usuario.id_rol||'') }
      : EMPTY
  );
  const [ver, setVer] = useState(false);
  const [busy, setBusy] = useState(false);

  // Handlers estables con useCallback para evitar re-renders que bloqueen inputs
  const updNombre  = useCallback(e => { const v = e.target.value; setForm(f=>({...f, nombre_completo: v})); }, []);
  const updUsuario = useCallback(e => { const v = e.target.value; setForm(f=>({...f, nombre_usuario: v.toLowerCase().replace(/\s/g,'')})); }, []);
  const updRol     = useCallback(e => { const v = e.target.value; setForm(f=>({...f, id_rol: v})); }, []);
  const updCorreo  = useCallback(e => { const v = e.target.value; setForm(f=>({...f, correo_electronico: v})); }, []);
  const updTel     = useCallback(e => { const v = e.target.value; setForm(f=>({...f, telefono: v})); }, []);
  const updDoc     = useCallback(e => { const v = e.target.value; setForm(f=>({...f, documento: v})); }, []);
  const updPass    = useCallback(e => { const v = e.target.value; setForm(f=>({...f, contraseña: v})); }, []);

  const guardar = async () => {
    if (!form.nombre_completo.trim()) return toast.error('Nombre requerido');
    if (!form.nombre_usuario.trim())  return toast.error('Usuario requerido');
    if (!form.correo_electronico.trim()) return toast.error('Correo requerido');
    if (!form.id_rol) return toast.error('Selecciona un rol');
    if (modo==='crear' && !form.contraseña) return toast.error('Contraseña requerida');
    setBusy(true);
    try {
      const body = {...form};
      if (!body.contraseña) delete body.contraseña;
      if (modo==='crear') await api.post('/usuarios', body);
      else                await api.put(`/usuarios/${usuario.id_usuario}`, body);
      toast.success(modo==='crear'?'Usuario creado ✓':'Actualizado ✓');
      onOk();
    } catch(e) { toast.error(e.response?.data?.error||'Error al guardar'); }
    finally { setBusy(false); }
  };

  return (
    <Modal onClose={onClose} maxWidth={520}>
      <div className="modal-header">
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <User size={17} style={{color:'var(--primary)'}}/>
          <h2 style={{fontWeight:800}}>{modo==='crear'?'Nuevo Usuario':'Editar Usuario'}</h2>
        </div>
        <button className="btn btn-outline btn-sm" onClick={onClose}><X size={15}/></button>
      </div>
      <div className="modal-body">
        <div style={{display:'flex',justifyContent:'center',marginBottom:'1.2rem'}}>
          <Avatar nombre={form.nombre_completo} size={52}/>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1rem'}}>

          <div className="form-group" style={{gridColumn:'span 2'}}>
            <label>Nombre Completo *</label>
            <input value={form.nombre_completo} placeholder="Ej: Carlos Rodríguez" onChange={updNombre}/>
          </div>

          <div className="form-group">
            <label>Usuario *</label>
            <input
              value={form.nombre_usuario}
              placeholder="sin espacios"
              disabled={modo==='editar'}
              style={modo==='editar'?{opacity:.5,background:'var(--bg)'}:{}}
              onChange={updUsuario}
            />
          </div>

          <div className="form-group">
            <label>Rol *</label>
            <select value={form.id_rol} onChange={updRol}>
              <option value="">Seleccionar rol</option>
              {roles.map(r=><option key={r.id_rol} value={String(r.id_rol)}>{r.nombre}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>Correo *</label>
            <input type="email" value={form.correo_electronico} placeholder="correo@empresa.com" onChange={updCorreo}/>
          </div>

          <div className="form-group">
            <label>Teléfono</label>
            <input type="tel" value={form.telefono} placeholder="310 123 4567" onChange={updTel}/>
          </div>

          <div className="form-group" style={{gridColumn:'span 2'}}>
            <label>Documento</label>
            <input value={form.documento} placeholder="Número de cédula" onChange={updDoc}/>
          </div>

          <div className="form-group" style={{gridColumn:'span 2'}}>
            <label>{modo==='crear'?'Contraseña *':'Nueva Contraseña (dejar vacío para no cambiar)'}</label>
            <div style={{position:'relative'}}>
              <input
                type={ver?'text':'password'}
                value={form.contraseña}
                placeholder={modo==='crear'?'Mínimo 6 caracteres':''}
                onChange={updPass}
                style={{paddingRight:36}}
              />
              <button type="button" onClick={()=>setVer(v=>!v)}
                style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',
                  background:'none',border:'none',cursor:'pointer',color:'var(--text-muted)',display:'flex'}}>
                {ver?<EyeOff size={14}/>:<Eye size={14}/>}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={guardar} disabled={busy}>
          {busy?<><RefreshCw size={14} style={{animation:'spin 1s linear infinite'}}/> Guardando…</>
               :modo==='crear'?'Crear Usuario':'Guardar Cambios'}
        </button>
      </div>
    </Modal>
  );
}

/* ─── Modal Importar ─────────────────────────────────────── */
function ModalImportar({ onClose, onOk }) {
  const [drag,  setDrag]  = useState(false);
  const [file,  setFile]  = useState(null);
  const [busy,  setBusy]  = useState(false);
  const [res,   setRes]   = useState(null);
  const ref = useRef();

  const setF = (f) => {
    if (!f) return;
    const ext = f.name.split('.').pop().toLowerCase();
    if (!['xlsx','xls','csv'].includes(ext)) return toast.error('Solo .xlsx .xls .csv');
    setFile(f); setRes(null);
  };

  const importar = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData(); fd.append('archivo', file);
      const { data } = await api.post('/usuarios/importar', fd, {headers:{'Content-Type':'multipart/form-data'}});
      setRes(data);
      if (data.creados > 0) onOk();
    } catch(e) { toast.error(e.response?.data?.error||'Error'); }
    finally { setBusy(false); }
  };

  const descargar = async () => {
    try {
      const r = await api.get('/usuarios/plantilla',{responseType:'blob'});
      const url = URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a'); a.href=url; a.download='plantilla_usuarios.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Error al descargar'); }
  };

  return (
    <Modal onClose={onClose} maxWidth={520}>
      <div className="modal-header">
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <Upload size={18} style={{color:'var(--primary)'}}/>
          <h2 style={{fontWeight:800}}>Importar Usuarios</h2>
        </div>
        <button className="btn btn-outline btn-sm" onClick={onClose}><X size={15}/></button>
      </div>
      <div className="modal-body" style={{display:'flex',flexDirection:'column',gap:'1rem'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
          background:'var(--bg)',border:'1px solid var(--border)',borderRadius:10,padding:'12px 14px'}}>
          <div>
            <p style={{fontWeight:700,fontSize:'.85rem'}}>Plantilla Excel</p>
            <p style={{fontSize:'.75rem',color:'var(--text-muted)'}}>Descarga el formato requerido</p>
          </div>
          <button className="btn btn-outline" style={{display:'flex',alignItems:'center',gap:6}} onClick={descargar}>
            <Download size={14}/> Descargar
          </button>
        </div>
        <p style={{fontSize:'.82rem',color:'var(--text-muted)'}}>
          Columnas: <strong>nombre, apellido, correo</strong> (obligatorias) · documento, telefono, rol (opcionales)
        </p>
        <div
          onClick={()=>ref.current?.click()}
          onDragOver={e=>{e.preventDefault();setDrag(true)}}
          onDragLeave={()=>setDrag(false)}
          onDrop={e=>{e.preventDefault();setDrag(false);setF(e.dataTransfer.files[0]);}}
          style={{border:`2px dashed ${drag?'var(--primary)':file?'#16a34a':'var(--border)'}`,
            borderRadius:12,padding:'2rem',textAlign:'center',cursor:'pointer',
            background:drag?'var(--primary-light)':file?'#f0fdf4':'var(--bg)'}}
        >
          <Upload size={28} style={{color:file?'#16a34a':'var(--text-muted)',margin:'0 auto 8px'}}/>
          <p style={{fontWeight:700,color:file?'#16a34a':'var(--text-primary)',marginBottom:4}}>
            {file?`✓ ${file.name}`:'Arrastra o haz clic'}
          </p>
          <p style={{fontSize:'.75rem',color:'var(--text-muted)'}}>xlsx · xls · csv — máx 5MB · 500 usuarios</p>
          <input ref={ref} type="file" accept=".xlsx,.xls,.csv" style={{display:'none'}}
            onChange={e=>setF(e.target.files[0])}/>
        </div>
        {res && (
          <div style={{border:'1px solid var(--border)',borderRadius:10,overflow:'hidden'}}>
            <div style={{background:'var(--bg)',padding:'8px 14px',borderBottom:'1px solid var(--border)'}}>
              <strong>Resultado</strong>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',textAlign:'center'}}>
              {[['Procesados',res.procesados,'#3b82f6'],['Creados',res.creados,'#16a34a'],
                ['Duplicados',res.duplicados,'#f59e0b'],['Errores',res.errores,'#dc2626']].map(([l,v,c])=>(
                <div key={l} style={{padding:'12px 4px',borderRight:'1px solid var(--border)'}}>
                  <div style={{fontSize:'1.5rem',fontWeight:900,color:c}}>{v}</div>
                  <div style={{fontSize:'.68rem',color:'var(--text-muted)',textTransform:'uppercase'}}>{l}</div>
                </div>
              ))}
            </div>
            {/* FIX clarificado por el usuario "17 errores sin saber por qué":
                mostrar TODOS los detalles cuando hay errores/duplicados, no
                solo los contadores. Así el usuario sabe qué corregir. */}
            {res.detalle && res.detalle.length > 0 && (
              <div style={{borderTop:'1px solid var(--border)',padding:'10px 14px',maxHeight:240,overflowY:'auto',background:'#FFF8F0'}}>
                <div style={{fontSize:'.72rem',fontWeight:700,color:'#92400E',marginBottom:6,textTransform:'uppercase',letterSpacing:'.06em'}}>
                  Detalle ({res.detalle.length} fila{res.detalle.length!==1?'s':''})
                </div>
                <ul style={{listStyle:'none',padding:0,margin:0,fontFamily:'monospace',fontSize:'.74rem',color:'#7C2D12',lineHeight:1.6}}>
                  {res.detalle.slice(0, 30).map((d, i) => (
                    <li key={i} style={{padding:'3px 0',borderBottom:'1px dotted #FED7AA'}}>
                      <strong>Fila {d.fila}{d.correo?` (${d.correo})`:''}:</strong> {d.error}
                    </li>
                  ))}
                  {res.detalle.length > 30 && (
                    <li style={{padding:'6px 0',fontStyle:'italic',color:'#9A3412'}}>
                      …y {res.detalle.length - 30} más
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="modal-footer">
        <button className="btn btn-outline" onClick={onClose}>Cerrar</button>
        {!res && (
          <button className="btn btn-primary" onClick={importar} disabled={!file||busy}
            style={{display:'flex',alignItems:'center',gap:7}}>
            {busy?<><RefreshCw size={14} style={{animation:'spin 1s linear infinite'}}/> Importando…</>:<><Upload size={14}/> Importar</>}
          </button>
        )}
      </div>
    </Modal>
  );
}

/* ─── Barra masiva ───────────────────────────────────────── */
function BarraMasiva({ n, onAction, onClear }) {
  return (
    <div style={{position:'fixed',bottom:24,left:'50%',transform:'translateX(-50%)',
      background:'var(--surface)',border:'1px solid var(--border)',borderRadius:14,
      padding:'10px 18px',display:'flex',alignItems:'center',gap:12,
      boxShadow:'0 8px 40px rgba(0,0,0,.2)',zIndex:998,flexWrap:'wrap',justifyContent:'center'}}>
      <span style={{fontWeight:800,fontSize:'.88rem',color:'var(--primary)'}}>
        {n} seleccionado{n!==1?'s':''}
      </span>
      {[{k:'activate',l:'Activar',c:'#16a34a',I:UserCheck},
        {k:'deactivate',l:'Desactivar',c:'#dc2626',I:UserX},
        {k:'delete',l:'Eliminar',c:'#7c3aed',I:Trash2}].map(({k,l,c,I})=>(
        <button key={k} onClick={()=>onAction(k)}
          style={{display:'flex',alignItems:'center',gap:5,padding:'6px 13px',
            background:'white',border:`1.5px solid ${c}`,color:c,
            borderRadius:8,fontWeight:700,fontSize:'.78rem',cursor:'pointer'}}>
          <I size={13}/>{l}
        </button>
      ))}
      <button onClick={onClear} style={{background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer'}}>
        <X size={16}/>
      </button>
    </div>
  );
}

/* ─── Avatar real del usuario ───────────────────────────── */
function UserAvatar({ u, size = 40 }) {
  if (u.avatar_url) {
    return (
      <img
        src={u.avatar_url} alt={u.nombre_completo}
        style={{width:size,height:size,borderRadius:'50%',objectFit:'cover',flexShrink:0,border:'2px solid rgba(255,255,255,.6)'}}
      />
    );
  }
  const bg = u.avatar_color || 'linear-gradient(135deg,#1239A6,#1A56DB)';
  const letra = u.avatar_letra || (u.nombre_completo?.[0] || '?').toUpperCase();
  return (
    <div style={{
      width:size, height:size, borderRadius:'50%', background:bg, flexShrink:0,
      display:'flex', alignItems:'center', justifyContent:'center',
      color:'#fff', fontWeight:800, fontSize:size*0.36,
      border:'2px solid rgba(255,255,255,.5)',
      boxShadow:'0 2px 8px rgba(0,0,0,.15)',
      userSelect:'none',
    }}>{letra}</div>
  );
}

/* ─── Tarjeta Usuario estilo proyectos ───────────────────── */
function Fila({ u, sel, onSel, onEdit, onEstado, onDel, onPass }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(()=>{
    const h = e=>{ if(ref.current&&!ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown',h);
    return ()=>document.removeEventListener('mousedown',h);
  },[]);

  const activo = u.estado === 'activo';
  const waNum = (u.telefono||'').replace(/\D/g,'');
  const waLink = waNum ? `https://wa.me/57${waNum}` : null;
  const fecha = u.fecha_creacion ? new Date(u.fecha_creacion).toLocaleDateString('es-CO') : '—';

  // Extraer el color dominante del avatar para la línea separadora
  const rawColor = u.avatar_color || '';
  // Si es gradiente, extraer el primer color hex; si es color plano usarlo directo
  const accentMatch = rawColor.match(/#[0-9A-Fa-f]{6}/);
  const accentColor = accentMatch ? accentMatch[0] : (rawColor.startsWith('#') ? rawColor : '#1A56DB');

  return (
    <div style={{
      background: sel ? '#EEF2FF' : '#fff',
      border: sel ? '1.5px solid #A5B4FC' : '1px solid #E5E7EB',
      borderRadius:14,
      boxShadow:'0 1px 4px rgba(0,0,0,.07)',
      overflow:'hidden',
      transition:'box-shadow .15s, border-color .15s',
      fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif",
      display:'flex', flexDirection:'column',
    }}
      onMouseEnter={e=>{ e.currentTarget.style.boxShadow='0 6px 18px rgba(0,0,0,.1)'; }}
      onMouseLeave={e=>{ e.currentTarget.style.boxShadow='0 1px 4px rgba(0,0,0,.07)'; }}
    >
      {/* ── TOP BAR: checkbox + badges + menú ── */}
      <div style={{display:'flex',alignItems:'center',gap:6,padding:'10px 12px 0'}}>
        <input type="checkbox" checked={sel} onChange={onSel}
          style={{width:14,height:14,cursor:'pointer',accentColor:'#1A56DB',flexShrink:0}}/>

        <span style={{
          fontFamily:"'DM Mono','Fira Code',monospace",
          fontSize:'.56rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'.07em',
          background:'#F3F4F6',color:'#374151',border:'1px solid #E5E7EB',
          borderRadius:4,padding:'2px 6px',
        }}>{u.rol||'Usuario'}</span>

        <span style={{
          fontFamily:"'DM Mono','Fira Code',monospace",
          fontSize:'.56rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'.07em',
          background:activo?'#F0FDF4':'#FEF2F2',
          color:activo?'#15803D':'#B91C1C',
          border:`1px solid ${activo?'#BBF7D0':'#FECACA'}`,
          borderRadius:4,padding:'2px 6px',
        }}>{activo?'Activo':'Inactivo'}</span>

        {u.primer_ingreso && (
          <span onClick={onPass} style={{
            background:'#FFFBEB',color:'#92400E',border:'1px solid #FDE68A',
            borderRadius:4,fontSize:'.52rem',padding:'2px 5px',fontWeight:700,
            cursor:'pointer',fontFamily:"'DM Mono','Fira Code',monospace",
          }}>🔑 Clave</span>
        )}

        <div style={{marginLeft:'auto',position:'relative'}} ref={ref}>
          <button onClick={e=>{e.stopPropagation();setOpen(o=>!o);}}
            style={{background:'none',border:'none',cursor:'pointer',color:'#9CA3AF',
              display:'flex',alignItems:'center',justifyContent:'center',
              width:26,height:26,borderRadius:6,padding:0}}
            onMouseEnter={e=>{e.currentTarget.style.background='#F3F4F6';e.currentTarget.style.color='#374151';}}
            onMouseLeave={e=>{e.currentTarget.style.background='none';e.currentTarget.style.color='#9CA3AF';}}
          ><MoreVertical size={14}/></button>
          {open && (
            <div style={{position:'absolute',right:0,top:'110%',zIndex:100,background:'#fff',
              border:'1px solid #E5E7EB',borderRadius:10,minWidth:175,
              boxShadow:'0 8px 24px rgba(0,0,0,.13)',overflow:'hidden'}}>
              {[
                {l:activo?'Desactivar':'Activar',c:activo?'#DC2626':'#16A34A',
                 I:activo?UserX:UserCheck,
                 fn:()=>{setOpen(false);onEstado(activo?'inactivo':'activo');}},
                {l:'Editar usuario',c:'#1A56DB',I:Edit,
                 fn:()=>{setOpen(false);onEdit();}},
                {l:'Cambiar contraseña',c:'#374151',I:Key,
                 fn:()=>{setOpen(false);onPass();}},
                null,
                {l:'Eliminar',c:'#DC2626',I:Trash2,
                 fn:()=>{setOpen(false);onDel();}},
              ].map((item,i)=>item===null
                ? <div key={i} style={{borderTop:'1px solid #F1F5F9'}}/>
                : <MenuBtn key={i} {...item}/>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── AVATAR CENTRADO (protagonista) ── */}
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',padding:'18px 16px 0'}}>
        {/* Halo exterior del color del usuario */}
        <div style={{
          padding:3,borderRadius:'50%',
          background:`linear-gradient(135deg, ${accentColor}55, ${accentColor}22)`,
          boxShadow:`0 0 0 3px ${accentColor}22`,
          marginBottom:10,
        }}>
          <UserAvatar u={u} size={68}/>
        </div>

        {/* Nombre */}
        <div style={{fontWeight:800,fontSize:'1rem',color:'#111827',textAlign:'center',lineHeight:1.2,marginBottom:3}}>
          {u.nombre_completo}
        </div>
        <div style={{fontFamily:"'DM Mono','Fira Code',monospace",fontSize:'.65rem',color:'#9CA3AF',marginBottom:16}}>
          @{u.nombre_usuario}
        </div>

        {/* Línea del color del usuario */}
        <div style={{
          width:'85%',height:2,borderRadius:2,marginBottom:14,
          background:`linear-gradient(90deg, transparent, ${accentColor}, transparent)`,
          boxShadow:`0 1px 6px ${accentColor}55`,
        }}/>
      </div>

      {/* ── DATOS ── */}
      <div style={{padding:'0 16px 12px',flex:1}}>
        <div style={{display:'grid',gridTemplateColumns:'auto 1fr',gap:'2px 0',fontSize:'.78rem'}}>

          <span style={{fontFamily:"'DM Mono','Fira Code',monospace",fontSize:'.58rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'.07em',color:'#9CA3AF',paddingRight:10,whiteSpace:'nowrap',display:'flex',alignItems:'center'}}>CORREO</span>
          <span style={{borderBottom:'1px dashed #F3F4F6',paddingBottom:5,marginBottom:5,color:'#374151',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{u.correo_electronico||'—'}</span>

          <span style={{fontFamily:"'DM Mono','Fira Code',monospace",fontSize:'.58rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'.07em',color:'#9CA3AF',paddingRight:10,whiteSpace:'nowrap',display:'flex',alignItems:'center'}}>TELÉFONO</span>
          <div style={{borderBottom:'1px dashed #F3F4F6',paddingBottom:5,marginBottom:5,display:'flex',alignItems:'center',gap:6}}>
            <span style={{color:'#374151'}}>{u.telefono||'—'}</span>
            {waLink && (
              <a href={waLink} target="_blank" rel="noopener noreferrer"
                onClick={e=>e.stopPropagation()} title="Abrir en WhatsApp"
                style={{display:'inline-flex',alignItems:'center',justifyContent:'center',
                  width:19,height:19,borderRadius:5,background:'#25D366',
                  textDecoration:'none',flexShrink:0,boxShadow:'0 1px 4px rgba(37,211,102,.3)'}}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="white">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
                </svg>
              </a>
            )}
          </div>

          <span style={{fontFamily:"'DM Mono','Fira Code',monospace",fontSize:'.58rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'.07em',color:'#9CA3AF',paddingRight:10,whiteSpace:'nowrap',display:'flex',alignItems:'center'}}>DOC.</span>
          <span style={{borderBottom:'1px dashed #F3F4F6',paddingBottom:5,marginBottom:5,color:'#374151'}}>{u.documento||'—'}</span>

          <span style={{fontFamily:"'DM Mono','Fira Code',monospace",fontSize:'.58rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'.07em',color:'#9CA3AF',paddingRight:10,whiteSpace:'nowrap',display:'flex',alignItems:'center'}}>CREADO</span>
          <span style={{color:'#6B7280'}}>{fecha}</span>
        </div>
      </div>

      {/* ── FOOTER ── */}
      <div style={{
        display:'flex',alignItems:'center',justifyContent:'space-between',
        padding:'8px 14px',background:'#FAFAFA',borderTop:'1px solid #F3F4F6',
      }}>
        <span style={{fontFamily:"'DM Mono','Fira Code',monospace",fontSize:'.56rem',color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'.07em'}}>Acceso</span>
        <button onClick={onEdit}
          style={{fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif",
            fontSize:'.75rem',fontWeight:700,padding:'4px 14px',
            background:'#fff',border:'1.5px solid #D1D5DB',
            borderRadius:7,cursor:'pointer',color:'#374151',transition:'all .12s'}}
          onMouseEnter={e=>{e.currentTarget.style.background='#1A56DB';e.currentTarget.style.color='#fff';e.currentTarget.style.borderColor='#1A56DB';}}
          onMouseLeave={e=>{e.currentTarget.style.background='#fff';e.currentTarget.style.color='#374151';e.currentTarget.style.borderColor='#D1D5DB';}}
        >Editar</button>
      </div>
    </div>
  );
}

function MenuBtn({l,c,I,fn}) {
  const [h,setH]=useState(false);
  return (
    <button onClick={fn} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{display:'flex',alignItems:'center',gap:9,width:'100%',padding:'9px 14px',
        background:h?'var(--bg)':'none',border:'none',cursor:'pointer',
        color:c,fontSize:'.82rem',fontWeight:600,textAlign:'left'}}>
      <I size={13}/>{l}
    </button>
  );
}

/* ─── PÁGINA ─────────────────────────────────────────────── */
export default function Usuarios() {
  const [data,    setData]   = useState({data:[],total:0,limit:50});
  const [roles,   setRoles]  = useState([]);
  const [loading, setLoad]   = useState(true);
  const [search,  setSearch] = useState('');
  // FIX usuarios inactivos: default a 'activo' para que al "eliminar" un usuario
  // con proyectos asociados (que se soft-deletea a 'inactivo'), DESAPAREZCA
  // visualmente de la lista. El usuario puede cambiar el filtro a "Inactivo"
  // para ver los desactivados o a "Todos" para ambos.
  const [fEst,    setFEst]   = useState('activo');
  const [fRol,    setFRol]   = useState('');
  const [sel,     setSel]    = useState(new Set());
  const [page,    setPage]   = useState(1);

  // Modales — solo uno abierto a la vez
  const [modalU,    setModalU]   = useState(null); // null | 'crear' | usuario{}
  const [modalPass, setModalPass]= useState(null); // null | usuario{}
  const [modalImp,  setModalImp] = useState(false);
  const [modalAud,  setModalAud] = useState(false);
  const [confirm,   setConfirm]  = useState(null);
  const [audit,     setAudit]    = useState([]);
  const timer = useRef(null);

  // FIX bug "Confirmación requerida" en eliminar usuario:
  // DELETE /usuarios/:id está protegida por requirePassword en el backend.
  // El modal Confirm local NO pide contraseña → backend respondía 400 y la UI
  // mostraba "Error". Usamos el hook estándar del sistema (mismo que Proyectos,
  // Cotizaciones, Materiales, etc.) que ya tiene el flujo con input password.
  const { confirm: confirmDel, modal: delModal } = useConfirmDelete();

  const load = useCallback(async (p=page) => {
    setLoad(true);
    try {
      const qs = new URLSearchParams({search,estado:fEst,rol:fRol,page:p,limit:50});
      const [u,r] = await Promise.all([api.get(`/usuarios?${qs}`),api.get('/roles')]);
      setData(u.data); setRoles(r.data); setSel(new Set());
    } catch { toast.error('Error al cargar'); }
    finally { setLoad(false); }
  },[search,fEst,fRol,page]);

  useEffect(()=>{
    clearTimeout(timer.current);
    timer.current = setTimeout(()=>{setPage(1);load(1);},320);
    return ()=>clearTimeout(timer.current);
  },[search,fEst,fRol]);

  useEffect(()=>{ load(page); },[page]);

  const usuarios   = data.data||[];
  const totalPages = Math.ceil((data.total||0)/50);

  const toggleSel = id => setSel(p=>{
    const n=new Set(p); const nid=Number(id);
    n.has(nid)?n.delete(nid):n.add(nid); return n;
  });
  const toggleAll = () => {
    if(sel.size===usuarios.length) setSel(new Set());
    else setSel(new Set(usuarios.map(u=>Number(u.id_usuario))));
  };

  const doEstado = (u, estado) => setConfirm({
    titulo:`Cambiar estado`, peligroso:estado==='inactivo',
    msg:`¿Cambiar a ${estado==='activo'?'ACTIVO':'INACTIVO'} a ${u.nombre_completo}?`,
    fn: async()=>{
      try{ await api.patch(`/usuarios/${u.id_usuario}/estado`,{estado}); toast.success('Estado actualizado'); load(); }
      catch(e){ toast.error(e.response?.data?.error||'Error'); }
      setConfirm(null);
    }
  });

  const doDel = (u) => confirmDel({
    title: 'Eliminar usuario',
    itemLabel: u.nombre_completo,
    warningText: 'Si el usuario tiene registros vinculados (proyectos, cotizaciones, etc.) será desactivado en lugar de eliminado físicamente.',
    onConfirm: async (password) => {
      // FIX: enviar contraseña en el body, como esperan requirePassword middleware
      // y como hacen Proyectos.jsx, Cotizaciones.jsx, Materiales.jsx, etc.
      try {
        const { data: r } = await api.delete(`/usuarios/${u.id_usuario}`, {
          data: { password }
        });
        toast.success(r.message || 'Usuario eliminado');
        load();
      } catch (e) {
        // Re-lanzar para que el modal NO se cierre y muestre el error
        // (típicamente "Contraseña incorrecta" si la pwd falló).
        const msg = e.response?.data?.error || 'Error al eliminar usuario';
        toast.error(msg);
        throw e;
      }
    }
  });

  const doMasiva = action => {
    const lbs={activate:'Activar',deactivate:'Desactivar',delete:'Eliminar'};
    // FIX v47: el borrado masivo ahora exige contraseña igual que el individual.
    // Antes usaba el modal de confirmación simple (sin password), lo que dejaba
    // eliminar usuarios en lote sin confirmar identidad. Para 'delete' usamos el
    // mismo hook con input de contraseña; para activar/desactivar (no
    // destructivas) seguimos con la confirmación simple.
    if (action === 'delete') {
      confirmDel({
        title: `Eliminar ${sel.size} usuario(s)`,
        itemLabel: `${sel.size} usuario(s) seleccionado(s)`,
        warningText: 'Los que tengan registros vinculados (proyectos, cotizaciones, etc.) serán desactivados en lugar de eliminados.',
        onConfirm: async (password) => {
          try {
            const { data: r } = await api.post('/usuarios/bulk-action', { action, ids:[...sel], password });
            toast.success(`${r.exitosos} procesados`);
            load();
          } catch (e) {
            toast.error(e.response?.data?.error || 'Error');
            throw e; // mantener el modal abierto si la contraseña falló
          }
        }
      });
      return;
    }
    setConfirm({
      titulo:`${lbs[action]} seleccionados`, peligroso:false,
      msg:`¿${lbs[action]} ${sel.size} usuario(s)?`,
      fn: async()=>{
        try{ const {data:r}=await api.post('/usuarios/bulk-action',{action,ids:[...sel]}); toast.success(`${r.exitosos} procesados`); load(); }
        catch(e){ toast.error(e.response?.data?.error||'Error'); }
        setConfirm(null);
      }
    });
  };

  return (
    <>
      {/* Header */}
      <div className="page-header">
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <Shield size={22} style={{color:'var(--primary)'}}/>
          <div>
            <h1>Usuarios</h1>
            <p style={{color:'var(--text-muted)',fontSize:'.875rem',marginTop:2}}>
              {data.total} usuarios en total
            </p>
          </div>
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <button className="btn btn-outline" style={{display:'flex',alignItems:'center',gap:6}}
            onClick={async()=>{
              setModalAud(true);
              try{ const {data:a}=await api.get('/usuarios/auditoria?limit=50'); setAudit(a.data); }
              catch{ toast.error('Error'); }
            }}>
            <ClipboardList size={15}/> Auditoría
          </button>
          <button className="btn btn-outline" style={{display:'flex',alignItems:'center',gap:6}}
            onClick={()=>setModalImp(true)}>
            <Upload size={15}/> Importar
          </button>
          <button className="btn btn-primary" style={{display:'flex',alignItems:'center',gap:6}}
            onClick={()=>setModalU('crear')}>
            <Plus size={16}/> Nuevo Usuario
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="card" style={{padding:'1rem',marginBottom:'1rem'}}>
        <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
          <div style={{position:'relative',flex:1,minWidth:200}}>
            <Search size={14} style={{position:'absolute',left:11,top:'50%',transform:'translateY(-50%)',color:'var(--text-muted)'}}/>
            <input placeholder="Buscar nombre, usuario, correo…" value={search}
              style={{paddingLeft:34}} onChange={e=>setSearch(e.target.value)}/>
          </div>
          <select value={fEst} style={{width:150}} onChange={e=>{setFEst(e.target.value);setPage(1);}}>
            <option value="">Todos los estados</option>
            <option value="activo">Activo</option>
            <option value="inactivo">Inactivo</option>
          </select>
          <select value={fRol} style={{width:160}} onChange={e=>{setFRol(e.target.value);setPage(1);}}>
            <option value="">Todos los roles</option>
            {roles.map(r=><option key={r.id_rol} value={r.nombre}>{r.nombre}</option>)}
          </select>
          {(search||fEst||fRol)&&(
            <button className="btn btn-outline btn-sm"
              onClick={()=>{setSearch('');setFEst('');setFRol('');setPage(1);}}>
              <X size={13}/> Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Tabla */}
      <div className="card" style={{padding:0,overflow:'hidden'}}>
        {loading?(
          <div style={{textAlign:'center',padding:'3rem'}}><div className="spinner" style={{margin:'0 auto'}}/></div>
        ):usuarios.length===0?(
          <div className="empty-state" style={{padding:'3rem'}}><User size={44}/><p>Sin usuarios</p></div>
        ):(
          <div style={{padding:'4px 0 8px'}}>
            {/* Select all strip */}
            <div style={{display:'flex',alignItems:'center',gap:8,padding:'6px 16px 10px',borderBottom:'1px solid rgba(75,85,99,.12)',marginBottom:8}}>
              <input type="checkbox"
                checked={usuarios.length>0&&sel.size===usuarios.length}
                onChange={toggleAll}
                style={{width:15,height:15,cursor:'pointer',accentColor:'#1A56DB'}}/>
              <span style={{fontFamily:"'DM Mono','Fira Code',monospace",fontSize:'.62rem',color:'#6B7280',textTransform:'uppercase',letterSpacing:'.08em'}}>
                {sel.size > 0 ? `${sel.size} seleccionado${sel.size!==1?'s':''}` : 'Seleccionar todos'}
              </span>
            </div>
            {/* Cards grid */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))',gap:12,padding:'0 12px 16px'}}>
              {usuarios.map(u=>(
                <Fila key={u.id_usuario} u={u}
                  sel={sel.has(Number(u.id_usuario))}
                  onSel={()=>toggleSel(u.id_usuario)}
                  onEdit={()=>setModalU(u)}
                  onEstado={e=>doEstado(u,e)}
                  onDel={()=>doDel(u)}
                  onPass={()=>setModalPass(u)}
                />
              ))}
            </div>
          </div>
        )}
        {totalPages>1&&(
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
            padding:'12px 16px',borderTop:'1px solid var(--border)',flexWrap:'wrap',gap:8}}>
            <span style={{fontSize:'.8rem',color:'var(--text-muted)'}}>
              {(page-1)*50+1}–{Math.min(page*50,data.total)} de {data.total}
            </span>
            <div style={{display:'flex',gap:6,alignItems:'center'}}>
              <button className="btn btn-outline btn-sm" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>
                <ChevronLeft size={14}/>
              </button>
              <span style={{fontSize:'.82rem',fontWeight:700,padding:'0 8px'}}>{page}/{totalPages}</span>
              <button className="btn btn-outline btn-sm" disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)}>
                <ChevronRight size={14}/>
              </button>
            </div>
          </div>
        )}
      </div>

      {sel.size>0&&<BarraMasiva n={sel.size} onAction={doMasiva} onClear={()=>setSel(new Set())}/>}

      {/* MODALES — renderizados aquí mismo, sin portal */}
      {modalU&&(
        <ModalUsuario
          modo={modalU==='crear'?'crear':'editar'}
          usuario={modalU!=='crear'?modalU:null}
          roles={roles}
          onClose={()=>setModalU(null)}
          onOk={()=>{setModalU(null);load();}}
        />
      )}
      {modalPass&&(
        <ModalCambiarPass
          usuario={modalPass}
          onClose={()=>setModalPass(null)}
          onOk={()=>{setModalPass(null);load();}}
        />
      )}
      {modalImp&&(
        <ModalImportar onClose={()=>setModalImp(false)} onOk={()=>load()}/>
      )}
      {confirm&&(
        <Confirm titulo={confirm.titulo} msg={confirm.msg} peligroso={confirm.peligroso}
          onOk={confirm.fn} onClose={()=>setConfirm(null)}/>
      )}
      {/* Modal de eliminación con confirmación por contraseña (DELETE /usuarios/:id) */}
      {delModal}
      {modalAud&&(
        <Modal onClose={()=>setModalAud(false)} maxWidth={700}>
          <div className="modal-header">
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <ClipboardList size={18} style={{color:'var(--primary)'}}/>
              <h2 style={{fontWeight:800}}>Auditoría</h2>
            </div>
            <button className="btn btn-outline btn-sm" onClick={()=>setModalAud(false)}><X size={15}/></button>
          </div>
          <div className="modal-body" style={{maxHeight:'60vh',overflowY:'auto'}}>
            {audit.length===0?(
              <p style={{textAlign:'center',color:'var(--text-muted)',padding:'2rem'}}>Sin registros</p>
            ):(
              <table style={{fontSize:'.8rem'}}>
                <thead><tr><th>Fecha</th><th>Acción</th><th>Por</th><th>Afectado</th><th>Detalle</th></tr></thead>
                <tbody>
                  {audit.map(a=>(
                    <tr key={a.id}>
                      <td style={{whiteSpace:'nowrap',color:'var(--text-muted)'}}>{new Date(a.fecha).toLocaleString('es-CO')}</td>
                      <td><span className="badge badge-blue" style={{fontSize:'.65rem'}}>{a.accion}</span></td>
                      <td>{a.realizado_por_nombre||'—'}</td>
                      <td>{a.usuario_afectado||'—'}</td>
                      <td style={{maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:'var(--text-muted)'}}>{a.detalle||'—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
