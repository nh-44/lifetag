import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { useEffect } from 'react';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { authenticateUser, registerUser, checkUserIdAvailability } from '@/services/userService';
import { tokenStorage } from '@/utils/tokenStorage';
import { refreshAccessToken } from '@/services/api';

// Mock dependencies
vi.mock('@/services/userService', () => ({
  authenticateUser: vi.fn(),
  registerUser: vi.fn(),
  checkUserIdAvailability: vi.fn(),
}));

vi.mock('@/utils/tokenStorage', () => ({
  tokenStorage: {
    setToken: vi.fn(),
    getToken: vi.fn(),
    clearTokens: vi.fn(),
  },
}));

vi.mock('@/services/api', () => ({
  API_URL: 'http://api.test/api/v1',
  refreshAccessToken: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Test consumer component
const TestConsumer = () => {
  const { currentUser, loading, error, login, signup, logout } = useAuth();
  
  if (loading) return <div data-testid="loading">Loading...</div>;

  return (
    <div>
      <div data-testid="user">{currentUser ? currentUser.name : 'No User'}</div>
      <div data-testid="error">{error ?? 'No Error'}</div>
      <button data-testid="btn-login" onClick={() => login('US12345', 'pass123')}>Login</button>
      <button data-testid="btn-signup" onClick={() => signup({ userId: 'US12345', password: 'pwd', confirmPassword: 'pwd', name: 'Test' } as any)}>Signup</button>
      <button data-testid="btn-logout" onClick={logout}>Logout</button>
    </div>
  );
};

describe('AuthContext', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.mocked(refreshAccessToken).mockResolvedValue(true);
  });

  it('restores the profile from localStorage and the access token from the refresh cookie', async () => {
    localStorage.setItem('aegistagUser', JSON.stringify({ userId: 'US12345', name: 'John Doe', role: 'USER' }));

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    expect(await screen.findByTestId('user')).toHaveTextContent('John Doe');
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
  });

  it('strips a token saved by older versions from the persisted profile', async () => {
    localStorage.setItem('aegistagUser', JSON.stringify({ userId: 'US12345', name: 'John Doe', role: 'USER', token: 'legacy-jwt' }));

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await screen.findByTestId('user');
    expect(localStorage.getItem('aegistagUser')).not.toContain('legacy-jwt');
  });

  it('handles successful login', async () => {
    vi.mocked(authenticateUser).mockResolvedValue({
      user: { userId: 'US12345', name: 'John Doe', role: 'USER' },
      token: 'jwt-access-token',
      refreshToken: 'jwt-refresh-token',
    } as any);

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    expect(screen.getByTestId('user')).toHaveTextContent('No User');

    await act(async () => {
      screen.getByTestId('btn-login').click();
    });

    expect(screen.getByTestId('user')).toHaveTextContent('John Doe');
    expect(tokenStorage.setToken).toHaveBeenCalledWith('jwt-access-token');
    expect(localStorage.getItem('aegistagUser')).toContain('John Doe');
    // No token of any kind is written to Web Storage
    expect(localStorage.getItem('aegistagUser')).not.toContain('jwt-');
    expect(Object.keys(localStorage)).toEqual(['aegistagUser']);
  });

  it('handles login failure and sets error state', async () => {
    vi.mocked(authenticateUser).mockRejectedValue(new Error('Invalid password'));

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await act(async () => {
      screen.getByTestId('btn-login').click();
    });

    expect(screen.getByTestId('user')).toHaveTextContent('No User');
    expect(screen.getByTestId('error')).toHaveTextContent('Invalid password');
  });

  it('handles successful signup', async () => {
    vi.mocked(registerUser).mockResolvedValue({
      user: { userId: 'US12345', name: 'John Doe', role: 'USER' },
      token: 'jwt-access-token',
      refreshToken: 'jwt-refresh-token',
    } as any);

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await act(async () => {
      screen.getByTestId('btn-signup').click();
    });

    expect(screen.getByTestId('user')).toHaveTextContent('John Doe');
    expect(tokenStorage.setToken).toHaveBeenCalledWith('jwt-access-token');
  });

  it('clears user state and tokens on logout', async () => {
    localStorage.setItem('aegistagUser', JSON.stringify({ userId: 'US12345', name: 'John Doe', role: 'USER' }));

    // Mock fetch globally
    const mockFetch = vi.fn().mockResolvedValue({} as any);
    vi.stubGlobal('fetch', mockFetch);

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    expect(await screen.findByTestId('user')).toHaveTextContent('John Doe');

    await act(async () => {
      screen.getByTestId('btn-logout').click();
    });

    expect(screen.getByTestId('user')).toHaveTextContent('No User');
    expect(mockFetch).toHaveBeenCalledWith('http://api.test/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
    expect(tokenStorage.clearTokens).toHaveBeenCalled();
    expect(localStorage.getItem('aegistagUser')).toBeNull();
  });
});
