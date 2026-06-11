import { useState, useEffect, useCallback } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

interface ToastItem { id: number; message: string; type: 'error' | 'success' | 'info'; }

let listeners: Array<(msg: string, type: ToastItem['type']) => void> = [];
let nextId = 0;

export function showToast(message: string, type: ToastItem['type'] = 'error') {
  listeners.forEach(fn => fn(message, type));
}

export function ToastContainer() {
  const [items, setItems] = useState<ToastItem[]>([]);

  const addToast = useCallback((message: string, type: ToastItem['type']) => {
    const id = ++nextId;
    setItems(prev => [...prev.slice(-4), { id, message, type }]);
    setTimeout(() => setItems(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  useEffect(() => {
    listeners.push(addToast);
    return () => { listeners = listeners.filter(fn => fn !== addToast); };
  }, [addToast]);

  if (items.length === 0) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 pointer-events-none w-[90vw] max-w-md">
      {items.map(t => (
        <div key={t.id} className={
          'pointer-events-auto flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium shadow-2xl backdrop-blur-xl animate-slide-down ' +
          (t.type === 'error' ? 'bg-rose-50/95 text-rose-700 border border-rose-200' :
           t.type === 'success' ? 'bg-emerald-50/95 text-emerald-700 border border-emerald-200' :
           'bg-blue-50/95 text-blue-700 border border-blue-200')
        }>
          {t.type === 'error' ? <AlertCircle className="h-4 w-4 shrink-0" /> :
           t.type === 'success' ? <CheckCircle className="h-4 w-4 shrink-0" /> :
           <Info className="h-4 w-4 shrink-0" />}
          <span className="flex-1 break-all">{t.message}</span>
          <button onClick={() => setItems(prev => prev.filter(x => x.id !== t.id))} className="shrink-0 opacity-50 hover:opacity-100">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}