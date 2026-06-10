/**
 * CorteAlum — Modal Global de Contraseña
 * ─────────────────────────────────────────────────────────────────────────────
 * Escucha el evento `global-password-prompt` emitido por el interceptor del
 * cliente axios. Cuando se dispara, muestra el modal pidiendo contraseña.
 *
 * Al confirmar, llama `resolveGlobalPasswordPrompt(password)` y el interceptor
 * reintenta automáticamente la petición que falló por PASSWORD_REQUIRED.
 *
 * Se monta UNA sola vez en App.jsx. Cualquier DELETE protegido por
 * requirePassword del backend dispara este modal automáticamente.
 */

import { useState, useEffect, useRef } from 'react';
import { X, AlertTriangle, Loader, Eye, EyeOff } from 'lucide-react';
import { resolveGlobalPasswordPrompt } from '../../api/client';

export default function GlobalPasswordPromptModal() {
  const [open, setOpen]       = useState(false);
  const [detalle, setDetalle] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError]     = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      setDetalle(e.detail?.detalle || '');
      setPassword('');
      // Si el interceptor nos dice que la contraseña anterior fue incorrecta,
      // mostramos el error inline y dejamos el modal abierto para reintento.
      setError(e.detail?.errorMsg || '');
      setShowPwd(false);
      setOpen(true);
      setTimeout(() => inputRef.current?.focus(), 50);
    };
    window.addEventListener('global-password-prompt', handler);
    return () => window.removeEventListener('global-password-prompt', handler);
  }, []);

  const cerrarCancelando = () => {
    resolveGlobalPasswordPrompt(null);
    setOpen(false);
  };

  const confirmar = (e) => {
    e?.preventDefault();
    if (!password.trim()) {
      setError('Ingresa tu contraseña');
      return;
    }
    resolveGlobalPasswordPrompt(password);
    // Cerramos el modal; si la contraseña es incorrecta, el interceptor
    // disparará el evento de nuevo (con errorMsg) y este componente lo reabre.
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') cerrarCancelando(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div
      onClick={cerrarCancelando}
      style={{
        position:'fixed', inset:0, zIndex:9999,
        background:'rgba(15,23,42,0.65)', backdropFilter:'blur(2px)',
        display:'flex', alignItems:'center', justifyContent:'center',
        padding:16, fontFamily:'"DM Sans", system-ui, sans-serif',
      }}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:'#fff', borderRadius:14, maxWidth:440, width:'100%',
        boxShadow:'0 25px 60px -10px rgba(0,0,0,.35)',
        border:'1px solid #E2E8F0', overflow:'hidden',
      }}>
        <div style={{
          background:'linear-gradient(135deg, #B91C1C 0%, #DC2626 100%)',
          color:'#fff', padding:'16px 18px',
          display:'flex', alignItems:'center', gap:12,
        }}>
          <div style={{
            width:38, height:38, borderRadius:9,
            background:'rgba(255,255,255,.18)',
            border:'1px solid rgba(255,255,255,.3)',
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>
            <AlertTriangle size={20}/>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:'1.02rem', fontWeight:700}}>Confirmar con contraseña</div>
            <div style={{fontSize:'.74rem', opacity:.85, marginTop:1}}>Operación destructiva</div>
          </div>
          <button onClick={cerrarCancelando} style={{
            background:'transparent', border:'none', cursor:'pointer',
            color:'#fff', opacity:.85, padding:4,
          }}><X size={20}/></button>
        </div>

        <form onSubmit={confirmar} style={{padding:'18px 20px'}}>
          <div style={{
            background:'#FEF2F2', border:'1px solid #FECACA',
            borderRadius:8, padding:'10px 12px', marginBottom:14,
            fontSize:'.82rem', color:'#7F1D1D', lineHeight:1.45,
          }}>
            {detalle || 'Esta acción es permanente y no se puede deshacer. Confirma con tu contraseña.'}
          </div>
          <label style={{
            display:'block', fontSize:'.72rem', fontWeight:700,
            color:'#475569', textTransform:'uppercase', letterSpacing:'.06em',
            marginBottom:6,
          }}>Tu contraseña actual</label>
          <div style={{position:'relative'}}>
            <input
              ref={inputRef}
              type={showPwd ? 'text' : 'password'}
              value={password}
              onChange={e => { setPassword(e.target.value); if (error) setError(''); }}
              autoComplete="current-password"
              placeholder="••••••••"
              style={{
                width:'100%', padding:'10px 38px 10px 12px',
                border:`1.5px solid ${error ? '#DC2626' : '#CBD5E1'}`,
                borderRadius:8, fontSize:'.92rem', outline:'none',
                boxSizing:'border-box', fontFamily:'inherit',
              }}
            />
            <button type="button" onClick={() => setShowPwd(s=>!s)} tabIndex={-1} style={{
              position:'absolute', right:8, top:'50%', transform:'translateY(-50%)',
              background:'transparent', border:'none', cursor:'pointer',
              color:'#64748B', padding:4,
            }}>{showPwd ? <EyeOff size={16}/> : <Eye size={16}/>}</button>
          </div>
          {error && <div style={{marginTop:8, fontSize:'.78rem', color:'#DC2626', fontWeight:500}}>{error}</div>}

          <div style={{
            display:'flex', justifyContent:'flex-end', gap:8,
            marginTop:18, paddingTop:14, borderTop:'1px solid #F1F5F9',
          }}>
            <button type="button" onClick={cerrarCancelando} style={{
              padding:'9px 16px', borderRadius:8, border:'1px solid #CBD5E1', background:'#fff',
              fontWeight:600, fontSize:'.85rem', cursor:'pointer', fontFamily:'inherit', color:'#334155',
            }}>Cancelar</button>
            <button type="submit" disabled={!password.trim()} style={{
              padding:'9px 18px', borderRadius:8, border:'none',
              background: !password.trim() ? '#FCA5A5' : '#DC2626',
              color:'#fff', fontWeight:700, fontSize:'.85rem',
              cursor: !password.trim() ? 'not-allowed' : 'pointer',
              fontFamily:'inherit',
            }}>Confirmar eliminación</button>
          </div>
        </form>
      </div>
    </div>
  );
}
