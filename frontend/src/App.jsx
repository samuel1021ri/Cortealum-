import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import PrimerIngresoModal from './components/common/PrimerIngresoModal';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Proyectos from './pages/Proyectos';
import NuevoProyecto from './pages/NuevoProyecto';
import ProyectoDetalle from './pages/ProyectoDetalle';
import Cotizaciones from './pages/Cotizaciones';
import Materiales from './pages/Materiales';
import Usuarios from './pages/Usuarios';
import Perfil from './pages/Perfil';
import ReportesTecnicos from './pages/ReportesTecnicos';
import BancoResiduos    from './pages/BancoResiduos';
import Catalogos from './pages/Catalogos';
import GlobalSearchModal from './components/common/GlobalSearchModal';
import GlobalPasswordPromptModal from './components/common/GlobalPasswordPromptModal';
import { useState, useEffect } from 'react';

function PrimerIngresoGuard() {
  const { user, marcarPasswordCambiada } = useAuth();
  // Mostrar si primer_ingreso es true (boolean) o "true" (string del localStorage)
  const mostrar = user && (user.primer_ingreso === true || user.primer_ingreso === 'true');
  if (!mostrar) return null;
  return (
    <PrimerIngresoModal
      user={user}
      onContinuar={marcarPasswordCambiada}
      onCambiar={marcarPasswordCambiada}
    />
  );
}

function PrivateRoute({ children, adminOnly }) {
  const { user, isAdmin, loading } = useAuth();
  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',background:'var(--bg)'}}>
      <div className="spinner"/>
    </div>
  );
  if (!user) return <Navigate to="/login" replace/>;
  if (adminOnly && !isAdmin) return <Navigate to="/dashboard" replace/>;
  return <Layout>{children}</Layout>;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard"/> : <Login/>}/>
      <Route path="/dashboard" element={<PrivateRoute><Dashboard/></PrivateRoute>}/>
      <Route path="/proyectos" element={<PrivateRoute><Proyectos/></PrivateRoute>}/>
      <Route path="/proyectos/nuevo" element={<PrivateRoute><NuevoProyecto/></PrivateRoute>}/>
      <Route path="/proyectos/:id" element={<PrivateRoute><ProyectoDetalle/></PrivateRoute>}/>
      <Route path="/cotizaciones" element={<PrivateRoute><Cotizaciones/></PrivateRoute>}/>
      <Route path="/reportes"  element={<PrivateRoute><ReportesTecnicos/></PrivateRoute>}/>
      <Route path="/residuos"  element={<PrivateRoute><BancoResiduos/></PrivateRoute>}/>
      <Route path="/materiales" element={<PrivateRoute adminOnly><Materiales/></PrivateRoute>}/>
      <Route path="/catalogos" element={<PrivateRoute adminOnly><Catalogos/></PrivateRoute>}/>
      <Route path="/usuarios" element={<PrivateRoute adminOnly><Usuarios/></PrivateRoute>}/>
      <Route path="/perfil" element={<PrivateRoute><Perfil/></PrivateRoute>}/>
      <Route path="*" element={<Navigate to="/dashboard"/>}/>
    </Routes>
  );
}

export default function App() {
  // Ctrl+K / Cmd+K abre la búsqueda global desde cualquier pantalla.
  // El listener vive aquí (en el App root) para no perderlo al navegar.
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(s => !s);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <AuthProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Toaster
          position="top-right"
          toastOptions={{
            style: { borderRadius: 10, fontWeight: 600, fontFamily: 'Barlow, sans-serif', fontSize: '.875rem' },
            success: { iconTheme: { primary: '#057a55', secondary: '#fff' } },
            error: { iconTheme: { primary: '#C0392B', secondary: '#fff' } },
          }}
        />
        <AppRoutes/>
        <PrimerIngresoGuard/>
        <GlobalSearchModal open={searchOpen} onClose={() => setSearchOpen(false)}/>
        {/* Modal global de confirmación con contraseña — escucha eventos del
            interceptor en client.js. Cualquier DELETE protegido por
            requirePassword del backend dispara este modal automáticamente. */}
        <GlobalPasswordPromptModal/>
      </BrowserRouter>
    </AuthProvider>
  );
}
