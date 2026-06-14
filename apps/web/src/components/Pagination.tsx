import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  total: number;
  page: number;
  pageSize: number;
  pageSizeOptions?: number[];
  onChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  compact?: boolean;
}

export function Pagination({
  total,
  page,
  pageSize,
  pageSizeOptions = [10, 20, 50, 100],
  onChange,
  onPageSizeChange,
  compact = false,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const handlePageSizeChange = (size: number) => {
    onPageSizeChange(size);
    onChange(1);
  };

  if (compact) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/40 bg-white/60 px-3 py-2 text-xs text-slate-500 shadow-lg backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <span>共{total}条</span>
          <select
            value={pageSize}
            onChange={(e) => handlePageSizeChange(Number(e.target.value))}
            className="rounded-lg border border-slate-200 bg-white/80 px-1.5 py-1 text-xs outline-none focus:border-indigo-300"
          >
            {pageSizeOptions.map((s) => (
              <option key={s} value={s}>{s}条/页</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => onChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-slate-100 disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[56px] text-center font-medium text-slate-600">
            {page}/{totalPages}
          </span>
          <button
            onClick={() => onChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-slate-100 disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/40 bg-white/60 px-4 py-2.5 text-xs text-slate-500 shadow-lg backdrop-blur-xl">
      <span className="tabular-nums">共 {total} 条</span>
      <div className="flex items-center gap-2">
        <span>每页</span>
        <select
          value={pageSize}
          onChange={(e) => handlePageSizeChange(Number(e.target.value))}
          className="rounded-lg border border-slate-200 bg-white/80 px-2 py-1 text-xs outline-none focus:border-indigo-300"
        >
          {pageSizeOptions.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <span>条</span>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-slate-100 disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-[64px] text-center font-medium text-slate-600">
          第 {page}/{totalPages} 页
        </span>
        <button
          onClick={() => onChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-slate-100 disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
