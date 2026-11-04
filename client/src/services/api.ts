import { tokenStorage } from '@/utils/tokenStorage';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:9000/api/v1';

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Exchanges the HttpOnly refresh cookie for a new in-memory access token.
 * Concurrent callers share one request so a burst of 401s triggers a single refresh.
 */
export const refreshAccessToken = (): Promise<boolean> => {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'include' });
        if (!res.ok) return false;
        const data = await res.json();
        if (data.success && data.data?.token) {
          tokenStorage.setToken(data.data.token);
          return true;
        }
        return false;
      } catch {
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
};

export const fetchWithAuth = async (endpoint: string, options: RequestInit = {}) => {
  // After a page reload the in-memory token is gone; restore it from the cookie first.
  if (!tokenStorage.getToken()) await refreshAccessToken();

  const getHeaders = (t: string | null) => ({
    'Content-Type': 'application/json',
    ...options.headers,
    ...(t ? { Authorization: `Bearer ${t}` } : {})
  });

  let response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: getHeaders(tokenStorage.getToken())
  });

  // Access token expired: refresh once via the cookie and retry
  if (response.status === 401) {
    if (await refreshAccessToken()) {
      response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: getHeaders(tokenStorage.getToken())
      });
    } else {
      // Refresh cookie missing, expired or revoked
      tokenStorage.clearTokens();
      localStorage.removeItem('aegistagUser');
      window.location.href = '/login';
    }
  }

  return response.json();
};

export const fetchWithoutAuth = async (endpoint: string, options: RequestInit = {}) => {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // credentials: 'include' lets login/signup store the HttpOnly refresh cookie
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
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
