import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

// React 19 安全的 portal 容器
let chartPortalContainer: HTMLDivElement | null = null;
function getChartPortalContainer(): HTMLDivElement {
  if (!chartPortalContainer) {
    chartPortalContainer = document.createElement('div');
    chartPortalContainer.id = 'msl-portal-chart';
    chartPortalContainer.style.cssText = 'position:relative;z-index:9999;';
    document.body.appendChild(chartPortalContainer);
  }
  return chartPortalContainer;
}

interface ChartModalProps {
  children: React.ReactNode;
  title?: string;
  extra?: React.ReactNode;
}

export function ChartModal({ children, title, extra }: ChartModalProps) {
  const [open, setOpen] = useState(false);

  const handleOpen = useCallback(() => { setOpen(true); }, []);
  const handleClose = useCallback(() => {
    try { screen.orientation?.unlock(); } catch {}
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch {}
    setOpen(false);
  }, []);

  // Body scroll lock + mobile landscape
  useEffect(() => {
    if (!open) { document.body.style.overflow = ''; return; }
    document.body.style.overflow = 'hidden';
    if (window.innerWidth < 768) {
      const el = document.documentElement;
      const rfs = el.requestFullscreen || (el as any).webkitRequestFullscreen;
      if (rfs) {
        rfs.call(el).then(() => {
          if (screen.orientation?.lock) {
            screen.orientation.lock('landscape').catch(() => {});
          }
        }).catch(() => {});
      }
    }
    return () => {
      document.body.style.overflow = '';
      try { screen.orientation?.unlock(); } catch {}
      try { if (document.fullscreenElement) document.exitFullscreen(); } catch {}
    };
  }, [open]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, handleClose]);

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  const modal = open ? createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={isMobile ? { background: '#fff' } : { background: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className={isMobile ? 'w-full h-full flex flex-col' : 'bg-white rounded-2xl shadow-2xl max-w-[90vw] max-h-[90vh] w-full flex flex-col overflow-hidden'}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="text-sm font-semibold text-slate-700">{title || '图表详情'}</div>
            {extra}
          </div>
          <button onClick={handleClose} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-slate-100 transition-colors">
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <div style={{ width: '100%', height: isMobile ? '100%' : '70vh', minHeight: 300 }}>
            {children}
          </div>
        </div>
      </div>
    </div>,
    getChartPortalContainer()
  ) : null;

  return (
    <>
      <div onDoubleClick={handleOpen} style={{ cursor: 'pointer' }}>
        {children}
      </div>
      {modal}
    </>
  );
}

export default ChartModal;