import { useState, useEffect } from 'react';
import { X, Share2, UserPlus, Trash2, Crown, Users, History, Clock } from 'lucide-react';
import api from '../../api/client';
import toast from 'react-hot-toast';

function Avatar({ u, size = 32 }) {
  const bg = u.avatar_color || '#6366f1';
  const letra = u.avatar_letra || (u.nombre_completo?.[0] || '?').toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: bg, color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: size * 0.4, flexShrink: 0
    }}>{letra}</div>
  );
}

function TabAccesos({ accesos, proyecto, loading, onCambiarPermiso, onQuitar }) {
  if (loading) return <div style={{ textAlign: 'center', padding: '3rem' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>;

  return (
    <div>
      {/* Dueño */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--gray-100)' }}>
        <Avatar u={{ nombre_completo: proyecto.creador, avatar_color: '#6366f1' }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: '.875rem' }}>{proyecto.creador}</div>
          <div style={{ fontSize: '.78rem', color: 'var(--gray-500)' }}>Dueño del proyecto</div>
        </div>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '.78rem', color: '#d97706', fontWeight: 600 }}>
          <Crown size={13} /> Dueño
        </span>
      </div>

      {accesos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-400)' }}>
          <Users size={36} style={{ marginBottom: 8, opacity: .5 }} />
          <p style={{ fontSize: '.875rem' }}>Nadie más tiene acceso.<br />Usa la pestaña <strong>"Invitar"</strong>.</p>
        </div>
      ) : (
        accesos.map(a => (
          <div key={a.id_acceso} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--gray-100)' }}>
            <Avatar u={a} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nombre_completo}</div>
              <div style={{ fontSize: '.78rem', color: 'var(--gray-500)' }}>@{a.nombre_usuario}</div>
            </div>
            <select
              value={a.permiso}
              onChange={e => onCambiarPermiso(a.id_usuario, e.target.value)}
              style={{ fontSize: '.8rem', padding: '4px 8px', borderRadius: 6, border: '1px solid var(--gray-300)', background: '#fff', cursor: 'pointer' }}
            >
              <option value="lectura">👁 Solo ver</option>
              <option value="edicion">✏️ Edición</option>
            </select>
            <button className="btn btn-danger btn-sm" onClick={() => onQuitar(a.id_usuario, a.nombre_completo)} title="Quitar acceso">
              <Trash2 size={13} />
            </button>
          </div>
        ))
      )}
    </div>
  );
}

