import { useState } from 'react';
import { X, Copy } from 'lucide-react';

export default function DuplicarModal({ proyecto, onClose, onDuplicar }) {
  const [nombre, setNombre] = useState(`${proyecto.nombre_proyecto} (copia)`);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!nombre.trim()) return;
    setLoading(true);
    await onDuplicar(nombre.trim());
    setLoading(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Copy size={18} /> Duplicar Proyecto
          </h2>
          <button className="btn btn-outline btn-sm" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <p style={{ color: 'var(--gray-500)', fontSize: '.9rem', marginBottom: '1.2rem' }}>
            Se creará una copia de <strong>"{proyecto.nombre_proyecto}"</strong> con todas sus ventanas en estado <em>en progreso</em>.
          </p>
          <div className="form-group">
            <label>Nombre del proyecto nuevo *</label>
            <input
              autoFocus
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') onClose(); }}
              placeholder="Nombre para la copia..."
            />
          </div>
        </div>
        <div className="modal-footer" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-outline" onClick={onClose} disabled={loading}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={loading || !nombre.trim()}>
            {loading ? <><div className="spinner" style={{ width: 14, height: 14, marginRight: 6 }} />Duplicando...</> : <><Copy size={14} /> Duplicar</>}
          </button>
        </div>
      </div>
    </div>
  );
}
