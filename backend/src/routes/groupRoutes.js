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
import { requireAuth } from '../middleware/auth.js';

const router = Router();

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

export default router;