function TabInvitar({ disponibles, usuarioSel, setUsuarioSel, permiso, setPermiso, busqueda, setBusqueda }) {
  const filtrados = disponibles.filter(u =>
    u.nombre_completo.toLowerCase().includes(busqueda.toLowerCase()) ||
    u.nombre_usuario.toLowerCase().includes(busqueda.toLowerCase()) ||
    (u.correo_electronico || '').toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <div>
      <div className="form-group" style={{ marginBottom: '1rem' }}>
        <label>Buscar usuario</label>
        <input
          autoFocus
          placeholder="Nombre, usuario o correo..."
          value={busqueda}
          onChange={e => { setBusqueda(e.target.value); setUsuarioSel(null); }}
        />
      </div>

      {filtrados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--gray-400)', fontSize: '.875rem' }}>
          {busqueda ? 'Sin resultados' : 'Todos los usuarios ya tienen acceso'}
        </div>
      ) : (
        <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--gray-200)', borderRadius: 8, marginBottom: '1rem' }}>
          {filtrados.map(u => (
            <div
              key={u.id_usuario}
              onClick={() => setUsuarioSel(usuarioSel?.id_usuario === u.id_usuario ? null : u)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer',
                background: usuarioSel?.id_usuario === u.id_usuario ? '#eef2ff' : 'transparent',
                borderLeft: usuarioSel?.id_usuario === u.id_usuario ? '3px solid var(--primary)' : '3px solid transparent',
                transition: 'all .1s'
              }}
            >
              <Avatar u={u} size={30} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '.85rem' }}>{u.nombre_completo}</div>
                <div style={{ fontSize: '.77rem', color: 'var(--gray-500)' }}>@{u.nombre_usuario}</div>
              </div>
              {usuarioSel?.id_usuario === u.id_usuario && (
                <span style={{ fontSize: '.75rem', color: 'var(--primary)', fontWeight: 700 }}>✓</span>
              )}
            </div>
          ))}
        </div>
      )}

      {usuarioSel && (
        <div className="form-group">
          <label>Permiso para <strong>{usuarioSel.nombre_completo}</strong></label>
          <div style={{ display: 'flex', gap: 10 }}>
            {[
              { value: 'lectura', label: '👁 Solo ver', desc: 'Puede ver pero no modificar' },
              { value: 'edicion', label: '✏️ Edición', desc: 'Puede trabajar en el proyecto' }
            ].map(opt => (
              <div
                key={opt.value}
                onClick={() => setPermiso(opt.value)}
                style={{
                  flex: 1, padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                  border: `2px solid ${permiso === opt.value ? 'var(--primary)' : 'var(--gray-200)'}`,
                  background: permiso === opt.value ? '#eef2ff' : '#fff',
                  transition: 'all .15s'
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '.875rem', color: permiso === opt.value ? 'var(--primary)' : 'var(--gray-700)' }}>{opt.label}</div>
                <div style={{ fontSize: '.78rem', color: 'var(--gray-500)', marginTop: 2 }}>{opt.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TabHistorial({ historial, loading }) {
  if (loading) return <div style={{ textAlign: 'center', padding: '2rem' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>;

  if (historial.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-400)' }}>
        <Clock size={32} style={{ marginBottom: 8, opacity: .4 }} />
        <p style={{ fontSize: '.875rem' }}>Sin actividad registrada</p>
      </div>
    );
  }

  return (
    <div style={{ maxHeight: 320, overflowY: 'auto' }}>
      {historial.map((h, i) => (
        <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--gray-100)', alignItems: 'flex-start' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary)', marginTop: 6, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '.85rem', color: 'var(--gray-700)', fontWeight: 500 }}>{h.accion}</div>
            <div style={{ fontSize: '.75rem', color: 'var(--gray-400)', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {h.nombre_usuario && (
                <span style={{ fontWeight: 600, color: 'var(--gray-500)' }}>👤 {h.nombre_usuario}</span>
              )}
              <span>{new Date(h.fecha).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function CompartirModal({ proyecto, onClose }) {
  const [accesos, setAccesos] = useState([]);
  const [disponibles, setDisponibles] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [usuarioSel, setUsuarioSel] = useState(null);
  const [permiso, setPermiso] = useState('lectura');
  const [loading, setLoading] = useState(true);
  const [loadingHistorial, setLoadingHistorial] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [tab, setTab] = useState('accesos');

  const cargar = async () => {
    setLoading(true);
    try {
      const [a, d] = await Promise.all([
        api.get(`/proyectos/${proyecto.id_proyecto}/accesos`),
        api.get(`/proyectos/${proyecto.id_proyecto}/usuarios-disponibles`)
      ]);
      setAccesos(a.data);
      setDisponibles(d.data);
    } catch {
      toast.error('Error al cargar accesos');
    } finally {
      setLoading(false);
    }
  };

  const cargarHistorial = async () => {
    setLoadingHistorial(true);
    try {
      const { data } = await api.get(`/proyectos/${proyecto.id_proyecto}/historial`);
      setHistorial(data);
    } catch {
      toast.error('Error al cargar historial');
    } finally {
      setLoadingHistorial(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  useEffect(() => {
    if (tab === 'historial' && historial.length === 0) cargarHistorial();
  }, [tab]);

  const handleCompartir = async () => {
    if (!usuarioSel) return;
    setGuardando(true);
    try {
      await api.post(`/proyectos/${proyecto.id_proyecto}/compartir`, { id_usuario: usuarioSel.id_usuario, permiso });
      toast.success(`Acceso dado a ${usuarioSel.nombre_completo}`);
      setUsuarioSel(null);
      setBusqueda('');
      setPermiso('lectura');
      setTab('accesos');
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al compartir');
    } finally {
      setGuardando(false);
    }
  };

  const handleCambiarPermiso = async (id_usuario, nuevoPermiso) => {
    try {
      await api.post(`/proyectos/${proyecto.id_proyecto}/compartir`, { id_usuario, permiso: nuevoPermiso });
      toast.success('Permiso actualizado');
      cargar();
    } catch {
      toast.error('Error al cambiar permiso');
    }
  };

  const handleQuitar = async (id_usuario, nombre) => {
    if (!window.confirm(`¿Quitar el acceso de ${nombre}?`)) return;
    try {
      await api.delete(`/proyectos/${proyecto.id_proyecto}/accesos/${id_usuario}`);
      toast.success(`Acceso de ${nombre} eliminado`);
      cargar();
    } catch {
      toast.error('Error al quitar acceso');
    }
  };

  const TABS = [
    { id: 'accesos',   label: `Con acceso (${accesos.length})`, icon: <Users size={14} /> },
    { id: 'agregar',   label: 'Invitar',                        icon: <UserPlus size={14} /> },
    { id: 'historial', label: 'Historial',                      icon: <History size={14} /> },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="modal-header">
          <h2 style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Share2 size={18} /> Compartir Proyecto
          </h2>
          <button className="btn btn-outline btn-sm" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Info del proyecto */}
        <div style={{ padding: '10px 24px', background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-200)', fontSize: '.875rem', color: 'var(--gray-600)' }}>
          <strong style={{ color: 'var(--gray-800)' }}>{proyecto.nombre_proyecto}</strong>
          {proyecto.nombre_cliente && <span> · {proyecto.nombre_cliente}</span>}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--gray-200)' }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1, padding: '11px 8px', border: 'none', background: 'transparent', cursor: 'pointer',
                fontWeight: tab === t.id ? 700 : 500,
                color: tab === t.id ? 'var(--primary)' : 'var(--gray-500)',
                borderBottom: tab === t.id ? '2px solid var(--primary)' : '2px solid transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                fontSize: '.8rem', transition: 'all .15s'
              }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Contenido del tab activo */}
        <div className="modal-body" style={{ minHeight: 260 }}>
          {tab === 'accesos' && (
            <TabAccesos
              accesos={accesos}
              proyecto={proyecto}
              loading={loading}
              onCambiarPermiso={handleCambiarPermiso}
              onQuitar={handleQuitar}
            />
          )}
          {tab === 'agregar' && (
            <TabInvitar
              disponibles={disponibles}
              usuarioSel={usuarioSel}
              setUsuarioSel={setUsuarioSel}
              permiso={permiso}
              setPermiso={setPermiso}
              busqueda={busqueda}
              setBusqueda={setBusqueda}
            />
          )}
          {tab === 'historial' && (
            <TabHistorial historial={historial} loading={loadingHistorial} />
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-outline" onClick={onClose}>Cerrar</button>
          {tab === 'agregar' && usuarioSel && (
            <button className="btn btn-primary" onClick={handleCompartir} disabled={guardando}>
              {guardando
                ? <><div className="spinner" style={{ width: 14, height: 14, marginRight: 6 }} />Compartiendo...</>
                : <><UserPlus size={14} /> Dar acceso a {usuarioSel.nombre_completo.split(' ')[0]}</>
              }
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
