import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff, LogIn, AtSign, Phone, User } from 'lucide-react';
import toast from 'react-hot-toast';
import './Login.css';


// ── Tabs de identificación ──────────────────────────────
const TABS = [
  { key: 'usuario', label: 'Usuario',  icon: User },
  { key: 'email',   label: 'Email',    icon: AtSign },
  { key: 'telefono',label: 'Teléfono', icon: Phone },
];

// ── Hook: tamaño del panel para canvas ──────────────────
function useSize(ref) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => {
      setSize({ width: e.contentRect.width, height: e.contentRect.height });
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

// ── Hook: trazos animados de sierra en el fondo ──────────
function useSawCanvas() {
  useEffect(() => {
    const canvas = document.getElementById('loginSawCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const lines = Array.from({ length: 7 }, (_, i) => ({
      x: Math.random() * window.innerWidth,
      y: 80 + i * (window.innerHeight / 7) + Math.random() * 60 - 30,
      speed: 0.4 + Math.random() * 0.5,
      amp: 18 + Math.random() * 22,
      freq: 0.012 + Math.random() * 0.01,
      alpha: 0.06 + Math.random() * 0.07,
      width: 0.8 + Math.random() * 0.6,
      color: Math.random() > 0.5 ? 'rgba(26,86,219,' : 'rgba(148,163,184,',
    }));

    const sparks = Array.from({ length: 18 }, () => ({
      x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, size: 0,
    }));

    let t = 0;

    const spawnSpark = (x, y) => {
      const s = sparks.find(s => s.life <= 0);
      if (!s) return;
      s.x = x; s.y = y;
      s.vx = (Math.random() - 0.5) * 1.8;
      s.vy = -Math.random() * 2 - 0.5;
      s.maxLife = 30 + Math.random() * 30;
      s.life = s.maxLife;
      s.size = 1 + Math.random() * 1.8;
    };

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      lines.forEach(ln => {
        ln.x += ln.speed;
        if (ln.x > canvas.width + 120) ln.x = -120;
        ctx.beginPath();
        ctx.lineWidth = ln.width;
        ctx.strokeStyle = ln.color + ln.alpha + ')';
        ctx.shadowBlur = 0;
        const segLen = 8;
        let first = true;
        for (let px = ln.x - 200; px <= ln.x; px += segLen) {
          const sawY = ln.y + Math.sign(Math.sin((px + t * 0.5) * ln.freq)) * ln.amp;
          if (first) { ctx.moveTo(px, sawY); first = false; }
          else ctx.lineTo(px, sawY);
        }
        ctx.stroke();
        const tipY = ln.y + Math.sign(Math.sin((ln.x + t * 0.5) * ln.freq)) * ln.amp;
        ctx.beginPath();
        ctx.arc(ln.x, tipY, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(147,197,253,0.9)';
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#3B82F6';
        ctx.fill();
        ctx.shadowBlur = 0;
        if (Math.random() < 0.18) spawnSpark(ln.x, tipY);
      });
      sparks.forEach(s => {
        if (s.life <= 0) return;
        s.x += s.vx; s.y += s.vy; s.vy += 0.06; s.life--;
        const a = (s.life / s.maxLife) * 0.85;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(253,224,71,${a})`;
        ctx.shadowBlur = 6; ctx.shadowColor = '#FBBF24';
        ctx.fill(); ctx.shadowBlur = 0;
      });
      t++;
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize); };
  }, []);
}

export default function Login() {
  useSawCanvas();
  const [tab, setTab] = useState('usuario');
  const panelRef = useRef(null);
  const panelSize = useSize(panelRef);
  const [identifier, setIdentifier] = useState('');
  const [pass, setPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const activeTab = TABS.find(t => t.key === tab);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!identifier.trim() || !pass.trim()) return toast.error('Completa todos los campos');
    setLoading(true);
    try {
      const user = await login(identifier.trim(), pass);
      toast.success(`Bienvenido, ${user.nombre}!`);
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Credenciales incorrectas');
    } finally { setLoading(false); }
  };

  return (
    <div className="login-page">
      {/* Fondos animados */}

      <canvas className="login-saw-canvas" id="loginSawCanvas"/>
      <div className="login-bg-grid" />
      <div className="login-bg-lines" />
      <div className="login-orb login-orb-1" />
      <div className="login-orb login-orb-2" />

      <div className="login-container">
        {/* Panel visual izquierdo con blueprint animado */}
        <div className="login-visual">
          <div className="login-blueprint-art">
            <div className="login-bp-art-grid" />
            <svg className="login-bp-svg" viewBox="0 0 380 300" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Marco principal animado */}
              <rect x="60" y="40" width="260" height="200" rx="2" stroke="#1565C0" strokeWidth="1.5" strokeDasharray="600" strokeDashoffset="600">
                <animate attributeName="stroke-dashoffset" from="600" to="0" dur="2s" fill="freeze" begin="0.3s"/>
              </rect>
              <rect x="72" y="52" width="236" height="176" rx="1" stroke="#0D47A1" strokeWidth="0.8" strokeDasharray="800" strokeDashoffset="800">
                <animate attributeName="stroke-dashoffset" from="800" to="0" dur="2.5s" fill="freeze" begin="0.8s"/>
              </rect>
              {/* Divisor vertical */}
              <line x1="190" y1="52" x2="190" y2="228" stroke="#0D47A1" strokeWidth="1.2" strokeDasharray="200" strokeDashoffset="200">
                <animate attributeName="stroke-dashoffset" from="200" to="0" dur="1s" fill="freeze" begin="1.5s"/>
              </line>
              {/* Divisor horizontal */}
              <line x1="72" y1="140" x2="308" y2="140" stroke="#0D47A1" strokeWidth="1.2" strokeDasharray="250" strokeDashoffset="250">
                <animate attributeName="stroke-dashoffset" from="250" to="0" dur="1s" fill="freeze" begin="1.8s"/>
              </line>
              {/* Líneas de dimensión */}
              <line x1="60" y1="255" x2="320" y2="255" stroke="#1565C0" strokeWidth="0.6" opacity="0">
                <animate attributeName="opacity" from="0" to="0.6" dur="0.5s" fill="freeze" begin="2.2s"/>
              </line>
              <line x1="60" y1="250" x2="60" y2="260" stroke="#1565C0" strokeWidth="0.6" opacity="0">
                <animate attributeName="opacity" from="0" to="0.6" dur="0.5s" fill="freeze" begin="2.2s"/>
              </line>
              <line x1="320" y1="250" x2="320" y2="260" stroke="#1565C0" strokeWidth="0.6" opacity="0">
                <animate attributeName="opacity" from="0" to="0.6" dur="0.5s" fill="freeze" begin="2.2s"/>
              </line>
              <text x="190" y="270" textAnchor="middle" fill="#1565C0" fontSize="9" fontFamily="DM Sans" opacity="0">
                <animate attributeName="opacity" from="0" to="0.8" dur="0.5s" fill="freeze" begin="2.4s"/>
                1.200 mm
              </text>
              <line x1="25" y1="40" x2="25" y2="240" stroke="#1565C0" strokeWidth="0.6" opacity="0">
                <animate attributeName="opacity" from="0" to="0.6" dur="0.5s" fill="freeze" begin="2.5s"/>
              </line>
              <line x1="20" y1="40" x2="30" y2="40" stroke="#1565C0" strokeWidth="0.6" opacity="0">
                <animate attributeName="opacity" from="0" to="0.6" dur="0.5s" fill="freeze" begin="2.5s"/>
              </line>
              <line x1="20" y1="240" x2="30" y2="240" stroke="#1565C0" strokeWidth="0.6" opacity="0">
                <animate attributeName="opacity" from="0" to="0.6" dur="0.5s" fill="freeze" begin="2.5s"/>
              </line>
              <text x="14" y="145" textAnchor="middle" fill="#1565C0" fontSize="9" fontFamily="DM Sans" transform="rotate(-90,14,145)" opacity="0">
                <animate attributeName="opacity" from="0" to="0.8" dur="0.5s" fill="freeze" begin="2.7s"/>
                900 mm
              </text>
              <g opacity="0">
                <animate attributeName="opacity" from="0" to="0.5" dur="0.4s" fill="freeze" begin="2s"/>
                <line x1="55" y1="40" x2="65" y2="40" stroke="#1565C0" strokeWidth="0.5"/>
                <line x1="60" y1="35" x2="60" y2="45" stroke="#1565C0" strokeWidth="0.5"/>
                <line x1="315" y1="40" x2="325" y2="40" stroke="#1565C0" strokeWidth="0.5"/>
                <line x1="320" y1="35" x2="320" y2="45" stroke="#1565C0" strokeWidth="0.5"/>
                <line x1="55" y1="240" x2="65" y2="240" stroke="#1565C0" strokeWidth="0.5"/>
                <line x1="60" y1="235" x2="60" y2="245" stroke="#1565C0" strokeWidth="0.5"/>
                <line x1="315" y1="240" x2="325" y2="240" stroke="#1565C0" strokeWidth="0.5"/>
                <line x1="320" y1="235" x2="320" y2="245" stroke="#1565C0" strokeWidth="0.5"/>
              </g>
              <text x="190" y="25" textAnchor="middle" fill="#8C939B" fontSize="8" fontFamily="DM Sans" letterSpacing="2" opacity="0">
                <animate attributeName="opacity" from="0" to="1" dur="0.5s" fill="freeze" begin="3s"/>
                PLANO-001 · VENTANA CORREDIZA
              </text>
              <g transform="translate(330,210)" opacity="0">
                <animate attributeName="opacity" from="0" to="0.7" dur="0.5s" fill="freeze" begin="3.2s"/>
                <rect x="0" y="0" width="30" height="6" fill="none" stroke="#1565C0" strokeWidth="0.8"/>
                <rect x="2" y="6" width="3" height="20" fill="none" stroke="#1565C0" strokeWidth="0.8"/>
                <rect x="25" y="6" width="3" height="20" fill="none" stroke="#1565C0" strokeWidth="0.8"/>
                <text x="15" y="-4" textAnchor="middle" fill="#1565C0" fontSize="6" fontFamily="DM Sans">PERFIL</text>
              </g>
            </svg>
          </div>

          <div className="login-visual-bottom">
            <div className="login-visual-logo">CORTE<span>ALUM</span></div>
            <div className="login-visual-desc">Sistema técnico de cálculo y gestión<br/>para carpintería en aluminio</div>
            <div className="login-chips">
              {['Calculadora','Planos 2D','Reportes','Proyectos','Perfiles','Cotizaciones'].map(c => (
                <div key={c} className="login-chip">
                  <div className="login-chip-dot"/>
                  {c}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Panel formulario derecho */}
        <div className="login-form-panel" ref={panelRef} style={{position:'relative'}}>
          <div style={{textAlign:'center', marginBottom:'1.5rem'}}>
            <img
              src="/logo-cortealum.png"
              alt="Cortealum"
              style={{height:72, width:'auto', objectFit:'contain', display:'inline-block'}}
            />
          </div>
          <div className="login-sys-label">Sistema de acceso</div>
          <div className="login-form-header">
            <h2>Bienvenido de vuelta</h2>
            <p>Selecciona cómo quieres identificarte</p>
          </div>

          {/* Tabs de identificación */}
          <div className="login-tabs">
            {TABS.map(t => (
              <button
                key={t.key}
                className={`login-tab${tab === t.key ? ' active' : ''}`}
                onClick={() => { setTab(t.key); setIdentifier(''); }}
                type="button"
              >
                <t.icon size={13}/>
                {t.label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>{activeTab.label}</label>
              <div className="input-icon-wrap">
                <activeTab.icon size={16} className="input-icon"/>
                <input
                  type={tab === 'correo' ? 'email' : tab === 'telefono' ? 'tel' : 'text'}
                  placeholder={activeTab.placeholder}
                  value={identifier}
                  onChange={e => setIdentifier(e.target.value)}
                  autoFocus
                  required
                />
              </div>
            </div>
            <div className="form-group">
              <label>Contraseña</label>
              <div className="pass-wrap">
                <div className="input-icon-wrap" style={{display:'contents'}}>
                  <span style={{position:'absolute',left:14,top:'50%',transform:'translateY(-50%)',color:'var(--lgray)',pointerEvents:'none',zIndex:1}}>
                    🔑
                  </span>
                </div>
                <input
                  type={showPass ? 'text' : 'password'}
                  placeholder="Ingresa tu contraseña"
                  value={pass}
                  onChange={e => setPass(e.target.value)}
                  required
                  style={{paddingLeft:44}}
                />
                <button type="button" className="pass-toggle" onClick={() => setShowPass(!showPass)}>
                  {showPass ? <EyeOff size={17}/> : <Eye size={17}/>}
                </button>
              </div>
            </div>

            <button type="submit" className="login-btn" disabled={loading}>
              {loading
                ? <><span className="login-spinner"/><span>Verificando...</span></>
                : <><LogIn size={17}/><span>Ingresar al Sistema</span></>
              }
            </button>
          </form>


          <div className="login-footer">
            <span>CorteAlu</span> · Sistema Industrial de Ventanería · v2.0
          </div>
        </div>
      </div>
    </div>
  );
}
