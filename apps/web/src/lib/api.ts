const headers = () => ({ Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' });
const token = () => localStorage.getItem('token');

interface CacheEntry { data: any; ts: number; lastAccess: number }
const cache = new Map<string, CacheEntry>();
const MAX_CACHE = 200;

const TTL_MAP: [RegExp, number][] = [
  [/\/categories/, 60000],
  [/\/auth\/me/, 300000],
  [/\/stores$/, 30000],
  [/\/dashboard/, 5000],
  [/\/report/, 15000],
  [/\/notifications/, 3000],
  [/\/unread-count/, 3000],
  [/\/entries/, 3000],
  [/\/inventory/, 5000],
  [/\/staff/, 30000],
  [/\/payroll/, 30000],
  [/\/dividends/, 30000],
  [/\/shifts/, 5000],
  [/\/logs/, 10000],
  [/\/system/, 30000],
];
const DEFAULT_TTL = 3000;

function getTTL(url: string): number {
  for (const [pattern, ttl] of TTL_MAP) {
    if (pattern.test(url)) return ttl;
  }
  return DEFAULT_TTL;
}

function getCached(key: string): any | null {
  const entry = cache.get(key);
  if (!entry) return null;
  const ttl = getTTL(key);
  if (Date.now() - entry.ts > ttl) { cache.delete(key); return null; }
  entry.lastAccess = Date.now();
  return entry.data;
}

function setCache(key: string, data: any) {
  if (cache.size >= MAX_CACHE) {
    let oldest = '';
    let oldestTime = Infinity;
    for (const [k, v] of cache) {
      if (v.lastAccess < oldestTime) { oldestTime = v.lastAccess; oldest = k; }
    }
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { data, ts: Date.now(), lastAccess: Date.now() });
}

export function invalidateCache(pattern?: string) {
  if (!pattern) { cache.clear(); return; }
  for (const key of cache.keys()) {
    if (key.includes(pattern)) cache.delete(key);
  }
}

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
