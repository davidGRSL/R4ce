import { Router } from 'express';
import {
  getProfile,
  updateProfile,
  uploadAvatar,
  deleteAvatar,
  acceptSafety,
  deleteAccount,
  registerPushToken,
  removePushToken,
} from '../controllers/profileController.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadSingle } from '../middleware/upload.js';

const router = Router();

router.use(requireAuth);

router.get('/',              getProfile);
router.patch('/',            updateProfile);
router.post('/avatar',       uploadSingle, uploadAvatar);
router.delete('/avatar',     deleteAvatar);
router.post('/accept-safety', acceptSafety);
router.post('/push-token',   registerPushToken);   // app nativa (FCM/APNs)
router.delete('/push-token', removePushToken);
router.delete('/',           deleteAccount); // borrado de cuenta (requiere password en body)

export default router;
