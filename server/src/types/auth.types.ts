import { Role } from '../constants/roles';
import { z } from 'zod';

export interface JwtPayload {
  userId: string;
  role: Role;
}

export const LoginRequestSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  password: z.string().min(1, 'Password is required'),
});
export type LoginRequestBody = z.infer<typeof LoginRequestSchema>;

export const SignupRequestSchema = z.object({
  userId: z.string().length(7, 'User ID must be 7 characters'),
  name: z.string().min(1, 'Name is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string().min(6, 'Confirm Password must be at least 6 characters'),
  role: z.enum(['USER', 'DOCTOR', 'FIRST_RESPONDER']),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});
export type SignupRequestBody = z.infer<typeof SignupRequestSchema>;
