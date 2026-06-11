const token = () => localStorage.getItem('token');
const headers = () => ({ Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' });

async function parseError(r: Response): Promise<Error> {
  try {
    const data = await r.json();
    return new Error(data.error || data.message || '请求失败');
  } catch {
    return new Error('请求失败 (' + r.status + ')');
  }
}

export const api = {
  get: (url: string) => fetch('/api' + url, { headers: headers(), cache: 'no-cache' }).then(async r => { if (!r.ok) throw await parseError(r); return r.json(); }),
  post: (url: string, body: any) => fetch('/api' + url, { method: 'POST', headers: headers(), cache: 'no-cache', body: JSON.stringify(body) }).then(async r => { if (!r.ok) throw await parseError(r); return r.json(); }),
  put: (url: string, body: any) => fetch('/api' + url, { method: 'PUT', headers: headers(), cache: 'no-cache', body: JSON.stringify(body) }).then(async r => { if (!r.ok) throw await parseError(r); return r.json(); }),
  del: (url: string, body?: any) => fetch('/api' + url, { method: 'DELETE', headers: headers(), cache: 'no-cache', ...(body ? { body: JSON.stringify(body) } : {}) }).then(async r => { if (!r.ok) throw await parseError(r); return r.json(); }),
};