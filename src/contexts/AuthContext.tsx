
import React, { createContext, useState, useContext, useEffect } from 'react';
import { toast } from 'sonner';
import { authenticateUser, checkUserIdAvailability, saveUserProfile, saveDoctorProfile, saveFirstResponderProfile } from '@/services/userService';

export type UserRole = 'USER' | 'DOCTOR' | 'FIRST_RESPONDER';

export interface User {
  userId: string;
  accountId?: string;
  name: string;
  role: UserRole;
  token: string;
}

interface AuthContextProps {
  currentUser: User | null;
  loading: boolean;
  error: string | null;
  login: (userId: string, password: string, redirectAccountId?: string) => Promise<void>;
  signup: (userData: Partial<User> & { password: string, confirmPassword: string }) => Promise<void>;
  logout: () => void;
  checkUserIdAvailability: (userId: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextProps>({
  currentUser: null,
  loading: false,
  error: null,
  login: async () => {},
  signup: async () => {},
  logout: () => {},
  checkUserIdAvailability: async () => false,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Load user from localStorage on initial render
  useEffect(() => {
    const storedUser = localStorage.getItem('lifetagUser');
    if (storedUser) {
      try {
        setCurrentUser(JSON.parse(storedUser));
      } catch (e) {
        console.error('Failed to parse stored user:', e);
        localStorage.removeItem('lifetagUser');
      }
    }
    setLoading(false);
  }, []);

  const login = async (userId: string, password: string, redirectAccountId?: string) => {
    try {
      setLoading(true);
      setError(null);
      
      if (!userId || !password) {
        throw new Error('User ID and password are required');
      }
      
      // Try to authenticate with MongoDB
      const authResult = await authenticateUser(userId, password);
      
      if (!authResult.success) {
        // If MongoDB auth fails, fall back to the mock authentication logic
        const prefixToRole: Record<string, UserRole> = {
          'US': 'USER',
          'DR': 'DOCTOR',
          'FR': 'FIRST_RESPONDER'
        };
        
        const prefix = userId.substring(0, 2);
        const role = prefixToRole[prefix];
        
        if (!role) {
          throw new Error('Invalid User ID format');
        }
        
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Mock successful login (this would be replaced with actual API response)
        const mockUser: User = {
          userId,
          name: `${role.charAt(0)}${role.slice(1).toLowerCase()} User`,
          role,
          token: 'mock-jwt-token',
          ...(role === 'USER' ? { accountId: userId.substring(2) } : {})
        };
        
        setCurrentUser(mockUser);
        localStorage.setItem('lifetagUser', JSON.stringify(mockUser));
      } else {
        // MongoDB authentication successful
        const user = authResult.user;
        
        // Create a user object with the required format
        const authenticatedUser: User = {
          userId: user.userId,
          name: user.name,
          role: user.role,
          token: 'mongodb-jwt-token', // In a real app, this would be a JWT from your auth system
          ...(user.role === 'USER' ? { accountId: user.accountId } : {})
        };
        
        setCurrentUser(authenticatedUser);
        localStorage.setItem('lifetagUser', JSON.stringify(authenticatedUser));
      }
      
      toast.success('Logged in successfully');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to login';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const signup = async (userData: Partial<User> & { password: string, confirmPassword: string }) => {
    try {
      setLoading(true);
      setError(null);
      
      if (!userData.userId || !userData.password || !userData.confirmPassword) {
        throw new Error('All fields are required');
      }
      
      if (userData.password !== userData.confirmPassword) {
        throw new Error('Passwords do not match');
      }
      
      // Validate user ID format
      const { userId } = userData;
      const prefixToRole: Record<string, UserRole> = {
        'US': 'USER',
        'DR': 'DOCTOR',
        'FR': 'FIRST_RESPONDER'
      };
      
      const prefix = userId.substring(0, 2);
      const role = prefixToRole[prefix];
      
      if (!role) {
        throw new Error('Invalid User ID format');
      }
      
      // Check if user ID is available
      const isAvailable = await checkUserIdAvailability(userId);
      if (!isAvailable) {
        throw new Error('User ID is already taken');
      }
      
      // Create the user based on role
      if (role === 'USER') {
        const accountId = userId.substring(2);
        await saveUserProfile({
          userId,
          accountId,
          name: userData.name || `New User`,
          age: 0,
          bloodGroup: '',
          allergies: [],
          emergencyContacts: [],
          dnrStatus: false,
          primaryPhysician: { userId: '', name: '' },
          insuranceId: '',
          doctorOnlyInfo: {
            drinkingHabits: '',
            smokingHabits: '',
            medications: [],
            illnesses: [],
            surgeries: [],
            lastCheckup: {
              weight: 0,
              bmi: 0,
              sugar: 0,
              bp: ''
            }
          }
        });
      } else if (role === 'DOCTOR') {
        await saveDoctorProfile({
          userId,
          name: userData.name || `New Doctor`,
          contactInfo: '',
          medicalLicenseNumber: '',
          qualifications: [],
          hospitalClinic: '',
          specialty: ''
        });
      } else if (role === 'FIRST_RESPONDER') {
        await saveFirstResponderProfile({
          userId,
          name: userData.name || `New First Responder`,
          occupation: '',
          contactInfo: '',
          agency: '',
          agencyId: '',
          organizationType: 'Government',
          qualification: ''
        });
      }
      
      // Create user object for authentication
      const newUser: User = {
        userId,
        name: userData.name || `New ${role.charAt(0)}${role.slice(1).toLowerCase()}`,
        role,
        token: 'mongodb-jwt-token', // In a real app, this would be a JWT
        ...(role === 'USER' ? { accountId: userId.substring(2) } : {})
      };
      
      setCurrentUser(newUser);
      localStorage.setItem('lifetagUser', JSON.stringify(newUser));
      
      toast.success('Account created successfully');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create account';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem('lifetagUser');
    toast.success('Logged out successfully');
  };

  const value = {
    currentUser,
    loading,
    error,
    login,
    signup,
    logout,
    checkUserIdAvailability
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
