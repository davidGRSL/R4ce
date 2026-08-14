-- ═══════════════════════════════════════════════
-- Migración 005: tokens de push nativo (FCM/APNs vía Firebase)
-- Para contenedores ya creados, ejecutar:
--   docker exec -i rally-postgres psql -U rally_user -d rally_db < backend/src/db/migrations/005_push_tokens.sql
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS push_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT UNIQUE NOT NULL,
  platform   VARCHAR(10) NOT NULL DEFAULT 'android',  -- android | ios
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id);
