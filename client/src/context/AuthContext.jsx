import { createContext, useContext, useState } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('codelens_user'));
    } catch {
      return null;
    }
  });

  const persist = (token, nextUser) => {
    localStorage.setItem('codelens_token', token);
    localStorage.setItem('codelens_user', JSON.stringify(nextUser));
    setUser(nextUser);
  };

  const login = async (email, password) => {
    const { data } = await api.post('/api/auth/login', { email, password });
    persist(data.token, data.user);
  };

  const register = async (name, email, password) => {
    const { data } = await api.post('/api/auth/register', { name, email, password });
    persist(data.token, data.user);
  };

  const logout = () => {
    localStorage.removeItem('codelens_token');
    localStorage.removeItem('codelens_user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
