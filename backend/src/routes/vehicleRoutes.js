import { Router } from 'express';
import {
  listVehicles,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  uploadVehiclePhoto,
  listVehicleTimes,
} from '../controllers/vehicleController.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadSingle } from '../middleware/upload.js';

const router = Router();

router.use(requireAuth);

router.get('/',              listVehicles);
router.post('/',             createVehicle);
router.patch('/:id',         updateVehicle);
router.delete('/:id',        deleteVehicle);
router.post('/:id/photo',    uploadSingle, uploadVehiclePhoto);
router.get('/:id/times',     listVehicleTimes);

export default router;
