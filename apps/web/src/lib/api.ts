const token = () => localStorage.getItem('token');
const headers = () => ({ Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' });

async function parseError(r: Response): Promise<Error> {
  try {
    const data = await r.json();
    if (r.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
      return new Error('登录已过期，请重新登录');
    }
    return new Error(data.error || data.message || '请求失败');
  } catch {
    if (r.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return new Error('请求失败 (' + r.status + ')');
  }
}

export const api = {
  get: (url: string) => fetch('/api' + url, { headers: headers(), cache: 'no-cache' }).then(async r => { if (!r.ok) throw await parseError(r); return r.json(); }),
  post: (url: string, body: any) => fetch('/api' + url, { method: 'POST', headers: headers(), cache: 'no-cache', body: JSON.stringify(body) }).then(async r => { if (!r.ok) throw await parseError(r); return r.json(); }),
  put: (url: string, body: any) => fetch('/api' + url, { method: 'PUT', headers: headers(), cache: 'no-cache', body: JSON.stringify(body) }).then(async r => { if (!r.ok) throw await parseError(r); return r.json(); }),
  del: (url: string, body?: any) => fetch('/api' + url, { method: 'DELETE', headers: headers(), cache: 'no-cache', ...(body ? { body: JSON.stringify(body) } : {}) }).then(async r => { if (!r.ok) throw await parseError(r); return r.json(); }),
  upload: async (url: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api' + url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token()! },
      body: formData
    });
    if (!res.ok) throw await parseError(res);
    return res.json();
  },
};
