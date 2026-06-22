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
} from '../controllers/stageController.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';

const router = Router();

router.get('/',             optionalAuth, listPublicStages);
router.post('/',            requireAuth,  createStage);
router.get('/my/stages',    requireAuth,  listMyStages);
router.get('/:id',          optionalAuth, getStage);
router.put('/:id',          requireAuth,  updateStage);
router.delete('/:id',       requireAuth,  deleteStage);
router.post('/:id/publish', requireAuth,  togglePublish);
router.post('/:id/groups',  requireAuth,  assignStageGroups);

export default router;