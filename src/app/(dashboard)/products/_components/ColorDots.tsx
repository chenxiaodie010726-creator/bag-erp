/* ============================================================
 * 颜色圆点组件
 * 说明: 展示产品的颜色变体，超过指定数量后显示 +N
 * 优先按 SKU 行渲染（与展开行数一致）；无 SKU 时回退到 colors 数组
 * ============================================================ */

import { useColorRegistry } from '@/hooks/useColorRegistry';
import { resolveHexForProductSku } from '@/lib/colorDisplay';
import { COLOR_MAP } from './mockData';
import type { SkuItem } from './mockData';

interface ColorDotsProps {
  colors: string[];
  /** 若存在 SKU，按每条 SKU 一个色块（避免多条 SKU 共用同一 colorCode 时只显示一个点） */
  skus?: SkuItem[];
  maxShow?: number;
}

function isLightHex(hex: string): boolean {
  try {
    const c = hex.replace('#', '');
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 200;
  } catch { return false; }
}

export default function ColorDots({ colors, skus, maxShow = 5 }: ColorDotsProps) {
  const registry = useColorRegistry();

  const fromSkus =
    skus && skus.length > 0
      ? skus.map((s) => ({
          key: s.id,
          hex: resolveHexForProductSku(s, registry),
          title: s.skuName || s.colorCode,
        }))
      : null;

  const rows = fromSkus ?? colors.map((code, i) => ({
    key: `c-${i}-${code}`,
    hex: COLOR_MAP[code] ?? (code.startsWith('#') ? code : '#9ca3af'),
    title: code,
  }));

  const visible = rows.slice(0, maxShow);
  const remaining = rows.length - maxShow;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1">
        {visible.map(({ key, hex, title }) => {
          const isLight = isLightHex(hex);
          return (
            <span
              key={key}
              title={title}
              className="inline-block w-7 h-7 rounded-md shrink-0"
              style={{
                backgroundColor: hex,
                border: isLight ? '1px solid #d1d5db' : 'none',
              }}
            />
          );
        })}
        {remaining > 0 && (
          <span className="text-xs text-gray-400 ml-0.5">+{remaining}</span>
        )}
      </div>
      <span className="text-xs text-gray-400">共 {rows.length} 个颜色</span>
    </div>
  );
}
