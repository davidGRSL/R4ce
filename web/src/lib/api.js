import axios from 'axios';
import { getAccessToken, setAccessToken, clearTokens, getRefreshToken } from './auth.js';

export const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
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
        refreshing = refreshing ?? axios.post('/api/v1/auth/refresh', {
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
