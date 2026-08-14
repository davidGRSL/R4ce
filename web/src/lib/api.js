import axios from 'axios';
import { getAccessToken, setAccessToken, clearTokens, getRefreshToken } from './auth.js';

// Base del API:
//  - Web (dev): rutas relativas → las resuelve el proxy de Vite.
//  - App nativa (Capacitor) o build apuntando a otro dominio: definir
//    VITE_API_URL (p. ej. https://api.r4ce.app) en el build.
export const API_ORIGIN = import.meta.env.VITE_API_URL?.replace(/\/$/, '') || '';

/**
 * Convierte una URL de media relativa (/uploads/…) en absoluta cuando la app
 * corre en un origen distinto al backend (app nativa). Con R2 en producción
 * las URLs ya son absolutas y se devuelven tal cual.
 */
export function resolveMediaUrl(url) {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_ORIGIN}${url}`;
}

// Sin Content-Type fijo: axios pone application/json para objetos
// y multipart/form-data (con boundary) automáticamente para FormData.
// Forzarlo a JSON rompía las subidas de archivos (avatar, fotos, .glb).
export const api = axios.create({
  baseURL: `${API_ORIGIN}/api/v1`,
});

// Adjuntar token a cada petición
api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Refresh automático en 401
let refreshing = null;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    if (error.response?.status === 401 && !original._retry && getRefreshToken()) {
      original._retry = true;

      try {
        refreshing = refreshing ?? axios.post(`${API_ORIGIN}/api/v1/auth/refresh`, {
          refreshToken: getRefreshToken(),
        });
        const { data } = await refreshing;
        refreshing = null;

        setAccessToken(data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);

        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch (refreshErr) {
        refreshing = null;
        clearTokens();
        window.location.href = '/login';
        return Promise.reject(refreshErr);
      }
    }

    return Promise.reject(error);
  }
);
