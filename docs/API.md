# API — R4ce

Base: `http://localhost:3000/api/v1`. Autenticación: `Authorization: Bearer <accessToken>`.

- **Auth Sí** = requiere token (`requireAuth`, 401 sin él).
- **Auth Opc** = pública, pero devuelve extras (favoritos, propiedad, visibilidad privada propia) con token (`optionalAuth`).

Salud: `GET /health` y `GET /api/v1/ping` (fuera de auth).
Archivos subidos: `GET /uploads/<key>` (estático, driver local).

## Auth — `/auth`

| Método | Ruta | Auth | Body / Notas |
|---|---|---|---|
| POST | `/register` | No | `{ username, password, pseudonym? }` — cuenta activa al instante (sin verificación email aún). Rate limit: 5/h por IP |
| POST | `/login` | No | `{ username, password }` → `{ accessToken, refreshToken }`. Rate limit: 10/5min por IP |
| POST | `/refresh` | No | `{ refreshToken }` — rotación: invalida el usado, emite nuevo. Reuso de token rotado → revoca todas las sesiones |
| POST | `/logout` | No | `{ refreshToken }` |
| GET | `/me` | Sí | — |

## Tramos — `/stages`

| Método | Ruta | Auth | Notas |
|---|---|---|---|
| GET | `/` | Opc | Listado de tramos públicos. `?sort=popular\|recent` (popular = likes+favoritos+pilotos), `?difficulty`, `?search`, paginación. Cada tramo incluye `likesCount`, `favoritesCount`, `pilotsCount`, `viewCount`, `likedByMe`, `favoritedByMe` |
| POST | `/` | Sí | Crear tramo (ruta GeoJSON, checkpoints, silueta SVG) |
| GET | `/my/stages` | Sí | Mis tramos |
| GET | `/favorites/list` | Sí | Mis favoritos |
| GET | `/near` | Opc | Tramos cercanos a `?lat&lng` (PostGIS, radio en metros) |
| GET | `/:id` | Opc | Detalle básico |
| GET | `/:id/detail` | Opc | Detalle ampliado (ranking, tiempos...) |
| PUT | `/:id` | Sí | Solo creador |
| DELETE | `/:id` | Sí | Solo creador |
| POST | `/:id/publish` | Sí | Alternar publicación |
| POST | `/:id/groups` | Sí | Asignar grupos que ven el tramo |
| POST | `/:id/favorite` | Sí | Añadir favorito |
| DELETE | `/:id/favorite` | Sí | Quitar favorito |
| POST | `/:id/like` | Sí | Like ❤ → `{ liked, likesCount }`. Rate limit: 30/min |
| DELETE | `/:id/like` | Sí | Quitar like → `{ liked, likesCount }`. Rate limit: 30/min |

⚠️ Las rutas fijas (`/my/stages`, `/favorites/list`, `/near`) van declaradas ANTES de `/:id` para que el parámetro no las capture. Mantener ese orden al añadir rutas.

## Tiempos — `/times`

| Método | Ruta | Auth | Notas |
|---|---|---|---|
| GET | `/my` | Sí | Mis tiempos |
| GET | `/stage/:stageId` | Opc | Tiempos de un tramo |
| GET | `/stage/:stageId/ranking` | Opc | Ranking del tramo |
| GET | `/:id` | Opc | Detalle de un tiempo |
| POST | `/` | Sí | Registrar tiempo: `{ stageId, durationMs, visibility, groupIds?, splits, track, maxSpeed?, avgSpeed? }` (splits y track guardados juntos en `route_gps`) |
| PATCH | `/:id/visibility` | Sí | private ↔ public |
| DELETE | `/:id` | Sí | Solo dueño |

## Grupos — `/groups` (todo con auth)

| Método | Ruta | Notas |
|---|---|---|
| POST | `/` | Crear grupo (genera invite code) |
| GET | `/my` | Mis grupos |
| GET | `/:id` | Detalle |
| PUT | `/:id` | Editar (owner/moderator) |
| DELETE | `/:id` | Solo owner |
| POST | `/join` | `{ inviteCode }` |
| POST | `/:id/leave` | Salir |
| GET | `/:id/members` | Miembros |
| DELETE | `/:id/members/:userId` | Expulsar |
| PATCH | `/:id/members/:userId/role` | owner / moderator / member |
| POST | `/:id/invite/regenerate` | Nuevo invite code |
| GET | `/:id/stages` | Tramos compartidos al grupo |
| GET | `/:id/times` | Tiempos compartidos al grupo |

## Perfil — `/profile` (todo con auth)

| Método | Ruta | Notas |
|---|---|---|
| GET | `/` | Perfil propio |
| PATCH | `/` | `pseudonym`, `bio`, `location` |
| POST | `/avatar` | multipart, campo imagen (sharp) |
| DELETE | `/avatar` | — |

## Vehículos — `/vehicles` (todo con auth)

| Método | Ruta | Notas |
|---|---|---|
| GET | `/` | Mi garaje |
| POST | `/` | `{ name, make?, model?, year? }` |
| PATCH | `/:id` | Editar |
| DELETE | `/:id` | — |
| POST | `/:id/photo` | multipart, imagen |
| POST | `/:id/model` | multipart, .glb (optimizado con Draco) |
| GET | `/:id/times` | Tiempos hechos con ese vehículo |

## Socket.io (ws en :3000)

Eventos cliente → servidor: `join_group(groupId, userId)`, `message({ groupId, content, ... })`, `leave_group(groupId)`.
Servidor → clientes del room `group_<id>`: `user_joined`, `message_received`.
Estado: relay sin persistencia ni cifrado todavía (ver ROADMAP).

## Errores

Formato uniforme: `{ error: { message, status } }`. En producción los 500 devuelven mensaje genérico. 404 con el mismo formato. Los endpoints con rate limit devuelven 429 con cabecera `Retry-After` (fail-open: si Redis no está disponible, no se limita).

## Notas sociales

`GET /:id/detail` incrementa `viewCount` con dedupe por usuario/IP en Redis (ventana 6h). Los badges del frontend (`web/src/lib/social.js`) se calculan por umbral: Popular ≥5 likes, Concurrido ≥10 pilotos, Fav. comunidad ≥5 favoritos.
