import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { GlassCard } from '../../components/GlassCard';
import { PageHeader } from '../../components/PageHeader';
import { Modal } from '../../components/Modal';
import { FloatingActionButton } from '../../components/FloatingActionButton';
import { useStore } from '../../stores/data';
import { Plus, Edit3, Trash2, Camera, Loader2, Phone, MapPin, Shield, Upload, Eye, Calendar, BadgeCheck, XCircle, AlertTriangle } from 'lucide-react';
import { compressImage } from '../../lib/image';

const roles = [
  { value: 'STORE_ADMIN', label: '店铺管理员' },
  { value: 'STAFF', label: '员工' },
  { value: 'MANAGER', label: '店长' },
  { value: 'SHAREHOLDER', label: '股东' },
];

const statuses = [
  { value: 'active', label: '在职', color: 'bg-emerald-50 text-emerald-600' },
  { value: 'resigned', label: '离职', color: 'bg-slate-100 text-slate-500' },
  { value: 'suspended', label: '停职', color: 'bg-amber-50 text-amber-600' },
];

export default function StoreStaffPage() {
  const { storeId } = useParams();
  const myRole = useStore((s) => s.user?.role);
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', position: '', address: '', monthly_salary: '', role: 'STAFF', password: '', avatar: '', status: 'active' });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [showDetail, setShowDetail] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    if (!storeId) return;
    setLoading(true);
    api.get('/stores/' + storeId + '/staff').then((d) => {
      const list = (d.staff || []).map((s: any) => ({
        ...s,
        position: s.job_title || s.position || '',
        monthly_salary: s.salary ?? s.monthly_salary ?? 0,
      }));
      setStaff(list);
      setLoading(false);
    }).catch(() => setLoading(false));
  };
  useEffect(() => { load(); }, [storeId]);

  const resetForm = () => {
    setForm({ name: '', phone: '', position: '', address: '', monthly_salary: '', role: 'STAFF', password: '', avatar: '', status: 'active' });
    setEditId(null);
  };

  const openCreate = () => { resetForm(); setShowModal(true); };

  const openEdit = (s: any) => {
    setEditId(s.id);
    setForm({
      name: s.name || '',
      phone: s.phone || s.username || '',
      position: s.position || s.job_title || '',
      address: s.address || '',
      monthly_salary: String(s.monthly_salary ?? s.salary ?? ''),
      role: s.role || 'STAFF',
      password: '',
      avatar: s.avatar || '',
      status: s.status || 'active',
    });
    setShowModal(true);
  };

  const handleAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm({ ...form, avatar: reader.result as string });
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!form.name || !form.phone) { alert('请填写姓名和手机号'); return; }
    setSaving(true);
    try {
      const body: any = {
        name: form.name,
        phone: form.phone,
        position: form.position,
        address: form.address,
        monthly_salary: parseFloat(form.monthly_salary) || 0,
        role: form.role,
        avatar: form.avatar,
        status: form.status,
      };
      if (form.password) body.password = form.password;
      if (editId) {
        await api.put('/stores/' + storeId + '/staff/' + editId, body);
      } else {
        await api.post('/stores/' + storeId + '/staff', body);
      }
      setShowModal(false);
      resetForm();
      load();
    } catch (e: any) { alert(e.message || '保存失败'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm('确认删除 ' + name + '？历史记录将保留。')) return;
    setDeleting(id);
    try { await api.del('/stores/' + storeId + '/staff/' + id); load(); }
    catch (e: any) { alert(e.message || '删除失败'); }
    finally { setDeleting(null); }
  };

  const getRoleBadge = (role: string) => {
    const m: Record<string, string> = { ADMIN: 'bg-indigo-50 text-indigo-600', STORE_ADMIN: 'bg-cyan-50 text-cyan-600', MANAGER: 'bg-emerald-50 text-emerald-600', STAFF: 'bg-amber-50 text-amber-600', SHAREHOLDER: 'bg-violet-50 text-violet-600' };
    const lm: Record<string, string> = { ADMIN: '系统管理员', STORE_ADMIN: '店铺管理员', MANAGER: '店长', STAFF: '员工', SHAREHOLDER: '股东' };
    return { color: m[role] || m.STAFF, label: lm[role] || role };
  };

  const getStatusBadge = (status: string) => statuses.find((s) => s.value === status) || statuses[0];
  const canEdit = myRole === 'ADMIN' || myRole === 'STORE_ADMIN' || myRole === 'MANAGER';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PageHeader title="员工管理" />
        {canEdit && (
          <button onClick={openCreate} className="hidden lg:inline-flex items-center gap-1 rounded-xl bg-indigo-500 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-600"><Plus className="h-4 w-4" />添加员工</button>
        )}
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-indigo-500" /></div>
      ) : staff.length === 0 ? (
        <GlassCard className="py-12 text-center text-sm text-slate-400">暂无员工</GlassCard>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {staff.map((s: any) => {
            const role = getRoleBadge(s.role);
            const status = getStatusBadge(s.status);
            const shareholder = s.role === 'SHAREHOLDER';
            return (
              <GlassCard key={s.id} className="p-4 cursor-pointer hover:ring-2 hover:ring-indigo-200 transition-all" onClick={() => setShowDetail(s)}>
                <div className="flex items-start gap-3">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-indigo-100">
                    {s.avatar ? <img src={s.avatar} className="h-full w-full object-cover"  loading="lazy" /> : <span className="text-xl font-bold text-indigo-400">{s.name?.[0] || '?'}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base font-bold text-slate-900 truncate">{s.name}</span>
                      <span className={'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ' + role.color}>{role.label}</span>
                      {s.position && <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-600">{s.position}</span>}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                      {s.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{s.phone}</span>}
                      {s.address && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{s.address}</span>}
                    </div>
                    <div className="mt-1.5">
                      <span className={'rounded-full px-2 py-0.5 text-xs ' + status.color}>{status.label}</span>
                    </div>
                  </div>
                </div>
                {canEdit && !shareholder && (
                  <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-2">
                    <button onClick={() => openEdit(s)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"><Edit3 className="h-3 w-3" />编辑</button>
                    <button onClick={() => handleDelete(s.id, s.name)} disabled={deleting === s.id} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-rose-500 hover:bg-rose-50"><Trash2 className="h-3 w-3" />删除</button>
                  </div>
                )}
                {shareholder && (
                  <div className="mt-3 flex items-center gap-1 border-t border-slate-100 pt-2 text-xs text-slate-400">
                    <Shield className="h-3 w-3" />股东账号，仅可查看
                  </div>
                )}
              </GlassCard>
            );
          })}
        </div>
      )}

      <Modal open={showModal} onClose={() => { setShowModal(false); resetForm(); }} title={editId ? '编辑员工' : '添加员工'} wide>
        <div className="space-y-4">
          <div className="flex items-center justify-center">
            <div className="relative">
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-indigo-100">
                {form.avatar ? <img src={form.avatar} className="h-full w-full object-cover"  loading="lazy" /> : <span className="text-2xl font-bold text-indigo-400">{form.name?.[0] || '?'}</span>}
              </div>
              <button onClick={() => { if (fileRef.current) { fileRef.current.accept = 'image/*'; fileRef.current.click(); } }} className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-indigo-500 text-white shadow-lg"><Camera className="h-3.5 w-3.5" /></button>
              <input ref={fileRef} type="file" onChange={handleAvatar} className="hidden" />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="mb-1 block text-xs text-slate-500">姓名 *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" placeholder="员工姓名" /></div>
            <div><label className="mb-1 block text-xs text-slate-500">手机号 *（登录账号）</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" placeholder="手机号码" /></div>
            <div><label className="mb-1 block text-xs text-slate-500">岗位名称</label><input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" placeholder="如: 店长, 收银" /></div>
            <div><label className="mb-1 block text-xs text-slate-500">月薪</label><input type="number" value={form.monthly_salary} onChange={(e) => setForm({ ...form, monthly_salary: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" placeholder="0" /></div>
          </div>

          <div><label className="mb-1 block text-xs text-slate-500">联系地址（可选）</label><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" placeholder="地址" /></div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-slate-500">角色</label>
              <div className="flex gap-2">{roles.map((r) => (<button key={r.value} onClick={() => setForm({ ...form, role: r.value })} className={'flex-1 rounded-lg py-1.5 text-xs font-medium ' + (form.role === r.value ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-600')}>{r.label}</button>))}</div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">状态</label>
              <div className="flex gap-2">{statuses.map((st) => (<button key={st.value} onClick={() => setForm({ ...form, status: st.value })} className={'flex-1 rounded-lg py-1.5 text-xs font-medium ' + (form.status === st.value ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-600')}>{st.label}</button>))}</div>
            </div>
          </div>

          <div><label className="mb-1 block text-xs text-slate-500">{editId ? '新密码（留空不修改）' : '密码'}</label><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" placeholder={editId ? '留空不修改' : '设置密码'} /></div>

          <button onClick={handleSave} disabled={saving} className="btn w-full disabled:opacity-50">{saving ? '保存中..' : '保存'}</button>
        </div>
      </Modal>

      
      {/* Employee Detail Modal */}
      <Modal open={!!showDetail} onClose={() => setShowDetail(null)} title="员工详情" wide>
        {showDetail && (
          <div className="space-y-4">
            {/* Avatar and basic info */}
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-indigo-100">
                {showDetail.avatar ? <img src={showDetail.avatar} className="h-full w-full object-cover"  loading="lazy" /> : <span className="text-2xl font-bold text-indigo-400">{showDetail.name?.[0] || '?'}</span>}
              </div>
              <div>
                <div className="text-xl font-bold text-slate-900">{showDetail.name}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-indigo-50 text-indigo-600">{showDetail.position || showDetail.job_title || '未设置岗位'}</span>
                  <span className={'rounded-full px-2 py-0.5 text-xs ' + (showDetail.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500')}>{showDetail.status === 'active' ? '在职' : showDetail.status === 'resigned' ? '离职' : '停职'}</span>
                </div>
              </div>
            </div>

            {/* Contact info */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                <div className="text-[10px] text-slate-400 mb-0.5">手机号</div>
                <div className="text-sm font-medium text-slate-800">{showDetail.phone || showDetail.username || '未设置'}</div>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                <div className="text-[10px] text-slate-400 mb-0.5">月薪资</div>
                <div className="text-sm font-medium text-slate-800">¥{Number(showDetail.salary || showDetail.monthly_salary || 0).toLocaleString()}</div>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                <div className="text-[10px] text-slate-400 mb-0.5">角色</div>
                <div className="text-sm font-medium text-slate-800">{({ADMIN:'系统管理员',STORE_ADMIN:'店铺管理员',MANAGER:'店长',STAFF:'员工',SHAREHOLDER:'股东'} as Record<string,string>)[showDetail.role] || showDetail.role}</div>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                <div className="text-[10px] text-slate-400 mb-0.5">入职时间</div>
                <div className="text-sm font-medium text-slate-800">{showDetail.created_at ? showDetail.created_at.split(' ')[0] : '未记录'}</div>
              </div>
            </div>
            {showDetail.address && (
              <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                <div className="text-[10px] text-slate-400 mb-0.5">联系地址</div>
                <div className="text-sm font-medium text-slate-800">{showDetail.address}</div>
              </div>
            )}

            {/* Health cert section */}
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2 mb-3">
                <BadgeCheck className="h-4 w-4 text-indigo-500" />
                <span className="text-sm font-semibold text-slate-700">健康证</span>
              </div>
              {showDetail.health_cert_url ? (
                <div className="space-y-3">
                  <div className="overflow-hidden rounded-xl">
                    <img src={showDetail.health_cert_url} alt="健康证" className="w-full max-h-48 object-cover rounded-xl bg-slate-50"  loading="lazy" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      <div className="text-[10px] text-slate-400 mb-0.5">姓名</div>
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-medium text-slate-800">{showDetail.health_cert_name || '未识别'}</span>
                        {showDetail.health_cert_verified ? <BadgeCheck className="h-3.5 w-3.5 text-emerald-500" /> : showDetail.health_cert_name ? <XCircle className="h-3.5 w-3.5 text-rose-400" /> : null}
                      </div>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      <div className="text-[10px] text-slate-400 mb-0.5">有效期至</div>
                      <span className={'text-sm font-medium ' + (showDetail.health_cert_expiry && new Date(showDetail.health_cert_expiry) < new Date() ? 'text-rose-600' : 'text-slate-800')}>{showDetail.health_cert_expiry || '未识别'}</span>
                    </div>
                  </div>
                  {showDetail.health_cert_expiry && (() => {
                    const daysLeft = Math.ceil((new Date(showDetail.health_cert_expiry).getTime() - Date.now()) / (1000*60*60*24));
                    if (daysLeft <= 0) return <div className="flex items-center gap-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-700"><AlertTriangle className="h-3.5 w-3.5" />健康证已过期</div>;
                    if (daysLeft <= 30) return <div className="flex items-center gap-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-700"><AlertTriangle className="h-3.5 w-3.5" />健康证将在{daysLeft}天内到期</div>;
                    return null;
                  })()}
                </div>
              ) : (
                <div className="py-4 text-center text-sm text-slate-400">暂未上传健康证</div>
              )}
            </div>

            <button onClick={() => { setShowDetail(null); openEdit(showDetail); }} className="btn w-full">编辑员工</button>
          </div>
        )}
      </Modal>

{canEdit && <FloatingActionButton label="添加员工" onClick={() => setShowModal(true)} />}
    </div>
  );
}