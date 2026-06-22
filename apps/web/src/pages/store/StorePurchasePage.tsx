import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useDataVersion } from '../../stores/data-sync';
import { api } from '../../lib/api';
import { useStore } from '../../stores/data';
import { GlassCard } from '../../components/GlassCard';
import { ChartModal } from '../../components/ChartModal';
import { PageHeader } from '../../components/PageHeader';
import { Modal } from '../../components/Modal';
import { showToast } from '../../components/Toast';
import { ChevronLeft, ChevronRight, Download, TrendingUp, Package, Pencil, Plus, Trash2, Edit3 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#84cc16'];

export default function StorePurchasePage() {
  const { storeId } = useParams();
  const user = useStore((s) => s.user);
  const isReadonly = user?.role === 'STAFF' || user?.role === 'SHAREHOLDER';
  const dataVersion = useDataVersion('store', storeId);

  const [date, setDate] = useState(new Date());
  const [items, setItems] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showItemManager, setShowItemManager] = useState(false);
  const [addForm, setAddForm] = useState({ name: '' });
  const [editItem, setEditItem] = useState<any>(null);
  const [editForm, setEditForm] = useState({ name: '' });
  const [trend, setTrend] = useState<any>(null);
  const [trendDays, setTrendDays] = useState(7);
  const [activeItems, setActiveItems] = useState<Set<string>>(new Set());
  
  const exportRef = useRef<HTMLDivElement>(null);

  const today = new Date().toISOString().slice(0, 10);
  const dateStr = date.toISOString().slice(0, 10);
  const isToday = dateStr === today;

  const load = () => {
    api.get('/stores/' + storeId + '/purchase?date=' + dateStr).then((d) => {
      setItems(d.items || []);
    }).catch(() => {});
  };

  
  const [weekdayData, setWeekdayData] = useState<any>(null);
  const loadWeekday = () => {
    api.get('/stores/' + storeId + '/purchase/trend?days=60').then((d) => {
      setWeekdayData(d);
    }).catch(() => {});
  };
  const loadTrend = () => {
    api.get('/stores/' + storeId + '/purchase/trend?days=' + trendDays).then((d) => {
      setTrend(d);
    }).catch(() => {});
  };

  useEffect(() => { load(); }, [storeId, dateStr, dataVersion]);
  useEffect(() => { loadTrend(); }, [storeId, trendDays, dataVersion]);
  useEffect(() => { loadWeekday(); }, [storeId, dataVersion]);

  const changeDate = (offset: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + offset);
    setDate(d);
    setEditing(false);
  };

  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { if (editing) return; touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (editing || !touchStart.current) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      if (dx < 0) changeDate(1); else changeDate(-1);
    }
    touchStart.current = null;
  };

  const updateQty = (itemId: number, field: 'morning_qty' | 'afternoon_qty', value: string) => {
    const num = value === '' ? 0 : parseFloat(value) || 0;
    setItems(prev => prev.map(item =>
      item.id === itemId ? { ...item, record: { ...item.record, [field]: num } } : item
    ));
  };

  const handleSave = async () => {
    if (!isToday) { showToast('只能编辑今天的进货数据', 'error'); return; }
    setSaving(true);
    try {
      await api.put('/stores/' + storeId + '/purchase/records', {
        date: dateStr,
        records: items.map(item => ({
          item_id: item.id,
          morning_qty: item.record.morning_qty || 0,
          afternoon_qty: item.record.afternoon_qty || 0
        }))
      });
      showToast('保存成功', 'success');
      setEditing(false);
    } catch (err: any) {
      showToast(err.message || '保存失败', 'error');
    }
    setSaving(false);
  };

  const handleAddItem = async () => {
    if (!addForm.name.trim()) return;
    try {
      await api.post('/stores/' + storeId + '/purchase/items', { name: addForm.name });
      setAddForm({ name: '' });
      load();
    } catch { showToast('添加失败', 'error'); }
  };

  const handleEditItem = async () => {
    if (!editItem || !editForm.name.trim()) return;
    try {
      await api.put('/stores/' + storeId + '/purchase/items/' + editItem.id, { name: editForm.name });
      setEditItem(null);
      load();
    } catch { showToast('修改失败', 'error'); }
  };

  const handleDeleteItem = async (id: number) => {
    if (!confirm('确定删除？该商品的所有历史进货记录也会被删除。')) return;
    try {
      await api.del('/stores/' + storeId + '/purchase/items/' + id);
      load();
    } catch { showToast('删除失败', 'error'); }
  };

  const handleExport = async () => {
    const el = exportRef.current;
    if (!el) { showToast('导出区域不存在', 'error'); return; }
    try {
      const { toPng } = await import('html-to-image');
      const url = await toPng(el, { pixelRatio: 2, backgroundColor: '#f8fafc' });
      const link = document.createElement('a');
      link.download = '进货登记_' + dateStr + '.png';
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('导出成功', 'success');
    } catch (err: any) {
      showToast('导出失败: ' + (err.message || '未知错误'), 'error');
    }
  };

  const toggleItem = (name: string) => {
    setActiveItems(prev => {
      const next = new Set(prev);
      if (next.has(name)) { next.delete(name); } else { next.add(name); }
      return next;
    });
  };
  const getVisibleItems = (allItems: string[]) => {
    if (activeItems.size === 0) return allItems;
    return allItems.filter(n => activeItems.has(n));
  };

  const totalMorning = items.reduce((s, i) => s + (i.record.morning_qty || 0), 0);
  const totalAfternoon = items.reduce((s, i) => s + (i.record.afternoon_qty || 0), 0);
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

  return (
    <div className="space-y-4" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <PageHeader title="进货登记" subtitle={dateStr + ' 周' + weekDays[date.getDay()]} />

      {/* Date Navigation */}
      <div className="flex items-center justify-between">
        <button onClick={() => changeDate(-1)} className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-white/50">
          <ChevronLeft className="h-5 w-5 text-slate-500" />
        </button>
        <span className={'text-sm font-medium ' + (isToday ? 'text-indigo-600' : 'text-slate-600')}>
          {isToday ? '今天' : dateStr}
        </span>
        <button onClick={() => changeDate(1)} className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-white/50">
          <ChevronRight className="h-5 w-5 text-slate-500" />
        </button>
      </div>

      {/* Form */}
      <div>
        <div ref={exportRef}><GlassCard className="p-0 overflow-hidden">
          {/* Title bar */}
          <div className="relative flex items-center px-4 py-3 border-b border-slate-100">
            <span className="absolute left-0 right-0 text-center text-base font-bold text-slate-800 pointer-events-none">进货单</span>
            <div className="ml-auto flex items-center gap-1 relative z-10">
              {isToday && !isReadonly && (
                <button onClick={() => setShowItemManager(true)} className="p-1.5 rounded-lg hover:bg-slate-100" title="管理商品">
                  <Pencil className="h-4 w-4 text-slate-400" />
                </button>
              )}
              <button onClick={handleExport} className="p-1.5 rounded-lg hover:bg-slate-100" title="导出图片">
                <Download className="h-4 w-4 text-slate-400" />
              </button>
            </div>
          </div>

          {/* Table header */}
          <div className="grid grid-cols-[1fr_90px_90px_70px] px-4 py-2 bg-slate-50 text-xs font-medium text-slate-500 border-b border-slate-100">
            <span>名称</span>
            <span className="text-center">上午</span>
            <span className="text-center">下午</span>
            <span className="text-center">合计</span>
          </div>

          {/* Table rows */}
          {items.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">
              <Package className="mx-auto mb-2 h-6 w-6" />
              暂无商品，点右上角笔图标添加
            </div>
          ) : (
            items.map((item, idx) => (
              <div key={item.id}
                className={'grid grid-cols-[1fr_90px_90px_70px] items-center px-4 py-2.5 transition-colors ' + (idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60') + (idx < items.length - 1 ? ' border-b border-slate-100/60' : '')}>
                <span className="text-sm text-slate-800 truncate">{item.name}</span>
                <div className="text-center">
                  {editing ? (
                    <input type="number" min="0" step="1" value={item.record.morning_qty || ''} placeholder="0"
                      onChange={e => updateQty(item.id, 'morning_qty', e.target.value)}
                      className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center text-sm font-medium text-slate-800 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100" />
                  ) : (
                    <span className="text-sm text-slate-700">{item.record.morning_qty || '-'}</span>
                  )}
                </div>
                <div className="text-center">
                  {editing ? (
                    <input type="number" min="0" step="1" value={item.record.afternoon_qty || ''} placeholder="0"
                      onChange={e => updateQty(item.id, 'afternoon_qty', e.target.value)}
                      className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center text-sm outline-none focus:border-indigo-300" />
                  ) : (
                    <span className="text-sm text-slate-700">{item.record.afternoon_qty || '-'}</span>
                  )}
                </div>
                <div className="text-center">
                  <span className="text-sm font-medium text-slate-800">
                    {(item.record.morning_qty || 0) + (item.record.afternoon_qty || 0) || '-'}
                  </span>
                </div>
              </div>
            ))
          )}
        </GlassCard></div>

        {/* Buttons */}
        {isToday && !isReadonly && (
          <div className="mt-3">
            {editing ? (
              <button onClick={handleSave} disabled={saving}
                className="w-full rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-50">
                {saving ? '保存中...' : '保存'}
              </button>
            ) : (
              <button onClick={() => setEditing(true)}
                className="w-full rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-600">
                填写
              </button>
            )}
          </div>
        )}
        {!isToday && (
          <div className="mt-3">
            <button onClick={() => { setDate(new Date()); setEditing(false); }}
              className="w-full rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-200">
              回到今天
            </button>
          </div>
        )}
      </div>

      {/* Trend Charts */}
      {trend && (
        <div className="space-y-4">
          
          {/* Recommended Order */}
          {trend.recommendations && trend.recommendations.length > 0 && (
            <GlassCard className="p-4">
              <div className="text-sm font-semibold text-slate-600 mb-1">
                明日建议订货量
                <span className="text-slate-400 font-normal ml-2">（{trend.tomorrowLabel}历史分析）</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                {trend.recommendations.map((r: any, i: number) => (
                  <div key={i} className="flex items-center justify-between rounded-lg bg-indigo-50/60 border border-indigo-100/50 px-2 py-1.5">
                    <span className="text-sm text-slate-600 truncate">{r.name}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-lg font-bold text-indigo-600">{r.recommended}</span>
                      {r.trend === 'up' && <span className="text-emerald-500">⬆</span>}
                      {r.trend === 'down' && <span className="text-rose-500">⬇</span>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-[10px] text-slate-400">* 基于过去8个{trend.tomorrowLabel}的历史数据推荐</div>
            </GlassCard>
          )}

          {/* Recent 7 Days Trend */}
          {trend.trendData && trend.trendData.length > 0 && (
            <GlassCard className="p-4">
              <div className="flex items-center justify-between mb-3"><div className="text-xs font-semibold text-slate-600">进货趋势</div><div className="flex gap-1">{[7,14,30,60].map(d=>(<button key={d} onClick={()=>setTrendDays(d)} className={'rounded-md px-2 py-0.5 text-[10px] font-medium '+(trendDays===d?'bg-indigo-100 text-indigo-700':'text-slate-400 hover:bg-slate-100')}>{d}天</button>))}</div></div>
              <ChartModal title="进货趋势" extra={<div className="flex gap-1">{[7,14,30,60].map(d=>(<button key={d} onClick={()=>setTrendDays(d)} className={"rounded-md px-2 py-0.5 text-[10px] font-medium "+(trendDays===d?"bg-indigo-100 text-indigo-700":"text-slate-400 hover:bg-slate-100")}>{d}天</button>))}</div>}><ResponsiveContainer width="100%" height={220}>
                <LineChart data={trend.trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={v => v.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} width={40} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend content={<CustomLegend onClick={(name: string) => toggleItem(name)} activeItems={activeItems} />} />
                  {getVisibleItems(weekdayData?.itemNames || trend?.itemNames || []).map((name: string) => (
                    <Line key={name} type="monotone" dataKey={name} stroke={COLORS[(trend.itemNames || []).indexOf(name) % COLORS.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </ChartModal>
</GlassCard>
          )}

          {/* Weekday Average */}
          {weekdayData && weekdayData.weekdayAvg && weekdayData.weekdayAvg.length > 0 && (
            <GlassCard className="p-4">
              <div className="text-xs font-semibold text-slate-600 mb-3">星期均值参考</div>
              <ChartModal title="星期均值参考"><ResponsiveContainer width="100%" height={200}>
                <BarChart data={weekdayData.weekdayAvg}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={40} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend content={<CustomLegend onClick={(name: string) => toggleItem(name)} activeItems={activeItems} />} />
                  {getVisibleItems(weekdayData?.itemNames || []).map((name: string, i: number) => (
                    <Bar key={name} dataKey={name} fill={COLORS[(weekdayData?.itemNames || []).indexOf(name) % COLORS.length]} radius={[4, 4, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </ChartModal>
</GlassCard>
          )}
        </div>
      )}

{/* Item Manager Modal */}
      <Modal open={showItemManager} onClose={() => setShowItemManager(false)} title="管理商品">
        <div className="space-y-3">
          <div className="flex gap-2">
            <input value={addForm.name} onChange={e => setAddForm({ name: e.target.value })} placeholder="输入商品名称"
              className="flex-1 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-indigo-300"
              onKeyDown={e => e.key === 'Enter' && handleAddItem()} />
            <button onClick={handleAddItem}
              className="rounded-xl bg-indigo-500 px-3 py-2 text-sm text-white hover:bg-indigo-600">
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">
            {items.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">暂无商品</div>
            ) : (
              items.map(item => (
                <div key={item.id} className="flex items-center justify-between px-3 py-2.5">
                  <span className="text-sm text-slate-800">{item.name}</span>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditItem(item); setEditForm({ name: item.name }); }}
                      className="p-1.5 rounded-lg hover:bg-slate-100"><Edit3 className="h-3.5 w-3.5 text-slate-400" /></button>
                    <button onClick={() => handleDeleteItem(item.id)}
                      className="p-1.5 rounded-lg hover:bg-slate-100"><Trash2 className="h-3.5 w-3.5 text-rose-400" /></button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </Modal>

      {/* Edit Item Modal */}
      <Modal open={!!editItem} onClose={() => setEditItem(null)} title="编辑商品">
        <div className="space-y-4">
          <input value={editForm.name} onChange={e => setEditForm({ name: e.target.value })}
            className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm outline-none focus:border-indigo-300"
            onKeyDown={e => e.key === 'Enter' && handleEditItem()} />
          <button onClick={handleEditItem} className="w-full rounded-xl bg-indigo-500 py-2.5 text-sm font-medium text-white hover:bg-indigo-600">保存</button>
        </div>
      </Modal>
    </div>
  );
}

function CustomLegend({ payload, onClick, activeItems }: any) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginTop: 8, cursor: 'pointer' }}>
      {(payload || []).map((entry: any, i: number) => {
        const isActive = !activeItems || activeItems.size === 0 || activeItems.has(entry.value);
        return (
          <div key={i} onClick={() => onClick && onClick(entry.value)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, opacity: isActive ? 1 : 0.35, color: isActive ? '#475569' : '#94a3b8' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: isActive ? entry.color : '#cbd5e1' }} />
            <span>{entry.value}</span>
          </div>
        );
      })}
    </div>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[9999] bg-white rounded-xl px-4 py-3 shadow-2xl border border-slate-200 max-w-[280px] pointer-events-none">
      <div className="text-xs font-semibold text-slate-600 mb-2">{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2 text-sm py-0.5">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-500 flex-1">{p.dataKey}</span>
          <span className="font-semibold text-slate-800">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

function HeatmapChart({ data, itemNames }: { data: any[]; itemNames: string[] }) {
  const dates = [...new Set(data.map(d => d.date))].sort();
  const maxVal = Math.max(...data.map(d => d.value), 1);
  const getColor = (v: number) => {
    if (v === 0) return 'bg-slate-50';
    const r = v / maxVal;
    if (r < 0.25) return 'bg-indigo-100';
    if (r < 0.5) return 'bg-indigo-200';
    if (r < 0.75) return 'bg-indigo-400';
    return 'bg-indigo-600';
  };
  const valMap: Record<string, number> = {};
  data.forEach(d => { valMap[d.date + '|' + d.item] = d.value; });
  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full">
        <div className="grid gap-0.5" style={{ gridTemplateColumns: '80px repeat(' + dates.length + ', 1fr)' }}>
          <div />
          {dates.map(d => <div key={d} className="text-center text-[10px] text-slate-400 pb-1">{d.slice(5)}</div>)}
          {itemNames.map(name => (
            <div key={name} className="contents">
              <div className="text-xs text-slate-600 pr-2 flex items-center truncate">{name}</div>
              {dates.map(d => {
                const v = valMap[d + '|' + name] || 0;
                return (
                  <div key={d + '|' + name}
                    className={'h-7 rounded-sm flex items-center justify-center text-[10px] font-medium ' + getColor(v) + (v > maxVal * 0.5 ? ' text-white' : ' text-slate-600')}
                    title={name + ' ' + d + ': ' + v}>{v || ''}</div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function WeekCompareChart({ data }: { data: any[] }) {
  const dayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const grouped: Record<string, { this_week: number; last_week: number }> = {};
  dayNames.forEach(d => { grouped[d] = { this_week: 0, last_week: 0 }; });
  data.forEach((r: any) => {
    const d = new Date(r.date);
    const dayIdx = (d.getDay() + 6) % 7;
    grouped[dayNames[dayIdx]][r.week as 'this_week' | 'last_week'] += r.total;
  });
  const chartData = dayNames.map(d => ({ day: d, ...grouped[d] }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="day" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} width={40} tickLine={false} axisLine={false} />
        <Tooltip content={<CustomTooltip />} />
        <Legend content={<CustomLegend />} />
        <Bar dataKey="last_week" fill="#cbd5e1" name="上周" radius={[4, 4, 0, 0]} />
        <Bar dataKey="this_week" fill="#6366f1" name="本周" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
