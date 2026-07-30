const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:9000/api/v1';

export const fetchWithAuth = async (endpoint: string, options: RequestInit = {}) => {
  const token = localStorage.getItem('lifetag_token');

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers
  });

  return response.json();
};

export const fetchWithoutAuth = async (endpoint: string, options: RequestInit = {}) => {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers
  });

  return response.json();
};
