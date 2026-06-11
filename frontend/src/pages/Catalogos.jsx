import { useEffect, useState } from 'react';
import api from '../api/client';
import toast from 'react-hot-toast';
import { Plus, Edit, Trash2, X, Settings, Layers, Box, Grid } from 'lucide-react';
import { useConfirmDelete } from '../hooks/useConfirmDelete';

const TABS = [
  { key:'sistemas', label:'Sistemas',  singular:'Sistema', endpoint:'/sistemas', idField:'id_sistema', nameField:'nombre',     Icon:Layers },
  { key:'perfiles', label:'Perfiles',  singular:'Perfil',  endpoint:'/perfiles', idField:'id_perfil',  nameField:'referencia', Icon:Box    },
  { key:'disenos',  label:'Diseños',   singular:'Diseño',  endpoint:'/disenos',  idField:'id_diseño',  nameField:'nombre',     Icon:Grid   },
];

function CatalogoTab({ tab }) {
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState(null);
  const [form,    setForm]    = useState({});

  // FIX v80: en celular la tabla del catálogo se desliza de lado (con ancho
  // mínimo) para que no parta las palabras ("NOMB RE", "Híbrid a"); en pantalla
  // grande se acomoda sola sin scroll.
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 760);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 760);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const load = async () => {
    try { const { data } = await api.get(tab.endpoint); setItems(data); }
    catch { toast.error('Error al cargar'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [tab.key]);

  const openCrear  = () => { setForm({ [tab.nameField]:'', descripcion:'', estado:'activo' }); setModal('crear'); };
  const openEditar = (item) => { setForm({ [tab.nameField]:item[tab.nameField]||'', descripcion:item.descripcion||'', estado:item.estado||'activo' }); setModal(item); };
  const handleSave = async () => {
    try {
      if (modal==='crear') { await api.post(tab.endpoint, form); toast.success(`${tab.singular} creado`); }
      else { await api.put(`${tab.endpoint}/${modal[tab.idField]}`, form); toast.success(`${tab.singular} actualizado`); }
      setModal(null); load();
    } catch(err) { toast.error(err.response?.data?.error||'Error al guardar'); }
  };
  const { confirm: confirmDelete, modal: deleteModal } = useConfirmDelete();

  const handleDelete = (item) => {
    const nombre = item.nombre || item.referencia || item[tab.idField];
    confirmDelete({
      itemLabel: `${tab.singular.toLowerCase()} "${nombre}"`,
      warningText: 'Se desactivará del catálogo. Esta acción puede deshacerse desde la base de datos.',
      onConfirm: async (password) => {
        await api.delete(`${tab.endpoint}/${item[tab.idField]}`, { data: { password } });
        toast.success('Desactivado');
        load();
      },
    });
  };

  return (
    <div>
      {loading ? (
        <div style={{ textAlign:'center', padding:'3rem' }}><div className="spinner" style={{ margin:'0 auto' }}/></div>
      ) : items.length===0 ? (
        <div className="empty-state" style={{ padding:'3.5rem' }}>
          <tab.Icon size={36} style={{ opacity:.25 }}/><p>No hay {tab.label.toLowerCase()} registrados</p>
        </div>
      ) : (
        <>
          <div style={{ overflowX:'auto', WebkitOverflowScrolling:'touch' }}>
          <table style={{ width:'100%', minWidth:isMobile?620:undefined, borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'2px solid var(--border)' }}>
                {[
                  {label:tab.nameField==='referencia'?'Referencia':'Nombre', w:'auto', align:'left'},
                  {label:'Descripción', w:'auto', align:'left'},
                  {label:'Estado',  w:100, align:'center'},
                  {label:'',        w:120, align:'right'},
                ].map((col,i) => (
                  <th key={i} style={{
                    padding:isMobile?'10px 12px':'10px 20px', textAlign:col.align,
                    fontFamily:'var(--font-body)', fontSize:'.72rem', fontWeight:700,
                    textTransform:'uppercase', letterSpacing:'.08em', whiteSpace:'nowrap',
                    color:'var(--text-muted)', background:'var(--bg-deep)',
                    borderBottom:'1px solid var(--border)',
                    width:col.w, minWidth:col.w==='auto'?undefined:col.w,
                  }}>
                    {i===3 ? (
                      <button onClick={openCrear} className="btn btn-primary" style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:'.75rem', padding:'5px 12px', whiteSpace:'nowrap' }}>
                        <Plus size={13}/> Nuevo {tab.singular}
                      </button>
                    ) : col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const activo = item.estado==='activo';
                return (
                  <tr key={item[tab.idField]} style={{
                    borderBottom:'1px solid var(--border)',
                    background: idx%2===0 ? 'var(--surface)' : 'var(--surface-2)',
                    transition:'background .12s',
                  }}
                    onMouseEnter={e=>e.currentTarget.style.background='#EEF3FA'}
                    onMouseLeave={e=>e.currentTarget.style.background=idx%2===0?'var(--surface)':'var(--surface-2)'}
                  >
                    <td style={{ padding:isMobile?'12px 12px':'13px 20px', fontFamily:'var(--font-body)', fontWeight:600, fontSize:'.9rem', color:'var(--text-primary)', whiteSpace:'nowrap' }}>
                      {item[tab.nameField]}
                    </td>
                    <td style={{ padding:isMobile?'12px 12px':'13px 20px', fontSize:'.85rem', color:'var(--text-secondary)', minWidth:160 }}>
                      {item.descripcion||'—'}
                    </td>
                    <td style={{ padding:isMobile?'12px 12px':'13px 20px', textAlign:'center' }}>
                      <span style={{
                        display:'inline-block', whiteSpace:'nowrap',
                        fontFamily:'var(--font-body)', fontSize:'.72rem', fontWeight:700,
                        textTransform:'uppercase', letterSpacing:'.06em',
                        padding:'3px 10px', borderRadius:4,
                        background: activo ? 'var(--success-light)' : 'var(--danger-light)',
                        color: activo ? 'var(--success)' : 'var(--danger)',
                        border: `1px solid ${activo ? '#A7D9B8' : '#F1B3AE'}`,
                      }}>{activo?'Activo':'Inactivo'}</span>
                    </td>
                    <td style={{ padding:isMobile?'12px 12px':'13px 20px', textAlign:'center' }}>
                      <div style={{ display:'flex', gap:6, justifyContent:'center' }}>
                        <button onClick={()=>openEditar(item)} style={{
                          display:'flex',alignItems:'center',justifyContent:'center',
                          width:32,height:32,borderRadius:6,cursor:'pointer',
                          background:'var(--steel-100)',border:'1px solid var(--border)',color:'var(--steel-600)',transition:'all .12s',
                        }}
                          onMouseEnter={e=>{e.currentTarget.style.background='var(--primary)';e.currentTarget.style.color='#fff';e.currentTarget.style.border='1px solid var(--primary)';}}
                          onMouseLeave={e=>{e.currentTarget.style.background='var(--steel-100)';e.currentTarget.style.color='var(--steel-600)';e.currentTarget.style.border='1px solid var(--border)';}}
                        ><Edit size={13}/></button>
                        <button onClick={()=>handleDelete(item)} style={{
                          display:'flex',alignItems:'center',justifyContent:'center',
                          width:32,height:32,borderRadius:6,cursor:'pointer',
                          background:'var(--danger-light)',border:'1px solid #F1B3AE',color:'var(--danger)',transition:'all .12s',
                        }}
                          onMouseEnter={e=>{e.currentTarget.style.background='var(--danger)';e.currentTarget.style.color='#fff';}}
                          onMouseLeave={e=>{e.currentTarget.style.background='var(--danger-light)';e.currentTarget.style.color='var(--danger)';}}
                        ><Trash2 size={13}/></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          <div style={{ padding:'10px 20px', background:'var(--bg-deep)', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'flex-end' }}>
            <span style={{ fontFamily:'var(--font-mono)', fontSize:'.68rem', color:'var(--text-muted)' }}>
              {items.length} {tab.label.toLowerCase()}
            </span>
          </div>
        </>
      )}

      {modal && (
        <div className="modal-overlay" onClick={()=>setModal(null)}>
          <div className="modal" style={{ maxWidth:440 }} onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ fontWeight:700 }}>{modal==='crear'?`Nuevo ${tab.singular}`:`Editar ${tab.singular}`}</h2>
              <button className="btn btn-outline btn-sm" onClick={()=>setModal(null)}><X size={16}/></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>{tab.nameField==='referencia'?'Referencia':'Nombre'} *</label>
                <input value={form[tab.nameField]||''} onChange={e=>setForm({...form,[tab.nameField]:e.target.value})} placeholder={tab.nameField==='referencia'?'Ej: 744':'Ej: Corredizo'}/>
              </div>
              <div className="form-group">
                <label>Descripción</label>
                <input value={form.descripcion||''} onChange={e=>setForm({...form,descripcion:e.target.value})} placeholder="Descripción opcional"/>
              </div>
              {modal!=='crear' && (
                <div className="form-group">
                  <label>Estado</label>
                  <select value={form.estado} onChange={e=>setForm({...form,estado:e.target.value})}>
                    <option value="activo">Activo</option><option value="inactivo">Inactivo</option>
                  </select>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={()=>setModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSave}>Guardar</button>
            </div>
          </div>
        </div>
      )}
      {deleteModal}
    </div>
  );
}

export default function Catalogos() {
  const [activeTab, setActiveTab] = useState('sistemas');
  return (
    <div>
      {/* Header */}
      <div className="page-header" style={{ marginBottom:'1.5rem' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:38, height:38, borderRadius:9, background:'var(--steel-100)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Settings size={18} style={{ color:'var(--primary)' }}/>
          </div>
          <div>
            <h1 style={{ fontFamily:'var(--font-display)', fontSize:'1.5rem', letterSpacing:'-.01em' }}>Catálogos</h1>
            <p style={{ color:'var(--text-muted)', fontSize:'.82rem', marginTop:1 }}>Sistemas, perfiles y diseños de ventanería</p>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display:'flex', gap:2, marginBottom:'1.25rem', background:'var(--bg-deep)', borderRadius:9, padding:4, width:'fit-content', border:'1px solid var(--border)' }}>
        {TABS.map(tab => {
          const active = activeTab===tab.key;
          return (
            <button key={tab.key} onClick={()=>setActiveTab(tab.key)} style={{
              display:'flex', alignItems:'center', gap:6,
              padding:'7px 18px', borderRadius:6, border:'none', cursor:'pointer',
              fontFamily:'var(--font-body)', fontSize:'.85rem', fontWeight:active?700:500,
              background: active ? 'var(--surface)' : 'transparent',
              color: active ? 'var(--primary)' : 'var(--text-muted)',
              boxShadow: active ? 'var(--shadow)' : 'none',
              transition:'all .15s',
            }}>
              <tab.Icon size={13} style={{ opacity:active?1:.6 }}/>{tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', overflow:'hidden', boxShadow:'var(--shadow)' }}>
        {TABS.map(tab => activeTab===tab.key && <CatalogoTab key={tab.key} tab={tab}/>)}
      </div>
    </div>
  );
}
