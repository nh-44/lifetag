import { fetchWithAuth, fetchWithoutAuth } from './api';

export interface EmergencyInfo {
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

export interface DoctorOnlyInfo {
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

export interface UserProfile extends EmergencyInfo {
  doctorOnlyInfo: DoctorOnlyInfo;
}

export interface DoctorProfile {
  userId: string;
  name: string;
  contactInfo: string;
  medicalLicenseNumber: string;
  qualifications: string[];
  hospitalClinic: string;
  specialty: string;
}

export interface FirstResponderProfile {
  userId: string;
  name: string;
  occupation: string;
  contactInfo: string;
  agency: string;
  agencyId: string;
  organizationType: 'Government' | 'Private' | 'Government Funded';
  qualification: string;
}

export const authenticateUser = async (userId: string, password: string): Promise<any> => {
  const response = await fetchWithoutAuth('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ userId, password }),
  });
  if (response.success) {
    return response.data;
  }
  throw new Error(response.error?.message || 'Login failed');
};

export const registerUser = async (userData: any): Promise<any> => {
  const response = await fetchWithoutAuth('/auth/signup', {
    method: 'POST',
    body: JSON.stringify(userData),
  });
  if (response.success) {
    return response.data;
  }
  throw new Error(response.error?.message || 'Registration failed');
};

export const checkUserIdAvailability = async (userId: string): Promise<boolean> => {
  try {
    const response = await fetchWithoutAuth(`/auth/check/${userId}`);
    return response.success && response.data?.available;
  } catch (error) {
    return false;
  }
};

export const getUserEmergencyInfo = async (accountId: string): Promise<EmergencyInfo | null> => {
  try {
    const response = await fetchWithAuth(`/patients/triage/${accountId}`);
    if (response.success) return response.data;
    return null;
  } catch (error) {
    console.error('Error fetching emergency info:', error);
    return null;
  }
};

export const getUserFullProfile = async (accountId: string): Promise<UserProfile | null> => {
  try {
    const response = await fetchWithAuth(`/patients/medical/${accountId}`);
    if (response.success) return response.data;
    return null;
  } catch (error) {
    console.error('Error fetching full profile:', error);
    return null;
  }
};

export const getUserProfileByUserId = async (userId: string): Promise<UserProfile | null> => {
  const response = await fetchWithAuth(`/patients/${userId}`);
  if (response.success) return response.data;
  return null;
};

export const getDoctorProfile = async (userId: string): Promise<DoctorProfile | null> => {
  const response = await fetchWithAuth(`/doctors/me`);
  if (response.success) return response.data;
  return null;
};

export const getFirstResponderProfile = async (userId: string): Promise<FirstResponderProfile | null> => {
  const response = await fetchWithAuth(`/first-responders/me`);
  if (response.success) return response.data;
  return null;
};

export const saveUserProfile = async (profile: UserProfile): Promise<UserProfile> => {
  const response = await fetchWithAuth(`/patients/me`, {
    method: 'PUT',
    body: JSON.stringify(profile),
  });
  if (response.success) return response.data;
  throw new Error(response.error?.message || 'Failed to update profile');
};

export const saveDoctorProfile = async (profile: DoctorProfile): Promise<DoctorProfile> => {
  const response = await fetchWithAuth(`/doctors/me`, {
    method: 'PUT',
    body: JSON.stringify(profile),
  });
  if (response.success) return response.data;
  throw new Error(response.error?.message || 'Failed to update profile');
};

export const saveFirstResponderProfile = async (profile: FirstResponderProfile): Promise<FirstResponderProfile> => {
  const response = await fetchWithAuth(`/first-responders/me`, {
    method: 'PUT',
    body: JSON.stringify(profile),
  });
  if (response.success) return response.data;
  throw new Error(response.error?.message || 'Failed to update profile');
};

export const logScan = async (patientAccount: string, deviceMeta?: string): Promise<any> => {
  const response = await fetchWithAuth(`/scans`, {
    method: 'POST',
    body: JSON.stringify({ patientAccount, deviceMeta }),
  });
  if (response.success) return response.data;
  throw new Error(response.error?.message || 'Failed to log scan');
};

export const getScanHistory = async (): Promise<any[]> => {
  const response = await fetchWithAuth(`/scans/history`);
  if (response.success) return response.data;
  return [];
};

export const getUserProfileByRole = async (userId: string, role: string) => {
  switch (role) {
    case 'USER':
      return getUserProfileByUserId(userId);
    case 'DOCTOR':
      return getDoctorProfile(userId);
    case 'FIRST_RESPONDER':
      return getFirstResponderProfile(userId);
    default:
      return null;
  }
};

export const getEmergencyInfo = getUserEmergencyInfo;
export const getDoctorInfo = getUserFullProfile;

