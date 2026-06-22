import { Router } from 'express';
import {
  createStage,
  listPublicStages,
  listMyStages,
  getStage,
  updateStage,
  deleteStage,
  togglePublish,
} from '../controllers/stageController.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { assignStageGroups } from '../controllers/stageController.js';

const router = Router();

// Rutas públicas (con auth opcional para ver tramos privados propios)
router.get('/',     optionalAuth, listPublicStages);
router.get('/:id',  optionalAuth, getStage);

// Rutas protegidas
router.post('/',              requireAuth, createStage);
router.get('/my/stages',      requireAuth, listMyStages);
router.put('/:id',            requireAuth, updateStage);
router.delete('/:id',         requireAuth, deleteStage);
router.post('/:id/publish',   requireAuth, togglePublish);
router.post('/:id/groups', requireAuth, assignStageGroups);

export default router;
