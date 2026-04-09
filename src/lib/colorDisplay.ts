import { COLOR_MAP } from '@/app/(dashboard)/products/_components/mockData';
import { lookupRegistryHex, type ColorRegistryEntry } from '@/lib/colorRegistry';

/** 从 SKU 片段推断 2–4 位颜色代码（如 AP1-BC-BLK → BLK） */
export function guessColorCodeFromSku(sku: string): string | null {
  const segs = sku.split('-').filter(Boolean);
  for (let i = segs.length - 1; i >= 0; i--) {
    const letters = segs[i].replace(/[^A-Za-z]/g, '');
    if (letters.length >= 2 && letters.length <= 6) {
      return letters.slice(0, 3).toUpperCase();
    }
  }
  return null;
}

/** 色块背景色：预设代码或 #RRGGBB */
export function resolveColorHex(colorCode: string | null | undefined): string {
  if (!colorCode) return '#e5e7eb';
  const c = colorCode.trim();
  if (c.startsWith('#')) return c;
  return COLOR_MAP[c] ?? '#9ca3af';
}

/** 产品 SKU 行：优先「颜色管理」词根匹配（订单颜色 / 中文名），再回退预设代码 */
export interface SkuColorLike {
  colorCode: string;
  colorNameZh?: string | null;
  /** 来自订单「颜色」列原文，用于词根匹配 */
  colorPhrase?: string | null;
}

export function resolveHexForProductSku(sku: SkuColorLike, registry: ColorRegistryEntry[]): string {
  const { colorCode } = sku;
  if (!colorCode) return '#e5e7eb';
  const c = colorCode.trim();
  if (c.startsWith('#')) return c;
  const fromReg = lookupRegistryHex(registry, [sku.colorPhrase, sku.colorNameZh]);
  if (fromReg) return fromReg;
  return COLOR_MAP[c] ?? '#9ca3af';
}

const LIGHT_CODES = new Set(['WHT', 'CRM', 'LPK', 'LBL', 'BGE']);

export function isLightColorHex(hex: string): boolean {
  if (!hex.startsWith('#') || hex.length < 7) return false;
  try {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 200;
  } catch {
    return false;
  }
}

export function swatchNeedsBorder(colorCode: string | null | undefined, hex: string): boolean {
  if (colorCode && LIGHT_CODES.has(colorCode)) return true;
  return isLightColorHex(hex);
}
