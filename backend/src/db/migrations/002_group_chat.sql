-- ═══════════════════════════════════════════════
-- Migración 002: chat de grupos con media
-- Para contenedores ya creados, ejecutar:
--   docker exec -i rally-postgres psql -U rally_user -d rally_db < backend/src/db/migrations/002_group_chat.sql
-- (schema.sql ya incluye estos cambios para volúmenes nuevos)
-- ═══════════════════════════════════════════════

-- Media adjunta al mensaje (imagen / vídeo / audio). La URL apunta al
-- storage (local o R2); el tipo MIME permite elegir el player en el cliente.
ALTER TABLE group_messages ADD COLUMN IF NOT EXISTS media_url  TEXT;
ALTER TABLE group_messages ADD COLUMN IF NOT EXISTS media_type VARCHAR(50);

-- message_type pasa a admitir: text, image, video, audio, time, stage, system
-- (era VARCHAR(20), suficiente — sin cambio de tipo)
