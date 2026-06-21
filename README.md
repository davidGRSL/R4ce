# Rally App — Backend

MVP de backend para una app de rally timing con grupos privados y chat cifrado.
Stack: Node.js + Express + Socket.io + PostgreSQL/PostGIS + Redis, todo orquestado con Docker Compose.

## Estructura

```
rally-app/
├── docker-compose.yml
├── .env                      # variables para docker-compose (no se sube a git)
└── backend/
    ├── Dockerfile
    ├── .dockerignore
    ├── .env                  # variables para correr el backend SUELTO (sin Docker)
    ├── .env.example          # plantilla versionada en git
    ├── package.json
    └── src/
        ├── app.js            # Express + Socket.io + arranque del servidor
        ├── controllers/
        │   └── authController.js   # register, login, refresh, logout, me
        ├── middleware/
        │   └── auth.js              # requireAuth — protege rutas con el access token
        ├── routes/
        │   └── authRoutes.js        # monta /api/v1/auth/*
        ├── utils/
        │   ├── jwt.js                # access tokens (JWT) + refresh tokens (opacos)
        │   └── validators.js         # validación de username/password/pseudonym
        └── db/
            ├── schema.sql    # se ejecuta automáticamente al crear el contenedor de postgres
            └── pool.js       # pool de conexiones pg + helpers query()/getClient()/testConnection()
```

## Arranque rápido (con Docker — recomendado)

```bash
cd rally-app
docker compose up -d --build
docker compose logs -f backend
```

Esto levanta 3 contenedores: `rally-postgres` (con PostGIS, cargando `schema.sql` la primera vez),
`rally-redis` y `rally-backend` (con hot reload vía nodemon, gracias al bind mount de `./backend/src`).

Comprobar que responde:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/api/v1/ping
```

Para resetear la base de datos desde cero (borra los datos y vuelve a ejecutar `schema.sql`):

```bash
docker compose down -v
docker compose up -d --build
```

## Arranque sin Docker (solo el backend, contra Postgres/Redis ya corriendo)

```bash
cd rally-app/backend
npm install
npm run dev
```

Asegúrate de que `backend/.env` apunta a `DB_HOST=localhost` (y no a `postgres`, que solo
resuelve dentro de la red de Docker).

## Cosas detectadas y corregidas al montar el árbol

1. **`jsonwebtoken` no existía en la versión `^9.1.2`** que tenías en `package.json`
   (la última publicada es `9.0.3`). `npm install` habría fallado en seco. Corregido a `^9.0.2`.
2. **`CREATE EXTENSION IF NOT EXISTS uuid-ossp;`** sin comillas es un error de sintaxis en
   PostgreSQL (el guion se interpreta como resta). Corregido a `"uuid-ossp"`. De propina:
   como usas `gen_random_uuid()` en los `DEFAULT` de los UUID, en PostgreSQL 13+ esa función
   ya es nativa — la extensión `uuid-ossp` no la necesitas a menos que más adelante uses
   `uuid_generate_v4()` explícitamente en algún sitio.
3. **`bcrypt` es un módulo nativo** (no JS puro): el `Dockerfile` instala `python3 make g++`
   en la imagen Alpine para que pueda compilarse si no hay binario precompilado para musl.

## Autenticación (implementada)

Registro simple sin verificación de email todavía (cuenta activa al instante).
Refresh tokens con **rotación** en cada uso: cada `refresh` invalida el token usado
y entrega uno nuevo. Si alguien presenta un refresh token que ya fue canjeado por
otro (reuso real, señal de robo), se cierran TODAS las sesiones de ese usuario.
Si el token simplemente fue cerrado por logout, no se considera sospechoso ni
afecta a otras sesiones (columna `replaced_by_token_id` distingue ambos casos).

| Método | Ruta                  | Auth | Body                                   |
|--------|-----------------------|------|-----------------------------------------|
| POST   | /api/v1/auth/register | No   | `{ username, password, pseudonym? }`   |
| POST   | /api/v1/auth/login    | No   | `{ username, password }`               |
| POST   | /api/v1/auth/refresh  | No   | `{ refreshToken }`                     |
| POST   | /api/v1/auth/logout   | No   | `{ refreshToken }`                     |
| GET    | /api/v1/auth/me       | Sí (`Authorization: Bearer <accessToken>`) | — |

`accessToken` dura 1h, `refreshToken` 30 días (configurable por `JWT_ACCESS_EXPIRES` /
`JWT_REFRESH_EXPIRES_DAYS` en el `.env`). Para usar rutas protegidas: `requireAuth`
en `src/middleware/auth.js`, que añade `req.user = { id, username }`.

### ⚠️ Migración necesaria si ya tenías el contenedor levantado

`schema.sql` solo se ejecuta automáticamente la primera vez que se crea el volumen
de Postgres. Como tú ya lo tenías corriendo desde antes de este cambio, te falta la
columna `replaced_by_token_id` en `refresh_tokens`. Dos opciones:

**A) Conservar los datos** — ejecuta esto contra el contenedor ya levantado:
```bash
docker exec -it rally-postgres psql -U rally_user -d rally_db -c \
  "ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS replaced_by_token_id UUID REFERENCES refresh_tokens(id) ON DELETE SET NULL;"
```

**B) Resetear todo** (no hay datos reales todavía, así que es lo más simple):
```bash
docker compose down -v
docker compose up -d --build
```

## Pendiente

- **CORS sigue sin `WEB_URL`/`MOBILE_URL` en `docker-compose.yml`** — sin esto, el
  login/registro funcionará por `curl` pero el navegador/app móvil lo bloqueará por
  CORS en cuanto haya un frontend real. Añade estas dos líneas al `environment:` de
  `backend` en `docker-compose.yml`:
  ```yaml
      WEB_URL: ${WEB_URL}
      MOBILE_URL: ${MOBILE_URL}
  ```
  (ya están definidas en el `.env` raíz, solo falta que el servicio las reciba).
- Verificación de email (cuenta queda activa al instante por ahora; `is_active` y
  `email_hash` ya están en el schema, listos para cuando se active ese flujo).
- Rate limiting en `/login` y `/register` contra fuerza bruta.
- La vista `user_stats` calcula `total_km_estimated` con una fórmula que no es una
  distancia real de ruta (usa solo el primer punto de la línea). Cuando lleguemos a
  estadísticas, lo ideal es `ST_Length(geography(route_line))` sumado por usuario.
- Tramos (stages): CRUD básico — siguiente paso, ahora que `requireAuth` ya existe
  para resolver el `creator_id`.
