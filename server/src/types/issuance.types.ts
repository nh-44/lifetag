import { z } from 'zod';

export const CertifyTagRequestSchema = z.object({
  accountId: z.string().regex(/^\d{5}$/, 'Account ID must be exactly 5 digits'),
  publicKey: z.object({
    x: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'x must be a base64url P-256 coordinate'),
    y: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'y must be a base64url P-256 coordinate'),
  }),
  issuedAt: z.number().int().positive(), // unix seconds; must equal the value the tag will carry
});

export type CertifyTagRequestBody = z.infer<typeof CertifyTagRequestSchema>;
