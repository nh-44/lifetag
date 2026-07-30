import { Router } from 'express';
import { doctorController } from '../../controllers/doctor.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/rbac.middleware';
import { Role } from '../../constants/roles';

const router = Router();

router.use(authMiddleware);
router.use(requireRole(Role.DOCTOR));

router.get('/me', doctorController.getMyProfile);
router.put('/me', doctorController.updateProfile);

export default router;
