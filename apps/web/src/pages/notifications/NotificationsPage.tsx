import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useNotificationStore } from '../../stores/notification';
import { GlassCard } from '../../components/GlassCard';
import { PageHeader } from '../../components/PageHeader';
import { Bell, CheckCircle, AlertCircle, Info, ChevronLeft, ChevronRight, CheckCheck } from 'lucide-react';
import { Modal } from '../../components/Modal';

const TYPE_FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'entry', label: '记账' },
  { key: 'payroll', label: '工资' },
  { key: 'dividend', label: '分红' },
  { key: 'inventory', label: '盘点' },
  { key: 'staff', label: '员工' },
  { key: 'health_cert', label: '健康证' },
  { key: 'store', label: '门店' },
  { key: 'shift', label: '开闭店' },
];

const TYPE_COLORS: Record<string, string> = {
  entry: 'bg-emerald-50 text-emerald-600',
  payroll: 'bg-indigo-50 text-indigo-600',
  dividend: 'bg-amber-50 text-amber-600',
  inventory: 'bg-orange-50 text-orange-600',
  staff: 'bg-purple-50 text-purple-600',
  health_cert: 'bg-rose-50 text-rose-600',
  store: 'bg-slate-100 text-slate-600',
  shift: 'bg-blue-50 text-blue-600',
};

const TYPE_LABELS: Record<string, string> = {
  entry: '记账',
  payroll: '工资',
  dividend: '分红',
  inventory: '盘点',
  staff: '员工',
  health_cert: '健康证',
  store: '门店',
  shift: '开闭店',
};

export default function NotificationsPage() {
  const [list, setList] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [unread, setUnread] = useState(0);
  const decrementUnread = useNotificationStore((s) => s.decrementUnread);
  const resetUnread = useNotificationStore((s) => s.resetUnread);
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('all');
  const [showDetail, setShowDetail] = useState(false);
  const [detailItem, setDetailItem] = useState<any>(null);
  const pageSize = 20;

  const fetchList = () => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (typeFilter !== 'all') params.set('type', typeFilter);
    api.get('/notifications?' + params.toString()).then((d) => {
      setList(d.notifications || []);
      setTotal(d.total || 0);
      setUnread(d.unread || 0);
    }).catch(() => {});
  };

  useEffect(() => { fetchList(); }, [page, typeFilter]);

  const openDetail = async (n: any) => {
    setDetailItem(n);
    setShowDetail(true);
    if (!n.read) {
      await api.put('/notifications/' + n.id + '/read', {});
      setList((prev) => prev.map((item) => item.id === n.id ? { ...item, read: 1 } : item));
      setUnread((u) => Math.max(0, u - 1));
      decrementUnread();
    }
  };

  const markRead = async (id: number) => {
    await api.put('/notifications/' + id + '/read', {});
    setList((prev) => prev.map((n) => n.id === id ? { ...n, read: 1 } : n));
    setUnread((u) => Math.max(0, u - 1));
    decrementUnread();
  };

  const markAllRead = async () => {
    await api.put('/notifications/read-all', {});
    setList((prev) => prev.map((n) => ({ ...n, read: 1 })));
    setUnread(0);
    resetUnread();
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const icon = (type: string) => {
    if (type === 'entry') return <CheckCircle className="h-4 w-4 text-emerald-500" />;
    if (type === 'payroll' || type === 'dividend') return <Info className="h-4 w-4 text-indigo-500" />;
    if (type === 'inventory' || type === 'health_cert') return <AlertCircle className="h-4 w-4 text-amber-500" />;
    return <Info className="h-4 w-4 text-blue-500" />;
  };

  return (
    <div className="space-y-4">
      <PageHeader title="消息通知" subtitle={'共 ' + total + ' 条，未读 ' + unread + ' 条'} />

      {/* Mark all read button */}
      {unread > 0 && (
        <button onClick={markAllRead}
          className="flex items-center gap-1.5 rounded-xl bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-600 hover:bg-indigo-100 transition-colors">
          <CheckCheck className="h-4 w-4" />全部已读
        </button>
      )}

      {/* Type filter */}
      <div className="flex flex-wrap gap-2">
        {TYPE_FILTERS.map((f) => (
          <button key={f.key} onClick={() => { setTypeFilter(f.key); setPage(1); }}
            className={'rounded-lg px-3 py-1 text-xs font-medium transition-all ' +
              (typeFilter === f.key ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-100')}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Notification list */}
      {list.length === 0 ? (
        <GlassCard className="py-12 text-center text-sm text-slate-400">
          <Bell className="mx-auto mb-2 h-8 w-8" />暂无通知
        </GlassCard>
      ) : (
        <GlassCard className="divide-y divide-slate-100">
          {list.map((n) => (
            <div key={n.id} onClick={() => openDetail(n)}
              className={'flex items-start gap-3 px-4 py-3 transition-colors cursor-pointer ' + (n.read ? 'opacity-70' : 'bg-indigo-50/30')}>
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100">
                {icon(n.type)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={'text-sm ' + (n.read ? 'text-slate-600' : 'font-medium text-slate-900')}>{n.title}</span>
                  <span className={'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ' + (TYPE_COLORS[n.type] || 'bg-slate-100 text-slate-600')}>
                    {TYPE_LABELS[n.type] || n.type}
                  </span>
                  {n.store_name && <span className="shrink-0 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">{n.store_name}</span>}
                </div>
                {n.content && <div className="mt-0.5 text-xs text-slate-500">{n.content}</div>}
                <div className="mt-1 text-xs text-slate-400">{n.created_at}</div>
              </div>
              {!n.read && <div className="mt-2 h-2 w-2 rounded-full bg-indigo-500 shrink-0" />}
            </div>
          ))}
        </GlassCard>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
            className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-white/30 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-sm text-slate-500">{page} / {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-white/30 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
        </div>
      )}
      <Modal open={showDetail} onClose={() => { setShowDetail(false); setDetailItem(null); }} title={detailItem?.title || '通知详情'}>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className={'rounded-full px-2 py-0.5 text-xs font-medium ' + (TYPE_COLORS[detailItem?.type] || 'bg-slate-100 text-slate-600')}>
              {TYPE_LABELS[detailItem?.type] || detailItem?.type}
            </span>
            <span className="text-xs text-slate-400">{detailItem?.created_at}</span>
          </div>
          <div className="rounded-xl bg-slate-50 px-4 py-4 text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{detailItem?.content || '无内容'}</div>
        </div>
      </Modal>
    </div>
  );
}