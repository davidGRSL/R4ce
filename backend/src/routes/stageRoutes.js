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
  listNearbyStages,
  addLike,
  removeLike,
} from '../controllers/stageController.js';
import { requireAuth, optionalAuth, requireVerifiedForPublic } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = Router();

// Listados específicos ANTES de /:id para que no los capture
router.get('/',                  optionalAuth, listPublicStages);
router.post('/',                 requireAuth,  createStage);
router.get('/my/stages',         requireAuth,  listMyStages);
router.get('/favorites/list',    requireAuth,  listFavorites);
router.get('/near',              optionalAuth, listNearbyStages);

// Operaciones sobre un tramo concreto
router.get('/:id',               optionalAuth, getStage);
router.put('/:id',               requireAuth,  updateStage);
router.delete('/:id',            requireAuth,  deleteStage);
// (con REQUIRE_EMAIL_VERIFICATION=true, publicar exige email verificado)
router.post('/:id/publish',      requireAuth,  requireVerifiedForPublic, togglePublish);
router.post('/:id/groups',       requireAuth,  assignStageGroups);
router.post('/:id/favorite',     requireAuth,  addFavorite);
router.delete('/:id/favorite',   requireAuth,  removeFavorite);
router.post('/:id/like',         requireAuth,  rateLimit({ prefix: 'like', windowSec: 60, max: 30 }), addLike);
router.delete('/:id/like',       requireAuth,  rateLimit({ prefix: 'like', windowSec: 60, max: 30 }), removeLike);
router.get('/:id/detail', optionalAuth, getStageDetail);

export default router;
