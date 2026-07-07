# Arquitectura — R4ce

## Visión general

```
┌─────────────┐     /api/v1 (proxy Vite)      ┌──────────────────┐
│  Web React   │ ────────────────────────────▶ │  Backend Express │
│  (5173)      │ ◀──────── Socket.io ────────▶ │  + Socket.io     │
└─────────────┘                                │  (3000)          │
      móvil (futuro) ────────────────────────▶ └───┬──────┬───────┘
                                                   │      │
                                     ┌─────────────▼┐  ┌──▼──────┐
                                     │ PostgreSQL 16 │  │ Redis 7 │
                                     │ + PostGIS 3.4 │  └─────────┘
                                     └───────────────┘
                                     Storage: local (volumen) | Cloudflare R2
```

Cuatro contenedores en `docker-compose.yml` sobre la red `rally-network`: `rally-postgres` (carga `schema.sql` al crear el volumen), `rally-redis`, `rally-backend` (nodemon con bind mount de `./backend/src` → hot reload) y `rally-frontend` (Vite dev server, `npm install` en cada arranque).

## Backend

Flujo de una petición: `app.js` → router (`routes/*.js`) → middleware auth → controlador (`controllers/*.js`) → `db/pool.js` (SQL directo con `pg`). No hay capa de servicios ni ORM; la lógica vive en los controladores.

### Autenticación

- **Access token**: JWT firmado con `JWT_SECRET`, expira en 1h (`JWT_ACCESS_EXPIRES`).
- **Refresh token**: opaco, se guarda hasheado en `refresh_tokens`, expira a 30 días (`JWT_REFRESH_EXPIRES_DAYS`). **Rotación en cada uso**: el refresh invalida el token usado y emite uno nuevo, enlazado por `replaced_by_token_id`.
- **Detección de robo**: si llega un refresh token ya rotado (tiene `replaced_by_token_id`), se revocan TODAS las sesiones del usuario. Si murió por logout (`replaced_by_token_id` NULL), no es sospechoso.
- Middleware: `requireAuth` (401 sin token válido, añade `req.user`), `optionalAuth` (añade `req.user` si hay token, sigue sin él).

### Datos geoespaciales

Cada tramo guarda la ruta por duplicado: `route_geojson` (JSONB, para devolver al cliente tal cual) y `route_line` (GEOMETRY LineString SRID 4326, para consultas). Índice GIST en `route_line`. `/stages/near` busca tramos cercanos a una coordenada con PostGIS (radio en metros).

### Almacenamiento de archivos

`storage/index.js` expone `save(buffer, key, contentType)`, `delete(key)`, `url(key)` y delega en `local.js` (disco, servido por Express en `/uploads` con volumen `uploads_data`) o `r2.js` (Cloudflare R2 vía SDK S3) según `STORAGE_DRIVER`. Subidas con multer (`middleware/upload.js`): `uploadSingle` para imágenes (procesadas con sharp), `uploadModelSingle` para .glb (optimizados con gltf-transform + compresión Draco en `utils/optimizeGlb.js`).

### Socket.io

Configurado en `app.js` con rooms por grupo (`group_<id>`). Eventos: `join_group`, `message` → `message_received`, `leave_group`, `user_joined`. **Estado actual: solo relay en memoria** — no persiste mensajes en `group_messages` ni implementa el cifrado AES-256 previsto en el schema.

### Redis

Cliente compartido en `db/redis.js` (lazy, fail-open: si Redis cae, la app sigue). Usos actuales: rate limiting (`middleware/rateLimit.js`, INCR+EXPIRE por IP, aplicado a login/register y likes) y dedupe de vistas de tramos (SET NX EX 6h por usuario/IP). `app.js` activa `trust proxy` para que `req.ip` sea la IP real detrás del proxy de Vite. Pendiente: adapter de Socket.io.

## Base de datos (schema.sql)

