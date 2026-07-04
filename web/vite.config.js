import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Permitir acceso a través de túneles (pruebas en el móvil)
    allowedHosts: ['.trycloudflare.com'],
    // En Docker sobre Windows los eventos de archivos no llegan al
    // contenedor: sondear cambios para que el hot-reload funcione
    watch: { usePolling: true, interval: 500 },
    proxy: {
      '/api': {
        target: 'http://backend:3000',
        changeOrigin: true,
      },
    },
  },
});
