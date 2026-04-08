/* ============================================================
 * 颜色圆点组件
 * 说明: 展示产品的颜色变体，超过指定数量后显示 +N
 * ============================================================ */

import { COLOR_MAP } from './mockData';

interface ColorDotsProps {
  colors: string[];
  maxShow?: number;
}

const LIGHT_PRESET = new Set(['WHT', 'CRM', 'LPK', 'LBL', 'BGE']);

function isLightHex(hex: string): boolean {
  try {
    const c = hex.replace('#', '');
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 200;
  } catch { return false; }
}

export default function ColorDots({ colors, maxShow = 5 }: ColorDotsProps) {
  const visible = colors.slice(0, maxShow);
  const remaining = colors.length - maxShow;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1">
        {visible.map((code) => {
          /* 支持预设代码（BLK）和自定义十六进制颜色（#ff5500） */
          const hex = COLOR_MAP[code] ?? (code.startsWith('#') ? code : '#9ca3af');
          const isLight = LIGHT_PRESET.has(code) || isLightHex(hex);
          return (
            <span
              key={code}
              title={code}
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
      <span className="text-xs text-gray-400">共 {colors.length} 个颜色</span>
    </div>
  );
}
