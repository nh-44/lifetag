
import { UserAccount, DoctorAccount, FirstResponderAccount } from '@/types/user';

// Initialize mock database if it doesn't exist
export const initializeMockData = () => {
  // Only initialize if data doesn't exist yet
  if (!localStorage.getItem('mockUsers')) {
    const mockUsers = [
      // Example User 1
      {
        user_id: 'US12345',
        account_id: '12345',
        name: 'John Doe',
        password: 'password123',
        role: 'user',
        age: 35,
        blood_group: 'O+',
        allergies: ['Peanuts', 'Penicillin'],
        emergency_contacts: ['US54321'],
        dnr_status: false,
        primary_physician: 'DR98765',
        insurance_id: 'INS-123456',
        doctor_only_info: {
          drinking_habits: 'Occasional',
          smoking_habits: 'No',
          medications: ['Lisinopril 10mg', 'Vitamin D 1000IU'],
          illnesses: ['Hypertension', 'Seasonal allergies'],
          surgeries: ['Appendectomy (2010)'],
          last_checkup: {
            weight: 82,
            bmi: 24.5,
            sugar: 98,
            bp: '120/80'
          }
        }
      } as UserAccount,
      
      // Example User 2
      {
        user_id: 'US54321',
        account_id: '54321',
        name: 'Jane Smith',
        password: 'password123',
        role: 'user',
        age: 28,
        blood_group: 'A-',
        allergies: ['Shellfish', 'Latex'],
        emergency_contacts: ['US12345'],
        dnr_status: false,
        primary_physician: 'DR98765',
        insurance_id: 'INS-789012',
        doctor_only_info: {
          drinking_habits: 'None',
          smoking_habits: 'No',
          medications: ['Levothyroxine 50mcg'],
          illnesses: ['Hypothyroidism'],
          surgeries: [],
          last_checkup: {
            weight: 65,
            bmi: 22.1,
            sugar: 86,
            bp: '118/75'
          }
        }
      } as UserAccount,
      
      // Example Doctor
      {
        user_id: 'DR98765',
        name: 'Dr. Sarah Johnson',
        password: 'password123',
        role: 'doctor',
        contact_info: '555-123-4567',
        medical_license: 'ML-987654',
        qualifications: ['MD', 'Board Certified Internal Medicine', 'Harvard Medical School'],
        hospital: 'City General Hospital',
        specialty: 'Internal Medicine'
      } as DoctorAccount,
      
      // Example First Responder
      {
        user_id: 'FR45678',
        name: 'Michael Wilson',
        password: 'password123',
        role: 'first_responder',
        contact_info: '555-987-6543',
        agency: 'City EMS',
        agency_id: 'EMS-123',
        organization_type: 'government',
        qualification: 'Paramedic'
      } as FirstResponderAccount
    ];
    
    localStorage.setItem('mockUsers', JSON.stringify(mockUsers));
    console.log('Initialized mock database with seed data');
  }
};
