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
}
