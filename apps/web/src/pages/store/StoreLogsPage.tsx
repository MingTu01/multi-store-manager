import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { GlassCard } from '../../components/GlassCard';
import { PageHeader } from '../../components/PageHeader';
import { api } from '../../lib/api';
import { Clock, Search, ChevronLeft, ChevronRight, Loader2, TrendingUp, TrendingDown, Store, Users, ClipboardCheck, Wallet, Building, Calendar } from 'lucide-react';

// Action type config
const ACTION_TYPES: Record<string, { label: string; color: string; bgColor: string; icon: any }> = {
  '记账': { label: '记账', color: 'text-emerald-600', bgColor: 'bg-emerald-50', icon: TrendingUp },
  '开闭店': { label: '开闭店', color: 'text-blue-600', bgColor: 'bg-blue-50', icon: Store },
  '开店': { label: '开闭店', color: 'text-blue-600', bgColor: 'bg-blue-50', icon: Store },
  '关店': { label: '开闭店', color: 'text-blue-600', bgColor: 'bg-blue-50', icon: Store },
  '员工': { label: '员工', color: 'text-purple-600', bgColor: 'bg-purple-50', icon: Users },
  '添加员工': { label: '员工', color: 'text-purple-600', bgColor: 'bg-purple-50', icon: Users },
  '修改员工': { label: '员工', color: 'text-purple-600', bgColor: 'bg-purple-50', icon: Users },
  '删除员工': { label: '员工', color: 'text-purple-600', bgColor: 'bg-purple-50', icon: Users },
  '盘点': { label: '盘点', color: 'text-orange-600', bgColor: 'bg-orange-50', icon: ClipboardCheck },
  '确认工资单': { label: '工资', color: 'text-indigo-600', bgColor: 'bg-indigo-50', icon: Wallet },
  '归档分红': { label: '分红', color: 'text-indigo-600', bgColor: 'bg-indigo-50', icon: Wallet },
  '创建门店': { label: '门店', color: 'text-slate-600', bgColor: 'bg-slate-100', icon: Building },
  '修改门店': { label: '门店', color: 'text-slate-600', bgColor: 'bg-slate-100', icon: Building },
  '更新股东': { label: '股东', color: 'text-slate-600', bgColor: 'bg-slate-100', icon: Building },
};

// Color bar by action
function getBarColor(action: string): string {
  if (action.includes('收入')) return 'bg-emerald-400';
  if (action.includes('支出') || action.includes('记账') && action.includes('支出')) return 'bg-rose-400';
  if (action.includes('记账')) return 'bg-emerald-400';
  if (action.includes('开') || action.includes('关') || action.includes('闭')) return 'bg-blue-400';
  if (action.includes('员工') || action.includes('股东')) return 'bg-purple-400';
  if (action.includes('盘点')) return 'bg-orange-400';
  if (action.includes('工资') || action.includes('分红')) return 'bg-indigo-400';
  if (action.includes('门店')) return 'bg-slate-400';
  return 'bg-slate-300';
}

function getActionConfig(action: string) {
  // Try exact match first
  if (ACTION_TYPES[action]) return ACTION_TYPES[action];
  // Try partial match
  for (const key of Object.keys(ACTION_TYPES)) {
    if (action.includes(key) || key.includes(action)) return ACTION_TYPES[key];
  }
  return { label: action, color: 'text-slate-600', bgColor: 'bg-slate-100', icon: Clock };
}

// Highlight amounts in detail text, handle structured modification logs
function highlightDetail(detail: string) {
  var yen = String.fromCharCode(165);
  if (detail.charAt(0) === '{') {
    try {
      var data = JSON.parse(detail);
      if (data.action === 'modify' && data.before && data.after) {
        return (
          <div style={{display:'flex',flexDirection:'column',gap:'6px'}}>
            <div style={{display:'flex',alignItems:'center',gap:'8px',padding:'6px 10px',borderRadius:'8px',background:'#f0fdf4',fontSize:'12px'}}>
              <span style={{color:'#94a3b8',fontWeight:500,minWidth:'18px'}}>{String.fromCharCode(21407)}</span>
              <span style={{color:'#475569'}}>{data.before.type} {String.fromCharCode(183)} {data.before.category}</span>
              <span style={{marginLeft:'auto',fontWeight:700,color:'#059669'}}>{yen + Number(data.before.amount).toLocaleString()}</span>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:'8px',padding:'6px 10px',borderRadius:'8px',background:'#fff1f2',fontSize:'12px'}}>
              <span style={{color:'#e11d48',fontWeight:500,minWidth:'18px'}}>{String.fromCharCode(25913)}</span>
              <span style={{color:'#475569'}}>{data.after.type} {String.fromCharCode(183)} {data.after.category}</span>
              <span style={{marginLeft:'auto',fontWeight:700,color:'#e11d48'}}>{yen + Number(data.after.amount).toLocaleString()}</span>
            </div>
          </div>
        );
      }
    } catch (e) { /* not JSON */ }
  }
  var parts = detail.split(new RegExp('(' + yen + '[0-9,.]+)', 'g'));
  return parts.map(function(part, i) {
    if (part.charAt(0) === yen) {
      var isExp = detail.indexOf(String.fromCharCode(25903)) >= 0 || detail.indexOf(String.fromCharCode(21024)) >= 0;
      return <span key={i} style={{fontWeight:700,color:isExp ? '#e11d48' : '#059669'}}>{part}</span>;
    }
    return <span key={i}>{part}</span>;
  });
}

