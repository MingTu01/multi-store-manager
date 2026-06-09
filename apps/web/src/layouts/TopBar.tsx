import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

export function TopBar({ title, subtitle }: { title?: string; subtitle?: string }) {
  const nav = useNavigate();
  return (
    <div className="flex items-center gap-3 px-4 py-3 lg:hidden">
      <button onClick={() => nav(-1)} className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/60 backdrop-blur-sm">
        <ChevronLeft className="h-5 w-5 text-slate-700" />
      </button>
      {title && (
        <div>
          <h1 className="text-base font-semibold text-slate-900">{title}</h1>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
      )}
    </div>
  );
}
