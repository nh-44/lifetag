import { Router } from 'express';
import { issuanceController } from '../../controllers/issuance.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requireRole, requireVerifiedClinician } from '../../middlewares/rbac.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { CertifyTagRequestSchema } from '../../types/issuance.types';
import { Role } from '../../constants/roles';

const router = Router();

router.use(authMiddleware);

// Tag issuance is a per-clinician, audited action (replaces the client-side shared admin password).
router.post('/certify', requireRole(Role.DOCTOR), requireVerifiedClinician, validate(CertifyTagRequestSchema), issuanceController.certifyTag);

// A patient can revoke their own lost/stolen tag at any time.
router.post('/revoke', requireRole(Role.USER), issuanceController.revokeOwnTag);

export default router;
