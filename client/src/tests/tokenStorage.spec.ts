import { describe, it, expect, beforeEach } from 'vitest';
import { tokenStorage } from '@/utils/tokenStorage';

describe('tokenStorage', () => {
  beforeEach(() => {
    tokenStorage.clearTokens();
    localStorage.clear();
  });

  it('keeps the access token in memory only, never in Web Storage', () => {
    tokenStorage.setToken('my-super-secret-token');
    expect(tokenStorage.getToken()).toBe('my-super-secret-token');
    expect(Object.keys(localStorage)).toHaveLength(0);
    expect(Object.keys(sessionStorage)).toHaveLength(0);
  });

  it('returns null when no token is set', () => {
    expect(tokenStorage.getToken()).toBeNull();
  });

  it('clearTokens removes the token', () => {
    tokenStorage.setToken('token-1');
    tokenStorage.clearTokens();
    expect(tokenStorage.getToken()).toBeNull();
  });

  it('exposes no refresh-token API (the refresh token is an HttpOnly cookie)', () => {
    expect(tokenStorage).not.toHaveProperty('setRefreshToken');
    expect(tokenStorage).not.toHaveProperty('getRefreshToken');
  });
});
