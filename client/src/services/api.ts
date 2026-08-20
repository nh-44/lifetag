import { tokenStorage } from '@/utils/tokenStorage';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:9000/api/v1';

export const fetchWithAuth = async (endpoint: string, options: RequestInit = {}) => {
  let token = tokenStorage.getToken();

  const getHeaders = (t: string | null) => ({
    'Content-Type': 'application/json',
    ...options.headers,
    ...(t ? { Authorization: `Bearer ${t}` } : {})
  });

  let response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: getHeaders(token)
  });

  // Intercept 401 Unauthorized for token refresh
  if (response.status === 401) {
    const refreshToken = tokenStorage.getRefreshToken();
    if (refreshToken) {
      try {
        const refreshResponse = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken })
        });
        
        if (refreshResponse.ok) {
          const data = await refreshResponse.json();
          if (data.success && data.data && data.data.token) {
            // Save new access token
            tokenStorage.setToken(data.data.token);
            token = data.data.token;
            
            // Retry original request
            response = await fetch(`${API_URL}${endpoint}`, {
              ...options,
              headers: getHeaders(token)
            });
          }
        } else {
          // Refresh failed (e.g., revoked or expired refresh token)
          tokenStorage.clearTokens();
          // Force a reload to trigger auth state reset (optional, but robust)
          window.location.href = '/login';
        }
      } catch (e) {
        console.error('Failed to refresh token', e);
      }
    }
  }

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

export const logBenchmarkTelemetry = async (data: {
  operation: "READ" | "WRITE";
  payloadSizeRaw: number;
  payloadSizeCompressed: number;
  timeElapsedMs: number;
  deviceMeta?: string;
}) => {
  try {
    return await fetchWithoutAuth('/benchmarks/log', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  } catch (error) {
    console.error('Failed to log benchmark telemetry:', error);
    return { success: false, error };
  }
};
