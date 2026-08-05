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
