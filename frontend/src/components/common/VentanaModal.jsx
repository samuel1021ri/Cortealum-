import { useState, useEffect } from 'react';
import { X, Calculator, Save, Loader, Edit } from 'lucide-react';
import api from '../../api/client';
import toast from 'react-hot-toast';
import { toCm, fromCm, fmtNumMedida, unitLabel, validateMedida } from '../../utils/unidades';

const getAccIcon = (descripcion = '') => {
  const n = descripcion.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const icon = (path) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {path}
    </svg>
  );

  if (!n.trim()) return null; // accesorio vacío → sin ícono

  if (n.includes('cerradura'))
    return icon(<>
      <rect x="5" y="11" width="14" height="10" rx="2"/>
      <path d="M12 11 C12 11, 12 7, 16 7 C20 7, 20 4, 16 4 C12 4, 9 6.5, 9 9.5"/>
      <circle cx="12" cy="16" r="1.4" fill="currentColor" stroke="none"/>
    </>);

  if (n.includes('remache'))
    return icon(<>
      <circle cx="12" cy="6" r="3.5"/>
      <line x1="12" y1="9.5" x2="12" y2="18"/>
      <path d="M9 18 Q12 20.5 15 18"/>
    </>);

  if (n.includes('empaque'))
    return icon(<>
      <rect x="3" y="9" width="18" height="5" rx="2.5"/>
      <path d="M7 9 C7 6, 17 6, 17 9"/>
      <line x1="3" y1="11.5" x2="21" y2="11.5" strokeDasharray="2.5 2"/>
    </>);

  if (n.includes('felpa'))
    return icon(<>
      <rect x="3" y="14" width="18" height="4" rx="1"/>
      <line x1="6"    y1="14" x2="6"    y2="8"/>
      <line x1="8.5"  y1="14" x2="8.5"  y2="7"/>
      <line x1="11"   y1="14" x2="11"   y2="8"/>
      <line x1="13.5" y1="14" x2="13.5" y2="7"/>
      <line x1="16"   y1="14" x2="16"   y2="8"/>
      <line x1="18.5" y1="14" x2="18.5" y2="8"/>
    </>);

  if (n.includes('rodachin'))
    return icon(<>
      <path d="M12 2 L12 8"/>
      <path d="M8 8 L16 8"/>
      <line x1="8"  y1="8" x2="8"  y2="13"/>
      <line x1="16" y1="8" x2="16" y2="13"/>
      <circle cx="8"  cy="16" r="3"/>
      <circle cx="8"  cy="16" r="1" fill="currentColor" stroke="none"/>
      <circle cx="16" cy="16" r="3"/>
      <circle cx="16" cy="16" r="1" fill="currentColor" stroke="none"/>
    </>);

  if (n.includes('guia') && n.includes('superior'))
    return icon(<>
      <path d="M3 14 L3 8 L21 8 L21 14"/>
      <line x1="12" y1="5" x2="12" y2="2"/>
      <polyline points="10,3.5 12,2 14,3.5"/>
    </>);

  if (n.includes('guia') && n.includes('inferior'))
    return icon(<>
      <path d="M3 10 L3 16 L21 16 L21 10"/>
      <line x1="12" y1="19" x2="12" y2="22"/>
      <polyline points="10,20.5 12,22 14,20.5"/>
    </>);

  if (n.includes('tornill'))
    return icon(<>
      <polygon points="12,2 16,4.5 16,9.5 12,12 8,9.5 8,4.5"/>
      <line x1="12" y1="4" x2="12" y2="10"/>
      <line x1="9"  y1="7" x2="15" y2="7"/>
      <line x1="12" y1="12" x2="12" y2="20"/>
      <path d="M10 13.5 Q12 14.5 14 13.5"/>
      <path d="M10 15.5 Q12 16.5 14 15.5"/>
      <path d="M10 17.5 Q12 18.5 14 17.5"/>
      <path d="M10 20 L12 22 L14 20"/>
    </>);

  // fallback genérico
  return icon(<>
    <circle cx="12" cy="12" r="4"/>
    <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3"/>
  </>);
};

