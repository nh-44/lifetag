import { z } from 'zod';

export const LogScanRequestSchema = z.object({
  patientAccount: z.string().min(1, 'Patient account is required'),
  deviceMeta: z.string().optional(),
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
