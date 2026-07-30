import { Router } from 'express';
import { authController } from '../../controllers/auth.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { LoginRequestSchema, SignupRequestSchema } from '../../types/auth.types';

const router = Router();

router.post('/login', validate(LoginRequestSchema), authController.login);
router.post('/signup', validate(SignupRequestSchema), authController.signup);
router.get('/check/:userId', authController.checkAvailability);
router.get('/me', authMiddleware, authController.me);

export default router;
