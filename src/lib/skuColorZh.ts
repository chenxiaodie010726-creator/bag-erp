/* ============================================================
 * SKU 中文颜色展示：人工填写 vs 自动（英文翻译 / 颜色代码预设）
 * ============================================================ */

import { COLOR_NAME_MAP, COLOR_NAME_ZH_MAP } from '@/app/(dashboard)/products/_components/mockData';

/** 颜色展示所需字段（产品 SKU / 套装 SKU 等均可传入） */
export interface SkuColorFields {
  colorCode: string;
  colorNameZh?: string;
  colorPhrase?: string | null;
}

/** 与列表「Color」列一致的英文标签（用于自动翻译中文） */
export function getSkuEnglishColorLabel(sku: SkuColorFields): string {
  if (sku.colorCode.startsWith('#')) return sku.colorCode;
  if (COLOR_NAME_MAP[sku.colorCode]) return COLOR_NAME_MAP[sku.colorCode];
  const phrase = sku.colorPhrase?.trim();
  if (phrase) return phrase;
  return sku.colorCode;
}

/**
 * 英文颜色名 → 中文（不区分大小写；支持常见复合词）
 * 未命中时返回 null，由调用方回退到颜色代码表。
 */
const ENGLISH_COLOR_TO_ZH: Record<string, string> = {
  black: '黑色',
  blue: '蓝色',
  red: '红色',
  brown: '棕色',
  tan: '卡其棕',
  beige: '米色',
  camel: '驼色',
  cream: '奶油色',
  wine: '酒红色',
  burgundy: '酒红色',
  khaki: '卡其色',
  pink: '粉色',
  orange: '橙色',
  yellow: '黄色',
  purple: '紫色',
  violet: '紫色',
  gold: '金色',
  silver: '银色',
  white: '白色',
  gray: '灰色',
  grey: '灰色',
  green: '绿色',
  navy: '藏青色',
  olive: '橄榄绿',
  'royal blue': '宝蓝色',
  'light blue': '浅蓝色',
  'dark blue': '深蓝色',
  'dark brown': '深棕色',
  'light pink': '浅粉色',
  'forest green': '森林绿',
  'lime green': '青柠绿',
  'rose gold': '玫瑰金',
  charcoal: '炭灰色',
  ivory: '象牙白',
  mint: '薄荷绿',
  coral: '珊瑚色',
  teal: '青绿色',
  turquoise: '绿松石色',
  magenta: '洋红色',
  maroon: '栗色',
  salmon: '鲑粉色',
  apricot: '杏色',
  copper: '铜色',
  bronze: '古铜色',
  champagne: '香槟色',
  denim: '丹宁蓝',
  sand: '沙色',
  stone: '石色',
  slate: '石板灰',
  rust: '铁锈色',
  lilac: '淡紫色',
  lavender: '薰衣草紫',
  plum: '梅紫色',
  mustard: '芥末黄',
  neon: '荧光色',
};

function normalizeEnglishColorKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function translateEnglishColorNameToZh(english: string): string | null {
  if (!english || english.startsWith('#')) return null;
  const k = normalizeEnglishColorKey(english);
  if (ENGLISH_COLOR_TO_ZH[k]) return ENGLISH_COLOR_TO_ZH[k];
  // 常见变体：末尾句号、括号说明
  const stripNote = k.replace(/\s*\([^)]*\)\s*$/g, '').trim();
  if (stripNote !== k && ENGLISH_COLOR_TO_ZH[stripNote]) return ENGLISH_COLOR_TO_ZH[stripNote];
  return null;
}

export type SkuChineseColorSource = 'manual' | 'auto_translated' | 'auto_code' | 'none';

export interface ResolvedSkuChineseColor {
  text: string;
  source: SkuChineseColorSource;
  /** 鼠标悬停说明 */
  hint: string;
}

export function resolveSkuChineseColor(sku: SkuColorFields): ResolvedSkuChineseColor {
  const manual = sku.colorNameZh?.trim();
  if (manual) {
    return {
      text: manual,
      source: 'manual',
      hint: '人工填写',
    };
  }

  const en = getSkuEnglishColorLabel(sku);
  if (!en.startsWith('#')) {
    const fromEn = translateEnglishColorNameToZh(en);
    if (fromEn) {
      return {
        text: fromEn,
        source: 'auto_translated',
        hint: '根据英文 Color 自动翻译，可在编辑 SKU 中填写中文以覆盖',
      };
    }
  }

  if (!sku.colorCode.startsWith('#')) {
    const fromCode = COLOR_NAME_ZH_MAP[sku.colorCode];
    if (fromCode) {
      return {
        text: fromCode,
        source: 'auto_code',
        hint: '根据颜色代码匹配的预设中文，可在编辑 SKU 中填写中文以覆盖',
      };
    }
  }

  return {
    text: '—',
    source: 'none',
    hint: '无中文颜色，请编辑 SKU 填写',
  };
}
