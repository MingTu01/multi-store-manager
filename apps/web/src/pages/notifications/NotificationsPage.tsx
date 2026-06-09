import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { GlassCard } from '../../components/GlassCard';
import { PageHeader } from '../../components/PageHeader';
import { Bell, CheckCircle, AlertCircle, Info, ChevronLeft, ChevronRight } from 'lucide-react';

export default function NotificationsPage() {
  const [list, setList] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  useEffect(() => {
    api.get('/notifications?page=' + page + '&pageSize=' + pageSize).then((d) => {
      setList(d.notifications || []);
      setTotal(d.total || 0);
    }).catch(() => {});
  }, [page]);

  const markRead = async (id: number) => {
    await api.put('/notifications/' + id + '/read', {});
    setList((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const icon = (type: string) => {
    if (type === 'success') return <CheckCircle className="h-4 w-4 text-emerald-500" />;
    if (type === 'warning' || type === 'alert') return <AlertCircle className="h-4 w-4 text-amber-500" />;
    return <Info className="h-4 w-4 text-blue-500" />;
  };

  return (
    <div className="space-y-4">
      <PageHeader title="消息通知" subtitle={'共 ' + total + ' 条'} />
      {list.length === 0 ? (
        <GlassCard className="py-12 text-center text-sm text-slate-400">
          <Bell className="mx-auto mb-2 h-8 w-8" />暂无通知
        </GlassCard>
      ) : (
        <GlassCard className="divide-y divide-slate-100">
          {list.map((n) => (
            <div key={n.id} onClick={() => !n.read && markRead(n.id)}
              className={'flex items-start gap-3 px-4 py-3 transition-colors ' + (n.read ? '' : 'bg-indigo-50/30 cursor-pointer')}>
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100">
                {icon(n.type)}
              </div>
              <div className="min-w-0 flex-1">
                <div className={'text-sm ' + (n.read ? 'text-slate-600' : 'font-medium text-slate-900')}>{n.title || n.message}</div>
                {n.detail && <div className="mt-0.5 text-xs text-slate-400">{n.detail}</div>}
                <div className="mt-1 text-xs text-slate-400">{n.created_at}</div>
              </div>
              {!n.read && <div className="mt-2 h-2 w-2 rounded-full bg-indigo-500" />}
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
