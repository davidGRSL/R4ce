# Roadmap — R4ce

Estado a 2026-07-05. Orden orientativo por valor/urgencia; cada bloque es una tarea acotada apta para una sesión de desarrollo.

## 1. Deuda técnica urgente (pequeñas, hacer ya)

- [ ] **CORS en docker-compose**: pasar `WEB_URL` y `MOBILE_URL` al `environment:` del servicio backend (ya existen en el `.env` raíz). Sin esto, cualquier frontend fuera del proxy Vite falla.
- [ ] **Pasar también `STORAGE_DRIVER` y `UPLOAD_DIR`** al servicio backend en docker-compose.
- [x] **Rate limiting** en `/auth/login` y `/auth/register` — hecho (2026-07-05) con middleware propio sobre Redis (`middleware/rateLimit.js`), sin dependencia nueva. Fail-open si Redis cae.
- [ ] **Vista `user_stats`**: corregir `total_km_estimated` con `ST_Length(geography(route_line))` y eliminar el `LEFT JOIN stages ON true` que multiplica filas.
- [ ] **Vincular vehículo al tiempo**: la columna `times.vehicle_id` y el endpoint `GET /vehicles/:id/times` existen, pero `POST /times` no acepta `vehicleId` — nunca se rellena. Añadirlo al body y al selector de guardado en Live.

## 1b. Feature social: popularidad y comentarios (decidido 2026-07-05, en desarrollo)

Decisiones tomadas: señales = favoritos + pilotos distintos + likes simples (❤, tabla nueva) + vistas (dedupe Redis); recompensa = contadores + badges por umbral y ordenación por popularidad (sin score ponderado por ahora); comentarios completos = planos con respuestas a 1 nivel, likes en comentarios, tiempo adjuntable; permiso de comentar = solo quien tiene un tiempo registrado en el tramo; borran comentario su autor o el creador del tramo.

- [x] **Fase 1 — Popularidad** — hecho (2026-07-05): `stage_likes` + `view_count` (migración al final de schema.sql), endpoints like/unlike, counts y `?sort=popular` en `GET /stages`, sección "Descubrir" en Stages.jsx, botones like/favorito en StageDetail, badges en `lib/social.js` + `components/StageBadges.jsx`. Pendiente de probar en local (requiere migración de BD, ver abajo).
- [ ] **Fase 2 — Comentarios**: `stage_comments` (parent_id 1 nivel, time_id opcional, soft delete) + `comment_likes`, endpoints CRUD, UI en StageDetail.

## 2. Seguridad y cuentas

- [ ] **Verificación de email**: flujo completo con SMTP (variables ya en `.env`), activación de `is_active`, reenvío de código. El schema ya lo soporta (`email_hash`, `is_active`).
- [ ] **Recuperación de contraseña** (depende del email verificado).
- [ ] **Auditoría**: empezar a escribir en `audit_log` (login, cambios de rol, borrados) — la tabla existe y nadie la usa.

## 3. Chat de grupos (la mayor pieza pendiente)

- [ ] Persistir mensajes en `group_messages` desde el handler de Socket.io (hoy solo relay).
- [ ] Autenticar el socket (hoy `join_group` acepta cualquier groupId/userId sin verificar membresía).
- [ ] Cifrado: definir modelo (E2E con `encryption_key_encrypted` por grupo vs. cifrado en servidor) e implementarlo.
- [ ] Frontend: página de chat por grupo (histórico paginado + tiempo real), mensajes especiales `time`/`stage` enlazando resultados.
- [ ] Adapter Redis para Socket.io si se escala a más de un proceso.

## 4. Experiencia Live y validez de tiempos

- [ ] Validación anti-trampas de `route_gps` al registrar tiempo (continuidad de puntos, velocidades plausibles, paso real por checkpoints — PostGIS puede verificar contra `route_line`).
- [ ] Recuperación de sesión Live si la app/pestaña se recarga a mitad de tramo.
- [ ] Modo evento: varios pilotos en el mismo tramo con clasificación en directo vía Socket.io.

## 5. Estadísticas y perfil

- [ ] Página de estadísticas del piloto (km reales, evolución de tiempos por tramo, récords) apoyada en la vista `user_stats` corregida.
- [ ] Comparador de tiempos (splits lado a lado, gráfica Recharts de gap por checkpoint).

## 6. Testing y calidad (transversal)

- [ ] Primeros tests con Jest (existe el script, no hay ni un test): empezar por `utils/validators.js`, `utils/jwt.js` y el flujo de rotación de refresh tokens (es la lógica más delicada).
- [ ] Tests de integración de la API con BD efímera (docker).
- [ ] CI simple (GitHub Actions: lint + test en cada PR).

## 7. Móvil (horizonte)

- [ ] Decidir enfoque (React Native / Expo reutilizando `lib/`, o PWA mejorada con la web actual).
- [ ] La pantalla Live es la prioridad móvil; el resto puede seguir siendo web.

---

### Cómo usar este roadmap con IA

Al pedir una tarea a un asistente: referencia el bloque concreto ("implementa el punto de rate limiting del ROADMAP"), y el asistente debe leer antes `CLAUDE.md` + los docs relevantes (`API.md` para endpoints, `ARQUITECTURA.md` para decisiones). Al terminar una tarea, marcar el checkbox y actualizar `API.md`/`ARQUITECTURA.md` si cambió algo.
