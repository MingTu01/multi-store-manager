import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { GlassCard } from '../../components/GlassCard';
import { PageHeader } from '../../components/PageHeader';
import { Modal } from '../../components/Modal';
import { useStore } from '../../stores/data';
import { Plus, Edit3, Trash2, Camera, Upload, Loader2, Phone, MapPin, Shield } from 'lucide-react';

const roles = [
  { value: 'STAFF', label: '员工' },
  { value: 'MANAGER', label: '经理' },
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
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    if (!storeId) return;
    setLoading(true);
    api.get('/stores/' + storeId + '/staff').then((d) => { setStaff(d.staff || []); setLoading(false); }).catch(() => setLoading(false));
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
      phone: s.phone || '',
      position: s.position || '',
      address: s.address || '',
      monthly_salary: String(s.monthly_salary || ''),
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
      const body: any = { ...form, monthly_salary: parseFloat(form.monthly_salary) || 0 };
      if (!body.password) delete body.password;
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
    try {
      await api.del('/stores/' + storeId + '/staff/' + id);
      load();
    } catch (e: any) { alert(e.message || '删除失败'); }
    finally { setDeleting(null); }
  };

  const getRoleBadge = (role: string) => {
    const m: Record<string, string> = { ADMIN: 'bg-indigo-50 text-indigo-600', MANAGER: 'bg-emerald-50 text-emerald-600', STAFF: 'bg-amber-50 text-amber-600', SHAREHOLDER: 'bg-violet-50 text-violet-600' };
    const lm: Record<string, string> = { ADMIN: '管理员', MANAGER: '经理', STAFF: '员工', SHAREHOLDER: '股东' };
    return { color: m[role] || m.STAFF, label: lm[role] || role };
  };

  const getStatusBadge = (status: string) => statuses.find((s) => s.value === status) || statuses[0];

  const isShareholder = (s: any) => s.role === 'SHAREHOLDER';

  return (
    <div className="space-y-4">
      <PageHeader title="员工管理" action={
        <button onClick={openCreate} className="btn text-sm"><Plus className="mr-1 h-4 w-4" />添加员工</button>
      } />

      {loading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-indigo-500" /></div>
      ) : staff.length === 0 ? (
        <GlassCard className="py-12 text-center text-sm text-slate-400">暂无员工</GlassCard>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {staff.map((s: any) => {
            const roleBadge = getRoleBadge(s.role);
            const statusBadge = getStatusBadge(s.status);
            const shareholder = isShareholder(s);
            return (
              <GlassCard key={s.id} className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-indigo-100">
                    {s.avatar ? <img src={s.avatar} className="h-full w-full object-cover" /> : <span className="text-lg font-bold text-indigo-500">{s.name?.[0] || '?'}</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">{s.name}</span>
                      <span className={'rounded-full px-2 py-0.5 text-xs font-medium ' + roleBadge.color}>{roleBadge.label}</span>
                      <span className={'rounded-full px-2 py-0.5 text-xs ' + statusBadge.color}>{statusBadge.label}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                      <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{s.phone}</span>
                      {s.position && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 uppercase">{s.position}</span>}
                    </div>
                    {s.address && <div className="mt-1 flex items-center gap-1 text-xs text-slate-400"><MapPin className="h-3 w-3" />{s.address}</div>}
                  </div>
                </div>
                {!shareholder && (
                  <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-2" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => openEdit(s)} className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100"><Edit3 className="h-3.5 w-3.5" />编辑</button>
                    <button onClick={() => handleDelete(s.id, s.name)} disabled={deleting === s.id} className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-rose-500 hover:bg-rose-50">
                      {deleting === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}删除
                    </button>
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
                {form.avatar ? <img src={form.avatar} className="h-full w-full object-cover" /> : <span className="text-2xl font-bold text-indigo-400">{form.name?.[0] || '?'}</span>}
              </div>
              <button onClick={() => { if (fileRef.current) { fileRef.current.accept = 'image/*'; fileRef.current.click(); } }}
                className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-indigo-500 text-white shadow-lg">
                <Camera className="h-3.5 w-3.5" />
              </button>
              <input ref={fileRef} type="file" onChange={handleAvatar} className="hidden" />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-slate-500">姓名 *</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" placeholder="员工姓名" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">手机号 * (登录账号)</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input" placeholder="手机号码" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">岗位名称</label>
              <input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} className="input" placeholder="如: 店长, 收银" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">月薪</label>
              <input type="number" value={form.monthly_salary} onChange={(e) => setForm({ ...form, monthly_salary: e.target.value })} className="input" placeholder="0" />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-500">联系地址 (可选)</label>
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="input" placeholder="地址" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-slate-500">角色</label>
              <div className="flex gap-2">
                {roles.map((r) => (
                  <button key={r.value} onClick={() => setForm({ ...form, role: r.value })}
                    className={'flex-1 rounded-lg py-1.5 text-xs font-medium ' + (form.role === r.value ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-600')}>
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">状态</label>
              <div className="flex gap-2">
                {statuses.map((st) => (
                  <button key={st.value} onClick={() => setForm({ ...form, status: st.value })}
                    className={'flex-1 rounded-lg py-1.5 text-xs font-medium ' + (form.status === st.value ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-600')}>
                    {st.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-500">{editId ? '新密码 (留空不修改)' : '密码'}</label>
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="input" placeholder={editId ? '留空不修改' : '设置密码'} />
          </div>

          <button onClick={handleSave} disabled={saving} className="btn w-full disabled:opacity-50">{saving ? '保存中..' : '保存'}</button>
        </div>
      </Modal>
    </div>
  );
}
