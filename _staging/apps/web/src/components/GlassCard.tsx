import type { ReactNode } from 'react';

export function GlassCard({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={'rounded-2xl border border-white/40 bg-white/60 shadow-lg backdrop-blur-xl ' + className}
    >
      {children}
    </div>
  );
}
