import { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { showToast } from './Toast';
import { api } from '../lib/api';
import { invalidateCache } from '../lib/api';

interface RestScheduleModalProps {
  open: boolean;
  storeId: string;
  date: string;
  onClose: () => void;
  onSuccess: () => void;
}

const LEAVE_TYPES = [
  { value: 'sick', label: '病假' },
  { value: 'personal', label: '事假' },
  { value: 'annual', label: '年假' },
];

export function RestScheduleModal({ open, storeId, date, onClose, onSuccess }: RestScheduleModalProps) {
  const [staff, setStaff] = useState<any[]>([]);
  const [userId, setUserId] = useState<number | ''>('');
  const [type, setType] = useState<'rest' | 'leave'>('rest');
  const [leaveType, setLeaveType] = useState('sick');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !storeId) return;
    setLoading(true);
    api.get('/stores/' + storeId + '/staff').then((d: any) => {
      const list = Array.isArray(d) ? d : (d.data || d.staff || []);
      setStaff(list.filter((s: any) => s.status !== 'disabled' && s.status !== 'inactive'));
    }).catch(() => setStaff([])).finally(() => setLoading(false));
  }, [open, storeId]);

  const reset = () => {
    setUserId('');
    setType('rest');
    setLeaveType('sick');
    setNote('');
  };

  const handleSubmit = async () => {
    if (!userId) {
      showToast('请选择员工', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.post('/stores/' + storeId + '/rest-schedules', {
        user_id: userId,
        date,
        type,
        leave_type: type === 'leave' ? leaveType : '',
        note: note.trim()
      });
      invalidateCache('rest-schedules');
      invalidateCache('calendar');
      showToast('排休成功', 'success');
      reset();
      onSuccess();
    } catch (e: any) {
      showToast(e.message || '排休失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title={`排休 - ${date}`}>
      <div className="space-y-4">
        {loading ? (
          <div className="py-4 text-center text-sm text-slate-400">加载员工列表...</div>
        ) : staff.length === 0 ? (
          <div className="py-4 text-center text-sm text-slate-400">暂无可排休员工</div>
        ) : (
          <>
            <div>
              <label className="mb-1 block text-xs text-slate-500">选择员工</label>
              <select
                value={userId}
                onChange={(e) => setUserId(e.target.value ? Number(e.target.value) : '')}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              >
                <option value="">请选择员工</option>
                {staff.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name || s.username}{s.job_title ? ` (${s.job_title})` : ''}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs text-slate-500">类型</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setType('rest')}
                  className={'flex-1 rounded-xl border py-2 text-sm transition-colors ' + (type === 'rest' ? 'border-indigo-400 bg-indigo-50 text-indigo-600 font-medium' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}
                >
                  全天休
                </button>
                <button
                  onClick={() => setType('leave')}
                  className={'flex-1 rounded-xl border py-2 text-sm transition-colors ' + (type === 'leave' ? 'border-indigo-400 bg-indigo-50 text-indigo-600 font-medium' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}
                >
                  请假
                </button>
              </div>
            </div>

            {type === 'leave' && (
              <div>
                <label className="mb-1 block text-xs text-slate-500">请假类型</label>
                <select
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                >
                  {LEAVE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs text-slate-500">备注（可选）</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="如：调休、特殊原因等"
                rows={2}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none resize-none"
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={saving}
              className="w-full rounded-xl bg-indigo-500 py-2.5 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-50 transition-colors"
            >
              {saving ? '提交中...' : '确认排休'}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
