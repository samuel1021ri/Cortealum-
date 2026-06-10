import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (stored) {
      const parsed = JSON.parse(stored);
      setUser(parsed);
    }
    setLoading(false);
  }, []);

  const login = async (identifier, contraseña) => {
    const { data } = await api.post('/auth/login', { nombre_usuario: identifier, contraseña });
    // Guardar exactamente lo que devuelve el backend (primer_ingreso viene de la BD)
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };

  const logout = () => { localStorage.clear(); setUser(null); };

  const updateUser = (updatedUser) => {
    const merged = { ...user, ...updatedUser };
    localStorage.setItem('user', JSON.stringify(merged));
    setUser(merged);
  };

  const marcarPasswordCambiada = () => {
    updateUser({ primer_ingreso: false });
  };

  const isAdmin = user?.rol === 'Administrador';

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUser, isAdmin, loading, marcarPasswordCambiada }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
