const headers = () => ({ Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' });
const token = () => localStorage.getItem('token');

// Simple in-memory cache for GET requests
const cache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 5000; // 5 seconds

function getCached(key: string): any | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  cache.delete(key);
  return null;
}

function setCache(key: string, data: any) {
  cache.set(key, { data, ts: Date.now() });
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

/** Invalidate cache for a URL and all its parent paths */
function invalidateRelated(url: string) {
  const path = url.split('?')[0];
  invalidateCache(path);
  const parts = path.split('/');
  while (parts.length > 2) { parts.pop(); invalidateCache(parts.join('/')); }
}

async function parseError(r: Response): Promise<Error> {
  try {
    const data = await r.json();
    if (r.status === 401) {
      localStorage.removeItem('token');
      if (location.pathname !== '/login') location.href = '/login';
      return new Error('登录已过期，请重新登录');
    }
    return new Error(data.error || data.message || '请求失败');
  } catch {
    return new Error('请求失败 (' + r.status + ')');
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
    invalidateRelated(url);
    return res.json();
  },
  put: async (url: string, body: any) => {
    const res = await fetch('/api' + url, { method: 'PUT', headers: headers(), cache: 'no-cache', body: JSON.stringify(body) });
    if (!res.ok) throw await parseError(res);
    invalidateRelated(url);
    return res.json();
  },
  del: async (url: string, body?: any) => {
    const res = await fetch('/api' + url, { method: 'DELETE', headers: headers(), cache: 'no-cache', ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!res.ok) throw await parseError(res);
    invalidateRelated(url);
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
