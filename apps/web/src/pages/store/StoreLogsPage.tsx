import { formatMoney } from '../../lib/format';
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { GlassCard } from '../../components/GlassCard';
import { PageHeader } from '../../components/PageHeader';
import { api } from '../../lib/api';
import { Clock, Search, ChevronLeft, ChevronRight, Loader2, TrendingUp, TrendingDown, Store, Users, ClipboardCheck, Wallet, Building, Calendar } from 'lucide-react';
import { Pagination } from '../../components/Pagination';

// Action type config
const ACTION_TYPES: Record<string, { label: string; color: string; bgColor: string; icon: any }> = {
  '记账': { label: '记账', color: 'text-emerald-600', bgColor: 'bg-emerald-50', icon: TrendingUp },
  '开闭店': { label: '开闭店', color: 'text-blue-600', bgColor: 'bg-blue-50', icon: Store },
  '员工': { label: '员工', color: 'text-purple-600', bgColor: 'bg-purple-50', icon: Users },
  '添加员工': { label: '员工', color: 'text-purple-600', bgColor: 'bg-purple-50', icon: Users },
  '修改员工': { label: '员工', color: 'text-purple-600', bgColor: 'bg-purple-50', icon: Users },
  '删除员工': { label: '员工', color: 'text-purple-600', bgColor: 'bg-purple-50', icon: Users },
  '盘点': { label: '盘点', color: 'text-orange-600', bgColor: 'bg-orange-50', icon: ClipboardCheck },
  '工资': { label: '工资', color: 'text-indigo-600', bgColor: 'bg-indigo-50', icon: Wallet },
  '确认工资单': { label: '工资', color: 'text-indigo-600', bgColor: 'bg-indigo-50', icon: Wallet },
  '分红': { label: '分红', color: 'text-indigo-600', bgColor: 'bg-indigo-50', icon: Wallet },
  '归档分红': { label: '分红', color: 'text-indigo-600', bgColor: 'bg-indigo-50', icon: Wallet },
  '创建门店': { label: '门店', color: 'text-slate-600', bgColor: 'bg-slate-100', icon: Building },
  '修改门店': { label: '门店', color: 'text-slate-600', bgColor: 'bg-slate-100', icon: Building },
  '更新股东': { label: '股东', color: 'text-slate-600', bgColor: 'bg-slate-100', icon: Building },
};

// Color bar by action - #26 fix: proper operator precedence with parentheses
function getBarColor(action: string): string {
  if (action.includes('收入')) return 'bg-emerald-400';
  if (action.includes('支出') || (action.includes('记账') && action.includes('支出'))) return 'bg-rose-400';
  if (action.includes('记账')) return 'bg-emerald-400';
  if (action.includes('开') || action.includes('关') || action.includes('闭')) return 'bg-blue-400';
  if (action.includes('员工') || action.includes('股东')) return 'bg-purple-400';
  if (action.includes('盘点') || action.includes('领出') || action.includes('物品')) return 'bg-orange-400';
  if (action.includes('工资') || action.includes('分红')) return 'bg-indigo-400';
  if (action.includes('门店')) return 'bg-slate-400';
  return 'bg-slate-300';
}

function getActionConfig(action: string) {
  if (ACTION_TYPES[action]) return ACTION_TYPES[action];
  for (const key of Object.keys(ACTION_TYPES)) {
    if (action.includes(key)) return ACTION_TYPES[key];
  }
  return { label: action, color: 'text-slate-600', bgColor: 'bg-slate-100', icon: Clock };
}

// Highlight amounts in detail text - #43 fix: direct Chinese instead of String.fromCharCode
function highlightDetail(detail: string) {
  const yen = '¥';
  const cleanDetail = detail.replace(/\s*\[IP:[^\]]*\]\s*$/, '');
  if (cleanDetail.charAt(0) === '{') {
    try {
      const data = JSON.parse(cleanDetail);
      if (data.action === 'modify' && data.before && data.after) {
        return (
          <div style={{display:'flex',flexDirection:'column',gap:'6px'}}>
            <div style={{display:'flex',alignItems:'center',gap:'8px',padding:'6px 10px',borderRadius:'8px',background:'#f0fdf4',fontSize:'12px'}}>
              <span style={{color:'#94a3b8',fontWeight:500,minWidth:'18px'}}>{'原'}</span>
              <span style={{color:'#475569'}}>{data.before.type} {'·'} {data.before.category} <span style={{fontWeight:700,color:'#059669'}}>{yen + formatMoney(data.before.amount)}</span></span>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:'8px',padding:'6px 10px',borderRadius:'8px',background:'#fff1f2',fontSize:'12px'}}>
              <span style={{color:'#e11d48',fontWeight:500,minWidth:'18px'}}>{'改'}</span>
              <span style={{color:'#475569'}}>{data.after.type} {'·'} {data.after.category} <span style={{fontWeight:700,color:'#e11d48'}}>{yen + formatMoney(data.after.amount)}</span></span>
            </div>
          </div>
        );
      }
    } catch (e) { /* not JSON */ }
  }
  const parts = cleanDetail.split(new RegExp('(' + yen + '[0-9,.]+)', 'g'));
  return parts.map(function(part: string, i: number) {
    if (part.charAt(0) === yen) {
      const isExp = cleanDetail.includes('支出') || cleanDetail.includes('删除');
      return <span key={i} style={{fontWeight:700,color:isExp ? '#e11d48' : '#059669'}}>{part}</span>;
    }
    return <span key={i}>{part}</span>;
  });
}

