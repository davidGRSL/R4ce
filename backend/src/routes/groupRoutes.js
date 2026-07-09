import { Router } from 'express';
import {
  createGroup,
  listMyGroups,
  getGroup,
  updateGroup,
  deleteGroup,
  joinGroup,
  leaveGroup,
  kickMember,
  listMembers,
  updateMemberRole,
  regenerateInviteCode,
  listGroupStages,
  listGroupTimes,
} from '../controllers/groupController.js';
import {
  listMessages,
  sendMessage,
  sendMediaMessage,
  deleteMessage,
} from '../controllers/messageController.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadChatMediaSingle } from '../middleware/upload.js';

const router = Router();

// Errores de multer (tamaño, formato) → 400 legible en vez de 500
function chatMediaUpload(req, res, next) {
  uploadChatMediaSingle(req, res, (err) => {
    if (err) return res.status(400).json({ error: { message: err.message, status: 400 } });
    next();
  });
}

// Todas las rutas de grupos requieren auth
router.use(requireAuth);

// CRUD grupos
router.post('/',                                    createGroup);
router.get('/my',                                   listMyGroups);
router.get('/:id',                                  getGroup);
router.put('/:id',                                  updateGroup);
router.delete('/:id',                               deleteGroup);

// Unirse / salir
router.post('/join',                                joinGroup);
router.post('/:id/leave',                           leaveGroup);

// Miembros
router.get('/:id/members',                          listMembers);
router.delete('/:id/members/:userId',               kickMember);
router.patch('/:id/members/:userId/role',           updateMemberRole);

// Invite code
router.post('/:id/invite/regenerate',               regenerateInviteCode);

// Contenido del grupo
router.get('/:id/stages',                           listGroupStages);
router.get('/:id/times',                            listGroupTimes);

// Chat
router.get('/:id/messages',                         listMessages);
router.post('/:id/messages',                        sendMessage);
router.post('/:id/messages/media',                  chatMediaUpload, sendMediaMessage);
router.delete('/:id/messages/:messageId',           deleteMessage);

export default router;