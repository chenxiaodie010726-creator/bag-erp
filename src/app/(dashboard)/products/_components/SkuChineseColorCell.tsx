/* ============================================================
 * SKU 表格「颜色」列：中文 + 手填 / 自动 标识
 * ============================================================ */

'use client';

import type { SkuColorFields } from '@/lib/skuColorZh';
import { resolveSkuChineseColor } from '@/lib/skuColorZh';

export default function SkuChineseColorCell({ sku }: { sku: SkuColorFields }) {
  const { text, source, hint } = resolveSkuChineseColor(sku);
  const isManual = source === 'manual';

  return (
    <div className="flex items-center gap-1.5 flex-wrap" title={hint}>
      <span className="text-sm text-gray-700">{text}</span>
      {source !== 'none' && (
        <span
          className={[
            'inline-flex items-center rounded px-1 py-0.5 text-[10px] font-medium leading-none shrink-0',
            isManual
              ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/80'
              : 'bg-slate-100 text-slate-500 ring-1 ring-slate-200/90',
          ].join(' ')}
        >
          {isManual ? '手填' : '自动'}
        </span>
      )}
    </div>
  );
}
