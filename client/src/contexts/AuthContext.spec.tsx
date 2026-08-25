import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { useEffect } from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import { authenticateUser, registerUser, checkUserIdAvailability } from '@/services/userService';
import { tokenStorage } from '@/utils/tokenStorage';

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
    setRefreshToken: vi.fn(),
    getRefreshToken: vi.fn(),
    clearTokens: vi.fn(),
  },
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
  });

  it('restores user from localStorage on initialization', async () => {
    const mockUser = { userId: 'US12345', name: 'John Doe', role: 'USER', token: 'mock-token' };
    localStorage.setItem('lifetagUser', JSON.stringify(mockUser));

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    // Should load the user from localStorage
    expect(screen.getByTestId('user')).toHaveTextContent('John Doe');
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
    expect(tokenStorage.setRefreshToken).toHaveBeenCalledWith('jwt-refresh-token');
    expect(localStorage.getItem('lifetagUser')).toContain('John Doe');
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
    const mockUser = { userId: 'US12345', name: 'John Doe', role: 'USER', token: 'mock-token' };
    localStorage.setItem('lifetagUser', JSON.stringify(mockUser));
    vi.mocked(tokenStorage.getRefreshToken).mockReturnValue('mock-refresh-token');

    // Mock fetch globally
    const mockFetch = vi.fn().mockResolvedValue({} as any);
    vi.stubGlobal('fetch', mockFetch);

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    expect(screen.getByTestId('user')).toHaveTextContent('John Doe');

    await act(async () => {
      screen.getByTestId('btn-logout').click();
    });

    expect(screen.getByTestId('user')).toHaveTextContent('No User');
    expect(tokenStorage.clearTokens).toHaveBeenCalled();
    expect(localStorage.getItem('lifetagUser')).toBeNull();
  });
});
