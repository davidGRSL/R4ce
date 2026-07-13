import { Router } from 'express';
import { createReport } from '../controllers/reportController.js';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = Router();

router.use(requireAuth);

// Rate limit: evitar spam de denuncias
router.post('/', rateLimit({ prefix: 'report', windowSec: 3600, max: 10 }), createReport);

export default router;
