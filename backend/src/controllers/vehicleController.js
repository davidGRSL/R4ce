import { query } from '../db/pool.js';
import { processAndStore, keyFromUrl } from '../middleware/upload.js';
import { storage } from '../storage/index.js';

function publicVehicle(row) {
  return {
    id:        row.id,
    name:      row.name,
    make:      row.make,
    model:     row.model,
    year:      row.year,
    photoUrl:  row.photo_url,
    timesCount: row.times_count != null ? parseInt(row.times_count) : undefined,
    createdAt: row.created_at,
  };
}

async function assertOwner(vehicleId, userId) {
  const r = await query(`SELECT * FROM vehicles WHERE id = $1`, [vehicleId]);
  const v = r.rows[0];
  if (!v) return { error: 'notfound' };
  if (v.user_id !== userId) return { error: 'forbidden' };
  return { vehicle: v };
}

// ─────────────────────────────────────────────
// GET /api/v1/vehicles
// Mis vehículos con nº de tiempos registrados con cada uno.
// ─────────────────────────────────────────────
export async function listVehicles(req, res) {
  try {
    const result = await query(
      `SELECT v.*, COUNT(t.id) AS times_count
       FROM vehicles v
       LEFT JOIN times t ON t.vehicle_id = v.id
       WHERE v.user_id = $1
       GROUP BY v.id
       ORDER BY v.created_at DESC`,
      [req.user.id]
    );
    return res.json({ vehicles: result.rows.map(publicVehicle) });
  } catch (err) {
    console.error('Error en listVehicles:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// ─────────────────────────────────────────────
// POST /api/v1/vehicles
// body: { name, make?, model?, year? }
// ─────────────────────────────────────────────
export async function createVehicle(req, res) {
  const { name, make, model, year } = req.body || {};

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: { message: 'name es obligatorio', status: 400 } });
  }
  if (year !== undefined && year !== null && (year < 1900 || year > 2100)) {
    return res.status(400).json({ error: { message: 'year inválido', status: 400 } });
  }

  try {
    const result = await query(
      `INSERT INTO vehicles (user_id, name, make, model, year)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.user.id, name.trim(), make ?? null, model ?? null, year ?? null]
    );
    return res.status(201).json({ vehicle: publicVehicle(result.rows[0]) });
  } catch (err) {
    console.error('Error en createVehicle:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// ─────────────────────────────────────────────
// PATCH /api/v1/vehicles/:id
// ─────────────────────────────────────────────
export async function updateVehicle(req, res) {
  const { id } = req.params;
  const { name, make, model, year } = req.body || {};

  const check = await assertOwner(id, req.user.id);
  if (check.error === 'notfound') return res.status(404).json({ error: { message: 'Vehículo no encontrado', status: 404 } });
  if (check.error === 'forbidden') return res.status(403).json({ error: { message: 'No tienes permiso', status: 403 } });

  try {
    const result = await query(
      `UPDATE vehicles SET
         name  = COALESCE($2, name),
         make  = COALESCE($3, make),
         model = COALESCE($4, model),
         year  = COALESCE($5, year)
       WHERE id = $1
       RETURNING *`,
      [id, name?.trim() ?? null, make ?? null, model ?? null, year ?? null]
    );
    return res.json({ vehicle: publicVehicle(result.rows[0]) });
  } catch (err) {
    console.error('Error en updateVehicle:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// ─────────────────────────────────────────────
// DELETE /api/v1/vehicles/:id
// ─────────────────────────────────────────────
export async function deleteVehicle(req, res) {
  const { id } = req.params;

  const check = await assertOwner(id, req.user.id);
  if (check.error === 'notfound') return res.status(404).json({ error: { message: 'Vehículo no encontrado', status: 404 } });
  if (check.error === 'forbidden') return res.status(403).json({ error: { message: 'No tienes permiso', status: 403 } });

  try {
    // Borrar la foto del storage si existe
    if (check.vehicle.photo_url) {
      const key = keyFromUrl(check.vehicle.photo_url);
      if (key) await storage.delete(key);
    }
    await query(`DELETE FROM vehicles WHERE id = $1`, [id]);
    return res.status(204).send();
  } catch (err) {
    console.error('Error en deleteVehicle:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// ─────────────────────────────────────────────
// POST /api/v1/vehicles/:id/photo  (multipart, campo "image")
// Foto del vehículo (16:9, 1200x675 webp).
// ─────────────────────────────────────────────
export async function uploadVehiclePhoto(req, res) {
  const { id } = req.params;

  if (!req.file) {
    return res.status(400).json({ error: { message: 'No se recibió ninguna imagen', status: 400 } });
  }

  const check = await assertOwner(id, req.user.id);
  if (check.error === 'notfound') return res.status(404).json({ error: { message: 'Vehículo no encontrado', status: 404 } });
  if (check.error === 'forbidden') return res.status(403).json({ error: { message: 'No tienes permiso', status: 403 } });

  try {
    const { url } = await processAndStore(req.file.buffer, {
      folder: 'vehicles',
      width: 1200,
      height: 675,
    });

    await query(`UPDATE vehicles SET photo_url = $2 WHERE id = $1`, [id, url]);

    // Borrar la anterior
    if (check.vehicle.photo_url) {
      const oldKey = keyFromUrl(check.vehicle.photo_url);
      if (oldKey) await storage.delete(oldKey);
    }

    return res.json({ photoUrl: url });
  } catch (err) {
    console.error('Error en uploadVehiclePhoto:', err);
    return res.status(500).json({ error: { message: 'Error procesando la imagen', status: 500 } });
  }
}

// ─────────────────────────────────────────────
// GET /api/v1/vehicles/:id/times
// Tiempos registrados con este vehículo (con nombre del tramo).
// ─────────────────────────────────────────────
export async function listVehicleTimes(req, res) {
  const { id } = req.params;

  const check = await assertOwner(id, req.user.id);
  if (check.error === 'notfound') return res.status(404).json({ error: { message: 'Vehículo no encontrado', status: 404 } });
  if (check.error === 'forbidden') return res.status(403).json({ error: { message: 'No tienes permiso', status: 403 } });

  try {
    const result = await query(
      `SELECT t.id, t.stage_id, t.duration_ms, t.max_speed, t.avg_speed,
              t.visibility, t.created_at, s.name AS stage_name
       FROM times t
       LEFT JOIN stages s ON s.id = t.stage_id
       WHERE t.vehicle_id = $1
       ORDER BY t.created_at DESC`,
      [id]
    );

    return res.json({
      times: result.rows.map(row => ({
        id:         row.id,
        stageId:    row.stage_id,
        stageName:  row.stage_name,
        durationMs: row.duration_ms,
        maxSpeed:   row.max_speed,
        avgSpeed:   row.avg_speed,
        visibility: row.visibility,
        createdAt:  row.created_at,
      })),
    });
  } catch (err) {
    console.error('Error en listVehicleTimes:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}
