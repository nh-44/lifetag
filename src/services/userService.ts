
import { User, UserRole } from '@/contexts/AuthContext';
import { getDatabase, COLLECTIONS } from './dbService';

// Types for our data models
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

// Mock data for when we're in the browser environment
const mockUserProfiles: Record<string, UserProfile> = {
  'US12345': {
    userId: 'US12345',
    accountId: '12345',
    name: 'John Doe',
    age: 30,
    bloodGroup: 'O+',
    allergies: ['Peanuts', 'Dust'],
    emergencyContacts: [
      { userId: 'US54321', name: 'Jane Doe' },
      { userId: 'US67890', name: 'Mike Smith' }
    ],
    dnrStatus: false,
    primaryPhysician: { userId: 'DR98765', name: 'Dr. Sarah Johnson' },
    insuranceId: 'INS45678',
    doctorOnlyInfo: {
      drinkingHabits: 'Occasional',
      smokingHabits: 'No',
      medications: ['Aspirin', 'Lisinopril'],
      illnesses: ['Diabetes Type 2', 'Hypertension'],
      surgeries: ['Appendectomy (2015)'],
      lastCheckup: {
        weight: 70,
        bmi: 22,
        sugar: 110,
        bp: '120/80'
      }
    }
  },
  'US67890': {
    userId: 'US67890',
    accountId: '67890',
    name: 'Mike Smith',
    age: 45,
    bloodGroup: 'AB-',
    allergies: ['Penicillin'],
    emergencyContacts: [
      { userId: 'US12345', name: 'John Doe' }
    ],
    dnrStatus: false,
    primaryPhysician: { userId: 'DR98765', name: 'Dr. Sarah Johnson' },
    insuranceId: 'INS87654',
    doctorOnlyInfo: {
      drinkingHabits: 'Rarely',
      smokingHabits: 'Former smoker',
      medications: ['Metformin', 'Atorvastatin'],
      illnesses: ['High Cholesterol'],
      surgeries: ['Knee Replacement (2018)'],
      lastCheckup: {
        weight: 82,
        bmi: 24.5,
        sugar: 105,
        bp: '135/85'
      }
    }
  }
};

const mockDoctorProfiles: Record<string, DoctorProfile> = {
  'DR98765': {
    userId: 'DR98765',
    name: 'Dr. Sarah Johnson',
    contactInfo: '+1-555-123-4567',
    medicalLicenseNumber: 'MDL-987654321',
    qualifications: ['MD, Cardiology', 'FACC'],
    hospitalClinic: 'City General Hospital',
    specialty: 'Cardiology'
  }
};

const mockFirstResponderProfiles: Record<string, FirstResponderProfile> = {
  'FR54321': {
    userId: 'FR54321',
    name: 'Alex Thompson',
    occupation: 'Paramedic',
    contactInfo: '+1-555-987-6543',
    agency: 'City Emergency Services',
    agencyId: 'EMS-12345',
    organizationType: 'Government',
    qualification: 'Licensed Paramedic, EMT-P'
  }
};

// Helper function to convert documents
function convertDocument<T>(doc: any): T | null {
  if (!doc) return null;
  // Remove MongoDB's _id field if it exists
  const { _id, ...rest } = doc || {};
  return rest as unknown as T;
}

// API service functions
export const getUserEmergencyInfo = async (accountId: string): Promise<EmergencyInfo | null> => {
  try {
    const db = await getDatabase();
    const usersCollection = db.collection(COLLECTIONS.USERS);
    
    // Find user by accountId - always returns null in our mock
    const userDoc = await usersCollection.findOne({ accountId });
    const user = convertDocument<UserProfile>(userDoc);
    
    if (!user) {
      console.log('User not found, using mock data');
      // Fall back to mock data
      const mockUser = Object.values(mockUserProfiles).find(u => u.accountId === accountId);
      if (!mockUser) return null;
      
      // Return everything except doctorOnlyInfo
      const { doctorOnlyInfo, ...emergencyInfo } = mockUser;
      return emergencyInfo;
    }
    
    // Remove doctorOnlyInfo from the result
    const { doctorOnlyInfo, ...emergencyInfo } = user;
    return emergencyInfo;
  } catch (error) {
    console.error('Error fetching emergency info:', error);
    // Fall back to mock data in case of error
    const mockUser = Object.values(mockUserProfiles).find(u => u.accountId === accountId);
    if (!mockUser) return null;
    
    const { doctorOnlyInfo, ...emergencyInfo } = mockUser;
    return emergencyInfo;
  }
};

