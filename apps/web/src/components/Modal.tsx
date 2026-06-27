import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;
  return (
    /*
     * 修复 Chrome 点击穿透问题：
     * 不再使用单独的 fixed backdrop div，改为在 overlay 容器上用 ::before 伪元素实现遮罩。
     * 避免 Chrome 的 fixed div elementFromPoint hit-testing 抢占点击事件。
     */
    <div
      className="msl-modal-overlay fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto px-4 py-8"
      onClick={onClose}
    >
      <div
        className={'msl-modal-content relative z-10 max-h-[85vh] w-full overflow-y-auto rounded-2xl bg-white/95 shadow-2xl backdrop-blur-xl my-auto ' + (wide ? 'max-w-2xl' : 'max-w-lg')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/80 px-5 py-3 backdrop-blur-lg rounded-t-2xl">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
