-- ═══════════════════════════════════════════════════════════════
-- Migración: sincroniza bases de datos creadas ANTES de que
-- schema.sql incluyera el "Área personal" y la "Parte social".
--
-- Por qué hace falta:
--   docker-compose monta schema.sql en /docker-entrypoint-initdb.d,
--   que SOLO se ejecuta cuando el volumen postgres_data está vacío.
--   En un volumen ya existente, los CREATE/ALTER añadidos después
--   nunca se aplicaron → faltan tablas/columnas como stage_likes,
--   favorites o view_count, y getStageDetail / listPublicStages
--   (que usan socialCountsSQL) revientan con 500 "Error interno".
--
-- Es 100% idempotente (IF NOT EXISTS): seguro ejecutarlo varias veces
-- y no toca datos existentes.
--
-- Aplicar (PowerShell, desde la raíz del repo):
--   docker cp backend/src/db/migrations/001_sync_existing_volume.sql rally-postgres:/tmp/mig.sql
--   docker exec rally-postgres psql -U rally_user -d rally_db -f /tmp/mig.sql
-- ═══════════════════════════════════════════════════════════════

-- ── Área personal (perfil + vehículos) ──────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio        TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS location   VARCHAR(100);

CREATE TABLE IF NOT EXISTS vehicles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       VARCHAR(100) NOT NULL,
  make       VARCHAR(50),
  model      VARCHAR(50),
  year       INT,
  photo_url  TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_vehicles_user ON vehicles(user_id);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS model_url TEXT;

ALTER TABLE times ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_times_vehicle ON times(vehicle_id);

CREATE TABLE IF NOT EXISTS favorites (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stage_id   UUID NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, stage_id)
);
CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id, created_at DESC);

-- ── Parte social (likes + vistas) ───────────────────────────────
CREATE TABLE IF NOT EXISTS stage_likes (
  user_id    UUID NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  stage_id   UUID NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, stage_id)
);
CREATE INDEX IF NOT EXISTS idx_stage_likes_stage ON stage_likes(stage_id);

ALTER TABLE stages ADD COLUMN IF NOT EXISTS view_count INT NOT NULL DEFAULT 0;
