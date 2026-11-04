import { Role } from '../constants/roles';
import { z } from 'zod';

export interface JwtPayload {
  userId: string;
  role: Role;
}

export const LoginRequestSchema = z.object({
  userId: z.string().min(1, 'User ID is required').max(20),
  password: z.string().min(1, 'Password is required').max(128),
});
export type LoginRequestBody = z.infer<typeof LoginRequestSchema>;

export const PASSWORD_RULE = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');

export const SignupRequestSchema = z.object({
  userId: z.string().regex(/^(US|DR|FR)\d{5}$/, 'User ID must be US, DR or FR followed by 5 digits'),
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name is too long'),
  password: PASSWORD_RULE,
  confirmPassword: z.string(),
  role: z.enum(['USER', 'DOCTOR', 'FIRST_RESPONDER']),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});
export type SignupRequestBody = z.infer<typeof SignupRequestSchema>;
