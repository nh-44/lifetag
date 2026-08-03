import { Router } from 'express';
import { patientController } from '../../controllers/patient.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/rbac.middleware';
import { requireMedicalConsent } from '../../middlewares/consent.middleware';
import { Role } from '../../constants/roles';

const router = Router();

// Protected by Auth
router.use(authMiddleware);

// Triage info - available to First Responders and Doctors
router.get('/triage/:accountId', requireRole(Role.FIRST_RESPONDER, Role.DOCTOR), patientController.getEmergencyInfo);

// Full Medical Info - available only to Doctors
router.get('/medical/:accountId', requireRole(Role.DOCTOR), requireMedicalConsent, patientController.getFullMedicalInfo);

// Patient self-management - available only to Users
router.get('/me', requireRole(Role.USER), patientController.getMyProfile);
router.put('/me', requireRole(Role.USER), patientController.updateProfile);
router.delete('/me', requireRole(Role.USER), patientController.deleteAccount);

// Explicit route for user fetching their own profile by ID (matches frontend service call)
router.get('/:userId', requireRole(Role.USER), patientController.getProfileByUserId);

export default router;
