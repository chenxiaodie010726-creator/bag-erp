/* ============================================================
 * 颜色物料对照「颜色(中文)」列：与产品 SKU 一致，手填 / 自动（英译中）
 * ============================================================ */

'use client';

import { resolveColorMapChineseColor } from '@/lib/skuColorZh';

export default function ColorMapChineseColorCell({
  colorZh,
  colorEn,
  compact,
}: {
  colorZh: string;
  colorEn: string;
  /** 顶栏简表用更小字号 */
  compact?: boolean;
}) {
  const { text, source, hint } = resolveColorMapChineseColor(colorZh, colorEn);
  const isManual = source === 'manual';

  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${compact ? 'text-xs' : ''}`} title={hint}>
      <span className={compact ? 'text-gray-800' : 'text-sm text-gray-700'}>{text}</span>
      {source !== 'none' && (
        <span
          className={[
            'inline-flex items-center rounded px-1 py-0.5 font-medium leading-none shrink-0',
            compact ? 'text-[8px]' : 'text-[10px]',
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
