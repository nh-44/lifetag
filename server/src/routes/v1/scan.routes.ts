import { Router } from 'express';
import { scanController } from '../../controllers/scan.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/rbac.middleware';
import { Role } from '../../constants/roles';

const router = Router();

router.use(authMiddleware);
router.use(requireRole(Role.FIRST_RESPONDER, Role.DOCTOR));

router.post('/', scanController.logScan);
router.get('/history', scanController.getScanHistory);
router.get('/export', scanController.exportScanHistory);

export default router;