export const getUserFullProfile = async (accountId: string): Promise<UserProfile | null> => {
  try {
    const db = await getDatabase();
    const usersCollection = db.collection(COLLECTIONS.USERS);
    
    // Find user by accountId
    const userDoc = await usersCollection.findOne({ accountId });
    const user = convertDocument<UserProfile>(userDoc);
    
    if (!user) {
      console.log('User not found in MongoDB, using mock data');
      return mockUserProfiles[`US${accountId}`] || null;
    }
    
    return user;
  } catch (error) {
    console.error('Error fetching user profile:', error);
    // Fall back to mock data in case of error
    return mockUserProfiles[`US${accountId}`] || null;
  }
};

export const getUserProfileByUserId = async (userId: string): Promise<UserProfile | null> => {
  try {
    const db = await getDatabase();
    const usersCollection = db.collection(COLLECTIONS.USERS);
    
    // Find user by userId
    const userDoc = await usersCollection.findOne({ userId });
    const user = convertDocument<UserProfile>(userDoc);
    
    if (!user) {
      console.log('User not found in MongoDB, using mock data');
      return mockUserProfiles[userId] || null;
    }
    
    return user;
  } catch (error) {
    console.error('Error fetching user profile by userId:', error);
    // Fall back to mock data in case of error
    return mockUserProfiles[userId] || null;
  }
};

export const getDoctorProfile = async (userId: string): Promise<DoctorProfile | null> => {
  try {
    const db = await getDatabase();
    const doctorsCollection = db.collection(COLLECTIONS.DOCTORS);
    
    // Find doctor by userId
    const doctorDoc = await doctorsCollection.findOne({ userId });
    const doctor = convertDocument<DoctorProfile>(doctorDoc);
    
    if (!doctor) {
      console.log('Doctor not found in MongoDB, using mock data');
      return mockDoctorProfiles[userId] || null;
    }
    
    return doctor;
  } catch (error) {
    console.error('Error fetching doctor profile:', error);
    // Fall back to mock data in case of error
    return mockDoctorProfiles[userId] || null;
  }
};

export const getFirstResponderProfile = async (userId: string): Promise<FirstResponderProfile | null> => {
  try {
    const db = await getDatabase();
    const firstRespondersCollection = db.collection(COLLECTIONS.FIRST_RESPONDERS);
    
    // Find first responder by userId
    const firstResponderDoc = await firstRespondersCollection.findOne({ userId });
    const firstResponder = convertDocument<FirstResponderProfile>(firstResponderDoc);
    
    if (!firstResponder) {
      console.log('First responder not found in MongoDB, using mock data');
      return mockFirstResponderProfiles[userId] || null;
    }
    
    return firstResponder;
  } catch (error) {
    console.error('Error fetching first responder profile:', error);
    // Fall back to mock data in case of error
    return mockFirstResponderProfiles[userId] || null;
  }
};

export const saveUserProfile = async (profile: UserProfile): Promise<UserProfile> => {
  try {
    const db = await getDatabase();
    const usersCollection = db.collection(COLLECTIONS.USERS);
    
    // Attempt to save - will use mock in browser environment
    const result = await usersCollection.updateOne(
      { userId: profile.userId },
      { $set: profile },
      { upsert: true }
    );
    
    console.log(`User profile ${result.upsertedId ? 'inserted' : 'updated'}`);
    
    // Always save to our mock data for browser environment
    mockUserProfiles[profile.userId] = profile;
    return profile;
  } catch (error) {
    console.error('Error saving user profile:', error);
    // In a real app, we would propagate this error
    // For now, we'll save to our mock data and return
    mockUserProfiles[profile.userId] = profile;
    return profile;
  }
};

