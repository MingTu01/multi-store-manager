// Server base URL configuration
// In web mode (same origin): returns empty string (relative paths)
// In native app mode (Capacitor): returns the configured server URL
// CapacitorHttp is enabled, so all requests bypass CORS in native mode

export function getBaseURL(): string {
  // Check if running in Capacitor native app
  const isNative = typeof window !== 'undefined' && 
    (window as any).Capacitor?.isNativePlatform?.();
  
  if (!isNative) {
    // Web mode - use relative paths (same origin)
    return '';
  }
  
  // Native app mode - read from localStorage
  // CapacitorHttp handles all requests natively (no CORS)
  return localStorage.getItem('msl_server_url') || '';
}

export function setServerURL(url: string) {
  const normalized = url.replace(/\/+$/, '');
  localStorage.setItem('msl_server_url', normalized);
}

export function getServerURL(): string {
  return localStorage.getItem('msl_server_url') || '';
}

export function clearServerURL() {
  localStorage.removeItem('msl_server_url');
}

export function isNativeApp(): boolean {
  return typeof window !== 'undefined' && 
    !!(window as any).Capacitor?.isNativePlatform?.();
}
