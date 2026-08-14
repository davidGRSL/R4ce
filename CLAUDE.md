# CLAUDE.md — Contexto del proyecto R4ce

Documento de contexto principal para asistentes de IA. Léelo antes de tocar código.
Documentación ampliada en `/docs`: ARQUITECTURA.md, API.md, PRODUCTO.md, CONVENCIONES.md, ROADMAP.md.

## Qué es R4ce

App de rally timing amateur: los usuarios crean tramos (rutas GPS), corren contra el crono con el móvil, registran tiempos, compiten en rankings y comparten en grupos privados con chat cifrado. Incluye área personal con garaje de vehículos (fotos y modelos 3D .glb).

## Stack

- **Backend** (`/backend`): Node.js ≥20, Express 4, Socket.io 4, PostgreSQL 16 + PostGIS 3.4, Redis 7. ES Modules (`"type": "module"`).
- **Web** (`/web`): React 18 + Vite 6, React Router 6, Tailwind 3, Leaflet/react-leaflet, Recharts, lucide-react, axios.
- **Infra**: Docker Compose (4 servicios: postgres, redis, backend, frontend). Almacenamiento de archivos abstracto: driver `local` o Cloudflare `r2` vía `STORAGE_DRIVER`.

## Arranque

```bash
docker compose up -d --build        # levanta todo
docker compose logs -f backend
curl http://localhost:3000/health   # backend OK
# web en http://localhost:5173 (proxy /api y /uploads → backend:3000)
docker compose down -v              # reset total de BD (reejecutar schema.sql)
```

`schema.sql` solo se ejecuta al crear el volumen de postgres. Cambios de schema en caliente → `docker exec -it rally-postgres psql -U rally_user -d rally_db -c "..."` o reset con `down -v`.

## Estructura

```
backend/src/
  app.js              # Express + Socket.io + arranque
  routes/             # authRoutes, stageRoutes, timeRoutes, groupRoutes, profileRoutes, vehicleRoutes
  controllers/        # 1 controlador por dominio, misma nomenclatura
  middleware/         # auth.js (requireAuth/optionalAuth), upload.js (multer), rateLimit.js (Redis, fail-open)
  db/                 # pool.js (query/getClient/testConnection), redis.js (cliente lazy), schema.sql
  storage/            # index.js elige driver local|r2
  utils/              # jwt.js, validators.js, optimizeGlb.js
web/src/
  pages/              # Dashboard, Live, Stages, StageCreate, StageDetail, Rankings, TimeDetail, Profile, Login
  components/         # Layout, Garage, MapPicker, MyStagesPanel, PlaceSearch, ProtectedRoute
  lib/                # api.js (axios + refresh auto), auth.js, geo.js, format.js, speech.js, settings.js, geocode.js, silhouette.js
```

## Reglas clave

1. **API bajo `/api/v1/`**. Rutas nuevas: archivo en `routes/` + controlador en `controllers/` + montaje en `app.js`.
2. **Auth**: JWT access (1h) + refresh token opaco con rotación (30d). Reuso de refresh rotado = robo → se revocan todas las sesiones. `requireAuth` añade `req.user = { id, username }`; `optionalAuth` para endpoints públicos con extras si hay sesión.
3. **SQL directo con `pg`** (sin ORM). Usar `query()` de `db/pool.js` con parámetros `$1, $2...`. Nunca interpolar strings.
4. **Geo**: rutas como `route_geojson` (JSONB) + `route_line` (GEOMETRY LineString 4326) con índice GIST. Consultas de cercanía con PostGIS.
5. **Archivos subidos**: siempre a través de `storage/index.js`, nunca `fs` directo en controladores. Los .glb se optimizan con `optimizeGlb.js` (gltf-transform + draco).
6. **Frontend**: llamadas solo vía `api` de `lib/api.js` (adjunta token y refresca en 401 automáticamente). No usar axios crudo. No fijar Content-Type (rompe subidas FormData).
7. **Privacidad por diseño**: no se guarda email en claro (`email_hash`), pseudónimo público opcional, visibilidad `private|public` en tramos y tiempos, tablas `stage_groups`/`time_groups` para compartir con grupos concretos.
8. **Idioma**: código en inglés, comentarios/docs/commits en español.

## Página Live (la más delicada)

`web/src/pages/Live.jsx` implementa el cronometraje por GPS con máquina de estados: `idle → scanning → armed → ready → running → finished`. Radios de disparo en metros (constantes al inicio del archivo): notificación 500, búsqueda 1000, zona de salida 30/40, checkpoint 40, meta 35. Usa voz (speech.js) para anunciar gaps contra un tiempo de referencia. Cambios aquí requieren prueba en móvil real.

## Estado actual y pendientes

Implementado: auth completa + rate limiting (login/register), CRUD tramos + favoritos + cercanos, social fase 1 (likes, vistas con dedupe Redis, sección Descubrir con orden por popularidad, badges por umbral en `web/src/lib/social.js`), tiempos + rankings (pestaña dentro de Tramos; `/rankings` redirige a `/stages?tab=rankings`), grupos + miembros + invite codes, **chat de grupos completo** (mensajes cifrados AES-256-GCM en reposo — `utils/messageCrypto.js`, clave por grupo derivada de `CHAT_MASTER_KEY` vía HKDF; media imagen/vídeo/audio vía storage; notas de voz con MediaRecorder; Socket.io con auth JWT y rooms por grupo en `src/socket.js`; soft delete por autor o admin), perfil + avatar, vehículos + garaje 3D, Live timing GPS.

Nota chat: el envío persiste por REST (`POST /groups/:id/messages[/media]`) y el backend emite `group:message` / `group:message_deleted` / `group:member_change` / `group:typing` a la room. Migración de schema en `db/migrations/002_group_chat.sql` (media_url, media_type).

También implementado: **notificaciones** (tabla + `utils/notify.js`, rooms `user_<id>`, página Avisos con badge; migración 003), **Bloque A de stores completo** (migración 004): roles globales admin/user/premium (`requireRole`, bootstrap desde `ADMIN_USERNAMES`, panel `/admin` con cola de denuncias + gestión de roles + difusión de noticias), denuncias UGC (`POST /reports`), bloqueo entre usuarios (filtra chat/rankings/descubrir), borrado de cuenta (`DELETE /profile` + media), legales públicos (`/legal/terminos|privacidad` — BORRADOR pendiente de abogado), aceptación de ToS con versión (`TOS_VERSION`), verificación de email (nodemailer fail-soft: sin SMTP loguea el enlace; gate opcional `REQUIRE_EMAIL_VERIFICATION`), aviso de seguridad vial en Live.

**Capacitor (Bloque B) hecho**: proyectos nativos en `web/android` y `web/ios` (permisos declarados, deep links `r4ce://`), capa `web/src/lib/native.js` (GPS/keep-awake/push/deep links con degradación a web — SIN background location por diseño), `VITE_API_URL` + `resolveMediaUrl` para apuntar al backend real, push FCM fail-soft (`utils/push.js`, tabla `push_tokens` migración 005, activar con `FIREBASE_SERVICE_ACCOUNT`). Guía de build/publicación en docs/CAPACITOR.md.

Pendiente (ver docs/ROADMAP.md y docs/PUBLICACION-STORES.md): comentarios en tramos (fase 2 social, diseño decidido), producción (Bloque C), vista `user_stats` con cálculo de km incorrecto (usar `ST_Length(geography(route_line))`).

## Testing

Jest configurado (`npm test` en backend) pero **no hay tests escritos aún**. Al añadir funcionalidad nueva al backend, proponer tests.
