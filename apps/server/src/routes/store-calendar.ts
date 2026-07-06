import { Router, Response } from 'express';
import { AuthRequest } from '../auth.js';
import { isManagerOrAbove, isReadonly } from '../lib/roles.js';
import db from '../db.js';

const router = Router({ mergeParams: true });

function pad(n: number) { return String(n).padStart(2, '0'); }

// 权限判断辅助
function canViewFinance(role: string) {
  // ADMIN/STORE_ADMIN/MANAGER/SHAREHOLDER 可见门店收支
  return ['ADMIN', 'STORE_ADMIN', 'MANAGER', 'SHAREHOLDER'].includes(role);
}
function canViewDividends(role: string) {
  // ADMIN/STORE_ADMIN/SHAREHOLDER 可见分红
  return ['ADMIN', 'STORE_ADMIN', 'SHAREHOLDER'].includes(role);
}
function canViewPayrollDetail(role: string) {
  // ADMIN/STORE_ADMIN/MANAGER 可见全部工资，STAFF 仅自己，SHAREHOLDER 不可见
  return ['ADMIN', 'STORE_ADMIN', 'MANAGER', 'STAFF'].includes(role);
}
function canViewHandovers(role: string) {
  // STAFF 及以上可见日常交接（SHAREHOLDER 不可见）
  return ['ADMIN', 'STORE_ADMIN', 'MANAGER', 'STAFF'].includes(role);
}