const DATE_PRESETS = [
  { label: '今天', value: 'today' },
  { label: '这周', value: 'week' },
  { label: '这月', value: 'month' },
  { label: '全部', value: 'all' },
];

function getPresetDates(preset: string) {
  const now = new Date();
  const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  if (preset === 'today') return { dateFrom: today, dateTo: today };
  if (preset === 'week') {
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay() + 1);
    return { dateFrom: start.getFullYear() + '-' + String(start.getMonth() + 1).padStart(2, '0') + '-' + String(start.getDate()).padStart(2, '0'), dateTo: today };
  }
  if (preset === 'month') {
    return { dateFrom: now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-01', dateTo: today };
  }
  return { dateFrom: '', dateTo: '' };
}

export default function StoreLogsPage() {
  const { storeId } = useParams();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [preset, setPreset] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterStore, setFilterStore] = useState('');
  const [stores, setStores] = useState<any[]>([]);

  useEffect(() => {
    if (!storeId) {
      api.get('/stores').then((d: any) => setStores(d.stores || (Array.isArray(d) ? d : []))).catch(() => {});
    }
  }, [storeId]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    if (search) params.set('search', search);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    if (!storeId && filterStore) params.set('storeId', filterStore);
    
    const url = storeId ? '/logs?storeId=' + storeId + '&' + params.toString() : '/logs?' + params.toString();
    api.get(url)
      .then((d: any) => { setLogs(d.logs || d.data || []); setTotal(d.total || 0); })
      .catch(() => { setLogs([]); setTotal(0); })
      .finally(() => setLoading(false));
  }, [storeId, page, pageSize, search, dateFrom, dateTo, filterStore]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const handlePreset = (p: string) => {
    setPreset(p);
    const dates = getPresetDates(p);
    setDateFrom(dates.dateFrom);
    setDateTo(dates.dateTo);
    setPage(1);
  };

  const handleSearch = () => {
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <PageHeader title="操作日志" subtitle="查看操作记录" />

      <div className="space-y-3">
        {/* Date presets */}
        <div className="flex flex-wrap gap-2">
          {DATE_PRESETS.map(p => (
            <button key={p.value} onClick={() => handlePreset(p.value)}
              className={'rounded-lg px-3 py-1.5 text-xs font-medium transition-all ' +
                (preset === p.value ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-100')}>
              {p.label}
            </button>
          ))}
          <div className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
            <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPreset(''); setPage(1); }}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none" />
            <span className="text-xs text-slate-400">至</span>
            <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPreset(''); setPage(1); }}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none" />
          </div>
        </div>

        {/* Search */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="搜索日志..."
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
          </div>
          <button onClick={handleSearch} className="rounded-lg bg-indigo-500 px-3 py-1.5 text-xs text-white hover:bg-indigo-600">
            搜索
          </button>
        </div>

        {/* Store filter */}
        {!storeId && stores.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => { setFilterStore(''); setPage(1); }}
              className={'rounded-lg px-2.5 py-1 text-xs font-medium transition-all ' +
                (!filterStore ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-100')}>
              全部门店
            </button>
            {stores.map((s: any) => (
              <button key={s.id} onClick={() => { setFilterStore(String(s.id)); setPage(1); }}
                className={'rounded-lg px-2.5 py-1 text-xs font-medium transition-all ' +
                  (filterStore === String(s.id) ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-100')}>
                {s.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Log list */}
      {loading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-indigo-500" /></div>
      ) : logs.length === 0 ? (
        <GlassCard className="py-12 text-center text-sm text-slate-400">
          <ClipboardCheck className="mx-auto mb-2 h-8 w-8" />暂无日志记录
        </GlassCard>
      ) : (
        <div className="space-y-2">
          {logs.map((log: any) => {
            const config = getActionConfig(log.action);
            const Icon = config.icon;
            const barColor = getBarColor(log.action);

            return (
              <GlassCard key={log.id} className="relative overflow-hidden p-0">
                <div className={'absolute left-0 top-0 bottom-0 w-1 ' + barColor} />
                <div className="flex items-start gap-3 pl-4 pr-4 py-3">
                  <div className={'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ' + config.bgColor}>
                    <Icon className={'h-4 w-4 ' + config.color} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={'rounded-full px-2 py-0.5 text-xs font-medium ' + config.bgColor + ' ' + config.color}>
                        {config.label}
                      </span>
                      {log.store_name && (
                        <span className="text-xs text-slate-400">{log.store_name}</span>
                      )}
                    </div>
                    <div className="mt-1.5 text-sm text-slate-700 leading-relaxed">
                      {highlightDetail(log.detail)}
                    </div>
                    <div className="mt-1.5 flex items-center gap-3 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {log.user_name}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {log.created_at}
                      </span>
                    </div>
                  </div>
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      <Pagination
        total={total}
        page={page}
        pageSize={pageSize}
        pageSizeOptions={[10, 20, 50]}
        onChange={setPage}
        onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
      />
    </div>
  );
}