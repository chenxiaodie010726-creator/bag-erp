/* ============================================================
 * 颜色管理 — 多词根（同义词）→ 色值（localStorage）
 * 用于订单「颜色」列与 SKU 展示：按关键词匹配后覆盖默认灰块
 * ============================================================ */

export const COLOR_REGISTRY_STORAGE_KEY = 'cf_erp_color_registry';

/** 与 useColorRegistry 同步同页更新 */
export const COLOR_REGISTRY_CHANGED_EVENT = 'cf-erp-color-registry-changed';

export interface ColorRegistryEntry {
  id: string;
  /** 同一色值的多个叫法，如 BLACK、黑色、黑 */
  keywords: string[];
  /** #RRGGBB */
  hex: string;
}

const DEFAULT_SEED: ColorRegistryEntry[] = [
  { id: 'seed-black', keywords: ['BLACK', '黑色'], hex: '#1a1a1a' },
  { id: 'seed-green', keywords: ['GREEN', '绿色'], hex: '#16a34a' },
];

/** 从单行输入解析多个关键词（逗号、顿号、换行等） */
export function parseKeywordLine(text: string): string[] {
  return text
    .split(/[,，、\n\r\t]+/)
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

function migrateRawEntry(raw: unknown): ColorRegistryEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.hex !== 'string') return null;

  if (Array.isArray(o.keywords)) {
    const kws = o.keywords.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim());
    if (kws.length === 0) return null;
    return { id: o.id, keywords: kws, hex: o.hex };
  }

  /* 旧版单字段 keyword */
  if (typeof o.keyword === 'string' && o.keyword.trim()) {
    return { id: o.id, keywords: [o.keyword.trim()], hex: o.hex };
  }

  return null;
}

/** 首次无数据时写入默认条目，便于开箱即用 */
export function loadColorRegistry(): ColorRegistryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(COLOR_REGISTRY_STORAGE_KEY);
    if (raw === null) {
      saveColorRegistry(DEFAULT_SEED);
      return DEFAULT_SEED.map((e) => ({ ...e, keywords: [...e.keywords] }));
    }
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) {
      saveColorRegistry(DEFAULT_SEED);
      return DEFAULT_SEED.map((e) => ({ ...e, keywords: [...e.keywords] }));
    }
    const migrated = parsed.map(migrateRawEntry).filter((e): e is ColorRegistryEntry => e !== null);
    if (migrated.length === 0) {
      saveColorRegistry(DEFAULT_SEED);
      return DEFAULT_SEED.map((e) => ({ ...e, keywords: [...e.keywords] }));
    }
    const hadLegacyShape = parsed.some(
      (item): item is Record<string, unknown> =>
        !!item && typeof item === 'object' && 'keyword' in item && !Array.isArray((item as Record<string, unknown>).keywords),
    );
    if (hadLegacyShape) saveColorRegistry(migrated);
    return migrated;
  } catch {
    saveColorRegistry(DEFAULT_SEED);
    return DEFAULT_SEED.map((e) => ({ ...e, keywords: [...e.keywords] }));
  }
}

export function saveColorRegistry(entries: ColorRegistryEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(COLOR_REGISTRY_STORAGE_KEY, JSON.stringify(entries));
    window.dispatchEvent(new Event(COLOR_REGISTRY_CHANGED_EVENT));
  } catch {
    /* quota */
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
