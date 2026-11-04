import { userRepository } from '../repositories/userRepository';
import { doctorRepository } from '../repositories/doctorRepository';
import { EmergencyInfoDTO, FullUserProfileDTO } from '../types/patient.types';
import { User, TriageProfile, MedicalHistory } from '@prisma/client';

type UserWithRelations = User & {
  triageProfile: TriageProfile | null;
  medicalHistory: MedicalHistory | null;
};

interface LastCheckup {
  weight: number;
  bmi: number;
  sugar: number;
  bp: string;
}

const mapToEmergencyInfo = (user: UserWithRelations): EmergencyInfoDTO => {
  return {
    userId: user.userId,
    accountId: user.accountId,
    name: user.name,
    age: user.triageProfile?.age || 0,
    bloodGroup: user.triageProfile?.bloodGroup || '',
    allergies: user.triageProfile?.allergies || [],
    emergencyContacts: (user.triageProfile?.emergencyContacts as unknown as { userId: string; name: string }[]) || [],
    dnrStatus: user.triageProfile?.dnrStatus || false,
    primaryPhysician: user.triageProfile?.primaryPhysician ? { userId: user.triageProfile.primaryPhysician, name: 'Dr.' } : { userId: '', name: '' },
    insuranceId: user.triageProfile?.insuranceId || '',
    authoritySignature: user.triageProfile?.authoritySignature || undefined,
    tagIssuedAt: user.triageProfile?.tagIssuedAt?.toISOString(),
    tagIssuedBy: user.triageProfile?.tagIssuedBy || undefined,
    tagRevokedAt: user.triageProfile?.tagRevokedAt?.toISOString(),
  };
};

const mapToFullProfile = (user: UserWithRelations): FullUserProfileDTO => {
  return {
    ...mapToEmergencyInfo(user),
    doctorOnlyInfo: {
      drinkingHabits: user.medicalHistory?.drinkingHabits || '',
      smokingHabits: user.medicalHistory?.smokingHabits || '',
      medications: user.medicalHistory?.medications || [],
      illnesses: user.medicalHistory?.illnesses || [],
      surgeries: user.medicalHistory?.surgeries || [],
      lastCheckup: (user.medicalHistory?.lastCheckup as unknown as LastCheckup) || { weight: 0, bmi: 0, sugar: 0, bp: '' },
    }
  };
};

export const patientService = {
  getEmergencyInfo: async (accountId: string): Promise<EmergencyInfoDTO> => {
    const user = await userRepository.findByAccountId(accountId);
    if (!user) throw { statusCode: 404, message: 'Patient not found' };
    return mapToEmergencyInfo(user as UserWithRelations);
  },

  getFullProfile: async (accountId: string): Promise<FullUserProfileDTO> => {
    const user = await userRepository.findByAccountId(accountId);
    if (!user) throw { statusCode: 404, message: 'Patient not found' };
    return mapToFullProfile(user as UserWithRelations);
  },

  getProfileByUserId: async (userId: string): Promise<FullUserProfileDTO> => {
    const user = await userRepository.findByUserId(userId);
    if (!user) throw { statusCode: 404, message: 'Patient not found' };
    return mapToFullProfile(user as UserWithRelations);
  },

  updateProfile: async (userId: string, data: FullUserProfileDTO) => {
    // Naming a primary physician grants that doctor standing access to the full record,
    // so it must be a real, verified doctor account, not an arbitrary string.
    const physicianId = data.primaryPhysician?.userId?.trim();
    if (physicianId) {
      const doctor = await doctorRepository.findByUserId(physicianId);
      if (!doctor || !doctor.verified) {
        throw { statusCode: 400, message: 'Primary physician must be a verified doctor account (DR followed by 5 digits)' };
      }
    }

    const triageData = {
      age: data.age,
      bloodGroup: data.bloodGroup,
      allergies: data.allergies,
      emergencyContacts: data.emergencyContacts,
      dnrStatus: data.dnrStatus,
      insuranceId: data.insuranceId,
      primaryPhysician: data.primaryPhysician?.userId || null,
      // authoritySignature is deliberately not writable here: only the issuance
      // service may set it, after a DOCTOR certifies a specific key (see issuance.service.ts).
    };

    const medicalData = {
      drinkingHabits: data.doctorOnlyInfo?.drinkingHabits,
      smokingHabits: data.doctorOnlyInfo?.smokingHabits,
      medications: data.doctorOnlyInfo?.medications,
      illnesses: data.doctorOnlyInfo?.illnesses,
      surgeries: data.doctorOnlyInfo?.surgeries,
      lastCheckup: data.doctorOnlyInfo?.lastCheckup,
    };

    await userRepository.updateTriageProfile(userId, triageData);
    if (data.doctorOnlyInfo) {
      await userRepository.updateMedicalHistory(userId, medicalData);
    }

    const updated = await userRepository.findByUserId(userId);
    if (!updated) throw { statusCode: 404, message: 'Patient not found after update' };
    return mapToFullProfile(updated as UserWithRelations);
  },

  deleteAccount: async (userId: string) => {
    await userRepository.deleteByUserId(userId);
    return { success: true };
  }
};
