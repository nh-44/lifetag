import { z } from 'zod';

export const LogScanRequestSchema = z.object({
  patientAccount: z.string().regex(/^\d{5}$/, 'Patient account must be exactly 5 digits'),
  deviceMeta: z.string().max(300).optional(),
  tagPayload: z.object({
    version: z.string(),
    tagId: z.string(),
    timestamp: z.string(),
    fhirPatientId: z.string(),
    triageData: z.object({
      name: z.string(),
      bloodGroup: z.string(),
      allergies: z.array(z.string()),
      emergencyContacts: z.array(z.object({
        userId: z.string(),
        name: z.string()
      })),
      dnrStatus: z.boolean(),
    }),
    signature: z.string(),
    authoritySignature: z.string().optional(),
  }, { required_error: 'Cryptographic proof of physical NFC tag proximity is required.' })
});

export type LogScanRequestBody = z.infer<typeof LogScanRequestSchema>;
