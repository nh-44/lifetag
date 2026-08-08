import React, { createContext, useState, useContext, useEffect } from 'react';
import { toast } from 'sonner';
import { authenticateUser, registerUser, checkUserIdAvailability } from '@/services/userService';
import { tokenStorage } from '@/utils/tokenStorage';

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
  login: (userId: string, password: string, redirectAccountId?: string) => Promise<boolean>;
  signup: (userData: Partial<User> & { password: string, confirmPassword: string }) => Promise<boolean>;
  logout: () => void;
  checkUserIdAvailability: (userId: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextProps>({
  currentUser: null,
  loading: false,
  error: null,
  login: async () => false,
  signup: async () => false,
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
      
      const response = await authenticateUser(userId, password);
      
      if (response && response.user && response.token) {
        const userWithToken = { ...response.user, token: response.token };
        setCurrentUser(userWithToken);
        localStorage.setItem('lifetagUser', JSON.stringify(userWithToken));
        tokenStorage.setToken(response.token);
        if (response.refreshToken) {
          tokenStorage.setRefreshToken(response.refreshToken);
        }
        toast.success('Logged in successfully');
        return true;
      }
      return false;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to login';
      setError(message);
      toast.error(message);
      return false;
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
      
      const response = await registerUser(userData);
      
      if (response && response.user && response.token) {
        const userWithToken = { ...response.user, token: response.token };
        setCurrentUser(userWithToken);
        localStorage.setItem('lifetagUser', JSON.stringify(userWithToken));
        tokenStorage.setToken(response.token);
        if (response.refreshToken) {
          tokenStorage.setRefreshToken(response.refreshToken);
        }
        toast.success('Account created successfully');
        return true;
      }
      
      return false;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create account';
      setError(message);
      toast.error(message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    const refreshToken = tokenStorage.getRefreshToken();
    if (refreshToken) {
      try {
        await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:9000/api/v1'}/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken })
        });
      } catch (e) {
        console.error('Failed to invalidate refresh token on backend', e);
      }
    }
    
    setCurrentUser(null);
    localStorage.removeItem('lifetagUser');
    tokenStorage.clearTokens();
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
