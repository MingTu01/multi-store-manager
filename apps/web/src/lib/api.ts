const headers = () => ({ Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' });
const token = () => localStorage.getItem('token');

// Simple in-memory cache for GET requests
const cache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 30000; // 30 seconds

function getCached(key: string): any | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  cache.delete(key);
  return null;
}

function setCache(key: string, data: any) {
  cache.set(key, { data, ts: Date.now() });
  // Limit cache size
  if (cache.size > 100) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

export function invalidateCache(pattern?: string) {
  if (!pattern) { cache.clear(); return; }
  for (const key of cache.keys()) {
    if (key.includes(pattern)) cache.delete(key);
  }
}

async function parseError(r: Response): Promise<Error> {
  try {
    const data = await r.json();
    if (r.status === 401) {
      localStorage.removeItem('token');
      if (location.pathname !== '/login') location.href = '/login';
      return new Error('\u767b\u5f55\u5df2\u8fc7\u671f\uff0c\u8bf7\u91cd\u65b0\u767b\u5f55');
    }
    return new Error(data.error || data.message || '\u8bf7\u6c42\u5931\u8d25');
  } catch {
    return new Error('\u8bf7\u6c42\u5931\u8d25 (' + r.status + ')');
  }
}

export const api = {
  get: async (url: string) => {
    const cached = getCached(url);
    if (cached) return cached;
    const res = await fetch('/api' + url, { headers: headers(), cache: 'no-cache' });
    if (!res.ok) throw await parseError(res);
    const data = await res.json();
    setCache(url, data);
    return data;
  },
  post: async (url: string, body: any) => {
    const res = await fetch('/api' + url, { method: 'POST', headers: headers(), cache: 'no-cache', body: JSON.stringify(body) });
    if (!res.ok) throw await parseError(res);
    invalidateCache(url.split('?')[0]);
    return res.json();
  },
  put: async (url: string, body: any) => {
    const res = await fetch('/api' + url, { method: 'PUT', headers: headers(), cache: 'no-cache', body: JSON.stringify(body) });
    if (!res.ok) throw await parseError(res);
    invalidateCache(url.split('?')[0]);
    return res.json();
  },
  del: async (url: string, body?: any) => {
    const res = await fetch('/api' + url, { method: 'DELETE', headers: headers(), cache: 'no-cache', ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!res.ok) throw await parseError(res);
    invalidateCache(url.split('?')[0]);
    return res.json();
  },
  upload: async (url: string, formData: FormData) => {
    const res = await fetch('/api' + url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token()! },
      body: formData,
    });
    if (!res.ok) throw await parseError(res);
    return res.json();
  },
};
