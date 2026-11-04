import React, { createContext, useState, useContext, useEffect } from 'react';
import { toast } from 'sonner';
import { authenticateUser, registerUser, checkUserIdAvailability } from '@/services/userService';
import { tokenStorage } from '@/utils/tokenStorage';
import { API_URL, refreshAccessToken } from '@/services/api';

export type UserRole = 'USER' | 'DOCTOR' | 'FIRST_RESPONDER';

export interface User {
  userId: string;
  accountId?: string;
  name: string;
  role: UserRole;
  /** Clinicians only: verified by the Healthcare Authority (required for clinical actions). */
  verified?: boolean;
}

// Only the non-secret profile is persisted. Tokens never touch Web Storage:
// the access token is in memory and the refresh token is an HttpOnly cookie.
const persistUser = (user: User) => {
  const { userId, accountId, name, role, verified } = user;
  localStorage.setItem('aegistagUser', JSON.stringify({ userId, accountId, name, role, verified }));
};

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

  // Restore the session on reload: profile from localStorage, access token from the
  // refresh cookie. If the refresh fails (offline, or cookie expired) the profile is
  // kept so offline tag scanning still works; the next authenticated request retries
  // the refresh and redirects to /login if the session is really gone.
  useEffect(() => {
    const storedUser = localStorage.getItem('aegistagUser');
    if (!storedUser) {
      setLoading(false);
      return;
    }
    try {
      const { token: _legacyToken, ...user } = JSON.parse(storedUser);
      setCurrentUser(user);
      persistUser(user); // rewrites entries saved by older versions without their token
    } catch (e) {
      console.error('Failed to parse stored user:', e);
      localStorage.removeItem('aegistagUser');
      setLoading(false);
      return;
    }
    refreshAccessToken().finally(() => setLoading(false));
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
        setCurrentUser(response.user);
        persistUser(response.user);
        tokenStorage.setToken(response.token);
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
        setCurrentUser(response.user);
        persistUser(response.user);
        tokenStorage.setToken(response.token);
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
    try {
      // The server revokes the refresh token named by the cookie and clears the cookie
      await fetch(`${API_URL}/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch (e) {
      console.error('Failed to invalidate refresh token on backend', e);
    }
    
    setCurrentUser(null);
    localStorage.removeItem('aegistagUser');
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