| Tabla | Propósito | Claves |
|---|---|---|
| `users` | Usuarios; email solo hasheado (`email_hash`), `pseudonym` visible, `is_active` para verificación futura. Perfil: `avatar_url`, `bio`, `location` | PK uuid |
| `stages` | Tramos: `route_geojson`, `route_line` (GIST), `silhouette_svg`, `visibility` private/public/group, `difficulty_level` 1-5, `is_published`, `view_count` | FK `creator_id` |
| `stage_likes` | Likes ❤ por usuario y tramo (señal social, distinta de favoritos) | PK (user_id, stage_id) |
| `times` | Tiempos: `duration_ms`, `route_gps` (JSONB), `max_speed`, `avg_speed`, `visibility`, `vehicle_id` opcional | FK user, stage, vehicle |
| `time_rankings` | Mejor tiempo por usuario y tramo con `rank` precalculado | UNIQUE(stage_id, user_id) |
| `groups` | Grupos privados: `invite_code` (expirable, regenerable), `encryption_key_encrypted` (AES-256, pendiente de uso) | FK `owner_id` |
| `group_members` | Membresía con `role` owner/moderator/member | UNIQUE(group_id, user_id) |
| `group_messages` | Chat cifrado (`content_encrypted`), `message_type` text/time/stage/system, soft delete | índice (group_id, created_at) |
| `refresh_tokens` | Sesiones; `token_hash`, `is_revoked`, `replaced_by_token_id` para rotación | FK user |
| `stage_groups` / `time_groups` | Compartir tramos/tiempos con grupos concretos | PK compuesta |
| `favorites` | Tramos favoritos por usuario | PK (user_id, stage_id) |
| `vehicles` | Garaje: `photo_url`, `model_url` (.glb) | FK user |
| `audit_log` | Auditoría de acciones con IP | BIGSERIAL |

Vista `user_stats`: agregados por usuario. ⚠️ `total_km_estimated` usa una fórmula incorrecta (primer punto de la línea) y un `LEFT JOIN stages ON true` que multiplica filas; sustituir por `ST_Length(geography(route_line))` cuando se aborden estadísticas.

## Frontend web

SPA React con React Router. `ProtectedRoute` + `Layout` envuelven todo excepto `/login`.

- **`lib/api.js`**: instancia axios con baseURL `/api/v1` (proxy Vite → `backend:3000`). Interceptores: adjunta Bearer token; en 401 hace refresh automático (deduplicado con promesa compartida) y reintenta; si falla, limpia tokens y redirige a `/login`. Tokens en `localStorage`.
- **`pages/Live.jsx`**: cronometraje GPS. Máquina de estados `idle → scanning → armed → ready → running → finished`. Detecta tramo cercano (500 m), arma la salida (zona 30 m, dispara al salir a 40 m), registra splits en checkpoints (40 m) y para en meta (35 m). Compara contra tiempo de referencia con anuncios de voz (`lib/speech.js`).
- **Mapas**: Leaflet + react-leaflet (`MapPicker` para dibujar rutas en `StageCreate`); geocodificación en `lib/geocode.js` + `PlaceSearch`.
- **`components/Garage.jsx`**: vehículos con foto y modelo 3D .glb girando (dentro de Profile).
- **`lib/silhouette.js`**: genera el SVG de silueta del trazado que se guarda con el tramo.

## Variables de entorno

`.env` raíz alimenta docker-compose; `backend/.env` es para ejecutar el backend suelto (`DB_HOST=localhost` en vez de `postgres`). Claves: `DB_*`, `REDIS_URL`, `JWT_SECRET` / `JWT_ACCESS_EXPIRES` / `JWT_REFRESH_EXPIRES_DAYS`, `SMTP_*` (email futuro), `WEB_URL` / `MOBILE_URL` (CORS), `STORAGE_DRIVER` (+credenciales R2), `UPLOAD_DIR`.

⚠️ `docker-compose.yml` no pasa `WEB_URL`/`MOBILE_URL` ni `STORAGE_DRIVER`/`UPLOAD_DIR` al servicio backend — el CORS del navegador fallará con un frontend fuera del proxy Vite hasta añadirlas al `environment:`.
