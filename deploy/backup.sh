#!/usr/bin/env bash
# ═══════════════════════════════════════════════
# Backup de PostgreSQL (R4ce) — pg_dump comprimido con rotación.
#
# Instalación en el VPS (ver docs/DESPLIEGUE-VPS.md):
#   chmod +x deploy/backup.sh
#   crontab -e   →   30 4 * * *  /opt/r4ce/deploy/backup.sh >> /var/log/r4ce-backup.log 2>&1
#
# Restaurar un backup:
#   gunzip -c /var/backups/r4ce/r4ce_2026-08-15_0430.sql.gz | \
#     docker exec -i r4ce-postgres psql -U "$DB_USER" -d "$DB_NAME"
# ═══════════════════════════════════════════════
set -euo pipefail

# Directorio del proyecto (donde está docker-compose.prod.yml)
PROJECT_DIR="${PROJECT_DIR:-/opt/r4ce}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/r4ce}"
KEEP_DAYS="${KEEP_DAYS:-14}"
CONTAINER="${CONTAINER:-r4ce-postgres}"

# Credenciales desde .env.production
set -a
# shellcheck disable=SC1090
source "${PROJECT_DIR}/.env.production"
set +a

mkdir -p "$BACKUP_DIR"
STAMP=$(date +%F_%H%M)
FILE="${BACKUP_DIR}/r4ce_${STAMP}.sql.gz"

echo "[$(date -Is)] Iniciando backup → ${FILE}"

# --clean --if-exists: el dump se puede restaurar sobre una BD existente
docker exec "$CONTAINER" pg_dump \
  -U "$DB_USER" -d "$DB_NAME" \
  --clean --if-exists --no-owner \
  | gzip -9 > "$FILE"

SIZE=$(du -h "$FILE" | cut -f1)
echo "[$(date -Is)] Backup completado (${SIZE})"

# Verificación mínima: un dump válido termina con la línea de PostgreSQL
if ! gunzip -c "$FILE" | tail -5 | grep -q "PostgreSQL database dump complete"; then
  echo "[$(date -Is)] ⚠ AVISO: el dump parece incompleto — revisar"
  exit 1
fi

# Rotación
DELETED=$(find "$BACKUP_DIR" -name 'r4ce_*.sql.gz' -mtime "+${KEEP_DAYS}" -print -delete | wc -l)
echo "[$(date -Is)] Backups antiguos eliminados: ${DELETED} (retención ${KEEP_DAYS} días)"

# ── Opcional: copia externa a Cloudflare R2 ──
# Un backup en el mismo servidor NO es un backup: si el VPS muere, se va todo.
# Con rclone configurado (rclone config → remote "r2"):
#   rclone copy "$FILE" r2:r4ce-backups/
