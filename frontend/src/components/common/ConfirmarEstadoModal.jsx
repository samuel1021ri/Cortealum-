import { useState, useEffect } from 'react';
import { X, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import api from '../../api/client';

export default function ConfirmarEstadoModal({ proyecto, estadoNuevo, onConfirmar, onClose }) {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [vents, cots] = await Promise.all([
          api.get(`/ventanas/proyecto/${proyecto.id_proyecto}`),
          api.get('/cotizaciones'),
        ]);
        const ventanas = vents.data;
        const sinReporte = ventanas.filter(v => !v.reporte_generado).length;
        const cotizacionesProyecto = cots.data.filter(c => c.id_proyecto == proyecto.id_proyecto || c.nombre_proyecto === proyecto.nombre_proyecto);
        setInfo({ total: ventanas.length, sinReporte, cotizaciones: cotizacionesProyecto.length });
      } catch { setInfo({ total: 0, sinReporte: 0, cotizaciones: 0 }); }
      finally { setLoading(false); }
    })();
  }, []);

  const esCompletado = estadoNuevo === 'completado';
  const esCancelado = estadoNuevo === 'cancelado';
  const hoy = new Date().toLocaleDateString('es-CO', { year:'numeric', month:'long', day:'numeric' });

  const COLOR = esCompletado ? { bg:'#f0fdf4', border:'#16a34a', text:'#15803d', icon:<CheckCircle size={20}/> }
    : { bg:'#fef2f2', border:'#dc2626', text:'#b91c1c', icon:<XCircle size={20}/> };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            {esCompletado ? <CheckCircle size={18} color="#16a34a"/> : <XCircle size={18} color="#dc2626"/>}
            {esCompletado ? 'Marcar como completado' : 'Cancelar proyecto'}
          </h2>
          <button className="btn btn-outline btn-sm" onClick={onClose}><X size={16}/></button>
        </div>

        <div className="modal-body">
          <div style={{ background: COLOR.bg, border: `1px solid ${COLOR.border}`, borderRadius: 10, padding: '12px 16px', marginBottom: '1.25rem', display: 'flex', gap: 10 }}>
            {COLOR.icon}
            <div>
              <div style={{ fontWeight: 700, color: COLOR.text, fontSize: '.875rem' }}>
                {esCompletado ? 'Esta acción es irreversible' : '⚠️ Esta acción es irreversible'}
              </div>
              <div style={{ fontSize: '.8rem', color: COLOR.text, marginTop: 3 }}>
                {esCompletado
                  ? `Se registrará hoy (${hoy}) como fecha de cierre.`
                  : 'El proyecto quedará bloqueado. No se podrán agregar ni editar ventanas.'}
              </div>
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign:'center', padding:'1rem' }}><div className="spinner" style={{ margin:'0 auto' }}/></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--gray-50)', borderRadius: 8, border: '1px solid var(--gray-200)' }}>
                <span style={{ fontSize: '.875rem', color: 'var(--gray-600)' }}>Total de ventanas</span>
                <span style={{ fontWeight: 700 }}>{info.total}</span>
              </div>

              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: 8, border: '1px solid',
                background: info.sinReporte > 0 ? '#fefce8' : 'var(--gray-50)',
                borderColor: info.sinReporte > 0 ? '#ca8a04' : 'var(--gray-200)'
              }}>
                <span style={{ fontSize: '.875rem', color: info.sinReporte > 0 ? '#854d0e' : 'var(--gray-600)', display:'flex', alignItems:'center', gap: 6 }}>
                  {info.sinReporte > 0 && <AlertTriangle size={14}/>} Ventanas sin reporte técnico
                </span>
                <span style={{ fontWeight: 700, color: info.sinReporte > 0 ? '#ca8a04' : 'inherit' }}>
                  {info.sinReporte} {info.sinReporte > 0 ? '⚠️' : '✓'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--gray-50)', borderRadius: 8, border: '1px solid var(--gray-200)' }}>
                <span style={{ fontSize: '.875rem', color: 'var(--gray-600)' }}>Cotizaciones generadas</span>
                <span style={{ fontWeight: 700 }}>{info.cotizaciones}</span>
              </div>

              {esCompletado && (
                <div style={{ padding: '10px 14px', background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0', fontSize: '.82rem', color: '#166534' }}>
                  📅 Fecha de cierre automática: <strong>{hoy}</strong><br/>
                  {info.cotizaciones === 0 && <span style={{color:'#854d0e'}}>⚠️ Aún no tienes cotización. Podrás generarla después de completar.</span>}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button
            className="btn"
            onClick={onConfirmar}
            disabled={loading}
            style={{ background: esCompletado ? '#16a34a' : '#dc2626', color: '#fff', border: 'none' }}
          >
            {esCompletado ? '✓ Confirmar — Completar proyecto' : '✗ Confirmar — Cancelar proyecto'}
          </button>
        </div>
      </div>
    </div>
  );
}
