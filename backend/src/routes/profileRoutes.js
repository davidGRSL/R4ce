import { Router } from 'express';
import {
  getProfile,
  updateProfile,
  uploadAvatar,
  deleteAvatar,
} from '../controllers/profileController.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadSingle } from '../middleware/upload.js';

const router = Router();

router.use(requireAuth);

router.get('/',            getProfile);
router.patch('/',          updateProfile);
router.post('/avatar',     uploadSingle, uploadAvatar);
router.delete('/avatar',   deleteAvatar);

export default router;
