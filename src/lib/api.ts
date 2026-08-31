// API Configuration & Base URL resolution for Web and Android Capacitor Native App

export const getApiBaseUrl = (): string => {
  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    const isCapacitorNative =
      Boolean((window as any).Capacitor?.isNativePlatform?.()) ||
      origin.includes('localhost') ||
      origin.startsWith('capacitor:') ||
      origin.startsWith('http://localhost') ||
      origin.startsWith('https://localhost');

    if (isCapacitorNative) {
      // Return configured environment API URL or primary production backend
      const customUrl = localStorage.getItem('checkers_api_base_url');
      if (customUrl) return customUrl.replace(/\/$/, '');

      const envUrl = (import.meta as any).env?.VITE_API_BASE_URL;
      if (envUrl) return envUrl.replace(/\/$/, '');

      // Default backend endpoint for mobile APK builds
      return 'https://ais-dev-6jl5ztzyfigu5rh4loi7rf-490075589647.europe-west2.run.app';
    }
  }
  return '';
};

export const getFullApiUrl = (path: string): string => {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const baseUrl = getApiBaseUrl();
  return baseUrl ? `${baseUrl}${cleanPath}` : cleanPath;
};

export const apiFetchJson = async (path: string, options?: RequestInit) => {
  const fullUrl = getFullApiUrl(path);
  try {
    const res = await fetch(fullUrl, {
      ...options,
      headers: {
        'Accept': 'application/json',
        ...(options?.headers || {}),
      },
    });
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      return { ok: res.ok, status: res.status, data: json };
    } catch {
      return {
        ok: false,
        status: res.status,
        data: { success: false, message: text && text.length < 200 ? text : `Server error (${res.status})` },
      };
    }
  } catch (networkErr: any) {
    return {
      ok: false,
      status: 0,
      data: { success: false, message: networkErr?.message || 'Network connection error. Check your internet connection.' },
    };
  }
};
