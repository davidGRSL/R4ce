# R4ce — Panel Web

Panel de administración para R4ce. Permite consultar tiempos, rankings, estadísticas
y visualizar recorridos GPS en mapa.

## Stack

- React 18 + Vite
- Tailwind CSS
- React Router
- Axios (con refresh automático de token)
- Leaflet (mapas GPS)
- Lucide icons
- Recharts

## Instalación

```bash
cd web
npm install
npm run dev
```

El panel se abre en `http://localhost:5173`. Las peticiones a `/api/*` se proxean
al backend en `http://localhost:3000` (configurado en `vite.config.js`).

Asegúrate de que el backend de R4ce está corriendo (`docker-compose up -d`).

## Estructura

```
src/
├── components/      Layout, ProtectedRoute
├── pages/           Login, Dashboard, Rankings, Times, TimeDetail
├── lib/             api (axios), auth (tokens), format
└── App.jsx          Router principal
```

## Build de producción

```bash
npm run build
npm run preview
```
