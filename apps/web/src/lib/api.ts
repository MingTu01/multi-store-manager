let isRedirectingToLogin = false;

const headers = () => ({ 'Content-Type': 'application/json' });

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


async function parseError(r: Response, silent = false): Promise<Error> {
  try {
    const data = await r.json();
    if (r.status === 401) {
      if ((r.url && r.url.includes('/auth/login')) || (typeof window !== 'undefined' && window.location.pathname === '/login')) {
        return new Error(data.error || data.message || '用户名或密码错误');
      }
      if (!isRedirectingToLogin) {
        isRedirectingToLogin = true;
        fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
        if (!silent && location.pathname !== '/login') {
          location.href = '/login';
        }
      }
      return new Error(data.error || data.message || '登录已过期，请重新登录');
    }
    return new Error(data.error || data.message || '请求失败');
  } catch {
    return new Error('请求失败 (' + r.status + ')');
  }
}

export function resetRedirectFlag() { isRedirectingToLogin = false; }

export const api = {
  get: async (url: string, opts?: { silent?: boolean }) => {
    const ck = url;
    const cached = getCached(ck);
    if (cached) return cached;
    const res = await fetch('/api' + url, { headers: headers(), cache: 'no-store', credentials: 'include' });
    if (!res.ok) throw await parseError(res, opts?.silent);
    const data = await res.json();
    setCache(ck, data);
    return data;
  },
  post: async (url: string, body: any) => {
    const res = await fetch('/api' + url, { method: 'POST', headers: headers(), cache: 'no-store', body: JSON.stringify(body), credentials: 'include' });
    if (!res.ok) throw await parseError(res);
    invalidateRelated(url);
    return res.json();
  },
  put: async (url: string, body: any) => {
    const res = await fetch('/api' + url, { method: 'PUT', headers: headers(), cache: 'no-store', body: JSON.stringify(body), credentials: 'include' });
    if (!res.ok) throw await parseError(res);
    invalidateRelated(url);
    return res.json();
  },
  del: async (url: string, body?: any) => {
    const res = await fetch('/api' + url, { method: 'DELETE', headers: headers(), cache: 'no-store', credentials: 'include', ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!res.ok) throw await parseError(res);
    invalidateRelated(url);
    return res.json();
  },
  upload: async (url: string, formData: FormData) => {
    const res = await fetch('/api' + url, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    if (!res.ok) throw await parseError(res);
    invalidateRelated(url);
    return res.json();
  },
};
