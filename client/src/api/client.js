import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('codelens_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const isAuthCall = err.config?.url?.includes('/api/auth/login') || err.config?.url?.includes('/api/auth/register');
    if (err.response?.status === 401 && !isAuthCall) {
      localStorage.removeItem('codelens_token');
      localStorage.removeItem('codelens_user');
      if (!window.location.pathname.startsWith('/login')) window.location.assign('/login');
    }
    return Promise.reject(err);
  }
);

export function apiError(err, fallback = 'Something went wrong') {
  return err?.response?.data?.error || err?.message || fallback;
}

export default api;
