# Publicación en stores — cambios necesarios en la aplicación

Checklist de desarrollo para poder publicar R4ce en Google Play y App Store.
Solo cambios de CÓDIGO/CONFIG de la app; los trámites administrativos
(cuentas developer, fichas, IARC, DSA) van aparte y no se listan aquí.

Leyenda: ✅ hecho · 🔶 parcial · ❌ pendiente

---

## Bloque A — Requisitos que causan rechazo directo (prioridad máxima)

### A1. Denunciar contenido (UGC — Apple guideline 1.2 / Google UGC policy) ✅
- [ ] Tabla `reports` (id, reporter_id, target_type `message|stage|user`, target_id, reason, status, created_at)
- [ ] `POST /api/v1/reports` (rate-limited)
- [ ] UI: opción "Denunciar" en cada mensaje del chat (junto al borrar), en perfil de miembro y en detalle de tramo
- [ ] Cola de revisión para admin de la app: `GET /reports` + acciones (borrar contenido, avisar, expulsar) — puede ser un endpoint + página simple protegida por `ADMIN_USERNAMES`
- [ ] Compromiso de revisión en 24h (lo exige Apple para UGC)

### A2. Bloquear usuarios ✅
- [ ] Tabla `user_blocks` (blocker_id, blocked_id)
- [ ] `POST/DELETE /api/v1/users/:id/block` + lista `GET /profile/blocked`
- [ ] Filtrado en backend: mensajes de chat, rankings y descubrimiento no muestran contenido de bloqueados (o se atenúa en chat de grupo: "mensaje de usuario bloqueado")
- [ ] UI: bloquear desde el panel de miembros del grupo y gestión en Perfil

### A3. Borrado de cuenta desde la app (obligatorio en ambas stores) ✅
- [ ] `DELETE /api/v1/profile` con confirmación por contraseña
- [ ] Borrar media del storage (avatar, fotos coches, .glb, media de chat propia) — las filas ya caen por `ON DELETE CASCADE`
- [ ] Revocar todas las sesiones (refresh tokens)
- [ ] UI en Perfil: zona de peligro con doble confirmación (escribir el username)

### A4. Términos de uso con tolerancia cero + aceptación ✅ (texto BORRADOR — revisar con abogado)
- [ ] Página pública `/legal/terminos` y `/legal/privacidad` (rutas web sin auth — sirven también como URL para las fichas de las stores)
- [ ] Checkbox de aceptación en registro + columna `tos_accepted_at` (y versión aceptada)
- [ ] Re-aceptación si cambia la versión de los términos

### A5. Verificación de email ✅ (gate opcional REQUIRE_EMAIL_VERIFICATION)
- [ ] Tabla/columnas de token de verificación + expiración
- [ ] Envío de email (SMTP ya está en env/docker-compose)
- [ ] Endpoint `GET /auth/verify?token=` + pantalla de confirmación
- [ ] `is_active` pasa a true al verificar; decidir qué se limita sin verificar

### A6. Seguridad vial (riesgo de rechazo + responsabilidad) ✅
- [ ] Aviso bloqueante la primera vez que se abre Live: "uso exclusivo en circuito cerrado / vías privadas; el dispositivo lo maneja el copiloto" — aceptación registrada (localStorage + backend)
- [ ] Texto recordatorio permanente en la pantalla de Live
- [ ] Mención en términos de uso

---

## Bloque B — Conversión a app nativa (Capacitor)

### B1. Montaje base ✅ (proyectos en web/android y web/ios — ver docs/CAPACITOR.md)
- [ ] `npm i @capacitor/core @capacitor/cli` + `npx cap init` + plataformas `ios`/`android` (carpeta `/app` o dentro de `/web`)
- [ ] `VITE_API_URL` real: `lib/api.js` usa baseURL relativa (`/api/v1`, válida con proxy de Vite) — hacerla configurable para que la app nativa apunte al dominio de producción. Igual para Socket.io (`lib/socket.js` conecta a `/`)
- [ ] Iconos + splash screens (`@capacitor/assets`)
- [ ] Safe areas iOS (notch) en Layout/Live/chat

