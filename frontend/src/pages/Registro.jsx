import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api/client';
import toast from 'react-hot-toast';
import { Eye, EyeOff, UserPlus, User, Mail, Phone, Lock, CheckCircle, ArrowLeft } from 'lucide-react';
import './Login.css';

function WeldCanvas({ width, height, r = 22 }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!width || !height) return;
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    const W = width, H = height;
    const DUR = 3800;
    let start = null, raf = null;
    const sparks = [];
    const perim = 2*(W-2*r) + 2*(H-2*r) + 2*Math.PI*r;
    function ptOnBorder(t) {
      let d = ((t%1)+1)%1*perim;
      const segs = [
        [W-2*r,s=>({x:r+s,y:0,ax:1,ay:0})],
        [Math.PI/2*r,s=>({x:W-r+Math.cos(-Math.PI/2+s/r)*r,y:r+Math.sin(-Math.PI/2+s/r)*r,ax:Math.cos(s/r),ay:Math.sin(-Math.PI/2+s/r)})],
        [H-2*r,s=>({x:W,y:r+s,ax:0,ay:1})],
        [Math.PI/2*r,s=>({x:W-r+Math.cos(s/r)*r,y:H-r+Math.sin(s/r)*r,ax:Math.cos(Math.PI/2+s/r),ay:Math.sin(Math.PI/2+s/r)})],
        [W-2*r,s=>({x:W-r-s,y:H,ax:-1,ay:0})],
        [Math.PI/2*r,s=>({x:r+Math.cos(Math.PI+s/r)*r,y:H-r+Math.sin(Math.PI+s/r)*r,ax:Math.cos(Math.PI+s/r),ay:Math.sin(Math.PI+s/r)})],
        [H-2*r,s=>({x:0,y:H-r-s,ax:0,ay:-1})],
        [Math.PI/2*r,s=>({x:r+Math.cos(3*Math.PI/2+s/r)*r,y:r+Math.sin(3*Math.PI/2+s/r)*r,ax:Math.cos(3*Math.PI/2+s/r),ay:Math.sin(3*Math.PI/2+s/r)})],
      ];
      for(const [len,fn] of segs){if(d<=len)return fn(d);d-=len;}
      return segs[0][1](0);
    }
    function spawn(x,y,ax,ay){
      const base=Math.atan2(ay,ax)+Math.PI;
      const n=5+Math.floor(Math.random()*7);
      for(let i=0;i<n;i++){
        const speed=0.8+Math.random()*5;
        const ang=base+(Math.random()-0.5)*2.2;
        const hot=Math.random()>0.4;
        sparks.push({x,y,vx:Math.cos(ang)*speed,vy:Math.sin(ang)*speed-Math.random()*2,life:1,decay:0.018+Math.random()*0.035,size:0.6+Math.random()*2.2,hot,trail:[]});
      }
    }
    function draw(ts){
      if(!start)start=ts;
      const t=(ts-start)/DUR;
      const p=Math.min(t,1);
      ctx.clearRect(0,0,W,H);
      if(p>0){
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(r,0);ctx.lineTo(W-r,0);ctx.arcTo(W,0,W,r,r);
        ctx.lineTo(W,H-r);ctx.arcTo(W,H,W-r,H,r);
        ctx.lineTo(r,H);ctx.arcTo(0,H,0,H-r,r);
        ctx.lineTo(0,r);ctx.arcTo(0,0,r,0,r);ctx.closePath();
        ctx.setLineDash([p*perim,perim]);
        ctx.strokeStyle='rgba(21,101,192,0.6)';ctx.lineWidth=2;
        ctx.shadowColor='rgba(21,101,192,1)';ctx.shadowBlur=10;ctx.stroke();ctx.restore();
      }
      for(let i=sparks.length-1;i>=0;i--){
        const s=sparks[i];
        s.trail.push({x:s.x,y:s.y});if(s.trail.length>5)s.trail.shift();
        s.x+=s.vx;s.y+=s.vy;s.vy+=0.18;s.vx*=0.96;s.life-=s.decay;
        if(s.life<=0){sparks.splice(i,1);continue;}
        const a=Math.max(0,s.life);
        if(s.trail.length>1){ctx.beginPath();ctx.moveTo(s.trail[0].x,s.trail[0].y);s.trail.forEach(p=>ctx.lineTo(p.x,p.y));ctx.strokeStyle=s.hot?`rgba(255,220,100,${a*0.4})`:`rgba(255,120,30,${a*0.35})`;ctx.lineWidth=s.size*0.5;ctx.stroke();}
        ctx.beginPath();ctx.arc(s.x,s.y,s.size*a,0,Math.PI*2);
        ctx.fillStyle=s.hot?`rgba(255,${200+Math.floor(s.life*55)},${50+Math.floor(s.life*150)},${a})`:`rgba(255,${80+Math.floor(s.life*100)},20,${a})`;
        ctx.shadowColor=s.hot?'rgba(255,240,100,0.9)':'rgba(255,100,0,0.7)';ctx.shadowBlur=8;ctx.fill();
      }
      if(t<1){
        const{x,y,ax,ay}=ptOnBorder(t);
        if(Math.random()>0.25)spawn(x,y,ax,ay);
        const fl=0.7+Math.random()*0.3;
        const gs=14+Math.random()*10;
        const g=ctx.createRadialGradient(x,y,0,x,y,gs);
        g.addColorStop(0,`rgba(255,255,255,${fl})`);g.addColorStop(0.2,`rgba(200,230,255,${0.85*fl})`);g.addColorStop(0.5,`rgba(21,101,192,${0.5*fl})`);g.addColorStop(1,'rgba(0,0,0,0)');
        ctx.beginPath();ctx.arc(x,y,gs,0,Math.PI*2);ctx.fillStyle=g;ctx.fill();
        const cs=2+Math.random()*2;ctx.beginPath();ctx.arc(x,y,cs,0,Math.PI*2);ctx.fillStyle='#fff';ctx.shadowColor='#fff';ctx.shadowBlur=16;ctx.fill();
        for(let i=0;i<4;i++){const ang=Math.random()*Math.PI*2;const len=4+Math.random()*12;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(ang)*len,y+Math.sin(ang)*len);ctx.strokeStyle=`rgba(180,220,255,${0.3+Math.random()*0.5})`;ctx.lineWidth=0.5+Math.random();ctx.shadowBlur=4;ctx.stroke();}
      }
      if(t<1.05)raf=requestAnimationFrame(draw);
    }
    raf=requestAnimationFrame(draw);
    return()=>{if(raf)cancelAnimationFrame(raf);};
  },[width,height,r]);
  return <canvas ref={ref} width={width} height={height} style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none',zIndex:2,borderRadius:r}}/>;
}
function useSize(ref){
  const[s,setS]=useState({width:0,height:0});
  useEffect(()=>{if(!ref.current)return;const ro=new ResizeObserver(([e])=>setS({width:Math.round(e.contentRect.width),height:Math.round(e.contentRect.height)}));ro.observe(ref.current);return()=>ro.disconnect();},[]);
  return s;
}

