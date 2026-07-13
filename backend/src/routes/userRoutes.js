import { Router } from 'express';
import { blockUser, unblockUser, listBlocked } from '../controllers/blockController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

// Bloqueo entre usuarios
router.get('/blocked',      listBlocked);
router.post('/:id/block',   blockUser);
router.delete('/:id/block', unblockUser);

export default router;
