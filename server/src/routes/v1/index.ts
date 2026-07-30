import { Router } from 'express';
import authRoutes from './auth.routes';
import patientRoutes from './patient.routes';
import doctorRoutes from './doctor.routes';
import firstResponderRoutes from './firstResponder.routes';
import scanRoutes from './scan.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/patients', patientRoutes);

router.use('/doctors', doctorRoutes);
router.use('/first-responders', firstResponderRoutes);
router.use('/scans', scanRoutes);

export default router;