// GET /api/stores/:storeId/calendar/monthly?year=2026&month=7
router.get('/monthly', (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.params.storeId;
    const role = req.user.role;
    const now = new Date();
    const year = parseInt(req.query.year as string) || now.getFullYear();
    const month = parseInt(req.query.month as string) || (now.getMonth() + 1);

    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const dateFrom = `${year}-${pad(month)}-01`;
    const dateTo = `${year}-${pad(month)}-${pad(lastDay.getDate())}`;

    // 收支聚合（仅 finance 可见角色查询）
    const viewFinance = canViewFinance(role);
    const incMap: Record<string, number> = {};
    const expMap: Record<string, number> = {};
    if (viewFinance) {
      const incRows = db.prepare(
        `SELECT date, COALESCE(SUM(amount),0) as total FROM entries
         WHERE store_id = ? AND date >= ? AND date <= ? AND type IN ('收入','income') GROUP BY date`
      ).all(storeId, dateFrom, dateTo) as any[];
      const expRows = db.prepare(
        `SELECT date, COALESCE(SUM(amount),0) as total FROM entries
         WHERE store_id = ? AND date >= ? AND date <= ? AND type IN ('支出','expense') GROUP BY date`
      ).all(storeId, dateFrom, dateTo) as any[];
      for (const r of incRows) incMap[r.date] = r.total;
      for (const r of expRows) expMap[r.date] = r.total;
    }

    // 日常交接标记（STAFF 及以上需要）
    const handoverDates = new Set<string>();
    if (canViewHandovers(role)) {
      const rows = db.prepare(
        'SELECT DISTINCT date FROM staff_handovers WHERE store_id = ? AND date >= ? AND date <= ?'
      ).all(storeId, dateFrom, dateTo) as any[];
      for (const r of rows) handoverDates.add(r.date);
    }

    // 排休数据
    const restCountMap: Record<string, number> = {};
    const myRestDates = new Set<string>();
    const restRows = db.prepare(
      'SELECT date, user_id FROM staff_rest_schedules WHERE store_id = ? AND date >= ? AND date <= ?'
    ).all(storeId, dateFrom, dateTo) as any[];
    for (const r of restRows) {
      restCountMap[r.date] = (restCountMap[r.date] || 0) + 1;
      if (r.user_id === req.user.id) myRestDates.add(r.date);
    }

    const days: any[] = [];
    const daysInMonth = lastDay.getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${year}-${pad(month)}-${pad(d)}`;
      const income = incMap[ds] || 0;
      const expense = expMap[ds] || 0;
      days.push({
        date: ds,
        profit: viewFinance ? (income - expense) : null,
        income: viewFinance ? income : null,
        expense: viewFinance ? expense : null,
        has_handover: handoverDates.has(ds),
        rest_count: restCountMap[ds] || 0,
        my_rest: myRestDates.has(ds)
      });
    }

    res.json({ year, month, days, can_view_finance: viewFinance });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '服务器内部错误' });
  }
});

// GET /api/stores/:storeId/calendar/daily?date=2026-07-01
router.get('/daily', (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.params.storeId;
    const role = req.user.role;
    const date = req.query.date as string;
    if (!date) return res.status(400).json({ error: '缺少 date 参数' });

    const result: any = {
      date,
      can_manage_rest: isManagerOrAbove(role),
      can_view_finance: canViewFinance(role),
      can_view_dividends: canViewDividends(role),
      can_view_payroll_detail: canViewPayrollDetail(role),
      can_view_handovers: canViewHandovers(role),
      can_create_handover: !isReadonly(role)
    };

    // 收支盈利
    if (canViewFinance(role)) {
      const income = (db.prepare(
        "SELECT COALESCE(SUM(amount),0) as t FROM entries WHERE store_id = ? AND date = ? AND type IN ('收入','income')"
      ).get(storeId, date) as any).t || 0;
      const expense = (db.prepare(
        "SELECT COALESCE(SUM(amount),0) as t FROM entries WHERE store_id = ? AND date = ? AND type IN ('支出','expense')"
      ).get(storeId, date) as any).t || 0;
      result.finance = { income, expense, profit: income - expense };
    }

    // 工资（当日确认的工资单）
    if (canViewPayrollDetail(role)) {
      let payrollSql = `SELECT p.id, p.period, p.total_amount, p.confirmed_at, p.status FROM payroll p WHERE p.store_id = ? AND p.status = 'confirmed' AND date(p.confirmed_at) = ?`;
      let payrollParams: any[] = [storeId, date];
      if (role === 'STAFF') {
        // STAFF 仅看包含自己的工资单
        payrollSql = `SELECT p.id, p.period, p.total_amount, p.confirmed_at, p.status, pi.total_amount as my_amount, pi.user_name as my_name
                       FROM payroll p
                       JOIN payroll_items pi ON pi.payroll_id = p.id
                       WHERE p.store_id = ? AND p.status = 'confirmed' AND date(p.confirmed_at) = ? AND pi.user_id = ?`;
        payrollParams = [storeId, date, req.user.id];
      }
      const payrolls = db.prepare(payrollSql).all(...payrollParams) as any[];
      result.payroll = payrolls;
    }

    // 分红（当日归档的分红）
    if (canViewDividends(role)) {
      const dividends = db.prepare(
        `SELECT d.id, d.total_amount, d.note, d.status, d.created_at,
                (SELECT json_group_array(json_object('shareholder_name', dd.shareholder_name, 'ratio', dd.ratio, 'amount', dd.amount)) FROM dividend_details dd WHERE dd.dividend_id = d.id) as details
         FROM dividends d
         WHERE d.store_id = ? AND d.status = 'archived' AND date(d.created_at) = ?`
      ).all(storeId, date) as any[];
      result.dividends = dividends.map((d: any) => {
        let details: any[] = [];
        try { details = JSON.parse(d.details || '[]'); } catch {}
        return { ...d, details };
      });
    }

    // 日常交接（STAFF 及以上可见）
    if (canViewHandovers(role)) {
      const handovers = db.prepare(
        `SELECT h.id, h.user_id, h.content, h.created_at, h.updated_at, u.name as user_name
         FROM staff_handovers h LEFT JOIN users u ON h.user_id = u.id
         WHERE h.store_id = ? AND h.date = ? ORDER BY h.created_at ASC`
      ).all(storeId, date) as any[];
      result.daily_handovers = handovers.map((h: any) => ({
        id: h.id,
        user_id: h.user_id,
        user_name: h.user_name,
        content: h.content,
        type: 'daily',
        created_at: h.created_at,
        updated_at: h.updated_at,
        is_mine: h.user_id === req.user.id,
        can_edit: h.user_id === req.user.id || isManagerOrAbove(role)
      }));
    }

    // 开闭店交接（全部角色可见）
    const shiftHandovers = db.prepare(
      `SELECT so.id, so.type, so.user_id, so.handover_content, so.note, so.created_at, u.name as user_name
       FROM store_opens so LEFT JOIN users u ON so.user_id = u.id
       WHERE so.store_id = ? AND date(so.created_at) = ? ORDER BY so.created_at ASC`
    ).all(storeId, date) as any[];
    result.shift_handovers = shiftHandovers
      .filter((s: any) => s.handover_content)
      .map((s: any) => ({
        id: s.id,
        user_name: s.user_name,
        content: s.handover_content,
        type: s.type === 'open' ? 'shift_open' : 'shift_close',
        note: s.note,
        created_at: s.created_at
      }));
    result.open_close = {
      open: shiftHandovers.find((s: any) => s.type === 'open') || null,
      close: shiftHandovers.find((s: any) => s.type === 'close') || null
    };

    // 排休（全部角色可见）
    const restSchedules = db.prepare(
      `SELECT r.id, r.user_id, r.date, r.type, r.leave_type, r.note, r.created_at, u.name as user_name, u.job_title
       FROM staff_rest_schedules r LEFT JOIN users u ON r.user_id = u.id
       WHERE r.store_id = ? AND r.date = ? ORDER BY r.id ASC`
    ).all(storeId, date) as any[];
    result.rest_schedules = restSchedules;

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || '服务器内部错误' });
  }
});

export default router;
