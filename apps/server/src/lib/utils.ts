export function localDate(d?: Date): string {
  const dt = d || new Date();
  const offset = 8 * 60;
  const local = new Date(dt.getTime() + (offset + dt.getTimezoneOffset()) * 60 * 1000);
  return local.getFullYear() + '-' + String(local.getMonth() + 1).padStart(2, '0') + '-' + String(local.getDate()).padStart(2, '0');
}

export function localDateTime(): string {
  const now = new Date();
  const offset = 8 * 60;
  const local = new Date(now.getTime() + (offset + now.getTimezoneOffset()) * 60 * 1000);
  return local.toISOString().slice(0, 19).replace('T', ' ');
}

export function formatMoney(amount: number): string {
  if (amount >= 10000) {
    return (amount / 10000).toFixed(2) + '\u4E07';
  }
  return amount.toFixed(2);
}
