import { Router } from 'express';
import { listReports, resolveReport, listUsers, setUserRole } from '../controllers/adminController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

// Todo el panel requiere rol admin (leído de BD en cada petición)
router.use(requireAuth, requireRole('admin'));

// Cola de denuncias
router.get('/reports',              listReports);
router.post('/reports/:id/resolve', resolveReport);

// Gestión de usuarios y roles (aquí se asigna premium)
router.get('/users',                listUsers);
router.patch('/users/:id/role',     setUserRole);

export default router;
