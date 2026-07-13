-- ═══════════════════════════════════════════════
-- Migración 004: roles de usuario + moderación (Bloque A stores)
-- Para contenedores ya creados, ejecutar:
--   docker exec -i rally-postgres psql -U rally_user -d rally_db < backend/src/db/migrations/004_moderation_roles.sql
-- (schema.sql ya incluye estos cambios para volúmenes nuevos)
-- ═══════════════════════════════════════════════

-- ── Roles de aplicación: admin | user | premium ──
-- Nota: distinto de group_members.role (owner/moderator/member), que es
-- el rol DENTRO de un grupo. Este es el rol global en la plataforma.
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user';

-- ── Aceptación de términos de uso ──
ALTER TABLE users ADD COLUMN IF NOT EXISTS tos_accepted_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tos_version     VARCHAR(20);

-- ── Verificación de email ──
-- is_active se mantiene como "cuenta habilitada" (gatea el login);
-- la verificación va en su propia columna para no bloquear el acceso.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS email_verifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_email_verif_user ON email_verifications(user_id);

-- ── Aviso de seguridad vial (Live) ──
ALTER TABLE users ADD COLUMN IF NOT EXISTS safety_accepted_at TIMESTAMP;

-- ── Denuncias de contenido (UGC) ──
CREATE TABLE IF NOT EXISTS reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID REFERENCES users(id) ON DELETE SET NULL,
  target_type VARCHAR(20) NOT NULL,   -- message | stage | user
  target_id   UUID NOT NULL,
  reason      TEXT NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending | resolved | dismissed
  resolution  TEXT,                    -- nota del admin al resolver
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMP,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at ASC);

-- ── Bloqueo entre usuarios ──
CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker ON user_blocks(blocker_id);
