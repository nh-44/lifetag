// User role types
export type UserRole = 'user' | 'doctor' | 'first_responder';

// ID prefix types
export type IDPrefix = 'US' | 'DR' | 'FR';

// Base user interface
export interface BaseUser {
  user_id: string;
  name: string;
  password?: string;
  role: UserRole;
}

// User account interface
export interface UserAccount extends BaseUser {
  role: 'user';
  account_id: string;
  age: number;
  blood_group: string;
  allergies: string[];
  emergency_contacts: string[];
  dnr_status: boolean;
  primary_physician: string;
  insurance_id: string;
  doctor_only_info: {
    drinking_habits: string;
    smoking_habits: string;
    medications: string[];
    illnesses: string[];
    surgeries: string[];
    last_checkup: {
      weight: number;
      bmi: number;
      sugar: number;
      bp: string;
    };
  };
}

// Doctor account interface
export interface DoctorAccount extends BaseUser {
  role: 'doctor';
  contact_info: string;
  medical_license: string;
  qualifications: string[];
  hospital: string;
  specialty: string;
}

// First responder account interface
export interface FirstResponderAccount extends BaseUser {
  role: 'first_responder';
  contact_info: string;
  agency: string;
  agency_id: string;
  organization_type: 'government' | 'private' | 'government_funded';
  qualification: string;
}

// Union type of all account types
export type User = UserAccount | DoctorAccount | FirstResponderAccount;

// Auth response
export interface AuthResponse {
  user: User;
  token: string;
}

// Login request
export interface LoginRequest {
  user_id: string;
  password: string;
}

// Profile update response
export interface ProfileUpdateResponse {
  success: boolean;
  user: User;
}

// Type guard functions
export function isUserAccount(user: User): user is UserAccount {
  return user.role === 'user';
}

export function isDoctorAccount(user: User): user is DoctorAccount {
  return user.role === 'doctor';
}

export function isFirstResponderAccount(user: User): user is FirstResponderAccount {
  return user.role === 'first_responder';
}

// --- Zero-Trust NFC & FHIR Emergency Record Extensions ---

export interface NfcTagPayload {
  version: '1.0' | '2.0';
  tagId?: string;
  timestamp: string;
  fhirPatientId: string;
  triageData: {
    name: string;
    bloodGroup: string;
    allergies: string[];
    emergencyContacts: Array<{ name: string; phone: string; relation: string }>;
    dnrStatus: boolean;
    organDonor: boolean;
  };
  signature?: string; // Digital ECDSA signature for on-tag payload integrity
  encryptedMedicalPayload?: string; // AES-GCM encrypted block for verified doctors
}

export interface NfcScanHistoryEntry {
  id: string;
  timestamp: string;
  serialNumber?: string;
  dataRead: string | NfcTagPayload;
  verified: boolean;
  status: 'valid' | 'corrupted' | 'tampered';
}
