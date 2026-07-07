# Convenciones de código — R4ce

## Generales

- Código (identificadores, nombres de archivo) en **inglés**; comentarios, documentación y mensajes de commit en **español**.
- ES Modules en todo el proyecto (`import`/`export`, extensión `.js` explícita en imports del backend).
- Commits: descripción corta en español en imperativo o sustantivo ("Creación de tramos", "Área personal funcional"). Ramas por feature (`FrontEnd`, `Area-Personal`, `grupos`) con merge por PR a `main`.

## Backend

- **Estructura por dominio**: cada recurso tiene `routes/<x>Routes.js` + `controllers/<x>Controller.js`. Las rutas solo declaran método/ruta/middleware/controlador; la lógica va al controlador.
- **Orden de rutas**: rutas fijas (`/my`, `/near`, `/favorites/list`) SIEMPRE antes que `/:id` en el router.
- **SQL**: directo con `pg` a través de `query()` de `db/pool.js`, siempre parametrizado (`$1, $2`). Transacciones con `getClient()` cuando hay varias escrituras dependientes.
- **Schema**: cambios de BD se añaden al final de `schema.sql` como migración idempotente (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`) con un comentario separador, y se documenta en el README/PR el `ALTER` para contenedores ya creados.
- **Auth**: `requireAuth` para escribir, `optionalAuth` para leer contenido con capa pública. Comprobar propiedad (creator/owner) en el controlador antes de mutar.
- **Errores**: responder `{ error: { message, status } }`. No filtrar detalles internos en producción.
- **Archivos**: subir vía multer (`middleware/upload.js`) → procesar (sharp / optimizeGlb) → guardar con `storage.save()`. Nunca `fs` directo en controladores.
- **Validación**: helpers en `utils/validators.js`; validar entrada al principio del controlador y responder 400 con mensaje claro.

## Frontend

- **Llamadas HTTP**: únicamente con `api` de `lib/api.js`. No fijar `Content-Type` manualmente (rompe FormData). No manejar refresh de tokens a mano: ya lo hace el interceptor.
- **Estructura**: vistas en `pages/`, piezas reutilizables en `components/`, lógica sin UI en `lib/`. Un componente por archivo, export default con nombre.
- **Estilos**: Tailwind con clases utilitarias en JSX; `index.css` solo para lo global. Iconos de `lucide-react`.
- **Estado**: hooks locales (`useState`/`useEffect`); preferencias de usuario persistentes en `localStorage` a través de `lib/settings.js`.
- **Mapas**: react-leaflet; utilidades de distancia/velocidad en `lib/geo.js` (no duplicar haversine).
- **Formato de datos**: duraciones y gaps siempre con `lib/format.js` (ms internamente, formatear solo al pintar).

## Docker / entorno

- Desarrollo siempre con `docker compose up -d --build`; el backend tiene hot reload (nodemon) y el frontend polling de archivos (Windows).
- Variables nuevas: añadirlas a `backend/.env.example` (documentadas), al `.env` raíz si las usa docker-compose, y al `environment:` del servicio en `docker-compose.yml`. Los tres sitios, o el contenedor no la verá.
- Nada de secretos en git: `.env` está en `.gitignore`; solo se versiona `.env.example`.

## Al añadir una feature (checklist)

1. Schema: migración idempotente al final de `schema.sql` (+ `ALTER` documentado).
2. Backend: ruta + controlador + validación + comprobación de permisos.
3. Frontend: consumir vía `lib/api.js`, formatear con `lib/format.js`.
4. Actualizar `docs/API.md` y, si cambia el rumbo, `docs/ROADMAP.md`.
5. Probar con `curl` y en el navegador; si toca Live, probar en móvil real.
