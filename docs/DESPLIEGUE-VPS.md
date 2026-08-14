# Despliegue en VPS (producción)

Resultado final: `https://tudominio.com` sirviendo la web **y** la API, con
certificado automático, y la app Android apuntando a ese dominio.

Arquitectura del stack (`docker-compose.prod.yml`):

```
Internet ──▶ Caddy (443)  ──▶ /api/*, /socket.io/*, /uploads/* ──▶ backend:3000
                          └─▶ resto ──▶ SPA de React (archivos estáticos)
                                          backend ──▶ postgres · redis
                                          media ──▶ Cloudflare R2
```

Postgres y Redis **no** exponen puertos al exterior: solo son accesibles desde
la red interna de Docker.

---

## 0. Qué necesitas antes de empezar

- Un VPS con Ubuntu 24.04 (Hetzner CX22 ~4 €/mes sobra: 2 vCPU / 4 GB).
- Un dominio (~10 €/año).
- Una cuenta de Cloudflare (gratis) para R2.

---

## 1. Dominio y DNS

En el panel de tu dominio crea dos registros **A** apuntando a la IP del VPS:

| Tipo | Nombre | Valor |
|---|---|---|
| A | `@` | IP.DEL.VPS |
| A | `www` | IP.DEL.VPS |

Verifica la propagación antes de seguir (importante: Caddy pedirá el
certificado nada más arrancar y Let's Encrypt tiene límites de reintentos):

```bash
dig +short tudominio.com
```

---

## 2. Preparar el servidor

Conecta por SSH (`ssh root@IP.DEL.VPS`) y ejecuta:

```bash
# Actualizar
apt update && apt upgrade -y

# Usuario sin privilegios (no trabajar como root)
adduser r4ce
usermod -aG sudo r4ce

# Docker
curl -fsSL https://get.docker.com | sh
usermod -aG docker r4ce

# Firewall: solo SSH y web
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# Protección anti fuerza bruta en SSH
apt install -y fail2ban
```

Recomendado: copia tu clave SSH (`ssh-copy-id r4ce@IP`) y luego desactiva el
acceso por contraseña y como root en `/etc/ssh/sshd_config`
(`PasswordAuthentication no`, `PermitRootLogin no`) + `systemctl restart ssh`.

---

## 3. Traer el código

```bash
su - r4ce
sudo mkdir -p /opt/r4ce && sudo chown r4ce:r4ce /opt/r4ce
git clone https://github.com/davidGRSL/R4ce.git /opt/r4ce
cd /opt/r4ce
```

---

## 4. Cloudflare R2 (media)

1. En `dash.cloudflare.com` → **R2** → *Create bucket* → nombre `r4ce-media`.
2. En el bucket → *Settings* → **Public access**: conecta un subdominio
   (ej. `media.tudominio.com`) o activa el dominio `r2.dev` de desarrollo.
3. R2 → **Manage API Tokens** → *Create API token* con permiso
   **Object Read & Write** sobre ese bucket. Apunta `Access Key ID`,
   `Secret Access Key` y tu `Account ID`.

---

## 5. Variables de entorno

```bash
cp .env.production.example .env.production
```

Genera los secretos (cada comando da un valor distinto):

```bash
openssl rand -hex 64      # JWT_SECRET
openssl rand -hex 64      # CHAT_MASTER_KEY
openssl rand -base64 32   # DB_PASSWORD
```

```bash
nano .env.production
```

Rellena dominio, email, secretos, credenciales R2, SMTP y `ADMIN_USERNAMES`.

> ⚠ **CHAT_MASTER_KEY es irreversible**: de ella se deriva la clave de cifrado
> de cada grupo. Si la cambias después, todo el histórico de chat queda
> ilegible para siempre. Fíjala ahora y guárdala en un gestor de contraseñas.

Protege el archivo:

```bash
chmod 600 .env.production
```

---

## 6. Levantar el stack

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

La primera vez tarda unos minutos (compila backend y frontend). Observa:

```bash
docker compose -f docker-compose.prod.yml logs -f
```

Señales de que va bien: `🚀 Rally App Backend`, `✓ PostgreSQL conectado`,
`[storage] driver activo: r2`, y en Caddy la obtención del certificado.

Comprobación:

```bash
curl https://tudominio.com/health
```

Y abre `https://tudominio.com` en el navegador: debe cargar R4ce con candado.

---

## 7. Migraciones de base de datos

El `schema.sql` solo se ejecuta al crear el volumen por primera vez, así que en
una instalación nueva **ya está todo** (incluye las migraciones 002-005).

Si más adelante añades migraciones, se aplican así:

```bash
docker exec -i r4ce-postgres psql -U "$DB_USER" -d "$DB_NAME" \
  < backend/src/db/migrations/00X_nombre.sql
```

Crea tu cuenta desde la web y comprueba que `ADMIN_USERNAMES` te dio el rol
admin (debe aparecer el apartado **Admin** en el menú; si no, reinicia el
backend, que es cuando se hace el bootstrap).

---

## 8. Backups automáticos

```bash
chmod +x /opt/r4ce/deploy/backup.sh
sudo mkdir -p /var/backups/r4ce
crontab -e
```

Añade (backup diario a las 4:30):

```
30 4 * * * /opt/r4ce/deploy/backup.sh >> /var/log/r4ce-backup.log 2>&1
```

Pruébalo ya, sin esperar al cron:

```bash
/opt/r4ce/deploy/backup.sh
ls -lh /var/backups/r4ce/
```

> Un backup en el mismo servidor no es un backup. Configura `rclone` hacia R2 y
> descomenta la última línea del script para llevarte una copia fuera.

**Ensaya la restauración una vez** — un backup sin probar no cuenta:

```bash
gunzip -c /var/backups/r4ce/r4ce_FECHA.sql.gz | \
  docker exec -i r4ce-postgres psql -U "$DB_USER" -d "$DB_NAME"
```

---

## 9. Compilar la app Android contra producción

En tu PC (Windows), ya con el dominio en marcha:

```powershell
cd C:\Users\Culebra\R4ce\web
$env:VITE_API_URL = "https://tudominio.com"
npm run build
npx cap sync android
```

Antes de generar el AAB, revierte los ajustes de desarrollo (ver
`docs/CAPACITOR.md`): `androidScheme: "https"`, quitar `allowMixedContent` y
quitar el `networkSecurityConfig` del Manifest. Con HTTPS real ya no hacen
falta. Después sigue `docs/PUBLICAR-ANDROID.md`.

---

## 10. Actualizar la app en el servidor

```bash
cd /opt/r4ce
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Si añadiste dependencias de npm, fuerza volúmenes limpios:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build --force-recreate
```

---

## Operación diaria

```bash
# Estado
docker compose -f docker-compose.prod.yml ps

# Logs del backend
docker compose -f docker-compose.prod.yml logs -f backend

# Reiniciar solo el backend
docker compose -f docker-compose.prod.yml restart backend

# Espacio en disco (los logs de Docker crecen)
df -h && docker system df
```

Mantenimiento recomendado: `docker system prune -f` de vez en cuando, y
`apt update && apt upgrade` mensual (o `unattended-upgrades`).

---

## Pendiente del Bloque C tras esto

- [ ] Ampliar rate limiting a mensajes, subida de media y registro de tiempos.
- [ ] Validación anti-trampa de tiempos (velocidades imposibles).
- [ ] Tests de backend (Jest está configurado, sin tests aún).
