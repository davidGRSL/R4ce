-- Habilitar extensión PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tabla de usuarios (anónimos con token)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  email_hash VARCHAR(255) UNIQUE,  -- Hash del email, no el email real
  pseudonym VARCHAR(50),            -- Nombre visible en ranking (opcional)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT false   -- false hasta verificar email
);

-- Tabla de tramos (stages)
CREATE TABLE stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  route_geojson JSONB,              -- GeoJSON de la ruta (puntos GPS)
  route_line GEOMETRY(LineString, 4326),  -- Línea PostGIS para queries geo
  silhouette_svg TEXT,              -- SVG de la silueta del tramo
  visibility VARCHAR(20) DEFAULT 'private',  -- private, public
  difficulty_level INT,             -- 1-5
  estimated_duration INT,           -- segundos
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_published BOOLEAN DEFAULT false
);

-- Índices espaciales para consultas rápidas de tramos cercanos
CREATE INDEX idx_stages_route ON stages USING GIST(route_line);

-- Tabla de tiempos registrados
CREATE TABLE times (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stage_id UUID REFERENCES stages(id) ON DELETE SET NULL,
  duration_ms INT NOT NULL,         -- Duración en milisegundos
  route_gps JSONB,                  -- Array de puntos GPS capturados
  max_speed FLOAT,                  -- Velocidad máxima en km/h
  avg_speed FLOAT,
  visibility VARCHAR(20) DEFAULT 'private',  -- private, public (en ranking)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de índices para ranking rápido
CREATE TABLE time_rankings (
  id SERIAL PRIMARY KEY,
  stage_id UUID NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  duration_ms INT NOT NULL,
  rank INT,                         -- Rank calculado per stage
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(stage_id, user_id)
);

-- Tabla de grupos privados
CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  invite_code VARCHAR(20) UNIQUE NOT NULL,
  invite_code_expires_at TIMESTAMP,
  invite_code_active BOOLEAN DEFAULT true,
  encryption_key_encrypted TEXT,   -- Clave AES-256 del grupo cifrada
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de miembros de grupo
CREATE TABLE group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) DEFAULT 'member',  -- owner, moderator, member
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(group_id, user_id)
);

-- Tabla de mensajes (chat)
CREATE TABLE group_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_encrypted TEXT NOT NULL, -- Contenido cifrado con AES-256
  message_type VARCHAR(20) DEFAULT 'text',  -- text, time, stage, system
  metadata JSONB,                  -- JSON con datos extra (tipo time: {duration, stage_id})
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP             -- Soft delete
);

-- Índice para queries rápidas del chat
CREATE INDEX idx_messages_group ON group_messages(group_id, created_at DESC);

-- Tabla de sesiones (para refresh tokens)
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  is_revoked BOOLEAN DEFAULT false,
  -- Apunta al token que lo sustituyó SOLO si murió por rotación (refresh).
  -- NULL si murió por logout u otra causa no rotacional. Esto es lo que
  -- nos permite distinguir "reuso real de un token robado" (sospechoso)
  -- de "alguien volvió a mandar un token que ya cerró sesión" (normal).
  replaced_by_token_id UUID REFERENCES refresh_tokens(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de auditoría (logs)
CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100),
  resource_type VARCHAR(50),
  resource_id VARCHAR(100),
  metadata JSONB,
  ip_address INET,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- Grupos que pueden ver un tramo
CREATE TABLE stage_groups (
  stage_id  UUID REFERENCES stages(id) ON DELETE CASCADE,
  group_id  UUID REFERENCES groups(id) ON DELETE CASCADE,
  PRIMARY KEY (stage_id, group_id)
);

-- Grupos que pueden ver un tiempo
CREATE TABLE time_groups (
  time_id   UUID REFERENCES times(id) ON DELETE CASCADE,
  group_id  UUID REFERENCES groups(id) ON DELETE CASCADE,
  PRIMARY KEY (time_id, group_id)
);

-- ═══════════════════════════════════════════════
-- Migración: Área personal (perfil + vehículos)
-- ═══════════════════════════════════════════════

-- Campos de perfil en users
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio        TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS location   VARCHAR(100);

-- Tabla de vehículos
CREATE TABLE IF NOT EXISTS vehicles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       VARCHAR(100) NOT NULL,    -- "Ford Fiesta R5"
  make       VARCHAR(50),              -- marca
  model      VARCHAR(50),              -- modelo
  year       INT,
  photo_url  TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vehicles_user ON vehicles(user_id);

-- Modelo 3D del vehículo (.glb, se muestra girando en el garaje)
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS model_url TEXT;

-- Vehículo usado en cada tiempo (opcional)
ALTER TABLE times ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_times_vehicle ON times(vehicle_id);

