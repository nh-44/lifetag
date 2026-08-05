import { userRepository } from '../repositories/userRepository';
import { EmergencyInfoDTO, FullUserProfileDTO } from '../types/patient.types';
import { User, TriageProfile, MedicalHistory } from '@prisma/client';
import { CryptoUtils } from '../utils/crypto.utils';

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
    const triageData = {
      age: data.age,
      bloodGroup: data.bloodGroup,
      allergies: data.allergies,
      emergencyContacts: data.emergencyContacts,
      dnrStatus: data.dnrStatus,
      insuranceId: data.insuranceId,
      primaryPhysician: data.primaryPhysician?.userId || null,
      authoritySignature: data.authoritySignature || CryptoUtils.simulateAuthoritySignature(userId),
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
