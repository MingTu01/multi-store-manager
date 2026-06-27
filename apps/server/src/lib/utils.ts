export function localDate(d?: Date): string {
  const dt = d || new Date();
  return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
}

export function localDateTime(): string {
  const now = new Date();
  return now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0') + ' ' +
    String(now.getHours()).padStart(2, '0') + ':' +
    String(now.getMinutes()).padStart(2, '0') + ':' +
    String(now.getSeconds()).padStart(2, '0');
}

export function formatMoney(amount: number): string {
  if (amount >= 10000) {
    return (amount / 10000).toFixed(2) + '万';
  }
  return amount.toFixed(2);
}
export function calculateFundBalance(db: any, storeId?: string): number {
  if (storeId) {
    const info = db.prepare('SELECT initial_capital FROM stores WHERE id = ?').get(storeId) as any;
    const initCap = info?.initial_capital || 0;
    const allInc = (db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM entries WHERE store_id=? AND type IN ('收入','income')").get(storeId) as any).t || 0;
    const allExp = (db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM entries WHERE store_id=? AND type IN ('支出','expense')").get(storeId) as any).t || 0;
    return initCap + allInc - allExp;
  }
  const stores = db.prepare('SELECT id, initial_capital FROM stores').all() as any[];
  let total = 0;
  for (const s of stores) {
    const ic = s.initial_capital || 0;
    const allInc = (db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM entries WHERE store_id=? AND type IN ('收入','income')").get(s.id) as any).t || 0;
    const allExp = (db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM entries WHERE store_id=? AND type IN ('支出','expense')").get(s.id) as any).t || 0;
    total += ic + allInc - allExp;
  }
  return total;
}
