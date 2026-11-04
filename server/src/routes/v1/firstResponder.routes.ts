import { Router } from 'express';
import { firstResponderController } from '../../controllers/firstResponder.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/rbac.middleware';
import { Role } from '../../constants/roles';
import { validate } from '../../middlewares/validate.middleware';
import { FirstResponderProfileUpdateSchema } from '../../types/patient.types';

const router = Router();

router.use(authMiddleware);
router.use(requireRole(Role.FIRST_RESPONDER));

router.get('/me', firstResponderController.getMyProfile);
router.put('/me', validate(FirstResponderProfileUpdateSchema), firstResponderController.updateProfile);

export default router;
