-- ═══════════════════════════════════════════════
-- Migración 003: sistema de notificaciones
-- Para contenedores ya creados, ejecutar:
--   docker exec -i rally-postgres psql -U rally_user -d rally_db < backend/src/db/migrations/003_notifications.sql
-- (schema.sql ya incluye estos cambios para volúmenes nuevos)
-- ═══════════════════════════════════════════════

-- Tipos: group_message (colapsa en 1 no-leída por grupo), record,
-- news (difusión admin), system.
-- Privacidad: NUNCA guardar aquí contenido de mensajes de chat (van
-- cifrados en group_messages; esto los expondría en claro).
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       VARCHAR(30) NOT NULL,
  title      VARCHAR(200) NOT NULL,
  body       TEXT,
  data       JSONB,           -- { groupId | stageId | url, count, ... }
  read_at    TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user
  ON notifications(user_id, created_at DESC);

-- Consulta frecuente: contador de no leídas
CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications(user_id) WHERE read_at IS NULL;
