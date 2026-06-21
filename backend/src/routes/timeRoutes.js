import { Router } from 'express';
import {
  recordTime,
  listMyTimes,
  getTime,
  listStageTimes,
  getStageRanking,
  updateTimeVisibility,
  deleteTime,
} from '../controllers/timeController.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';

const router = Router();

// Mis tiempos
router.get('/my',                       requireAuth,   listMyTimes);

// Tiempos y ranking de un tramo (públicos)
router.get('/stage/:stageId',           optionalAuth,  listStageTimes);
router.get('/stage/:stageId/ranking',   optionalAuth,  getStageRanking);

// Ver un tiempo concreto
router.get('/:id',                      optionalAuth,  getTime);

// Registrar tiempo al terminar la carrera
router.post('/',                        requireAuth,   recordTime);

// Cambiar visibilidad de un tiempo ya registrado
router.patch('/:id/visibility',         requireAuth,   updateTimeVisibility);

// Borrar tiempo
router.delete('/:id',                   requireAuth,   deleteTime);

export default router;
