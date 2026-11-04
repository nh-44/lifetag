export interface EmergencyInfoDTO {
  userId: string;
  accountId: string;
  name: string;
  age: number;
  bloodGroup: string;
  allergies: string[];
  emergencyContacts: { userId: string; name: string }[];
  dnrStatus: boolean;
  primaryPhysician: { userId: string; name: string };
  insuranceId: string;
  authoritySignature?: string;
  tagIssuedAt?: string;  // issuedAt of the only currently valid tag
  tagIssuedBy?: string;  // Doctor who certified it
  tagRevokedAt?: string; // Set if the patient reported the tag lost
}

export interface DoctorOnlyInfoDTO {
  drinkingHabits: string;
  smokingHabits: string;
  medications: string[];
  illnesses: string[];
  surgeries: string[];
  lastCheckup: {
    weight: number;
    bmi: number;
    sugar: number;
    bp: string;
  };
}

export interface FullUserProfileDTO extends EmergencyInfoDTO {
  doctorOnlyInfo: DoctorOnlyInfoDTO;
}

import { z } from 'zod';

export const EmergencyInfoSchema = z.object({
  userId: z.string().optional(),
  accountId: z.string().optional(),
  name: z.string().optional(),
  age: z.number().int().min(0).max(150),
  bloodGroup: z.string().min(1),
  allergies: z.array(z.string()),
  emergencyContacts: z.array(z.object({
    userId: z.string(),
    name: z.string()
  })),
  dnrStatus: z.boolean(),
  primaryPhysician: z.object({
    userId: z.string(),
    name: z.string()
  }).optional(),
  insuranceId: z.string(),
  authoritySignature: z.string().optional()
});

export const DoctorOnlyInfoSchema = z.object({
  drinkingHabits: z.string().optional(),
  smokingHabits: z.string().optional(),
  medications: z.array(z.string()),
  illnesses: z.array(z.string()),
  surgeries: z.array(z.string()),
  lastCheckup: z.object({
    weight: z.number(),
    bmi: z.number(),
    sugar: z.number(),
    bp: z.string()
  }).optional()
});

export const FullUserProfileSchema = EmergencyInfoSchema.extend({
  doctorOnlyInfo: DoctorOnlyInfoSchema.optional()
});

export interface DoctorProfileDTO {
  userId: string;
  name: string;
  contactInfo: string;
  medicalLicenseNumber: string;
  qualifications: string[];
  hospitalClinic: string;
  specialty: string;
  verified?: boolean;
}

export interface FirstResponderProfileDTO {
  userId: string;
  name: string;
  occupation: string;
  contactInfo: string;
  agency: string;
  agencyId: string;
  organizationType: 'Government' | 'Private' | 'Government Funded';
  qualification: string;
  verified?: boolean;
}

// Explicit whitelists for clinician self-service updates. validate() strips every other
// key (password, userId, verified, ...) before the body reaches Prisma.
export const DoctorProfileUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  contactInfo: z.string().max(100),
  medicalLicenseNumber: z.string().trim().min(1).max(50),
  qualifications: z.array(z.string().max(200)).max(20),
  hospitalClinic: z.string().max(200),
  specialty: z.string().max(100),
});

export const FirstResponderProfileUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  occupation: z.string().max(100),
  contactInfo: z.string().max(100),
  agency: z.string().max(200),
  agencyId: z.string().max(100),
  organizationType: z.enum(['Government', 'Private', 'Government Funded']),
  qualification: z.string().max(200),
});
