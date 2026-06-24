import { useState, useEffect } from 'react';
import { Bell, Check } from 'lucide-react';
import { api } from '../lib/api';
import { PushSettingsModal } from './PushSettingsModal';
import { useDataVersion } from '../stores/data-sync';

export function PushSettingsButton() {
  const [open, setOpen] = useState(false);
  const [configured, setConfigured] = useState(false);
  const ver = useDataVersion('notifications');

  const checkStatus = () => {
    api.get('/system/user-notification-settings', { silent: true }).then((d: any) => {
      if (!d || !d.method) { setConfigured(false); return; }
      const hasPushplus = !!d.pushplus_token;
      const hasServerchan = !!d.serverchan_key;
      const hasWecom = !!(d.wecom_corpid && d.wecom_secret);
      setConfigured(hasPushplus || hasServerchan || hasWecom);
    }).catch(() => setConfigured(false));
  };

  useEffect(() => { checkStatus(); }, [ver]);

  return (
    <>
      <button onClick={() => setOpen(true)}
        className={'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-all ' +
          (configured
            ? 'bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100'
            : 'bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200')}>
        <Bell className="h-3.5 w-3.5" />
        推送
        {configured && <Check className="h-3.5 w-3.5 text-emerald-500" />}
      </button>
      <PushSettingsModal open={open} onClose={() => { setOpen(false); checkStatus(); }} />
    </>
  );
}
