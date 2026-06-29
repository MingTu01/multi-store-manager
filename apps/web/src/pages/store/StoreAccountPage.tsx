import { showToast } from '../../components/Toast';
import { useState, useRef, useEffect } from 'react';
import { useStore } from '../../stores/data';
import { uploadImage, compressToBase64 } from '../../lib/image';
import { ImagePreview } from '../../components/ImagePreview';
import { api } from '../../lib/api';
import { GlassCard } from '../../components/GlassCard';
import { PageHeader } from '../../components/PageHeader';
import { PushSettingsButton } from '../../components/PushSettingsButton';
import { Modal } from '../../components/Modal';
import { User, Phone, MapPin, Shield, Camera, Lock, Save, LogOut, Upload, FileCheck, AlertTriangle, CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react';

import { getRoleLabel, getRoleBg, getRoleColor } from '../../lib/role';

export default function StoreAccountPage() {
  const user = useStore((s) => s.user);
  const logout = useStore((s) => s.logout);
  // msg state removed - using showToast
  const [showPwd, setShowPwd] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [pwdForm, setPwdForm] = useState({ oldPassword: '', newPassword: '', confirm: '' });
  const [profileForm, setProfileForm] = useState({ phone: (user as any)?.phone || '', address: (user as any)?.address || '' });
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const avatarCameraRef = useRef<HTMLInputElement>(null);

  // 健康证状态
  const [healthCert, setHealthCert] = useState<{ url: string; name: string; expiry: string; verified: boolean } | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<'idle'|'uploading'|'recognizing'|'done'>('idle');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showImageZoom, setShowImageZoom] = useState(false);
  const [ocrResult, setOcrResult] = useState<{ name: string; expiry: string; match: boolean; examDate?: string } | null>(null);
  const [manualEdit, setManualEdit] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualDate, setManualDate] = useState('');
  const [showOcrConfirm, setShowOcrConfirm] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState('');
  const healthFileRef = useRef<HTMLInputElement>(null);
  const healthCameraRef = useRef<HTMLInputElement>(null);

  const showMsg = (ok: boolean, text: string) => { showToast(text, ok ? 'success' : 'error'); };

  useEffect(() => {
    api.get('/health-cert').then((d: any) => {
      if (d.cert) setHealthCert(d.cert);
    }).catch(() => {});
  }, []);

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      if (profileForm.phone && !/^1[3-9]\d{9}$/.test(profileForm.phone)) { showToast('手机号格式不正确', 'error'); return; }
      const d: any = await api.put('/auth/me', profileForm);
      if (d.user) useStore.setState({ user: { ...user!, ...d.user } });
      showMsg(true, d.message || '信息已更新');
      setShowProfile(false);
    } catch (e: any) { showMsg(false, e.message || '更新失败'); }
    finally { setSaving(false); }
  };

  const handleChangePwd = async () => {
    if (!pwdForm.oldPassword || !pwdForm.newPassword) { showMsg(false, '请填写完整'); return; }
    if (pwdForm.newPassword !== pwdForm.confirm) { showMsg(false, '两次密码不一致'); return; }
    setSaving(true);
    try {
      const d: any = await api.put('/auth/me', { oldPassword: pwdForm.oldPassword, newPassword: pwdForm.newPassword });
      showMsg(true, d.message || '密码修改成功');
      setShowPwd(false); setPwdForm({ oldPassword: '', newPassword: '', confirm: '' });
    } catch (e: any) { showMsg(false, e.message || '修改失败'); }
    finally { setSaving(false); }
  };

  const handleAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadImage(file, api, 'avatars');
      const d = await api.put('/auth/me', { avatar: url });
      if (d.user) useStore.setState({ user: { ...user!, ...d.user } });
      showMsg(true, '头像已更新');
    } catch (err) { showMsg(false, '头像更新失败'); }
  };

  // 健康证上传 + OCR
  const handleHealthUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setShowUploadModal(false);
    setHealthLoading(true);
    setUploadPhase("uploading");
    try {
      const fd = new FormData(); fd.append('file', file);
      const uploadRes: any = await api.upload('/health-cert/upload', fd);
      if (!uploadRes.url) throw new Error('上传失败');
      setUploadedUrl(uploadRes.url);
      setUploadPhase("recognizing");
      const ocrRes: any = await api.post('/health-cert/ocr', { url: uploadRes.url });
      setOcrResult({
        name: ocrRes.ocrName || ocrRes.name || '',
        expiry: ocrRes.realExpiry || ocrRes.expiry || '',
        examDate: ocrRes.ocrExpiry || '',
        match: ocrRes.match || false,
      });
      setUploadPhase("done");
      setShowOcrConfirm(true);
    } catch (err: any) {
      showMsg(false, err.message || '健康证上传失败');
      setUploadPhase("idle");
    } finally {
      setHealthLoading(false);
      if (e.target) e.target.value = '';
    }
  };

  const confirmHealthCert = async () => {
    const finalName = manualEdit ? manualName : (ocrResult?.name || '');
    const rawDate = manualEdit ? manualDate : (ocrResult?.expiry || '');
    if (!finalName && !rawDate) { showToast('请填写姓名或日期', 'error'); return; }
    // 手动输入时：体检日期 +1 年 = 有效期
    let finalDate = rawDate;
    if (manualEdit && rawDate) {
      const d = new Date(rawDate);
      d.setFullYear(d.getFullYear() + 1);
      finalDate = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    const isVerified = manualEdit ? (manualName === (user?.name || '')) : !!(ocrResult?.match);
    setSaving(true);
    try {
      await api.put('/health-cert/save', {
        url: uploadedUrl,
        name: finalName,
        expiry: finalDate,
        verified: isVerified,
      });
      setHealthCert({ url: uploadedUrl || '', name: finalName, expiry: finalDate, verified: isVerified });
      setShowOcrConfirm(false);
      setOcrResult(null);
      setManualEdit(false);
      setManualName('');
      setManualDate('');
      showToast('健康证已保存', 'success');
    } catch (err: any) {
      showToast(err.message || '保存失败', 'error');
    } finally { setSaving(false); }
  };

  const isExpiringSoon = (expiry: string) => {
    if (!expiry) return false;
    const diff = new Date(expiry).getTime() - Date.now();
    return diff > 0 && diff < 30 * 24 * 60 * 60 * 1000;
  };

  const isExpired = (expiry: string) => {
    if (!expiry) return false;
    return new Date(expiry).getTime() < Date.now();
  };

  const inputCls = 'w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm outline-none transition-all focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100';

  return (
    <div className="flex flex-col min-h-[calc(100vh-10rem)] space-y-4">
      <PageHeader title="我的" subtitle="账户信息管理" action={<PushSettingsButton />} />

      <GlassCard className="p-5">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-indigo-100 text-3xl font-bold text-indigo-600 overflow-hidden">
              {(user as any)?.avatar ? <ImagePreview src={(user as any).avatar} className="h-full w-full"><img src={(user as any).avatar} className="h-full w-full object-cover" loading="lazy" /></ImagePreview> : (user?.name?.[0] || '?')}
            </div>
            <button onClick={() => fileRef.current?.click()} className="absolute -bottom-0.5 -right-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-indigo-500 text-white shadow-lg hover:bg-indigo-600">
              <Camera className="h-3.5 w-3.5" />
            </button>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatar} className="hidden" />
          </div>
          <div>
            <div className="text-xl font-bold text-slate-900">{user?.name}</div>
            <div className="text-sm text-slate-500">@{user?.username}</div>
            <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${getRoleBg(user?.role)} ${getRoleColor(user?.role)}`}>{getRoleLabel(user?.role)}</span>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="divide-y divide-slate-100">
        {[
          { icon: User, label: '用户名', value: user?.username },
          { icon: Phone, label: '手机号', value: (user as any)?.phone || '未设置' },
          { icon: MapPin, label: '联系地址', value: (user as any)?.address || '未设置' },
          { icon: Shield, label: '角色', value: getRoleLabel(user?.role) },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-3 px-4 py-3.5">
            <item.icon className="h-4 w-4 text-slate-400" />
            <div className="flex-1 text-sm text-slate-500">{item.label}</div>
            <div className="text-sm font-medium text-slate-800">{item.value}</div>
          </div>
        ))}
      </GlassCard>

      {/* 健康证板块 */}
      <GlassCard className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <FileCheck className="h-5 w-5 text-indigo-500" />
          <h3 className="text-base font-semibold text-slate-900">健康证</h3>
        </div>

        {/* 上传/识别中状态 */}
        {healthLoading && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            <span className="text-sm text-slate-600">{uploadPhase === "uploading" ? "正在上传图片..." : "正在识别健康证..."}</span>
            <span className="text-xs text-slate-400">请稍候，处理完成后会自动弹出确认</span>
          </div>
        )}

        {!healthLoading && healthCert ? (
          <div className="space-y-3">
            {/* 图片展示 — 点击放大弹窗 */}
            <div className="relative overflow-hidden rounded-xl cursor-pointer group" onClick={() => setShowImageZoom(true)}>
              <img src={healthCert.url} alt="健康证" className="w-full h-64 object-cover object-center rounded-xl bg-slate-50 transition-transform group-hover:scale-[1.02]"  loading="lazy" />
              <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-white text-xs bg-black/60 px-2 py-1 rounded-lg">点击放大</span>
              </div>
            </div>

            {/* 识别信息 — 姓名 + 到期日期 */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                <div className="text-[10px] text-slate-400 mb-0.5">识别姓名</div>
                <div className="flex items-center gap-1">
                  <span className="text-sm font-semibold text-slate-800">{healthCert.name || "未识别"}</span>
                  {healthCert.name && (
                    healthCert.verified
                      ? <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                      : <XCircle className="h-3.5 w-3.5 text-rose-400" />
                  )}
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                <div className="text-[10px] text-slate-400 mb-0.5">有效期至</div>
                <span className={"text-sm font-semibold " + (isExpired(healthCert.expiry) ? "text-rose-600" : isExpiringSoon(healthCert.expiry) ? "text-amber-600" : "text-slate-800")}>
                  {healthCert.expiry || "未识别"}
                </span>
              </div>
            </div>

            {/* 过期提醒 */}
            {(isExpired(healthCert.expiry) || isExpiringSoon(healthCert.expiry)) && (
              <div className={"flex items-center gap-2 rounded-xl p-3 text-xs " + (isExpired(healthCert.expiry) ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700")}>
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {isExpired(healthCert.expiry) ? "健康证已过期，请及时更新" : "健康证将在30天内到期，请注意更新"}
              </div>
            )}

            <button onClick={() => setShowUploadModal(true)} disabled={healthLoading}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/80 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              <Upload className="h-4 w-4" />重新上传
            </button>
          </div>
        ) : !healthLoading && (
          <div>
            <div onClick={() => setShowUploadModal(true)} className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 py-8 text-center cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition-all">
              <FileCheck className="mb-2 h-10 w-10 text-slate-300" />
              <p className="text-sm text-slate-400">点击上传健康证</p>
              <p className="text-xs text-slate-300 mt-1">支持拍照或选择文件</p>
            </div>
          </div>
        )}

        <input ref={healthFileRef} type="file" accept="image/*" onChange={handleHealthUpload} className="hidden" />
        <input ref={healthCameraRef} type="file" accept="image/*" capture="environment" onChange={handleHealthUpload} className="hidden" />
      </GlassCard>

      {/* 图片放大弹窗 */}
      <Modal open={showImageZoom} onClose={() => setShowImageZoom(false)} title="健康证">
        <div className="flex items-center justify-center">
          {healthCert?.url && (
            <img src={healthCert.url} alt="健康证" className="max-w-full max-h-[85vh] object-contain rounded-xl cursor-zoom-in" onClick={(e) => { const img = e.currentTarget; if (img.style.transform === 'scale(2)') { img.style.transform = 'scale(1)'; img.style.cursor = 'zoom-in'; } else { img.style.transform = 'scale(2)'; img.style.cursor = 'zoom-out'; } }} />
          )}
        </div>
        {healthCert?.name && (
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <span className="text-slate-500">姓名: </span>
              <span className="font-medium">{healthCert.name}</span>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <span className="text-slate-500">有效期: </span>
              <span className="font-medium">{healthCert.expiry}</span>
            </div>
          </div>
        )}
      </Modal>

      {/* 上传健康证弹窗 */}
      <Modal open={showUploadModal} onClose={() => setShowUploadModal(false)} title="上传健康证">
        <div className="space-y-3">
          <p className="text-sm text-slate-500">请选择上传方式，系统将自动识别姓名和有效期。</p>
          <button onClick={() => healthCameraRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 py-3 text-sm font-medium text-white hover:bg-indigo-600">
            <Camera className="h-5 w-5" />拍照上传
          </button>
          <button onClick={() => healthFileRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Upload className="h-5 w-5" />选择文件
          </button>
          <p className="text-xs text-center text-slate-400">支持 JPG/PNG 格式</p>
        </div>
      </Modal>

      <div className="grid grid-cols-2 gap-3">
        <button onClick={(e) => { e.stopPropagation(); setProfileForm({ phone: (user as any)?.phone || '', address: (user as any)?.address || '' }); setShowProfile(true); }} className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/80 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"><User className="h-4 w-4" />编辑资料</button>
        <button onClick={() => setShowPwd(true)} className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/80 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"><Lock className="h-4 w-4" />修改密码</button>
      </div>

      <div className="flex flex-col items-end justify-end pb-6 gap-3">
        <div className="flex items-center justify-center gap-2 w-full">
          <div className="animate-logo-border h-11 w-11 rounded-xl shrink-0"><img src="/logo.png" alt="Logo" className="h-full w-full rounded-xl object-cover relative z-[1]" /></div>
          <span className="rounded-full bg-gradient-to-r from-indigo-100 to-purple-100 px-4 py-2 text-base font-bold text-white animate-gradient-capsule"><span className="animate-text-gradient">Multi Shop Link</span></span>
        </div>
        <div className="rounded-2xl animate-logo-border p-3 w-full flex items-center justify-center">
          <img src="data:image/png;base64,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" alt="Mingtu" className="w-full max-h-28 object-contain rounded-xl"  loading="lazy" />
        </div>
        <button onClick={logout} className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50/80 py-3 text-sm font-medium text-rose-600 hover:bg-rose-100 transition-all"><LogOut className="h-4 w-4" />退出登录</button>
      </div>

      {/* OCR确认弹窗 */}
      <Modal open={showOcrConfirm} onClose={() => { setShowOcrConfirm(false); setOcrResult(null); }} title="健康证识别结果">
        <div className="space-y-4">
          {uploadedUrl && (
            <div className="overflow-hidden rounded-xl">
              <ImagePreview src={uploadedUrl} className="w-full"><img src={uploadedUrl} alt="健康证预览" className="w-full max-h-48 object-contain rounded-xl bg-slate-50" loading="lazy" /></ImagePreview>
            </div>
          )}
          {/* 识别结果或手动输入 */}
          {manualEdit ? (
            <div className="space-y-3">
              <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-xs text-blue-700 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                识别不准确？请手动输入信息
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">姓名</label>
                <input value={manualName} onChange={e => setManualName(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-300" placeholder="请输入姓名" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">体检日期</label>
                <input type="date" value={manualDate} onChange={e => setManualDate(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-300" />
                {manualDate && (
                  <div className="mt-1 text-xs text-emerald-600">有效期将自动设为：{(() => { const d = new Date(manualDate); d.setFullYear(d.getFullYear() + 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })()}</div>
                )}
              </div>
            </div>
          ) : ocrResult && (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <span className="text-sm text-slate-500">识别姓名</span>
                <span className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-slate-800">{ocrResult.name || "未识别到"}</span>
                  {ocrResult.name && (
                    ocrResult.match
                      ? <span className="flex items-center gap-0.5 text-emerald-600 text-xs"><CheckCircle className="h-3.5 w-3.5" />与账户匹配</span>
                      : <span className="flex items-center gap-0.5 text-rose-600 text-xs"><XCircle className="h-3.5 w-3.5" />与账户不匹配</span>
                  )}
                </span>
              </div>
              {ocrResult.expiry && (
                <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                  <span className="text-sm text-slate-500">有效期至</span>
                  <span className="text-sm font-medium text-slate-800">{ocrResult.expiry}</span>
                </div>
              )}
              {(!ocrResult.name || !ocrResult.expiry || !ocrResult.match) && (
                <button onClick={() => { setManualEdit(true); setManualName(ocrResult.name || ''); setManualDate((ocrResult as any).examDate || ''); }} className="w-full rounded-xl border border-amber-300 bg-amber-50 py-2 text-sm text-amber-700 hover:bg-amber-100">
                  识别不完整？点击手动填写
                </button>
              )}
              {(isExpired(ocrResult.expiry) || isExpiringSoon(ocrResult.expiry)) && (
                <div className={'flex items-center gap-2 rounded-xl p-3 text-xs ' + (isExpired(ocrResult.expiry) ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700')}>
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {isExpired(ocrResult.expiry) ? '该健康证已过期' : '该健康证将在30天内到期'}
                </div>
              )}
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={() => { setShowOcrConfirm(false); setOcrResult(null); }} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">取消</button>
            <button onClick={confirmHealthCert} disabled={saving} className="action-btn btn flex-1 disabled:opacity-50">
              <Save className="mr-1.5 h-4 w-4 inline" />{saving ? '保存中...' : '确认保存'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={showProfile} onClose={() => setShowProfile(false)} title="编辑资料">
        <div className="space-y-4">
          <div><label className="mb-1.5 block text-xs font-medium text-slate-600">手机号</label><input value={profileForm.phone} onChange={e => { const v = e.target.value.replace(/\D/g,'').slice(0,11); setProfileForm(f => ({ ...f, phone: v })); }} className={inputCls} placeholder="请输入11位手机号" maxLength={11} type="tel" inputMode="numeric" pattern="1[3-9]\d{9}" /></div>
          <div><label className="mb-1.5 block text-xs font-medium text-slate-600">联系地址</label><input value={profileForm.address} onChange={e => setProfileForm(f => ({ ...f, address: e.target.value }))} className={inputCls} placeholder="请输入联系地址" /></div>
          <button onClick={handleSaveProfile} disabled={saving} className="action-btn btn w-full disabled:opacity-50"><Save className="mr-1.5 h-4 w-4 inline" />{saving ? '保存中...' : '保存'}</button>
        </div>
      </Modal>

      <Modal open={showPwd} onClose={() => setShowPwd(false)} title="修改密码">
        <div className="space-y-4">
          <div><label className="mb-1.5 block text-xs font-medium text-slate-600">当前密码</label><input type="password" value={pwdForm.oldPassword} onChange={e => setPwdForm(f => ({ ...f, oldPassword: e.target.value }))} className={inputCls} placeholder="请输入当前密码" /></div>
          <div><label className="mb-1.5 block text-xs font-medium text-slate-600">新密码</label><input type="password" value={pwdForm.newPassword} onChange={e => setPwdForm(f => ({ ...f, newPassword: e.target.value }))} className={inputCls} placeholder="请输入新密码" /></div>
          <div><label className="mb-1.5 block text-xs font-medium text-slate-600">确认密码</label><input type="password" value={pwdForm.confirm} onChange={e => setPwdForm(f => ({ ...f, confirm: e.target.value }))} className={inputCls} placeholder="请再次输入新密码" /></div>
          <button onClick={handleChangePwd} disabled={saving} className="action-btn btn w-full disabled:opacity-50"><Lock className="mr-1.5 h-4 w-4 inline" />{saving ? '保存中...' : '确认修改'}</button>
        </div>
      </Modal>
    </div>
  );
}
