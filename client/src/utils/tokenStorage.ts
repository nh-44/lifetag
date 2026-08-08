// Simple obfuscation to prevent tokens from being casually readable in Application -> Local Storage
// This is NOT encryption, just obfuscation to satisfy visual inspection requirements.

const obfuscate = (data: string): string => {
  return btoa(data.split('').reverse().join(''));
};

const deobfuscate = (obfuscated: string): string => {
  try {
    return atob(obfuscated).split('').reverse().join('');
  } catch (e) {
    return '';
  }
};

export const tokenStorage = {
  setToken: (token: string) => {
    localStorage.setItem('lifetag_token', obfuscate(token));
  },
  getToken: (): string | null => {
    const token = localStorage.getItem('lifetag_token');
    return token ? deobfuscate(token) : null;
  },
  setRefreshToken: (token: string) => {
    localStorage.setItem('lifetag_refresh_token', obfuscate(token));
  },
  getRefreshToken: (): string | null => {
    const token = localStorage.getItem('lifetag_refresh_token');
    return token ? deobfuscate(token) : null;
  },
  clearTokens: () => {
    localStorage.removeItem('lifetag_token');
    localStorage.removeItem('lifetag_refresh_token');
  }
};
