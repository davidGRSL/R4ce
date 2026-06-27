import { Router } from 'express';
import {
  createStage,
  listPublicStages,
  listMyStages,
  getStage,
  updateStage,
  deleteStage,
  togglePublish,
  assignStageGroups,
  addFavorite,
  removeFavorite,
  listFavorites,
  getStageDetail,
} from '../controllers/stageController.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';

const router = Router();

// Listados específicos ANTES de /:id para que no los capture
router.get('/',                  optionalAuth, listPublicStages);
router.post('/',                 requireAuth,  createStage);
router.get('/my/stages',         requireAuth,  listMyStages);
router.get('/favorites/list',    requireAuth,  listFavorites);

// Operaciones sobre un tramo concreto
router.get('/:id',               optionalAuth, getStage);
router.put('/:id',               requireAuth,  updateStage);
router.delete('/:id',            requireAuth,  deleteStage);
router.post('/:id/publish',      requireAuth,  togglePublish);
router.post('/:id/groups',       requireAuth,  assignStageGroups);
router.post('/:id/favorite',     requireAuth,  addFavorite);
router.delete('/:id/favorite',   requireAuth,  removeFavorite);
router.get('/:id/detail', optionalAuth, getStageDetail);

export default router;
