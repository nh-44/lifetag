import { Router } from 'express';
import { authController } from '../../controllers/auth.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { LoginRequestSchema, SignupRequestSchema } from '../../types/auth.types';

import { authLimiter } from '../../middlewares/rateLimit.middleware';

const router = Router();

router.post('/login', authLimiter, validate(LoginRequestSchema), authController.login);
router.post('/signup', authLimiter, validate(SignupRequestSchema), authController.signup);
router.get('/check/:userId', authController.checkAvailability);
router.get('/me', authMiddleware, authController.me);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);

export default router;
