/**
 * CorteAlum — Modal de confirmación destructiva con contraseña
 * ─────────────────────────────────────────────────────────────────────────────
 * Componente reutilizable para cualquier acción de eliminación.
 *
 * Uso:
 *   const [confirm, setConfirm] = useState(null);
 *
 *   <ConfirmDeleteModal
 *     open={confirm !== null}
 *     onClose={() => setConfirm(null)}
 *     itemLabel="el proyecto «Casa Bogotá»"
 *     onConfirm={async (password) => {
 *       await api.delete(`/proyectos/${id}`, { data: { password } });
 *       toast.success('Eliminado');
 *       setConfirm(null);
 *     }}
 *   />
 *
 *   <button onClick={() => setConfirm(id)}>Eliminar</button>
 *
 * El modal:
 *   - Pide la contraseña del usuario actual (NO la del item)
 *   - El backend la valida con bcrypt (middleware requirePassword)
 *   - Si es incorrecta → muestra error inline (sin cerrar el modal)
 *   - Si es correcta → ejecuta onConfirm
 */

import { useState, useEffect, useRef } from 'react';
import { X, AlertTriangle, Loader, Eye, EyeOff } from 'lucide-react';

export default function ConfirmDeleteModal({
  open,
  onClose,
  onConfirm,
  itemLabel = 'este elemento',
  title = '¿Confirmar eliminación?',
  warningText = 'Esta acción es permanente y no se puede deshacer.',
  confirmButtonText = 'Eliminar definitivamente',
}) {
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const inputRef = useRef(null);

  // Limpiar y enfocar al abrir
  useEffect(() => {
    if (open) {
      setPassword('');
      setError('');
      setShowPwd(false);
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // ESC cierra
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape' && !loading) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, loading, onClose]);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!password.trim()) {
      setError('Ingresa tu contraseña para confirmar.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await onConfirm(password);
      // si onConfirm no lanza, el caller debería cerrar el modal
    } catch (err) {
      const status = err?.response?.status;
      const code = err?.response?.data?.code;
      if (status === 401 || code === 'PASSWORD_MISMATCH') {
        setError('Contraseña incorrecta.');
      } else if (code === 'PASSWORD_REQUIRED') {
        setError('Confirmación requerida.');
      } else {
        setError(err?.response?.data?.error || err?.message || 'Error al eliminar.');
      }
      setLoading(false);
    }
  };

  return (
    <div
      onClick={() => !loading && onClose()}
      style={{
        position:'fixed', inset:0, zIndex:9999,
        background:'rgba(15,23,42,0.65)', backdropFilter:'blur(2px)',
        display:'flex', alignItems:'center', justifyContent:'center',
        padding:16, fontFamily:'"DM Sans", system-ui, sans-serif',
      }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background:'#fff', borderRadius:14, maxWidth:440, width:'100%',
          boxShadow:'0 25px 60px -10px rgba(0,0,0,.35)',
          border:'1px solid #E2E8F0', overflow:'hidden',
        }}>
        {/* Header rojo */}
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
            <div style={{fontSize:'1.02rem', fontWeight:700}}>{title}</div>
            <div style={{fontSize:'.74rem', opacity:.85, marginTop:1}}>
              Operación destructiva
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            style={{
              background:'transparent', border:'none', cursor: loading?'not-allowed':'pointer',
              color:'#fff', opacity:loading?.5:.85, padding:4,
            }}>
            <X size={20}/>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} style={{padding:'18px 20px'}}>
          <div style={{
            background:'#FEF2F2', border:'1px solid #FECACA',
            borderRadius:8, padding:'10px 12px', marginBottom:14,
            fontSize:'.82rem', color:'#7F1D1D', lineHeight:1.45,
          }}>
            Vas a eliminar <strong>{itemLabel}</strong>.<br/>
            {warningText}
          </div>

          <label style={{
            display:'block', fontSize:'.72rem', fontWeight:700,
            color:'#475569', textTransform:'uppercase', letterSpacing:'.06em',
            marginBottom:6,
          }}>
            Tu contraseña actual
          </label>
          <div style={{position:'relative'}}>
            <input
              ref={inputRef}
              type={showPwd ? 'text' : 'password'}
              value={password}
              onChange={e => { setPassword(e.target.value); if (error) setError(''); }}
              disabled={loading}
              autoComplete="current-password"
              placeholder="••••••••"
              style={{
                width:'100%', padding:'10px 38px 10px 12px',
                border:`1.5px solid ${error ? '#DC2626' : '#CBD5E1'}`,
                borderRadius:8, fontSize:'.92rem',
                outline:'none', boxSizing:'border-box',
                fontFamily:'inherit',
              }}
            />
            <button
              type="button"
              onClick={() => setShowPwd(s => !s)}
              tabIndex={-1}
              style={{
                position:'absolute', right:8, top:'50%',
                transform:'translateY(-50%)',
                background:'transparent', border:'none', cursor:'pointer',
                color:'#64748B', padding:4,
              }}>
              {showPwd ? <EyeOff size={16}/> : <Eye size={16}/>}
            </button>
          </div>
          {error && (
            <div style={{
              marginTop:8, fontSize:'.78rem', color:'#DC2626', fontWeight:500,
            }}>{error}</div>
          )}

          <div style={{
            display:'flex', justifyContent:'flex-end', gap:8,
            marginTop:18, paddingTop:14, borderTop:'1px solid #F1F5F9',
          }}>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              style={{
                padding:'9px 16px', borderRadius:8,
                border:'1px solid #CBD5E1', background:'#fff',
                fontWeight:600, fontSize:'.85rem', cursor:loading?'not-allowed':'pointer',
                opacity:loading?.6:1, fontFamily:'inherit', color:'#334155',
              }}>
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !password.trim()}
              style={{
                padding:'9px 18px', borderRadius:8, border:'none',
                background: (loading || !password.trim()) ? '#FCA5A5' : '#DC2626',
                color:'#fff', fontWeight:700, fontSize:'.85rem',
                cursor: (loading || !password.trim())?'not-allowed':'pointer',
                fontFamily:'inherit',
                display:'inline-flex', alignItems:'center', gap:7,
              }}>
              {loading ? <Loader size={14} style={{animation:'spin 1s linear infinite'}}/> : null}
              {confirmButtonText}
            </button>
          </div>
        </form>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
