import { describe, it, expect, beforeEach, vi } from 'vitest';
import { tokenStorage } from './tokenStorage';

describe('tokenStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('obfuscates and stores tokens correctly', () => {
    tokenStorage.setToken('my-super-secret-token');
    const stored = localStorage.getItem('lifetag_token');
    expect(stored).not.toBeNull();
    expect(stored).not.toBe('my-super-secret-token'); // Should be obfuscated

    const retrieved = tokenStorage.getToken();
    expect(retrieved).toBe('my-super-secret-token');
  });

  it('stores and retrieves refresh tokens correctly', () => {
    tokenStorage.setRefreshToken('refresh-token-value');
    const retrieved = tokenStorage.getRefreshToken();
    expect(retrieved).toBe('refresh-token-value');
  });

  it('returns null if token does not exist', () => {
    expect(tokenStorage.getToken()).toBeNull();
    expect(tokenStorage.getRefreshToken()).toBeNull();
  });

  it('handles corrupted stored values gracefully by returning empty string or null', () => {
    localStorage.setItem('lifetag_token', '!!!invalid-base64!!!');
    // deobfuscate should catch base64 decoding error and return empty string
    const retrieved = tokenStorage.getToken();
    expect(retrieved).toBe('');
  });

  it('clears all tokens on clearTokens()', () => {
    tokenStorage.setToken('token-1');
    tokenStorage.setRefreshToken('token-2');

    expect(tokenStorage.getToken()).toBe('token-1');
    expect(tokenStorage.getRefreshToken()).toBe('token-2');

    tokenStorage.clearTokens();

    expect(tokenStorage.getToken()).toBeNull();
    expect(tokenStorage.getRefreshToken()).toBeNull();
  });
});
