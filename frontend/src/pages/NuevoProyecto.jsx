import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import api from '../api/client';
import toast from 'react-hot-toast';

export default function NuevoProyecto() {
  const navigate = useNavigate();
  // FIX: la fecha de inicio por defecto se calcula en hora LOCAL, no en UTC.
  // Antes usaba toISOString() (UTC) y de noche en Colombia (UTC-5) salía el día
  // siguiente. Ahora arma el YYYY-MM-DD con la fecha local del navegador.
  const hoyLocal = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  const [form, setForm] = useState({
    nombre_proyecto: '', nombre_cliente: '',
    fecha_inicio: hoyLocal, fecha_fin: '',
    observaciones: ''
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post('/proyectos', form);
      toast.success('Proyecto creado exitosamente');
      navigate(`/proyectos/${data.id_proyecto}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al crear proyecto');
    } finally { setLoading(false); }
  };

  return (
    <div>
      <div className="page-header">
        <div style={{display:'flex', alignItems:'center', gap:12}}>
          <button className="btn btn-outline btn-sm" onClick={() => navigate('/proyectos')}>
            <ArrowLeft size={16}/>
          </button>
          <h1>Nuevo Proyecto</h1>
        </div>
      </div>

      <div className="card">
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Nombre del Proyecto *</label>
            <input value={form.nombre_proyecto} onChange={e=>setForm({...form,nombre_proyecto:e.target.value})} placeholder="Ej: Edificio Torre Norte" maxLength={150} required/>
          </div>
          <div className="form-group">
            <label>Nombre del Cliente</label>
            <input value={form.nombre_cliente} onChange={e=>setForm({...form,nombre_cliente:e.target.value})} placeholder="Ej: Juan Pérez"/>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label>Fecha de Inicio *</label>
              <input type="date" value={form.fecha_inicio} onChange={e=>setForm({...form,fecha_inicio:e.target.value})} required/>
            </div>
            <div className="form-group">
              <label>Fecha de Fin (estimada)</label>
              <input type="date" value={form.fecha_fin} onChange={e=>setForm({...form,fecha_fin:e.target.value})} min={form.fecha_inicio||undefined}/>
            </div>
          </div>
          <div className="form-group">
            <label>Observaciones</label>
            <textarea
              rows={3}
              placeholder="Detalles especiales del proyecto, condiciones del cliente, notas internas..."
              value={form.observaciones}
              onChange={e=>setForm({...form,observaciones:e.target.value})}
              style={{resize:'vertical'}}
            />
          </div>
          <div style={{display:'flex', gap:12, justifyContent:'flex-end', marginTop:8}}>
            <button type="button" className="btn btn-outline" onClick={()=>navigate('/proyectos')}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              <Save size={16}/> {loading?'Guardando...':'Crear Proyecto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
