/* ============================================================
 * 分页组件
 * 说明: 参照设计稿底部分页器样式，支持跳转、每页条数切换
 * ============================================================ */

interface PaginationProps {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export default function Pagination({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function getPageNumbers(): (number | '...')[] {
    const pages: (number | '...')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
      return pages;
    }
    pages.push(1);
    if (page > 3) pages.push('...');
    const start = Math.max(2, page - 1);
    const end = Math.min(totalPages - 1, page + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (page < totalPages - 2) pages.push('...');
    pages.push(totalPages);
    return pages;
  }

  const btnBase =
    'w-8 h-8 flex items-center justify-center text-sm rounded-md transition-colors';
  const btnNormal = 'text-gray-600 hover:bg-gray-100';
  const btnActive = 'bg-gray-900 text-white';
  const btnDisabled = 'text-gray-300 cursor-not-allowed';

  return (
    <div className="flex items-center justify-between pt-4 pb-2 border-t border-gray-100">
      <span className="text-sm text-gray-500">
        共 <b className="text-gray-700">{total}</b> 条
      </span>

      <div className="flex items-center gap-1">
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="h-8 px-2 text-sm border border-gray-200 rounded-md bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-gray-400 mr-2"
        >
          {PAGE_SIZE_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}条/页</option>
          ))}
        </select>

        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className={`${btnBase} ${page <= 1 ? btnDisabled : btnNormal}`}
        >
          ‹
        </button>

        {getPageNumbers().map((p, i) =>
          p === '...' ? (
            <span key={`dots-${i}`} className="w-8 h-8 flex items-center justify-center text-gray-400 text-sm">
              ···
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`${btnBase} ${p === page ? btnActive : btnNormal}`}
            >
              {p}
            </button>
          )
        )}

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className={`${btnBase} ${page >= totalPages ? btnDisabled : btnNormal}`}
        >
          ›
        </button>

        <div className="flex items-center gap-1 ml-2 text-sm text-gray-500">
          <span>前往</span>
          <input
            type="number"
            min={1}
            max={totalPages}
            className="w-12 h-8 px-1.5 text-center text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const v = Number((e.target as HTMLInputElement).value);
                if (v >= 1 && v <= totalPages) onPageChange(v);
              }
            }}
          />
          <span>页</span>
        </div>
      </div>
    </div>
  );
}
