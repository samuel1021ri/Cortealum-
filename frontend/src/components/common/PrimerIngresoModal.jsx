import { useState } from 'react';
import { Lock, Eye, EyeOff, CheckCircle, AlertTriangle, ShieldCheck } from 'lucide-react';
import api from '../../api/client';
import toast from 'react-hot-toast';

function Regla({ ok, txt }) {
  return (
    <div style={{display:'flex',alignItems:'center',gap:7,fontSize:'.78rem',color:ok?'#16a34a':'#9ca3af'}}>
      <CheckCircle size={13} style={{color:ok?'#16a34a':'#d1d5db',flexShrink:0}}/>
      {txt}
    </div>
  );
}

export default function PrimerIngresoModal({ user, onContinuar, onCambiar }) {
  const [pantalla, setPantalla] = useState('decision'); // 'decision' | 'cambiar'
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [ver, setVer] = useState(false);
  const [busy, setBusy] = useState(false);

  // Cuando el usuario elige continuar sin cambiar contraseña,
  // marcamos primer_ingreso=false en la BD para que no vuelva a aparecer
  const handleContinuar = async () => {
    try {
      await api.put(`/usuarios/${user.id}/omitir-primer-ingreso`);
    } catch {
      // Si falla la BD igual cerramos, el localStorage ya lo tiene en false
    }
    onContinuar();
  };

  const r = {
    len:     p1.length >= 8,
    mayus:   /[A-Z]/.test(p1),
    num:     /[0-9]/.test(p1),
    igual:   p1.length > 0 && p1 === p2,
  };
  const valida = r.len && r.igual;

  const guardar = async () => {
    if (!valida) return;
    setBusy(true);
    try {
      await api.put(`/usuarios/${user.id}/cambiar-password-primer-ingreso`, { contraseña: p1 });
      toast.success('¡Contraseña actualizada!');
      onCambiar();
    } catch(e) {
      toast.error(e.response?.data?.error || 'Error al guardar');
    } finally { setBusy(false); }
  };

  return (
    // position:fixed directo — sin portal, sin capas extra
    // z-index 9999 garantiza que esté encima de todo
    <div style={{
      position:'fixed', inset:0, zIndex:9999,
      background:'rgba(0,0,0,.65)', backdropFilter:'blur(4px)',
      display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem',
    }}>
      <div style={{
        background:'var(--surface)', borderRadius:20, width:'100%', maxWidth:450,
        boxShadow:'0 24px 80px rgba(0,0,0,.35)', overflow:'hidden',
      }}
        // stopPropagation para que clicks dentro no suban al fondo
        onClick={e=>e.stopPropagation()}
      >
        {/* Cabecera azul */}
        <div style={{
          background:'linear-gradient(135deg,#1565C0,#0D47A1)',
          padding:'1.5rem 1.75rem',
          display:'flex', flexDirection:'column', alignItems:'center', gap:10,
        }}>
          <div style={{
            width:56, height:56, borderRadius:'50%',
            background:'rgba(255,255,255,.18)',
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>
            <ShieldCheck size={28} style={{color:'#fff'}}/>
          </div>
          <div style={{textAlign:'center'}}>
            <h2 style={{color:'#fff',fontWeight:900,fontSize:'1.1rem',margin:0}}>
              ¡Bienvenido, {user?.nombre?.split(' ')[0]}!
            </h2>
            <p style={{color:'rgba(255,255,255,.75)',fontSize:'.82rem',marginTop:4,margin:'4px 0 0'}}>
              Primer ingreso al sistema
            </p>
          </div>
        </div>

        {/* ── DECISIÓN ── */}
        {pantalla === 'decision' && (
          <div style={{padding:'1.5rem 1.75rem'}}>
            <div style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:12,
              padding:'12px 14px',marginBottom:'1.25rem',display:'flex',gap:10,alignItems:'flex-start'}}>
              <AlertTriangle size={16} style={{color:'#d97706',flexShrink:0,marginTop:1}}/>
              <p style={{fontSize:'.83rem',color:'#92400e',lineHeight:1.55,margin:0}}>
                Estás usando la <strong>contraseña inicial</strong> asignada por el administrador.
                Te recomendamos cambiarla para mayor seguridad.
              </p>
            </div>
            <p style={{fontSize:'.88rem',color:'var(--text-secondary)',textAlign:'center',
              marginBottom:'1.25rem',lineHeight:1.5}}>
              ¿Qué deseas hacer?
            </p>
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              <button onClick={()=>setPantalla('cambiar')} style={{
                background:'linear-gradient(135deg,#1565C0,#0D47A1)',
                color:'#fff',border:'none',borderRadius:12,padding:'14px',
                cursor:'pointer',fontWeight:700,fontSize:'.9rem',
                display:'flex',alignItems:'center',justifyContent:'center',gap:10,
              }}>
                <Lock size={17}/> Cambiar mi contraseña ahora
              </button>
              <button onClick={handleContinuar} style={{
                background:'var(--bg)',color:'var(--text-secondary)',
                border:'1.5px solid var(--border)',borderRadius:12,
                padding:'12px',cursor:'pointer',fontWeight:600,fontSize:'.85rem',
              }}>
                Continuar con la contraseña actual
              </button>
            </div>
            <p style={{fontSize:'.72rem',color:'var(--text-muted)',textAlign:'center',marginTop:12}}>
              Podrás cambiarla más adelante desde tu perfil.
            </p>
          </div>
        )}

        {/* ── CAMBIAR ── */}
        {pantalla === 'cambiar' && (
          <div style={{padding:'1.5rem 1.75rem',display:'flex',flexDirection:'column',gap:'1rem'}}>
            <div className="form-group" style={{marginBottom:0}}>
              <label style={{fontWeight:700}}>Nueva contraseña</label>
              <div style={{position:'relative'}}>
                <input
                  type={ver?'text':'password'}
                  value={p1}
                  placeholder="Mínimo 8 caracteres"
                  onChange={e=>setP1(e.target.value)}
                  style={{paddingRight:38}}
                  autoComplete="new-password"
                />
                <button type="button" onClick={()=>setVer(v=>!v)} style={{
                  position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',
                  background:'none',border:'none',cursor:'pointer',
                  color:'var(--text-muted)',display:'flex',
                }}>
                  {ver?<EyeOff size={14}/>:<Eye size={14}/>}
                </button>
              </div>
            </div>

            {p1.length > 0 && (
              <div style={{background:'var(--bg)',borderRadius:10,padding:'10px 14px',
                border:'1px solid var(--border)',display:'flex',flexDirection:'column',gap:5}}>
                <Regla ok={r.len}   txt="Mínimo 8 caracteres"/>
                <Regla ok={r.mayus} txt="Al menos una mayúscula"/>
                <Regla ok={r.num}   txt="Al menos un número"/>
              </div>
            )}

            <div className="form-group" style={{marginBottom:0}}>
              <label style={{fontWeight:700}}>Confirmar contraseña</label>
              <input
                type={ver?'text':'password'}
                value={p2}
                placeholder="Repetir contraseña"
                onChange={e=>setP2(e.target.value)}
                autoComplete="new-password"
                style={{borderColor: p2.length>0?(r.igual?'#16a34a':'#dc2626'):undefined}}
              />
              {p2.length>0&&!r.igual&&<small style={{color:'#dc2626',fontSize:'.72rem'}}>No coinciden</small>}
              {p2.length>0&&r.igual &&<small style={{color:'#16a34a',fontSize:'.72rem'}}>✓ Coinciden</small>}
            </div>

            <button onClick={guardar} disabled={!valida||busy} style={{
              background:valida?'linear-gradient(135deg,#1565C0,#0D47A1)':'var(--border)',
              color:valida?'#fff':'var(--text-muted)',border:'none',borderRadius:12,
              padding:'14px',cursor:valida?'pointer':'not-allowed',fontWeight:700,
              fontSize:'.9rem',transition:'all .2s',marginTop:4,
            }}>
              {busy?'Guardando…':'Guardar nueva contraseña'}
            </button>

            <button onClick={()=>setPantalla('decision')} style={{
              background:'none',border:'none',cursor:'pointer',
              color:'var(--text-muted)',fontSize:'.82rem',textDecoration:'underline',
            }}>
              ← Volver
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