export default function Registro() {
  const navigate = useNavigate();
  const panelRef = useRef(null);
  const panelSize = useSize(panelRef);
  const [form, setForm] = useState({
    nombre_completo: '', nombre_usuario: '', correo_electronico: '', telefono: '', contraseña: '', confirmar: ''
  });
  const [showP, setShowP]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone]     = useState(false);

  const f = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const passOk = form.contraseña.length >= 6 && form.contraseña === form.confirmar;
  const passMsg = !form.contraseña ? '' :
    form.contraseña.length < 6 ? 'Mínimo 6 caracteres' :
    form.contraseña !== form.confirmar ? 'Las contraseñas no coinciden' : 'Las contraseñas coinciden ✓';
  const passColor = !form.contraseña ? 'var(--lgray)' :
    form.contraseña.length < 6 ? 'var(--lred)' :
    form.contraseña !== form.confirmar ? 'var(--lred)' : 'var(--lgreen)';

  const strengthLevel = !form.contraseña ? 0 :
    form.contraseña.length < 6 ? 1 :
    form.contraseña.length < 10 ? 2 : 3;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nombre_completo.trim()) return toast.error('Ingresa tu nombre completo');
    if (!form.nombre_usuario.trim())  return toast.error('Ingresa un nombre de usuario');
    if (!form.correo_electronico.trim()) return toast.error('Ingresa tu correo');
    if (!passOk) return toast.error('Verifica tu contraseña');
    setLoading(true);
    try {
      await api.post('/auth/registro', {
        nombre_completo: form.nombre_completo,
        nombre_usuario: form.nombre_usuario,
        correo_electronico: form.correo_electronico,
        telefono: form.telefono || null,
        contraseña: form.contraseña,
      });
      setDone(true);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al registrar');
    } finally { setLoading(false); }
  };

  return (
    <div className="login-page">
      {/* Fondos animados */}
      <div className="login-bg-grid" />
      <div className="login-bg-lines" />
      <div className="login-orb login-orb-1" />
      <div className="login-orb login-orb-2" />

      <div className="login-container registro-container">
        {/* Panel formulario izquierdo */}
        <div className="registro-form-panel" ref={panelRef} style={{position:'relative'}}>
          {panelSize.width > 0 && <WeldCanvas width={panelSize.width} height={panelSize.height} />}
          <Link to="/login" className="login-back-link">
            <ArrowLeft size={14}/> Volver al login
          </Link>

          {done ? (
            <div className="registro-success">
              <div className="registro-success-icon">
                <CheckCircle size={36} color="var(--lgreen)"/>
              </div>
              <h2>¡Registro exitoso!</h2>
              <p>Tu cuenta ha sido creada. Ya puedes iniciar sesión con tu usuario o correo.</p>
              <button className="login-btn" onClick={() => navigate('/login')} style={{marginTop:0}}>
                <LogInIcon size={16}/> Ir al login
              </button>
            </div>
          ) : (
            <>
              <div style={{textAlign:'center', marginBottom:'1.5rem'}}>
                <img
                  src="/logo-cortealum.png"
                  alt="Cortealum"
                  style={{height:72, width:'auto', objectFit:'contain', display:'inline-block'}}
                />
              </div>
              <div className="login-sys-label">Crear nueva cuenta</div>
              <div className="login-form-header">
                <h2>Únete a CorteAlu</h2>
                <p>Completa los datos para registrarte en el sistema</p>
              </div>

              <form onSubmit={handleSubmit}>
                {/* Nombre completo */}
                <div className="form-group">
                  <label>Nombre Completo *</label>
                  <div className="r-inp-wrap">
                    <User size={14} className="r-ico"/>
                    <input value={form.nombre_completo} onChange={f('nombre_completo')} placeholder="Tu nombre completo" required/>
                  </div>
                </div>

                {/* Usuario + Teléfono */}
                <div className="grid-2">
                  <div className="form-group">
                    <label>Nombre de Usuario *</label>
                    <input
                      value={form.nombre_usuario} onChange={f('nombre_usuario')}
                      placeholder="sin espacios"
                      style={{fontFamily:'monospace', fontSize:'.85rem', paddingLeft:16}}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Teléfono</label>
                    <div className="r-inp-wrap">
                      <Phone size={14} className="r-ico"/>
                      <input type="tel" value={form.telefono} onChange={f('telefono')} placeholder="+57 300..."/>
                    </div>
                  </div>
                </div>

                {/* Correo */}
                <div className="form-group">
                  <label>Correo Electrónico *</label>
                  <div className="r-inp-wrap">
                    <Mail size={14} className="r-ico"/>
                    <input type="email" value={form.correo_electronico} onChange={f('correo_electronico')} placeholder="correo@empresa.com" required/>
                  </div>
                </div>

                {/* Contraseñas */}
                <div className="grid-2">
                  <div className="form-group">
                    <label>Contraseña *</label>
                    <div className="r-inp-wrap pass-wrap" style={{display:'block',position:'relative'}}>
                      <Lock size={14} className="r-ico"/>
                      <input
                        type={showP ? 'text' : 'password'}
                        value={form.contraseña} onChange={f('contraseña')}
                        placeholder="Mín. 6 caracteres"
                        style={{paddingLeft:44, paddingRight:36}}
                        required
                      />
                      <button type="button" className="pass-toggle" onClick={() => setShowP(!showP)}>
                        {showP ? <EyeOff size={14}/> : <Eye size={14}/>}
                      </button>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Confirmar Contraseña *</label>
                    <input
                      type="password" value={form.confirmar} onChange={f('confirmar')}
                      placeholder="Repite la contraseña"
                      style={{paddingLeft:16}}
                      required
                    />
                  </div>
                </div>

                {/* Barra fuerza */}
                {form.contraseña && (
                  <div className="pass-strength-bars">
                    <div className={`pass-bar${strengthLevel >= 1 ? ' s1' : ''}`}/>
                    <div className={`pass-bar${strengthLevel >= 2 ? ' s2' : ''}`}/>
                    <div className={`pass-bar${strengthLevel >= 3 ? ' s3' : ''}`}/>
                  </div>
                )}
                {(form.contraseña || form.confirmar) && (
                  <p className="pass-match-msg" style={{color: passColor}}>{passMsg}</p>
                )}

                <button type="submit" className="login-btn" disabled={loading || !passOk}>
                  <UserPlus size={16}/>
                  {loading ? 'Registrando...' : 'Crear mi cuenta'}
                </button>

                <div className="login-register-link">
                  ¿Ya tienes cuenta?{' '}
                  <Link to="/login">Inicia sesión</Link>
                </div>
              </form>
            </>
          )}
        </div>

        {/* Panel visual derecho con blueprint */}
        <div className="registro-visual">
          <div className="registro-visual-art">
            <div className="registro-art-grid"/>
            <svg viewBox="0 0 340 280" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Marco ventana con hoja abatible */}
              <rect x="50" y="30" width="240" height="190" rx="2" stroke="#1565C0" strokeWidth="1.5" strokeDasharray="700" strokeDashoffset="700">
                <animate attributeName="stroke-dashoffset" from="700" to="0" dur="2s" fill="freeze" begin="0.3s"/>
              </rect>
              <rect x="62" y="42" width="216" height="166" rx="1" stroke="#0D47A1" strokeWidth="0.8" strokeDasharray="800" strokeDashoffset="800">
                <animate attributeName="stroke-dashoffset" from="800" to="0" dur="2.5s" fill="freeze" begin="0.8s"/>
              </rect>
              {/* Hoja izquierda abatible */}
              <rect x="62" y="42" width="108" height="166" rx="1" stroke="#1565C0" strokeWidth="1" strokeDasharray="550" strokeDashoffset="550">
                <animate attributeName="stroke-dashoffset" from="550" to="0" dur="1.5s" fill="freeze" begin="1.4s"/>
              </rect>
              {/* Línea diagonal hoja abatible */}
              <line x1="62" y1="42" x2="170" y2="208" stroke="#0D47A1" strokeWidth="0.6" strokeDasharray="200" strokeDashoffset="200" opacity="0.6">
                <animate attributeName="stroke-dashoffset" from="200" to="0" dur="0.8s" fill="freeze" begin="2.2s"/>
              </line>
              {/* Manija */}
              <rect x="158" y="118" width="12" height="28" rx="6" fill="none" stroke="#1565C0" strokeWidth="1" opacity="0">
                <animate attributeName="opacity" from="0" to="0.8" dur="0.4s" fill="freeze" begin="2.5s"/>
              </rect>
              {/* Dimensiones */}
              <line x1="50" y1="240" x2="290" y2="240" stroke="#1565C0" strokeWidth="0.6" opacity="0">
                <animate attributeName="opacity" from="0" to="0.5" dur="0.5s" fill="freeze" begin="2.8s"/>
              </line>
              <text x="170" y="255" textAnchor="middle" fill="#1565C0" fontSize="8" fontFamily="DM Sans" opacity="0">
                <animate attributeName="opacity" from="0" to="0.8" dur="0.5s" fill="freeze" begin="3s"/>
                1.400 mm
              </text>
              <text x="170" y="20" textAnchor="middle" fill="#8C939B" fontSize="8" fontFamily="DM Sans" letterSpacing="2" opacity="0">
                <animate attributeName="opacity" from="0" to="1" dur="0.5s" fill="freeze" begin="3.2s"/>
                PLANO-002 · VENTANA ABATIBLE
              </text>
            </svg>
          </div>

          <div className="registro-visual-bottom">
            <div className="registro-visual-logo">CORTE<span>ALUM</span></div>
            <div className="registro-visual-desc">
              Crea tu cuenta para acceder al sistema de gestión de ventanería de aluminio.
            </div>
            <ul className="registro-access-list">
              {[
                'Calcula materiales por ventana',
                'Genera reportes técnicos',
                'Revisa cotizaciones',
                'Consulta historial de proyectos',
                'Accede desde cualquier dispositivo',
              ].map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// Ícono reutilizable para el botón de éxito
function LogInIcon({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
      <polyline points="10 17 15 12 10 7"/>
      <line x1="15" y1="12" x2="3" y2="12"/>
    </svg>
  );
}
