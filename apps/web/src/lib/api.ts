const token = () => localStorage.getItem('token');
const headers = () => ({ Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' });

async function parseError(r: Response): Promise<Error> {
  try {
    const data = await r.json();
    if (r.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
      return new Error('\u767B\u5F55\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55');
    }
    return new Error(data.error || data.message || '\u8BF7\u6C42\u5931\u8D25');
  } catch {
    if (r.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return new Error('\u8BF7\u6C42\u5931\u8D25 (' + r.status + ')');
  }
}

export const api = {
  get: (url: string) => fetch('/api' + url, { headers: headers(), cache: 'no-cache' }).then(async r => { if (!r.ok) throw await parseError(r); return r.json(); }),
  post: (url: string, body: any) => fetch('/api' + url, { method: 'POST', headers: headers(), cache: 'no-cache', body: JSON.stringify(body) }).then(async r => { if (!r.ok) throw await parseError(r); return r.json(); }),
  put: (url: string, body: any) => fetch('/api' + url, { method: 'PUT', headers: headers(), cache: 'no-cache', body: JSON.stringify(body) }).then(async r => { if (!r.ok) throw await parseError(r); return r.json(); }),
  del: (url: string, body?: any) => fetch('/api' + url, { method: 'DELETE', headers: headers(), cache: 'no-cache', ...(body ? { body: JSON.stringify(body) } : {}) }).then(async r => { if (!r.ok) throw await parseError(r); return r.json(); }),
};