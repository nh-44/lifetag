
import { AuthResponse, LoginRequest, User, ProfileUpdateResponse, UserAccount } from '../types/user';

// Base API URL - would come from environment variables in a real app
const API_URL = 'http://localhost:5000/api';

// Helper for HTTP requests
const fetchWithAuth = async (endpoint: string, options: RequestInit = {}) => {
  const token = localStorage.getItem('token');
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      message: 'An unknown error occurred'
    }));
    throw new Error(error.message || `HTTP error! Status: ${response.status}`);
  }

  return response.json();
};

// Auth Services
export const authService = {
  login: async (credentials: LoginRequest): Promise<AuthResponse> => {
    return fetchWithAuth('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials)
    });
  },

  signup: async (userData: Partial<User>): Promise<AuthResponse> => {
    return fetchWithAuth('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(userData)
    });
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },

  getCurrentUser: (): User | null => {
    const userStr = localStorage.getItem('user');
    if (!userStr) return null;
    try {
      return JSON.parse(userStr) as User;
    } catch (error) {
      console.error('Error parsing user data', error);
      return null;
    }
  },

  setCurrentUser: (user: User, token: string) => {
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('token', token);
  }
};

// User Services
export const userService = {
  getUserByAccountId: async (accountId: string): Promise<UserAccount> => {
    return fetchWithAuth(`/users/account/${accountId}`);
  },

  updateUserProfile: async (userData: Partial<User>): Promise<ProfileUpdateResponse> => {
    return fetchWithAuth('/users/profile', {
      method: 'PUT',
      body: JSON.stringify(userData)
    });
  },

  getEmergencyInfo: async (accountId: string): Promise<Partial<UserAccount>> => {
    return fetchWithAuth(`/users/emergency/${accountId}`);
  },

  getDoctorInfo: async (accountId: string): Promise<UserAccount> => {
    return fetchWithAuth(`/users/doctor-info/${accountId}`);
  },

  deleteAccount: async (): Promise<{ success: boolean }> => {
    return fetchWithAuth('/users/account', {
      method: 'DELETE'
    });
  }
};

// Mock implementations for development
// In a real scenario, these would be replaced by actual API calls
export const mockAuthService = {
  login: async (credentials: LoginRequest): Promise<AuthResponse> => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 800));
    
    const storedUsers = JSON.parse(localStorage.getItem('mockUsers') || '[]');
    const user = storedUsers.find((u: User) => u.user_id === credentials.user_id);
    
    if (!user || user.password !== credentials.password) {
      throw new Error('Invalid credentials');
    }
    
    // Remove password before sending
    const { password, ...userWithoutPassword } = user;
    
    const token = `mock-jwt-token-${Date.now()}`;
    return { user: userWithoutPassword, token };
  },

  signup: async (userData: Partial<User>): Promise<AuthResponse> => {
    await new Promise(resolve => setTimeout(resolve, 800));
    
    const storedUsers = JSON.parse(localStorage.getItem('mockUsers') || '[]');
    
    if (storedUsers.some((u: User) => u.user_id === userData.user_id)) {
      throw new Error('User ID already exists');
    }
    
    const newUser = { ...userData };
    
    storedUsers.push(newUser);
    localStorage.setItem('mockUsers', JSON.stringify(storedUsers));
    
    const { password, ...userWithoutPassword } = newUser;
    
    const token = `mock-jwt-token-${Date.now()}`;
    return { user: userWithoutPassword as User, token };
  },
  
  // Use same implementation as the real service for these methods
  logout: authService.logout,
  getCurrentUser: authService.getCurrentUser,
  setCurrentUser: authService.setCurrentUser
};

export const mockUserService = {
  getUserByAccountId: async (accountId: string): Promise<UserAccount> => {
    await new Promise(resolve => setTimeout(resolve, 800));
    
    const storedUsers = JSON.parse(localStorage.getItem('mockUsers') || '[]');
    const user = storedUsers.find((u: User) => 
      'account_id' in u && u.account_id === accountId
    );
    
    if (!user) {
      throw new Error('User not found');
    }
    
    return user as UserAccount;
  },

  updateUserProfile: async (userData: Partial<User>): Promise<ProfileUpdateResponse> => {
    await new Promise(resolve => setTimeout(resolve, 800));
    
    const storedUsers = JSON.parse(localStorage.getItem('mockUsers') || '[]');
    const index = storedUsers.findIndex((u: User) => u.user_id === userData.user_id);
    
    if (index === -1) {
      throw new Error('User not found');
    }
    
    storedUsers[index] = { ...storedUsers[index], ...userData };
    localStorage.setItem('mockUsers', JSON.stringify(storedUsers));
    
    return { success: true, user: storedUsers[index] };
  },

  getEmergencyInfo: async (accountId: string): Promise<Partial<UserAccount>> => {
    await new Promise(resolve => setTimeout(resolve, 800));
    
    const storedUsers = JSON.parse(localStorage.getItem('mockUsers') || '[]');
    const user = storedUsers.find((u: User) => 
      'account_id' in u && u.account_id === accountId
    );
    
    if (!user) {
      throw new Error('User not found');
    }
    
    // Return only emergency information
    const { 
      user_id, name, account_id, age, blood_group, 
      allergies, emergency_contacts, dnr_status, 
      primary_physician, insurance_id 
    } = user;
    
    return { 
      user_id, name, account_id, age, blood_group, 
      allergies, emergency_contacts, dnr_status, 
      primary_physician, insurance_id 
    };
  },

  getDoctorInfo: async (accountId: string): Promise<UserAccount> => {
    await new Promise(resolve => setTimeout(resolve, 800));
    
    const storedUsers = JSON.parse(localStorage.getItem('mockUsers') || '[]');
    const user = storedUsers.find((u: User) => 
      'account_id' in u && u.account_id === accountId
    );
    
    if (!user) {
      throw new Error('User not found');
    }
    
    return user as UserAccount;
  },

  deleteAccount: async (): Promise<{ success: boolean }> => {
    await new Promise(resolve => setTimeout(resolve, 800));
    
    const currentUser = authService.getCurrentUser();
    if (!currentUser) {
      throw new Error('Not authenticated');
    }
    
    const storedUsers = JSON.parse(localStorage.getItem('mockUsers') || '[]');
    const filteredUsers = storedUsers.filter((u: User) => u.user_id !== currentUser.user_id);
    
    localStorage.setItem('mockUsers', JSON.stringify(filteredUsers));
    authService.logout();
    
    return { success: true };
  }
};

// Use mock services for development
export const currentAuthService = mockAuthService;
export const currentUserService = mockUserService;