export const saveDoctorProfile = async (profile: DoctorProfile): Promise<DoctorProfile> => {
  try {
    const db = await getDatabase();
    const doctorsCollection = db.collection(COLLECTIONS.DOCTORS);
    
    // Check if doctor exists and update or insert
    const result = await doctorsCollection.updateOne(
      { userId: profile.userId },
      { $set: profile },
      { upsert: true }
    );
    
    console.log(`Doctor profile ${result.upsertedId ? 'inserted' : 'updated'}`);
    // Update mock data too for browser environment
    mockDoctorProfiles[profile.userId] = profile;
    return profile;
  } catch (error) {
    console.error('Error saving doctor profile:', error);
    // In a real app, we would propagate this error
    // For now, we'll save to our mock data and return
    mockDoctorProfiles[profile.userId] = profile;
    return profile;
  }
};

export const saveFirstResponderProfile = async (profile: FirstResponderProfile): Promise<FirstResponderProfile> => {
  try {
    const db = await getDatabase();
    const firstRespondersCollection = db.collection(COLLECTIONS.FIRST_RESPONDERS);
    
    // Check if first responder exists and update or insert
    const result = await firstRespondersCollection.updateOne(
      { userId: profile.userId },
      { $set: profile },
      { upsert: true }
    );
    
    console.log(`First responder profile ${result.upsertedId ? 'inserted' : 'updated'}`);
    // Update mock data too for browser environment
    mockFirstResponderProfiles[profile.userId] = profile;
    return profile;
  } catch (error) {
    console.error('Error saving first responder profile:', error);
    // In a real app, we would propagate this error
    // For now, we'll save to our mock data and return
    mockFirstResponderProfiles[profile.userId] = profile;
    return profile;
  }
};

export const getUserProfileByRole = async (userId: string, role: UserRole) => {
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

export const checkUserIdAvailability = async (userId: string): Promise<boolean> => {
  try {
    const db = await getDatabase();
    
    // In browser environment, we'll check our mock data
    if (userId.startsWith('US')) {
      return !mockUserProfiles[userId];
    } else if (userId.startsWith('DR')) {
      return !mockDoctorProfiles[userId];
    } else if (userId.startsWith('FR')) {
      return !mockFirstResponderProfiles[userId];
    }
    
    return false;
  } catch (error) {
    console.error('Error checking user ID availability:', error);
    // For demo, fall back to the simple check
    return userId.length % 2 === 0;
  }
};

export const authenticateUser = async (userId: string, password: string): Promise<any> => {
  try {
    // In browser environment, we'll use our mock data
    if (userId.startsWith('US')) {
      const user = mockUserProfiles[userId];
      if (user) {
        return { 
          success: true, 
          user: { 
            userId, 
            name: user.name, 
            role: 'USER' as UserRole,
            accountId: user.accountId
          } 
        };
      }
    } else if (userId.startsWith('DR')) {
      const doctor = mockDoctorProfiles[userId];
      if (doctor) {
        return { 
          success: true, 
          user: { 
            userId, 
            name: doctor.name, 
            role: 'DOCTOR' as UserRole
          } 
        };
      }
    } else if (userId.startsWith('FR')) {
      const firstResponder = mockFirstResponderProfiles[userId];
      if (firstResponder) {
        return { 
          success: true, 
          user: { 
            userId, 
            name: firstResponder.name, 
            role: 'FIRST_RESPONDER' as UserRole
          } 
        };
      }
    }
    
    // If we get here, the user wasn't found
    return { success: false, message: 'Invalid user ID or password' };
  } catch (error) {
    console.error('Error authenticating user:', error);
    return { success: false, message: 'Authentication error' };
  }
};
