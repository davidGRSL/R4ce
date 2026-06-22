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
