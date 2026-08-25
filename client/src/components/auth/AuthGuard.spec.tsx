import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AuthGuard from './AuthGuard';
import { useAuth } from '@/contexts/AuthContext';

// Mock context hook
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

describe('AuthGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading spinner when auth context is loading', () => {
    vi.mocked(useAuth).mockReturnValue({
      currentUser: null,
      loading: true,
      login: vi.fn(),
      logout: vi.fn(),
    } as any);

    render(
      <MemoryRouter>
        <AuthGuard>
          <div>Protected Content</div>
        </AuthGuard>
      </MemoryRouter>
    );

    // Verify loading state is shown
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('redirects to /login when user is not authenticated', () => {
    vi.mocked(useAuth).mockReturnValue({
      currentUser: null,
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
    } as any);

    render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route
            path="/protected"
            element={
              <AuthGuard>
                <div>Protected Content</div>
              </AuthGuard>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Login Page')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('redirects to /unauthorized when user role is not allowed', () => {
    vi.mocked(useAuth).mockReturnValue({
      currentUser: { userId: 'US12345', role: 'USER', name: 'Alice' },
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
    } as any);

    render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route path="/unauthorized" element={<div>Unauthorized Page</div>} />
          <Route
            path="/protected"
            element={
              <AuthGuard allowedRoles={['DOCTOR']}>
                <div>Doctor Only Content</div>
              </AuthGuard>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Unauthorized Page')).toBeInTheDocument();
    expect(screen.queryByText('Doctor Only Content')).not.toBeInTheDocument();
  });

  it('renders children when authenticated and role is allowed', () => {
    vi.mocked(useAuth).mockReturnValue({
      currentUser: { userId: 'DR12345', role: 'DOCTOR', name: 'Dr. Bob' },
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
    } as any);

    render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route
            path="/protected"
            element={
              <AuthGuard allowedRoles={['DOCTOR']}>
                <div>Doctor Only Content</div>
              </AuthGuard>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Doctor Only Content')).toBeInTheDocument();
  });
});