### B2. Plugins nativos (el "valor nativo" que pide Apple 4.2) ✅ (sin background location por diseño: keep-awake; push requiere configurar Firebase)
- [ ] `@capacitor/geolocation` + background: Live debe seguir cronometrando con pantalla apagada (lo que la web no puede — ver persistencia en `lib/liveSession.js`, que se mantiene como red de seguridad)
- [ ] `@capacitor/push-notifications` (FCM + APNs): las notificaciones (grupo/récord/noticias) deben llegar con la app cerrada. Backend: tabla `push_tokens`, registro de token por dispositivo y envío desde `utils/notify.js` además del socket
- [ ] Micrófono para notas de voz: MediaRecorder funciona en WebView, verificar permisos nativos; si falla en iOS, plugin de grabación
- [ ] `@capacitor-community/keep-awake` sustituye al Wake Lock API
- [ ] Deep links (`r4ce://` + App Links/Universal Links) para notificaciones → pantalla correcta

### B3. Declaración de permisos ✅ (Manifest/Info.plist parcheados; sin ACCESS_BACKGROUND_LOCATION)
- [ ] iOS `Info.plist`: `NSLocationWhenInUseUsageDescription`, `NSLocationAlwaysAndWhenInUseUsageDescription`, `NSMicrophoneUsageDescription`, `NSCameraUsageDescription` (si se saca foto directa) — textos claros de por qué
- [ ] Android `AndroidManifest.xml`: `ACCESS_FINE_LOCATION`, `ACCESS_BACKGROUND_LOCATION` (requiere declaración especial + vídeo demo en Play Console), `RECORD_AUDIO`, `POST_NOTIFICATIONS`
- [ ] Pedir permisos en contexto (al activar Live / al grabar), nunca en el arranque

---

## Bloque C — Endurecimiento de producción

### C1. Backend público ❌
- [ ] Dominio + HTTPS (Cloudflare Tunnel pendiente del roadmap, o VPS)
- [ ] `WEB_URL`/`MOBILE_URL` de producción en CORS (ya se pasan al contenedor ✅)
- [ ] `trust proxy` revisado para el reverse proxy real

### C2. Secretos y datos ❌
- [ ] `JWT_SECRET`, `CHAT_MASTER_KEY` de producción (⚠ rotar CHAT_MASTER_KEY invalida el histórico de chat — fijarla ANTES de tener usuarios reales)
- [ ] `ADMIN_USERNAMES` definido
- [ ] `STORAGE_DRIVER=r2` + credenciales Cloudflare (código listo ✅)
- [ ] Backups automáticos de PostgreSQL (pg_dump programado o servicio gestionado)

### C3. Robustez 🔶
- [x] Rate limiting en login/register ✅
- [ ] Ampliar rate limiting a: envío de mensajes, subida de media, denuncias, registro de tiempos
- [ ] Límite de tamaño ya existe en media de chat ✅ (img 8MB / vídeo 50MB / audio 15MB)
- [ ] Validación de tiempos anti-trampa básica (velocidades imposibles, duración vs distancia) — mínimo un flag para revisión
- [ ] Tests backend (Jest configurado, 0 tests) — mínimo: auth, permisos de grupos, denuncias/bloqueos

### C4. Ya cubierto por diseño ✅
- [x] Privacidad: email solo hasheado, pseudónimo opcional, visibilidad private/public/group
- [x] Chat cifrado en reposo (AES-256-GCM por grupo)
- [x] Moderación básica en grupos: admin/moderador borra mensajes y expulsa
- [x] Notificaciones in-app + navegador (falta push nativo → B2)

---

## Orden de ataque recomendado

| # | Qué | Bloque | Por qué primero |
|---|-----|--------|-----------------|
| 1 | Denunciar + bloquear | A1, A2 | El motivo nº1 de rechazo con UGC; además lleva schema |
| 2 | Borrado de cuenta | A3 | Obligatorio, y es corto |
| 3 | Términos + privacidad públicos + aceptación | A4 | Necesario para registro y para las fichas |
| 4 | Aviso de seguridad vial en Live | A6 | Corto y crítico legalmente |
| 5 | Verificación de email | A5 | Cierra el flujo de cuentas |
| 6 | Capacitor base + permisos | B1, B3 | Ya se puede probar en móvil real |
| 7 | Push nativo + GPS background | B2 | El grueso técnico nuevo |
| 8 | Producción (dominio, R2, secretos, backups) | C | En paralelo a 6-7 |
| 9 | TestFlight + prueba cerrada Play (12 testers/14 días) | — | La fase de feedback cuenta como requisito |

> Nota legal: la redacción de términos/privacidad (RGPD) y el disclaimer de
> seguridad vial conviene pasarlos por un abogado antes del lanzamiento público.