var DATE_PRESETS = [
  { label: String.fromCharCode(20170,22825), value: 'today' },
  { label: String.fromCharCode(36825,21608), value: 'week' },
  { label: String.fromCharCode(36825,26376), value: 'month' },
  { label: String.fromCharCode(20840,37096), value: 'all' },
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
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [storeName, setStoreName] = useState('');
  const [filterStore, setFilterStore] = useState(storeId || '');
  const [stores, setStores] = useState<any[]>([]);
  const [actionFilter, setActionFilter] = useState('all');
  const [datePreset, setDatePreset] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  // Action type filter buttons
  const actionFilters = [
    { label: '全部', value: 'all' },
    { label: '记账', value: '记账' },
    { label: '开闭店', value: '开闭店' },
    { label: '员工', value: '员工' },
    { label: '盘点', value: '盘点' },
    { label: '工资', value: '确认工资单' },
    { label: '分红', value: '归档分红' },
  ];

  useEffect(() => {
    api.get('/stores').then((d) => setStores(d.stores || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (storeId) setFilterStore(storeId);
  }, [storeId]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterStore) params.set('storeId', filterStore);
    if (actionFilter !== 'all') params.set('action', actionFilter);

    // Date range
    if (datePreset !== 'all') {
      const dates = getPresetDates(datePreset);
      if (dates.dateFrom) params.set('dateFrom', dates.dateFrom);
      if (dates.dateTo) params.set('dateTo', dates.dateTo);
    } else {
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
    }

    if (search) params.set('search', search);
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));

    api.get('/logs?' + params.toString()).then((d) => {
      if (Array.isArray(d)) {
        setLogs(d);
        setTotal(d.length);
      } else {
        setLogs(d.logs || []);
        setTotal(d.total || 0);
      }
      setLoading(false);
    }).catch(() => setLoading(false));

    if (filterStore) {
      api.get('/stores/' + filterStore).then((d) => setStoreName(d.name || d.store?.name || '')).catch(() => setStoreName(''));
    } else {
      setStoreName('');
    }
  }, [filterStore, actionFilter, datePreset, dateFrom, dateTo, search, page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  const handleDatePreset = (preset: string) => {
    setDatePreset(preset);
    if (preset !== 'all') {
      setDateFrom('');
      setDateTo('');
    }
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <PageHeader title="操作日志" subtitle={storeName || '全部门店'} />

      {/* Filters */}
      <div className="space-y-3">
        {/* Action type filter */}
        <div className="flex flex-wrap gap-2">
          {actionFilters.map((af) => (
            <button key={af.value} onClick={() => { setActionFilter(af.value); setPage(1); }}
              className={'rounded-full px-3 py-1.5 text-xs font-medium transition-all ' +
                (actionFilter === af.value ? 'bg-indigo-500 text-white shadow-sm' : 'bg-white/60 text-slate-600 hover:bg-white/80 border border-slate-200')}>
              {af.label}
            </button>
          ))}
        </div>

        {/* Date + Search row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Date presets */}
          <div className="flex items-center gap-1">
            <Calendar className="h-4 w-4 text-slate-400" />
            {DATE_PRESETS.map((dp) => (
              <button key={dp.value} onClick={() => handleDatePreset(dp.value)}
                className={'rounded-lg px-2.5 py-1 text-xs font-medium transition-all ' +
                  (datePreset === dp.value ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-100')}>
                {dp.label}
              </button>
            ))}
          </div>

          {/* Custom date range */}
          {datePreset === 'all' && (
            <div className="flex items-center gap-1">
              <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-indigo-300" />
              <span className="text-xs text-slate-400">至</span>
              <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-indigo-300" />
            </div>
          )}

          {/* Search */}
          <div className="flex items-center gap-1 ml-auto">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="搜索日志..."
                className="w-40 rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs outline-none focus:border-indigo-300"
              />
            </div>
            <button onClick={handleSearch} className="rounded-lg bg-indigo-500 px-3 py-1.5 text-xs text-white hover:bg-indigo-600">
              搜索
            </button>
          </div>
        </div>

        {/* Store filter (only show if not in store context) */}
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
                {/* Left color bar */}
                <div className={'absolute left-0 top-0 bottom-0 w-1 ' + barColor} />

                <div className="flex items-start gap-3 pl-4 pr-4 py-3">
                  {/* Icon */}
                  <div className={'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ' + config.bgColor}>
                    <Icon className={'h-4 w-4 ' + config.color} />
                  </div>

                  {/* Content */}
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
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/60 px-4 py-2.5 text-xs text-slate-500 backdrop-blur-sm">
        <span>共 {total} 条</span>
        <div className="flex items-center gap-2">
          <span>每页</span>
          <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none">
            <option value={10}>10</option><option value={20}>20</option><option value={50}>50</option>
          </select>
          <span>条</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
            className="rounded px-2 py-1 hover:bg-slate-100 disabled:opacity-30">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span>{page} / {totalPages}</span>
          <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}
            className="rounded px-2 py-1 hover:bg-slate-100 disabled:opacity-30">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}