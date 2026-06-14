import { useState } from 'react';

export function MoneyDisplay({ value, className = '' }: { value: number; className?: string }) {
  const [full, setFull] = useState(false);
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  let display: string;
  if (!full && abs >= 10000) {
    display = sign + (abs / 10000).toFixed(2) + '万';
  } else {
    display = sign + abs.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return (
    <span className={'font-bold tracking-wide cursor-pointer ' + className} onClick={() => setFull(f => !f)} title="点击切换显示">
      {display}
    </span>
  );
}

export function formatMoney(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 10000) return sign + (abs / 10000).toFixed(2) + '万';
  return sign + abs.toFixed(2);
}

export function formatDate(d: string | Date): string {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export function formatTime(d: string | Date): string {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}