export default function VentanaModal({ idProyecto, catData, ventanaEdit, onClose, onSaved, unidadProyecto }) {
  const isEdit = !!ventanaEdit;
  const { sistemas, perfiles, disenos } = catData;

  // ── Unidad visual de la ventana (cm | mm) ────────────────────────────────
  // POLÍTICA SIMPLIFICADA (según diseño definitivo):
  //   - BD guarda SIEMPRE en cm (ancho_vano/alto_vano son cm canónicos).
  //   - Cada ventana tiene SU PROPIA unidadUI (`ancho_unidad`/`alto_unidad`),
  //     que es la unidad que el usuario eligió al crearla.
  //   - Al EDITAR: tomar la unidadUI de la ventana, mostrar con fromCm puro.
  //   - Al GUARDAR: convertir con toCm puro, persistir `ancho_unidad: unidad`.
  //   - Sin heurísticas. Sin detección por rango. Sin "doble conversión".
  //
  // `unidadProyecto` se acepta solo para CREAR ventanas nuevas (sugiere la
  // unidad por defecto). Al EDITAR, gana la unidad guardada de la ventana.
  const unidadInicial = isEdit
    ? (ventanaEdit?.ancho_unidad || ventanaEdit?.alto_unidad || 'cm')
    : (unidadProyecto || 'cm');

  // Helper local: cm canónico → unidad visual del form.
  // Es la única "conversión" que hacemos al cargar datos para editar.
  const _fromCmToView = (valCm) => {
    if (valCm == null || valCm === '') return '';
    const cm = parseFloat(valCm);
    if (!Number.isFinite(cm) || cm <= 0) return '';
    return unidadInicial === 'mm'
      ? String(+(cm * 10).toFixed(1))
      : String(+cm.toFixed(2));
  };

  const [form, setForm] = useState({
    id_sistema:        ventanaEdit?.id_sistema?.toString() || '',
    id_perfil:         ventanaEdit?.id_perfil?.toString()  || '',
    // Usar el id real de BD del diseño (id_diseno_bd) para que el <select> lo muestre correctamente.
    id_diseno:         (ventanaEdit?.id_diseno_bd || ventanaEdit?.id_diseno || ventanaEdit?.['id_diseño'])?.toString() || '',
    // BD = cm canónico. Solo convertimos a la unidadUI elegida para mostrar.
    ancho_vano:        _fromCmToView(ventanaEdit?.ancho_vano),
    alto_vano:         _fromCmToView(ventanaEdit?.alto_vano),
    notas:             ventanaEdit?.notas              || '',
    referencia_vidrio: ventanaEdit?.referencia_vidrio  || '5MM',
  });

  const [unidad, setUnidad] = useState(unidadInicial);

  // Errores de validación
  const [errores, setErrores] = useState({ ancho: '', alto: '' });

  const [simulacion,  setSimulacion]  = useState(null);
  const [simLoading,  setSimLoading]  = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);

  // Al CAMBIAR la unidad: convertir los valores actuales del form a la nueva unidad
  // para que el usuario no pierda el dato y vea el equivalente al instante.
  // Ej: tenía 39 en cm, cambia a mm → ahora ve 390.
  const handleUnidadChange = (nuevaUnidad) => {
    if (nuevaUnidad === unidad) return;
    setForm(f => {
      const aCm = toCm(f.ancho_vano, unidad);
      const hCm = toCm(f.alto_vano,  unidad);
      const aNuevo = aCm ? +fromCm(aCm, nuevaUnidad).toFixed(nuevaUnidad === 'mm' ? 1 : 2) : '';
      const hNuevo = hCm ? +fromCm(hCm, nuevaUnidad).toFixed(nuevaUnidad === 'mm' ? 1 : 2) : '';
      return {
        ...f,
        ancho_vano: aNuevo === '' ? '' : String(aNuevo),
        alto_vano:  hNuevo === '' ? '' : String(hNuevo),
      };
    });
    setUnidad(nuevaUnidad);
    setErrores({ ancho: '', alto: '' });
  };

  // Validación reactiva al editar el campo
  const handleAnchoChange = (raw) => {
    const v = raw.replace(',', '.');
    setForm(f => ({ ...f, ancho_vano: v }));
    if (v === '') { setErrores(e => ({ ...e, ancho: '' })); return; }
    const val = validateMedida(v, unidad);
    setErrores(e => ({ ...e, ancho: val.valid ? '' : val.error }));
  };
  const handleAltoChange = (raw) => {
    const v = raw.replace(',', '.');
    setForm(f => ({ ...f, alto_vano: v }));
    if (v === '') { setErrores(e => ({ ...e, alto: '' })); return; }
    const val = validateMedida(v, unidad);
    setErrores(e => ({ ...e, alto: val.valid ? '' : val.error }));
  };

  useEffect(() => {
    if (isEdit) doSimular(form);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doSimular = async (f) => {
    if (!f.id_sistema || !f.id_perfil || !f.id_diseno || !f.ancho_vano || !f.alto_vano) return;
    setSimLoading(true);
    setSimulacion(null);
    try {
      // POLÍTICA CANÓNICA: el backend siempre recibe cm.
      // Aquí convertimos el valor del form (en la unidad de visualización)
      // a cm antes de enviar. Nunca usamos el atajo "solo id_ventana" porque
      // si la BD tiene datos legacy en mm para esa ventana, el backend
      // calcularía mal. Enviar siempre los valores actuales del form
      // garantiza consistencia entre lo que el usuario ve y lo que se calcula.
      const anchoCmNorm = toCm(f.ancho_vano, unidad);
      const altoCmNorm  = toCm(f.alto_vano,  unidad);

      const payload = {
        id_sistema:        f.id_sistema,
        id_perfil:         f.id_perfil,
        id_diseno:         f.id_diseno,
        ancho_vano:        anchoCmNorm,   // ← siempre cm
        alto_vano:         altoCmNorm,    // ← siempre cm
        unidad:            'cm',           // declarar explícitamente
        referencia_vidrio: f.referencia_vidrio,
      };
      const { data } = await api.post('/ventanas/simular', payload);
      setSimulacion({ ...data, referencia_vidrio: f.referencia_vidrio || '5MM' });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al simular');
    } finally { setSimLoading(false); }
  };

  const handleSimular = () => {
    if (!form.id_sistema || !form.id_perfil || !form.id_diseno || !form.ancho_vano || !form.alto_vano)
      return toast.error('Complete todos los campos antes de simular');

    const vAncho = validateMedida(form.ancho_vano, unidad);
    const vAlto  = validateMedida(form.alto_vano,  unidad);
    if (!vAncho.valid) { toast.error('Ancho inválido: ' + vAncho.error); return; }
    if (!vAlto.valid)  { toast.error('Alto inválido: '  + vAlto.error);  return; }

    doSimular(form);
  };

  const handleGuardar = async () => {
    if (!simulacion) return toast.error('Primero simula el cálculo');

    const vAncho = validateMedida(form.ancho_vano, unidad);
    const vAlto  = validateMedida(form.alto_vano,  unidad);
    if (!vAncho.valid) { toast.error('Ancho inválido: ' + vAncho.error); return; }
    if (!vAlto.valid)  { toast.error('Alto inválido: '  + vAlto.error);  return; }

    setSaveLoading(true);
    try {
      // BD siempre en cm + guardar la unidad elegida por el usuario
      const payload = {
        ...form,
        ancho_vano:   vAncho.cm,
        alto_vano:    vAlto.cm,
        ancho_unidad: unidad,
        alto_unidad:  unidad,
      };
      if (isEdit) {
        await api.put(`/ventanas/${ventanaEdit.id_ventana}`, payload);
        toast.success('Ventana actualizada');
      } else {
        await api.post('/ventanas', { ...payload, id_proyecto: idProyecto });
        toast.success('Ventana guardada');
      }
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar');
    } finally { setSaveLoading(false); }
  };

  const piezasMarco       = simulacion?.piezas?.filter(p => !p.es_vidrio && p.resultado != null && ['MARCO','MARCO 744'].includes(p.seccion)) || [];
  const piezasNave        = simulacion?.piezas?.filter(p => !p.es_vidrio && p.resultado != null && p.seccion?.startsWith('NAVE')) || [];
  const piezasAdapt       = simulacion?.piezas?.filter(p => !p.es_vidrio && p.resultado != null && p.seccion === 'ADAPTADOR') || [];
  // ✅ filtra vacíos y usa descripcion
  const accesorios        = simulacion?.piezas?.filter(p => p.es_accesorio && p.descripcion?.trim()) || [];
  const vidrios           = simulacion?.piezas?.filter(p => p.es_vidrio) || [];
  const perfilesConPiezas = [...piezasMarco, ...piezasNave, ...piezasAdapt];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{maxWidth:720}} onClick={e=>e.stopPropagation()}>

        <div className="modal-header">
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            {isEdit && <Edit size={18} style={{color:'var(--primary)'}}/>}
            <h2 style={{fontWeight:700}}>{isEdit ? 'Editar Ventana' : 'Nueva Ventana'}</h2>
          </div>
          <button className="btn btn-outline btn-sm" onClick={onClose}><X size={16}/></button>
        </div>

        <div className="modal-body">
          {isEdit && ventanaEdit.reporte_generado && (
            <div style={{background:'var(--warning-light)',border:'1px solid #fcd34d',borderRadius:8,padding:'.75rem 1rem',marginBottom:'1rem',fontSize:'.84rem',color:'var(--warning)',fontWeight:600}}>
              ⚠️ Esta ventana ya tiene reporte técnico. Al guardar los cambios, el reporte se marcará como pendiente y deberás regenerarlo.
            </div>
          )}

          {/* Perfil / Sistema / Diseño */}
          <div className="grid-3" style={{marginBottom:'1rem'}}>
            <div className="form-group">
              <label>Perfil *</label>
              <select value={form.id_perfil} onChange={e => {
                const pid = e.target.value;
                setForm(f => ({...f, id_perfil:pid, id_sistema:'', id_diseno:''}));
              }}>
                <option value="">Seleccionar</option>
                {perfiles.filter(p=>p.estado==='activo').map(p =>
                  <option key={p.id_perfil} value={p.id_perfil}>{p.referencia} — {p.descripcion}</option>
                )}
              </select>
            </div>
            <div className="form-group">
              <label>Sistema *</label>
              <select value={form.id_sistema} onChange={e=>setForm({...form,id_sistema:e.target.value})}
                disabled={!form.id_perfil}>
                <option value="">Seleccionar</option>
                {sistemas.filter(s => {
                  if (s.estado !== 'activo') return false;
                  const perfil = perfiles.find(p => parseInt(p.id_perfil) === parseInt(form.id_perfil));
                  if (!perfil) return true;
                  const ref = perfil.referencia?.trim();
                  const nom = s.nombre?.trim().toLowerCase();
                  if (ref === '5020') return nom === 'tradicional' || nom === 'híbrida' || nom === 'hibrida';
                  return nom === 'tradicional' || nom === 'línea 90' || nom === 'linea 90' || nom === 'l90' || nom.includes('90');
                }).map(s =>
                  <option key={s.id_sistema} value={s.id_sistema}>{s.nombre}</option>
                )}
              </select>
            </div>
            <div className="form-group">
              <label>Diseño *</label>
              <select value={form.id_diseno} onChange={e=>setForm({...form,id_diseno:e.target.value})}
                disabled={!form.id_perfil}>
                <option value="">Seleccionar</option>
                {disenos.filter(d => {
                  if (d.estado !== 'activo') return false;
                  const perfil = perfiles.find(p => parseInt(p.id_perfil) === parseInt(form.id_perfil));
                  if (!perfil) return true;
                  const ref = perfil.referencia?.trim();
                  if (ref === '5020' && d.nombre?.trim().toUpperCase() === 'XXX') return false;
                  return true;
                }).map(d =>
                  <option key={d['id_diseño']} value={d['id_diseño']}>{d.nombre} — {d.descripcion}</option>
                )}
              </select>
            </div>
          </div>

          {/* Selector ÚNICO de unidad de medida (afecta TODO: input + resultados) */}
          <div style={{
            background: unidad === 'mm' ? '#eff6ff' : '#f8fafc',
            border: `1.5px solid ${unidad === 'mm' ? '#bfdbfe' : '#e2e8f0'}`,
            borderRadius: 8,
            padding: '10px 14px',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}>
            <div>
              <div style={{ fontSize: '.66rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: '#475569', marginBottom: 2 }}>
                Unidad de medida
              </div>
              <div style={{ fontSize: '.78rem', color: '#64748b' }}>
                Se aplica a entrada y resultados (vano, perfiles, vidrios, felpas, empaques).
              </div>
            </div>
            <div style={{ display: 'flex', gap: 0, borderRadius: 8, overflow: 'hidden', border: '1.5px solid #cbd5e1' }}>
              {['cm', 'mm'].map(u => (
                <button
                  key={u}
                  type="button"
                  onClick={() => handleUnidadChange(u)}
                  style={{
                    padding: '8px 22px',
                    fontWeight: 800,
                    fontSize: '.86rem',
                    border: 'none',
                    cursor: 'pointer',
                    background: unidad === u ? '#1e3a5f' : '#fff',
                    color:      unidad === u ? '#fff'    : '#475569',
                    transition: 'all .15s',
                  }}
                >
                  {u.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Medidas + Referencia vidrio (sin selector aparte, usa el unificado de arriba) */}
          <div className="grid-3" style={{marginBottom:'1.25rem'}}>
            <div className="form-group">
              <label>Ancho Vano ({unitLabel(unidad)}) *</label>
              <input
                type="text" inputMode="decimal"
                placeholder={unidad === 'mm' ? 'Ej: 390' : 'Ej: 43.3'}
                value={form.ancho_vano}
                onChange={e => handleAnchoChange(e.target.value)}
                style={{
                  fontVariantNumeric:'tabular-nums',
                  width: '100%',
                  borderColor: errores.ancho ? '#dc2626' : undefined,
                }}
              />
              {errores.ancho && (
                <div style={{fontSize:'.72rem',color:'#dc2626',marginTop:4,fontWeight:600}}>
                  {errores.ancho}
                </div>
              )}
            </div>

            <div className="form-group">
              <label>Alto Vano ({unitLabel(unidad)}) *</label>
              <input
                type="text" inputMode="decimal"
                placeholder={unidad === 'mm' ? 'Ej: 1205' : 'Ej: 120.5'}
                value={form.alto_vano}
                onChange={e => handleAltoChange(e.target.value)}
                style={{
                  fontVariantNumeric:'tabular-nums',
                  width: '100%',
                  borderColor: errores.alto ? '#dc2626' : undefined,
                }}
              />
              {errores.alto && (
                <div style={{fontSize:'.72rem',color:'#dc2626',marginTop:4,fontWeight:600}}>
                  {errores.alto}
                </div>
              )}
            </div>

            <div className="form-group">
              <label>Referencia Vidrio</label>
              <select value={form.referencia_vidrio} onChange={e=>setForm({...form,referencia_vidrio:e.target.value})}>
                <option value="4MM">4 MM</option>
                <option value="5MM">5 MM</option>
                <option value="6MM">6 MM</option>
                <option value="8MM">8 MM</option>
              </select>
            </div>
          </div>

          <div className="form-group" style={{marginBottom:'1.25rem'}}>
            <label>Notas / Observaciones</label>
            <textarea
              rows={2}
              placeholder="Anomalías del vano, instrucciones de instalación, detalles especiales..."
              value={form.notas}
              onChange={e=>setForm({...form, notas:e.target.value})}
              style={{resize:'vertical', minHeight:60}}
            />
          </div>

          <button
            className="btn btn-outline"
            style={{width:'100%',justifyContent:'center',marginBottom:'1.25rem'}}
            onClick={handleSimular}
            disabled={simLoading || !!errores.ancho || !!errores.alto}
          >
            {simLoading
              ? <><Loader size={16}/> Calculando...</>
              : <><Calculator size={16}/> Simular Cálculo</>}
          </button>

          {simulacion && (
            <div style={{background:'var(--gray-50)',borderRadius:10,padding:'1rem'}}>

              {/* Dimensiones resultado */}
              <div style={{display:'flex',gap:'1.5rem',marginBottom:'1rem',padding:'.75rem',background:'var(--primary-light)',borderRadius:8,flexWrap:'wrap'}}>
                <div>
                  <span style={{fontSize:'.8rem',color:'var(--gray-500)'}}>Ancho Ventana:</span>{' '}
                  <strong>{fmtNumMedida(simulacion.ancho_ventana, unidad)} {unitLabel(unidad)}</strong>
                </div>
                <div>
                  <span style={{fontSize:'.8rem',color:'var(--gray-500)'}}>Alto Ventana:</span>{' '}
                  <strong>{fmtNumMedida(simulacion.alto_ventana, unidad)} {unitLabel(unidad)}</strong>
                </div>
                <div>
                  <span style={{fontSize:'.8rem',color:'var(--gray-500)'}}>Referencia Vidrio:</span>
                  <strong style={{marginLeft:4,background:'#1e3a5f',color:'#fff',padding:'1px 8px',borderRadius:4,fontSize:'.78rem'}}>
                    {simulacion.referencia_vidrio}
                  </strong>
                </div>
              </div>

              {/* Tabla perfiles */}
              {perfilesConPiezas.length > 0 && (
                <>
                  <p style={{fontSize:'.78rem',fontWeight:700,color:'var(--gray-600)',marginBottom:8,textTransform:'uppercase',letterSpacing:'.05em'}}>
                    Piezas de Perfil
                  </p>
                  <div style={{overflowX:'auto',marginBottom:'1rem'}}>
                    <table>
                      <thead>
                        <tr>
                          <th>Sección</th><th>Ubicación</th><th>Cant.</th>
                          <th>Fórmula</th><th>Resultado</th><th style={{textAlign:'center'}}>Ángulo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {perfilesConPiezas.map((p,i) => (
                          <tr key={i}>
                            <td style={{fontSize:'.72rem',color:'var(--gray-400)',fontWeight:600,whiteSpace:'nowrap'}}>{p.seccion}</td>
                            <td style={{fontSize:'.83rem'}}>{p.ubicacion}</td>
                            <td style={{fontWeight:600,textAlign:'center'}}>{p.cantidad}</td>
                            <td style={{color:'var(--gray-500)',fontSize:'.78rem'}}>{p.formula}</td>
                            <td style={{fontWeight:700,color:'var(--primary)',whiteSpace:'nowrap'}}>{fmtNumMedida(p.resultado, unidad)} {unitLabel(unidad)}</td>
                            <td style={{textAlign:'center',whiteSpace:'nowrap'}}>
                              {p.angulo
                                ? p.angulo !== 90
                                  ? <span style={{background:'#fef3c7',color:'#92400e',fontWeight:800,padding:'2px 7px',borderRadius:5,fontSize:'.78rem'}}>∠{p.angulo}°</span>
                                  : <span style={{color:'var(--gray-400)',fontSize:'.78rem'}}>90°</span>
                                : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {/* ✅ Accesorios — usa descripcion, filtra vacíos */}
              {accesorios.length > 0 && (
                <>
                  <p style={{fontSize:'.78rem',fontWeight:700,color:'var(--gray-600)',marginBottom:8,textTransform:'uppercase',letterSpacing:'.05em'}}>
                    Accesorios
                  </p>
                  <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:'1rem'}}>
                    {accesorios.map((a,i) => {
                      // Si el accesorio mide longitud (felpa/empaque/silicona en cm), convertir
                      const esLongitud = a.unidad === 'cm' || a.unidad === 'mm';
                      const cantStr = esLongitud
                        ? `${fmtNumMedida(a.cantidad, unidad)} ${unitLabel(unidad)}`
                        : `${a.cantidad} ${a.unidad || 'un'}`;
                      return (
                        <span key={i} style={{
                          display:'flex', alignItems:'center', gap:7,
                          background:'#fff', border:'1px solid var(--gray-200)',
                          borderRadius:8, padding:'5px 10px', fontSize:'.78rem',
                          color:'var(--gray-600)'
                        }}>
                          <span style={{color:'var(--primary)', display:'flex', alignItems:'center'}}>
                            {getAccIcon(a.descripcion)}
                          </span>
                          {a.descripcion}:&nbsp;
                          <strong style={{color:'var(--primary)'}}>{cantStr}</strong>
                        </span>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Vidrios */}
              {vidrios.length > 0 && (
                <>
                  <p style={{fontSize:'.78rem',fontWeight:700,color:'#1e3a5f',marginBottom:8,textTransform:'uppercase',letterSpacing:'.05em',borderTop:'2px solid #1e3a5f',paddingTop:10,marginTop:4}}>
                    🪟 Vidrios — {vidrios.reduce((s,v)=>s+v.cantidad,0)} unidad{vidrios.reduce((s,v)=>s+v.cantidad,0)>1?'es':''}
                  </p>
                  <div style={{overflowX:'auto'}}>
                    <table>
                      <thead>
                        <tr style={{background:'#eef3ff'}}>
                          <th style={{textAlign:'left'}}>Descripción</th>
                          <th style={{textAlign:'center'}}>Ref.</th>
                          <th style={{textAlign:'center'}}>Cant.</th>
                          <th style={{textAlign:'center',color:'var(--primary)'}}>Ancho ({unitLabel(unidad)})</th>
                          <th style={{textAlign:'center',color:'var(--primary)'}}>Alto ({unitLabel(unidad)})</th>
                          <th style={{textAlign:'left'}}>Fórmula Ancho</th>
                          <th style={{textAlign:'left'}}>Fórmula Alto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vidrios.map((v,i) => (
                          <tr key={i} style={{background:i%2===0?'#fff':'#f8faff'}}>
                            <td style={{fontSize:'.83rem'}}>{v.ubicacion}</td>
                            <td style={{textAlign:'center'}}>
                              <span style={{background:'#1e3a5f',color:'#fff',padding:'1px 7px',borderRadius:4,fontSize:'.75rem',fontWeight:700}}>
                                {v.ref}
                              </span>
                            </td>
                            <td style={{fontWeight:700,textAlign:'center'}}>{v.cantidad}</td>
                            <td style={{fontWeight:800,textAlign:'center',color:'var(--primary)',fontSize:'.95rem'}}>{fmtNumMedida(v.ancho, unidad)}</td>
                            <td style={{fontWeight:800,textAlign:'center',color:'var(--primary)',fontSize:'.95rem'}}>{fmtNumMedida(v.alto, unidad)}</td>
                            <td style={{color:'var(--gray-500)',fontSize:'.75rem'}}>{v.formula_ancho}</td>
                            <td style={{color:'var(--gray-500)',fontSize:'.75rem'}}>{v.formula_alto}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleGuardar} disabled={!simulacion||saveLoading}>
            <Save size={16}/>
            {saveLoading ? 'Guardando...' : isEdit ? 'Guardar Cambios' : 'Guardar Ventana'}
          </button>
        </div>

      </div>
    </div>
  );
}