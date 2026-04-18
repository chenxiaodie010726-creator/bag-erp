/* ============================================================
 * 颜色管理 — 多词根（同义词）→ 色值（数据库存储，经 /api/colors）
 * 用于订单「颜色」列与 SKU 展示：按关键词匹配后覆盖默认灰块
 * ============================================================ */

/** @deprecated 仅保留常量名，数据源已迁至 API */
export const COLOR_REGISTRY_STORAGE_KEY = 'cf_erp_color_registry';

/** @deprecated 同页同步已改为 useColors 共享状态 + API；勿再依赖此事件 */
export const COLOR_REGISTRY_CHANGED_EVENT = 'cf-erp-color-registry-changed';

export interface ColorRegistryEntry {
  id: string;
  /** 同一色值的多个叫法，如 BLACK、黑色、黑 */
  keywords: string[];
  /** #RRGGBB */
  hex: string;
}

/** 「添加 SKU → 常用颜色」取注册表**存储顺序**前 N 条（与颜色管理列表从上到下一致） */
export const COLOR_REGISTRY_COMMON_PRESET_LIMIT = 20;

/** 用于添加 SKU 的颜色编号：优先拉丁/数字代码，否则 #RRGGBB，否则第一个关键词 */
export function derivePresetColorCode(entry: ColorRegistryEntry): string {
  const kws = entry.keywords.map((k) => k.trim()).filter(Boolean);
  if (kws.length === 0) {
    const norm = normalizeHexInput(entry.hex);
    if (norm) return norm;
    const raw = entry.hex.trim();
    if (raw) return raw;
    return 'COLOR';
  }
  const ascii = kws.find((k) => /^[A-Za-z][A-Za-z0-9#-]{0,15}$/.test(k));
  if (ascii) return ascii;
  const hexish = kws.find((k) => k.startsWith('#'));
  if (hexish) return hexish;
  return normalizeHexInput(entry.hex) ?? kws[0]!;
}

/** 中文名：第一个含中文的关键词，无则空（用户可再在弹窗里改） */
export function derivePresetColorNameZh(entry: ColorRegistryEntry): string {
  const kws = entry.keywords.map((k) => k.trim()).filter(Boolean);
  const zh = kws.find((k) => /[\u4e00-\u9fff]/.test(k));
  return zh ?? '';
}

/** 添加 SKU 常用色块：按注册表数组顺序取前 limit 条（含关键词为空的行，与列表行一一对应） */
export function getRegistryEntriesForCommonPresets(
  registry: ColorRegistryEntry[],
  limit = COLOR_REGISTRY_COMMON_PRESET_LIMIT,
): ColorRegistryEntry[] {
  return registry.slice(0, limit);
}

/** 完全空库时首次种子（见 useColors）；含占位 id，写入 API 时服务端可分配新 id */
export const DEFAULT_SEED: ColorRegistryEntry[] = [
  { id: 'seed-black', keywords: ['BLACK', '黑色'], hex: '#1a1a1a' },
  { id: 'seed-green', keywords: ['GREEN', '绿色'], hex: '#16a34a' },
];

/** 从单行输入解析多个关键词（逗号、顿号、分号、换行等） */
export function parseKeywordLine(text: string): string[] {
  return text
    .split(/[,，、;；\n\r\t]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function keywordsToInputLine(keywords: string[]): string {
  return keywords.join(', ');
}

export function normalizeColorKeyword(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[/,、|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** @deprecated 颜色数据已迁至 /api/colors，请使用 useColors().refresh() */
export function loadColorRegistry(): ColorRegistryEntry[] {
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
    console.warn('[colorRegistry] loadColorRegistry() 已废弃：请改用 useColors / useColorRegistry（API）。');
  }
  return [];
}

/** @deprecated 颜色数据已迁至 /api/colors，请使用 useColors().replaceAll() */
export function saveColorRegistry(_entries: ColorRegistryEntry[]): void {
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
    console.warn('[colorRegistry] saveColorRegistry() 已废弃：请改用 useColors().replaceAll()。');
  }
}

function entryMaxKeywordLen(entry: ColorRegistryEntry): number {
  let m = 0;
  for (const k of entry.keywords) {
    const n = normalizeColorKeyword(k).length;
    if (n > m) m = n;
  }
  return m;
}

/**
 * 按「订单颜色文案」等短语匹配注册表；长关键词优先（如 royal blue 先于 blue）
 */
export function lookupRegistryHex(
  registry: ColorRegistryEntry[],
  phrases: (string | null | undefined)[],
): string | null {
  const normalizedPhrases = phrases
    .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    .map((p) => normalizeColorKeyword(p));
  if (normalizedPhrases.length === 0 || registry.length === 0) return null;

  const sortedEntries = [...registry].sort((a, b) => entryMaxKeywordLen(b) - entryMaxKeywordLen(a));

  for (const phrase of normalizedPhrases) {
    if (!phrase) continue;
    for (const entry of sortedEntries) {
      const kws = [...entry.keywords].sort(
        (a, b) => normalizeColorKeyword(b).length - normalizeColorKeyword(a).length,
      );
      for (const kw of kws) {
        const nk = normalizeColorKeyword(kw);
        if (!nk) continue;
        if (phrase === nk) return entry.hex;
        if (phrase.includes(nk)) return entry.hex;
        const words = phrase.split(/\s+/).filter(Boolean);
        for (const w of words) {
          if (w === nk) return entry.hex;
        }
      }
    }
  }
  return null;
}

export function normalizeHexInput(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const withHash = t.startsWith('#') ? t : `#${t}`;
  if (/^#[0-9A-Fa-f]{6}$/.test(withHash)) return withHash.toLowerCase();
  return null;
}