-- Tramos favoritos de cada usuario
CREATE TABLE IF NOT EXISTS favorites (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stage_id   UUID NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, stage_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id, created_at DESC);

-- Índices para búsquedas frecuentes
CREATE INDEX idx_times_user ON times(user_id, created_at DESC);
CREATE INDEX idx_times_stage ON times(stage_id, duration_ms ASC);
CREATE INDEX idx_groups_owner ON groups(owner_id);
CREATE INDEX idx_group_members_user ON group_members(user_id);
CREATE INDEX idx_audit_user ON audit_log(user_id, created_at DESC);

-- Vistas útiles
CREATE VIEW user_stats AS
SELECT 
  u.id,
  u.pseudonym,
  COUNT(DISTINCT t.id) as total_times,
  COUNT(DISTINCT s.id) as stages_created,
  AVG(t.avg_speed) as avg_speed,
  MAX(t.max_speed) as best_speed,
  SUM(
    SQRT(
      ST_X(ST_PointN(stages.route_line, 1))^2 + 
      ST_Y(ST_PointN(stages.route_line, 1))^2
    )
  ) as total_km_estimated
FROM users u
LEFT JOIN times t ON u.id = t.user_id
LEFT JOIN stages s ON u.id = s.creator_id
LEFT JOIN stages ON true
WHERE u.is_active = true
GROUP BY u.id, u.pseudonym;

-- ═══════════════════════════════════════════════
-- Migración: feature social fase 1 (likes + vistas)
-- Para contenedores ya creados, ejecutar los ALTER/CREATE de este
-- bloque con: docker exec -it rally-postgres psql -U rally_user -d rally_db
-- ═══════════════════════════════════════════════

-- Likes simples (❤) sobre tramos. Distinto de favorites:
-- favorito = "quiero tenerlo a mano", like = "me gusta este tramo".
CREATE TABLE IF NOT EXISTS stage_likes (
  user_id    UUID NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  stage_id   UUID NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, stage_id)
);

CREATE INDEX IF NOT EXISTS idx_stage_likes_stage ON stage_likes(stage_id);

-- Contador de vistas del detalle (dedupe por usuario/IP vía Redis, 6h)
ALTER TABLE stages ADD COLUMN IF NOT EXISTS view_count INT NOT NULL DEFAULT 0;

-- ═══════════════════════════════════════════════
-- Migración 002: chat de grupos con media
-- (ver migrations/002_group_chat.sql para contenedores existentes)
-- ═══════════════════════════════════════════════

-- Media adjunta al mensaje (imagen / vídeo / audio)
ALTER TABLE group_messages ADD COLUMN IF NOT EXISTS media_url  TEXT;
ALTER TABLE group_messages ADD COLUMN IF NOT EXISTS media_type VARCHAR(50);

-- ═══════════════════════════════════════════════
-- Migración 003: sistema de notificaciones
-- (ver migrations/003_notifications.sql para contenedores existentes)
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       VARCHAR(30) NOT NULL,   -- group_message, record, news, system
  title      VARCHAR(200) NOT NULL,
  body       TEXT,
  data       JSONB,                  -- { groupId | stageId | url, count, ... }
  read_at    TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user
  ON notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications(user_id) WHERE read_at IS NULL;

-- ═══════════════════════════════════════════════
-- Migración 004: roles de usuario + moderación (Bloque A stores)
-- (ver migrations/004_moderation_roles.sql para contenedores existentes)
-- ═══════════════════════════════════════════════

-- Rol global en la plataforma: admin | user | premium
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user';

-- Aceptación de términos + verificación de email + aviso de seguridad vial
ALTER TABLE users ADD COLUMN IF NOT EXISTS tos_accepted_at   TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tos_version       VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS safety_accepted_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS email_verifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_email_verif_user ON email_verifications(user_id);

-- Denuncias de contenido (UGC)
CREATE TABLE IF NOT EXISTS reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID REFERENCES users(id) ON DELETE SET NULL,
  target_type VARCHAR(20) NOT NULL,   -- message | stage | user
  target_id   UUID NOT NULL,
  reason      TEXT NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending | resolved | dismissed
  resolution  TEXT,
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMP,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at ASC);

-- Bloqueo entre usuarios
CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker ON user_blocks(blocker_id);

-- ═══════════════════════════════════════════════
-- Migración 005: tokens de push nativo (FCM/APNs)
-- (ver migrations/005_push_tokens.sql para contenedores existentes)
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS push_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT UNIQUE NOT NULL,
  platform   VARCHAR(10) NOT NULL DEFAULT 'android',  -- android | ios
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id);
