import { Router } from 'express';
import { register, login, refresh, logout, me } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = Router();

// Rate limiting anti fuerza bruta (por IP; fail-open si Redis no está)
router.post('/register', rateLimit({ prefix: 'register', windowSec: 3600, max: 5 }), register);
router.post('/login',    rateLimit({ prefix: 'login',    windowSec: 300,  max: 10 }), login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/me', requireAuth, me);

export default router;
