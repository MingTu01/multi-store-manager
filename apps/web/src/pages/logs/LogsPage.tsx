import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { GlassCard } from '../../components/GlassCard';
import { PageHeader } from '../../components/PageHeader';
import { api } from '../../lib/api';
import { Clock, FileText, ChevronLeft, ChevronRight } from 'lucide-react';

export default function LogsPage() {
  const { storeId } = useParams();
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [storeName, setStoreName] = useState('');
  const pageSize = 20;

  useEffect(() => {
    const params = new URLSearchParams();
    if (storeId) params.set('storeId', storeId);
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    api.get('/logs?' + params.toString()).then((d) => { setLogs(d.logs || []); setTotal(d.total || 0); });
    if (storeId) api.get('/stores/' + storeId).then((d) => setStoreName(d.name || d.store?.name || ''));
  }, [storeId, page]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <PageHeader title="操作日志" subtitle={storeName || '全部门店'} />
      {logs.length === 0 ? (
        <GlassCard className="py-12 text-center text-sm text-slate-400">暂无日志记录</GlassCard>
      ) : (
        <GlassCard className="divide-y divide-slate-100">
          {logs.map((log) => (
            <div key={log.id} className="flex items-start gap-3 px-4 py-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-50">
                <FileText className="h-4 w-4 text-indigo-500" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-slate-800">
                  <span className="font-medium">{log.user_name}</span>
                  <span className="ml-1 text-slate-500">{log.detail}</span>
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-slate-400">
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{log.created_at}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5">{log.action}</span>
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