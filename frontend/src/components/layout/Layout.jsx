import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  FolderOpen, FileText, Package, Recycle,
  Users, LogOut, Settings, FileSearch,
  X, Menu, Bell, AlertTriangle
} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import api from '../../api/client';
import './Layout.css';

function UserAvatar({ user, size = 34 }) {
  const initials = user?.avatar_letra ||
    (user?.nombre ? user.nombre.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase() : 'U');
  const color = user?.avatar_color || 'linear-gradient(135deg,var(--primary),var(--primary-dark))';
  if (user?.avatar_url) {
    return (
      <div style={{width:size,height:size,borderRadius:'50%',overflow:'hidden',flexShrink:0,border:'2px solid rgba(255,255,255,.25)'}}>
        <img src={user.avatar_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
      </div>
    );
  }
  return (
    <div style={{
      width:size,height:size,borderRadius:'50%',flexShrink:0,
      background: color,
      display:'flex',alignItems:'center',justifyContent:'center',
      fontFamily:'Barlow Condensed,sans-serif',fontWeight:900,
      fontSize: size * .35, color:'#fff',
      border:'2px solid rgba(255,255,255,.25)',
      letterSpacing:'.04em',
    }}>
      {initials}
    </div>
  );
}

export default function Layout({ children }) {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen]         = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [notifs, setNotifs]     = useState([]);
  const menuRef = useRef(null);
  const bellRef = useRef(null);

  const handleLogout = () => { logout(); navigate('/login'); };
  const handleNav    = (to) => { navigate(to); setOpen(false); };

  // Escape / clic fuera
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') { setOpen(false); setBellOpen(false); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // Cerrar al cambiar ruta
  useEffect(() => { setOpen(false); setBellOpen(false); }, [location.pathname]);

  // Notificaciones — solo stock bajo, solo para administradores
  useEffect(() => {
    if (!isAdmin) return;
    const load = async () => {
      try {
        const sb = await api.get('/materiales/stock-bajo').catch(() => ({ data: [] }));
        const stockBajo = Array.isArray(sb.data) ? sb.data : [];
        const stockNotifs = stockBajo.map(m => ({
          type: 'warning',
          text: m.nombre_material,
          sub: `Stock actual: ${m.stock_actual} — mínimo: ${m.stock_minimo}`,
          link: '/materiales',
        }));
        const res = isAdmin ? await api.get('/residuos/recomendaciones').catch(() => ({ data: { alertas: [] } })) : { data: { alertas: [] } };
        const alertasResid = (res.data?.alertas || [])
          .filter(a => a.tipo === 'alerta' || a.tipo === 'ahorro')
          .slice(0, 2)
          .map(a => ({
            type: a.tipo === 'ahorro' ? 'info' : 'warning',
            text: '♻️ Residuos',
            sub: a.mensaje,
            link: '/residuos',
          }));
        setNotifs([...stockNotifs, ...alertasResid]);
      } catch {}
    };
    load();
  }, [isAdmin]);


  const mainLinks = [
    { to: '/proyectos',   icon: FolderOpen, label: 'Proyectos' },
    { to: '/cotizaciones',icon: FileText,   label: 'Cotizaciones' },
    { to: '/reportes',    icon: FileSearch, label: 'Reportes Técnicos' },
    // FIX v42: el Banco es información operativa (cortadores necesitan verlo
    // antes de tomar barras del depósito). Pasa a links principales; las
    // acciones admin (eliminar, tab Config) siguen ocultas dentro del módulo.
    { to: '/residuos',    icon: Recycle,    label: 'Banco de Residuos' },
  ];
  const adminLinks = [
    { to: '/materiales', icon: Package,  label: 'Materiales' },
    { to: '/catalogos',  icon: Settings, label: 'Catálogos' },
    { to: '/usuarios',   icon: Users,    label: 'Usuarios' },
  ];

  const isActive = (to) => location.pathname === to || location.pathname.startsWith(to + '/');

  return (
    <div className="layout">

      {/* Topbar fija */}
      <div className="app-topbar">
        <div className="app-logo" onClick={() => navigate('/dashboard')}>
          <img src="/logo-cortealum.png" alt="Cortealum" className="app-logo-img" />
          <span className="app-logo-name">CORTE<span>ALUM</span></span>
        </div>


        {/* Campana notificaciones */}
        <div style={{marginLeft:'auto', position:'relative', flexShrink:0}} ref={bellRef}>
          <button
            className="bell-btn"
            onClick={() => setBellOpen(o => !o)}
            aria-label="Notificaciones"
          >
            <Bell size={20}/>
            {notifs.length > 0 && <span className="bell-badge">{notifs.length}</span>}
          </button>
          {bellOpen && (
            <div className="bell-dropdown">
              <div className="bell-dropdown-header">Notificaciones</div>
              {notifs.length === 0
                ? <div className="bell-empty">Sin notificaciones</div>
                : notifs.map((n, i) => (
                  <div key={i}
                    className={`bell-item bell-item-${n.type}`}
                    onClick={() => { if(n.link){ setBellOpen(false); navigate(n.link); } }}
                    style={{cursor: n.link ? 'pointer' : 'default'}}
                  >
                    <div className="bell-item-icon"><AlertTriangle size={15}/></div>
                    <div>
                      <div className="bell-item-text">{n.text}</div>
                      {n.sub && <div className="bell-item-sub">{n.sub}</div>}
                    </div>
                  </div>
                ))
              }
            </div>
          )}
        </div>
      </div>

      {/* Contenido principal */}
      <main className="main-content">
        {children}
      </main>

      {/* Overlay oscuro */}
      <div className={`nav-overlay ${open ? 'open' : ''}`} onClick={() => setOpen(false)}/>

      {/* Burbuja flotante */}
      <nav className="floating-nav" ref={menuRef}>
        <div className={`nav-menu ${open ? 'open' : ''}`}>

          {/* Perfil usuario */}
          <div className="nav-menu-item nav-user-mini" onClick={() => handleNav('/perfil')}>
            <div className="nav-item-label">
              <span className="nav-user-name">{user?.nombre || 'Usuario'}</span>
              <span className="nav-user-role">{user?.rol || 'Usuario'}</span>
            </div>
            <div className="nav-item-icon"><UserAvatar user={user} size={30}/></div>
          </div>

          <div className="nav-menu-divider"/>

          {mainLinks.map(({ to, icon: Icon, label }) => (
            <div key={to} className={`nav-menu-item ${isActive(to) ? 'active-nav' : ''}`} onClick={() => handleNav(to)}>
              <span className="nav-item-label">{label}</span>
              <div className="nav-item-icon"><Icon size={19}/></div>
            </div>
          ))}

          {isAdmin && (
            <>
              <div className="nav-menu-divider"/>
              {adminLinks.map(({ to, icon: Icon, label }) => (
                <div key={to} className={`nav-menu-item ${isActive(to) ? 'active-nav' : ''}`} onClick={() => handleNav(to)}>
                  <span className="nav-item-label">{label}</span>
                  <div className="nav-item-icon"><Icon size={19}/></div>
                </div>
              ))}
            </>
          )}

          <div className="nav-menu-divider"/>

          <div className="nav-menu-item nav-logout-item" onClick={handleLogout}>
            <span className="nav-item-label">Cerrar sesión</span>
            <div className="nav-item-icon"><LogOut size={19}/></div>
          </div>

        </div>

        <button
          className={`nav-bubble-btn ${open ? 'active' : ''}`}
          onClick={() => setOpen(!open)}
          aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
        >
          {open ? <X size={22}/> : <Menu size={22}/>}
        </button>
      </nav>
    </div>
  );
}
