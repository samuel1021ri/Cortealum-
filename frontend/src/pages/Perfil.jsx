import { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import toast from 'react-hot-toast';
import {
  User, AtSign, Phone, Lock, Eye, EyeOff, Save, Camera,
  Palette, Type, CheckCircle, AlertTriangle, Shield
} from 'lucide-react';
import './Perfil.css';

const PRESET_COLORS = [
  '#1565C0','#0D47A1','#1A1D21','#1565C0','#057a55',
  '#7e22ce','#dc2626','#0891b2','#854d0e','#065f46',
];
const PRESET_GRADIENTS = [
  'linear-gradient(135deg,#1565C0,#0D47A1)',
  'linear-gradient(135deg,#1A1D21,#3A424C)',
  'linear-gradient(135deg,#1565C0,#0d47a1)',
  'linear-gradient(135deg,#057a55,#065f46)',
  'linear-gradient(135deg,#7e22ce,#581c87)',
  'linear-gradient(135deg,#dc2626,#991b1b)',
  'linear-gradient(135deg,#0891b2,#0e7490)',
  'linear-gradient(135deg,#854d0e,#713f12)',
];

function AvatarPreview({ color, letra, url, nombre, size = 80 }) {
  const initials = letra || (nombre ? nombre.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase() : 'U');
  const style = {
    width: size, height: size, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: size * 0.35, fontWeight: 900, color: '#fff',
    background: url ? 'transparent' : (color || 'linear-gradient(135deg,#1565C0,#0D47A1)'),
    overflow: 'hidden', flexShrink: 0, userSelect: 'none',
    border: '3px solid rgba(255,255,255,.2)',
    boxShadow: '0 4px 16px rgba(0,0,0,.18)',
    fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: '.05em',
  };
  return (
    <div style={style}>
      {url ? <img src={url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/> : initials}
    </div>
  );
}

export default function Perfil() {
  const { user, updateUser } = useAuth();
  const fileRef = useRef();
  const [activeSection, setActiveSection] = useState('info');
  const [saving, setSaving] = useState(false);

  // Form state
  const [info, setInfo] = useState({
    nombre_completo: user?.nombre || '',
    correo_electronico: user?.correo || '',
    telefono: user?.telefono || '',
  });
  const [pass, setPass] = useState({ actual: '', nueva: '', confirmar: '' });
  const [showPass, setShowPass] = useState({ actual: false, nueva: false, confirmar: false });
  const [avatar, setAvatar] = useState({
    color: user?.avatar_color || PRESET_GRADIENTS[0],
    letra: user?.avatar_letra || '',
    url: user?.avatar_url || '',
  });
  const [previewUrl, setPreviewUrl] = useState(user?.avatar_url || '');

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('Imagen máx. 2MB'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      setPreviewUrl(dataUrl);
      setAvatar(a => ({ ...a, url: dataUrl }));
    };
    reader.readAsDataURL(file);
  };

  const handleSaveInfo = async () => {
    if (!info.nombre_completo.trim()) return toast.error('El nombre es requerido');
    setSaving(true);
    try {
      const { data } = await api.put('/auth/perfil', {
        ...info,
        avatar_color: avatar.color,
        avatar_letra: avatar.letra,
        avatar_url: avatar.url || null,
      });
      updateUser({
        nombre: data.user.nombre_completo,
        correo: data.user.correo_electronico,
        telefono: data.user.telefono,
        avatar_color: data.user.avatar_color,
        avatar_letra: data.user.avatar_letra,
        avatar_url: data.user.avatar_url,
      });
      toast.success('✅ Perfil actualizado');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar');
    } finally { setSaving(false); }
  };

  const handleSavePass = async () => {
    if (!pass.actual) return toast.error('Ingresa tu contraseña actual');
    if (pass.nueva.length < 6) return toast.error('Mínimo 6 caracteres');
    if (pass.nueva !== pass.confirmar) return toast.error('Las contraseñas no coinciden');
    setSaving(true);
    try {
      await api.post('/auth/cambiar-password', {
        contrasena_actual: pass.actual,
        contrasena_nueva: pass.nueva,
      });
      toast.success('✅ Contraseña actualizada');
      setPass({ actual: '', nueva: '', confirmar: '' });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error');
    } finally { setSaving(false); }
  };

  const SECTIONS = [
    { key:'info',    label:'Información', icon: User },
    { key:'avatar',  label:'Avatar',      icon: Palette },
    { key:'pass',    label:'Contraseña',  icon: Lock },
  ];

  return (
    <div className="perfil-page">
      {/* Header card */}
      <div className="perfil-hero">
        <div className="perfil-hero-bg"/>
        <div className="perfil-hero-content">
          <div className="perfil-hero-avatar">
            <AvatarPreview color={avatar.color} letra={avatar.letra} url={previewUrl} nombre={info.nombre_completo} size={88}/>
          </div>
          <div className="perfil-hero-info">
            <div className="perfil-hero-name">{info.nombre_completo || 'Sin nombre'}</div>
            <div className="perfil-hero-meta">
              <span className="perfil-role-badge">
                <Shield size={11}/> {user?.rol}
              </span>
              {info.correo_electronico && <span className="perfil-meta-item"><AtSign size={11}/>{info.correo_electronico}</span>}
              {info.telefono && <span className="perfil-meta-item"><Phone size={11}/>{info.telefono}</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="perfil-layout">
        {/* Sidebar tabs */}
        <aside className="perfil-tabs">
          {SECTIONS.map(s => (
            <button
              key={s.key}
              className={`perfil-tab${activeSection===s.key?' active':''}`}
              onClick={()=>setActiveSection(s.key)}
            >
              <s.icon size={17}/>
              <span>{s.label}</span>
            </button>
          ))}
        </aside>

        {/* Content */}
        <div className="perfil-content">

          {/* ── INFORMACIÓN ── */}
          {activeSection === 'info' && (
            <div className="perfil-section">
              <div className="perfil-section-header">
                <User size={20} className="psh-icon"/>
                <div>
                  <h2>Información Personal</h2>
                  <p>Actualiza tus datos de contacto e identificación</p>
                </div>
              </div>
              <div className="perfil-form-grid">
                <div className="form-group">
                  <label>Nombre Completo *</label>
                  <div className="input-icon-wrap">
                    <User size={15} className="fi-icon"/>
                    <input value={info.nombre_completo} onChange={e=>setInfo({...info,nombre_completo:e.target.value})} placeholder="Ej: Carlos Rodríguez"/>
                  </div>
                </div>
                <div className="form-group">
                  <label>Nombre de Usuario</label>
                  <div className="input-icon-wrap">
                    <span className="fi-icon" style={{fontSize:'.85rem',fontWeight:800,color:'var(--primary)',left:12}}>@</span>
                    <input value={user?.usuario||''} disabled style={{paddingLeft:32,opacity:.6,background:'var(--bg)'}}/>
                  </div>
                  <small style={{color:'var(--text-muted)',fontSize:'.72rem'}}>El nombre de usuario no puede cambiarse</small>
                </div>
                <div className="form-group">
                  <label>Correo Electrónico</label>
                  <div className="input-icon-wrap">
                    <AtSign size={15} className="fi-icon"/>
                    <input type="email" value={info.correo_electronico} onChange={e=>setInfo({...info,correo_electronico:e.target.value})} placeholder="correo@ejemplo.com"/>
                  </div>
                </div>
                <div className="form-group">
                  <label>Teléfono</label>
                  <div className="input-icon-wrap">
                    <Phone size={15} className="fi-icon"/>
                    <input type="tel" value={info.telefono} onChange={e=>setInfo({...info,telefono:e.target.value})} placeholder="310 123 4567"/>
                  </div>
                </div>
              </div>
              <div className="perfil-form-actions">
                <button className="btn btn-primary" onClick={handleSaveInfo} disabled={saving}>
                  <Save size={15}/>{saving?'Guardando...':'Guardar Cambios'}
                </button>
              </div>
            </div>
          )}

          {/* ── AVATAR ── */}
          {activeSection === 'avatar' && (
            <div className="perfil-section">
              <div className="perfil-section-header">
                <Palette size={20} className="psh-icon"/>
                <div>
                  <h2>Personalizar Avatar</h2>
                  <p>Elige una foto, un color o personaliza tus iniciales</p>
                </div>
              </div>

              {/* Preview grande */}
              <div className="avatar-preview-center">
                <AvatarPreview color={avatar.color} letra={avatar.letra} url={previewUrl} nombre={info.nombre_completo} size={110}/>
                <div>
                  <p style={{fontWeight:700,fontSize:'.9rem',marginBottom:4}}>Vista previa</p>
                  <p style={{fontSize:'.8rem',color:'var(--text-muted)'}}>Así verán tu avatar en el sistema</p>
                </div>
              </div>

              {/* Subir foto */}
              <div className="avatar-block">
                <div className="avatar-block-label"><Camera size={15}/> Foto de perfil</div>
                <input ref={fileRef} type="file" accept="image/*" style={{display:'none'}} onChange={handleFileChange}/>
                <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
                  <button className="btn btn-outline" onClick={()=>fileRef.current.click()}>
                    <Camera size={15}/> Subir imagen
                  </button>
                  {previewUrl && (
                    <button className="btn btn-outline" style={{color:'var(--danger)',borderColor:'var(--danger)'}}
                      onClick={()=>{ setPreviewUrl(''); setAvatar(a=>({...a,url:''})); }}>
                      Quitar foto
                    </button>
                  )}
                  <small style={{color:'var(--text-muted)',fontSize:'.75rem'}}>JPG, PNG · máx. 2MB</small>
                </div>
              </div>

              {/* Color / gradiente */}
              <div className="avatar-block">
                <div className="avatar-block-label"><Palette size={15}/> Color de fondo</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:10}}>
                  {PRESET_GRADIENTS.map((g,i)=>(
                    <button key={i} onClick={()=>setAvatar(a=>({...a,color:g,url:''}))} style={{
                      width:36,height:36,borderRadius:'50%',background:g,border:'none',cursor:'pointer',
                      outline: avatar.color===g ? '3px solid var(--primary)' : '3px solid transparent',
                      outlineOffset:2,transition:'outline .15s',
                    }}/>
                  ))}
                  {PRESET_COLORS.map((c,i)=>(
                    <button key={'c'+i} onClick={()=>setAvatar(a=>({...a,color:c,url:''}))} style={{
                      width:36,height:36,borderRadius:'50%',background:c,border:'none',cursor:'pointer',
                      outline: avatar.color===c ? '3px solid var(--primary)' : '3px solid transparent',
                      outlineOffset:2,transition:'outline .15s',
                    }}/>
                  ))}
                </div>
                <div style={{display:'flex',gap:8,alignItems:'center'}}>
                  <label style={{fontSize:'.78rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.05em'}}>Color personalizado:</label>
                  <input type="color" value={avatar.color.startsWith('#')?avatar.color:'#1565C0'}
                    onChange={e=>setAvatar(a=>({...a,color:e.target.value,url:''}))}
                    style={{width:36,height:30,border:'1.5px solid var(--border)',borderRadius:6,cursor:'pointer',padding:2}}
                  />
                </div>
              </div>

              {/* Letra/iniciales personalizada */}
              <div className="avatar-block">
                <div className="avatar-block-label"><Type size={15}/> Texto / Iniciales</div>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <input
                    maxLength={3}
                    placeholder={`Auto: ${(info.nombre_completo||'').split(' ').slice(0,2).map(w=>w[0]||'').join('').toUpperCase()||'CA'}`}
                    value={avatar.letra}
                    onChange={e=>setAvatar(a=>({...a,letra:e.target.value.toUpperCase()}))}
                    style={{width:100,textAlign:'center',fontWeight:800,fontSize:'1.1rem',letterSpacing:'.08em',textTransform:'uppercase'}}
                  />
                  <small style={{color:'var(--text-muted)',fontSize:'.78rem'}}>Máx. 3 caracteres. Vacío = iniciales automáticas.</small>
                </div>
              </div>

              <div className="perfil-form-actions">
                <button className="btn btn-primary" onClick={handleSaveInfo} disabled={saving}>
                  <Save size={15}/>{saving?'Guardando...':'Guardar Avatar'}
                </button>
              </div>
            </div>
          )}

          {/* ── CONTRASEÑA ── */}
          {activeSection === 'pass' && (
            <div className="perfil-section">
              <div className="perfil-section-header">
                <Lock size={20} className="psh-icon"/>
                <div>
                  <h2>Cambiar Contraseña</h2>
                  <p>Actualiza tu contraseña de acceso al sistema</p>
                </div>
              </div>
              <div style={{maxWidth:400}}>
                <div className="form-group">
                  <label>Contraseña Actual</label>
                  <div className="pass-wrap">
                    <input type={showPass.actual?'text':'password'} value={pass.actual}
                      onChange={e=>setPass({...pass,actual:e.target.value})} placeholder="Tu contraseña actual"/>
                    <button type="button" className="pass-toggle" onClick={()=>setShowPass(s=>({...s,actual:!s.actual}))}>
                      {showPass.actual?<EyeOff size={16}/>:<Eye size={16}/>}
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label>Nueva Contraseña</label>
                  <div className="pass-wrap">
                    <input type={showPass.nueva?'text':'password'} value={pass.nueva}
                      onChange={e=>setPass({...pass,nueva:e.target.value})} placeholder="Mínimo 6 caracteres"/>
                    <button type="button" className="pass-toggle" onClick={()=>setShowPass(s=>({...s,nueva:!s.nueva}))}>
                      {showPass.nueva?<EyeOff size={16}/>:<Eye size={16}/>}
                    </button>
                  </div>
                  {pass.nueva && (
                    <div style={{marginTop:6,display:'flex',alignItems:'center',gap:6,fontSize:'.75rem'}}>
                      {pass.nueva.length >= 6
                        ? <><CheckCircle size={13} style={{color:'var(--success)'}}/><span style={{color:'var(--success)',fontWeight:700}}>Segura</span></>
                        : <><AlertTriangle size={13} style={{color:'var(--warning)'}}/><span style={{color:'var(--warning)',fontWeight:700}}>Muy corta</span></>
                      }
                    </div>
                  )}
                </div>
                <div className="form-group">
                  <label>Confirmar Contraseña</label>
                  <div className="pass-wrap">
                    <input type={showPass.confirmar?'text':'password'} value={pass.confirmar}
                      onChange={e=>setPass({...pass,confirmar:e.target.value})} placeholder="Repite la contraseña"/>
                    <button type="button" className="pass-toggle" onClick={()=>setShowPass(s=>({...s,confirmar:!s.confirmar}))}>
                      {showPass.confirmar?<EyeOff size={16}/>:<Eye size={16}/>}
                    </button>
                  </div>
                  {pass.confirmar && (
                    <div style={{marginTop:6,display:'flex',alignItems:'center',gap:6,fontSize:'.75rem'}}>
                      {pass.nueva===pass.confirmar
                        ? <><CheckCircle size={13} style={{color:'var(--success)'}}/><span style={{color:'var(--success)',fontWeight:700}}>Coinciden</span></>
                        : <><AlertTriangle size={13} style={{color:'var(--danger)'}}/><span style={{color:'var(--danger)',fontWeight:700}}>No coinciden</span></>
                      }
                    </div>
                  )}
                </div>
              </div>
              <div className="perfil-form-actions">
                <button className="btn btn-primary" onClick={handleSavePass} disabled={saving||!pass.actual||!pass.nueva||pass.nueva!==pass.confirmar}>
                  <Lock size={15}/>{saving?'Guardando...':'Cambiar Contraseña'}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
