import { Router } from 'express';
import { listNotifications, markRead, broadcast } from '../controllers/notificationController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.get('/',           listNotifications);
router.post('/read',      markRead);
router.post('/broadcast', broadcast); // solo ADMIN_USERNAMES

export default router;
