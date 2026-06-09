import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Lock } from 'lucide-react';

export function StoreGuard({ children }: { children: React.ReactNode }) {
  const { storeId } = useParams();
  const [closed, setClosed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!storeId) return;
    api.get('/stores/' + storeId).then((d) => {
      setClosed(d.is_open === 0);
    }).catch(() => setClosed(false));
  }, [storeId]);

  if (closed === null) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" /></div>;
  if (closed) return (
    <div className="flex h-screen flex-col items-center justify-center bg-slate-50">
      <Lock className="mb-4 h-12 w-12 text-slate-300" />
      <h2 className="text-lg font-semibold text-slate-700">门店已关闭</h2>
      <p className="mt-1 text-sm text-slate-400">请先开店后再操作</p>
    </div>
  );
  return <>{children}</>;
}
