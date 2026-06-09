import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { GlassCard } from '../../components/GlassCard';
import { PageHeader } from '../../components/PageHeader';
import { api } from '../../lib/api';
import { Clock, FileText, ChevronLeft, ChevronRight, Filter, Loader2 } from 'lucide-react';

export default function StoreLogsPage() {
  const { storeId } = useParams();
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [storeName, setStoreName] = useState('');
  const [filterStore, setFilterStore] = useState(storeId || '');
  const [stores, setStores] = useState<any[]>([]);
  const pageSize = 20;

  useEffect(() => {
    api.get('/stores').then((d) => setStores(d.stores || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (storeId) { setFilterStore(storeId); }
  }, [storeId]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterStore) params.set('storeId', filterStore);
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    api.get('/logs?' + params.toString()).then((d) => { setLogs(d.logs || []); setTotal(d.total || 0); setLoading(false); }).catch(() => setLoading(false));
    if (filterStore) api.get('/stores/' + filterStore).then((d) => setStoreName(d.name || d.store?.name || '')).catch(() => setStoreName(''));
    else setStoreName('');
  }, [filterStore, page]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <PageHeader title={"操作日志"} subtitle={storeName || "全部门店"} />

      {!storeId && stores.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto">
          <Filter className="h-4 w-4 shrink-0 text-slate-400" />
          <button onClick={() => { setFilterStore(''); setPage(1); }}
            className={'shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ' + (!filterStore ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
            {"全部"}
          </button>
          {stores.map((s: any) => (
            <button key={s.id} onClick={() => { setFilterStore(String(s.id)); setPage(1); }}
              className={'shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ' + (filterStore === String(s.id) ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
              {s.name}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-indigo-500" /></div>
      ) : logs.length === 0 ? (
        <GlassCard className="py-12 text-center text-sm text-slate-400">
          <FileText className="mx-auto mb-2 h-8 w-8" />{"暂无日志记录"}
        </GlassCard>
      ) : (
        <GlassCard className="divide-y divide-slate-100">
          {logs.map((log: any) => (
            <div key={log.id} className="flex items-start gap-3 px-4 py-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-50">
                <FileText className="h-4 w-4 text-indigo-500" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-slate-800">
                  <span className="font-medium">{log.user_name}</span>
                  <span className="ml-1 text-slate-500">{log.detail}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{log.created_at}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5">{log.action}</span>
                  {log.store_name && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-indigo-500">{log.store_name}</span>}
                </div>
              </div>
            </div>
          ))}
        </GlassCard>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
            className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-white/30 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-sm text-slate-500">{page} / {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-white/30 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  );
}
