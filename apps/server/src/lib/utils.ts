// 公共工具函数，消除重复定义

export function localDate(d?: Date): string {
  const dt = d || new Date();
  return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
}

export function localDateTime(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 19).replace('T', ' ');
}

export function formatMoney(amount: number): string {
  if (amount >= 10000) {
    return (amount / 10000).toFixed(2) + '\u4E07';
  }
  return amount.toFixed(2);
}