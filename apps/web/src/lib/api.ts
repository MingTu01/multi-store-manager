const token = () => localStorage.getItem('token');
const headers = () => ({ Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' });
export const api = {
  get: (url: string) => fetch('/api' + url, { headers: headers() }).then(r => { if (!r.ok) throw new Error('请求失败'); return r.json(); }),
  post: (url: string, body: any) => fetch('/api' + url, { method: 'POST', headers: headers(), body: JSON.stringify(body) }).then(r => { if (!r.ok) throw new Error('请求失败'); return r.json(); }),
  put: (url: string, body: any) => fetch('/api' + url, { method: 'PUT', headers: headers(), body: JSON.stringify(body) }).then(r => { if (!r.ok) throw new Error('请求失败'); return r.json(); }),
  del: (url: string, body?: any) => fetch('/api' + url, { method: 'DELETE', headers: headers(), ...(body ? { body: JSON.stringify(body) } : {}) }).then(r => { if (!r.ok) throw new Error('请求失败'); return r.json(); }),
};