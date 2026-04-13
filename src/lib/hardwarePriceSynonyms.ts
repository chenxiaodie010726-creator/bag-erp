/* ============================================================
 * 五金物料价格 — 同义词匹配（与颜色管理 parseKeywordLine / 归一化规则一致）
 * 英文不区分大小写；整句或分词命中任一同义词即视为匹配；较长词优先。
 * ============================================================ */

import { normalizeColorKeyword, parseKeywordLine } from '@/lib/colorRegistry';
import type { PriceItem } from '@/app/(dashboard)/prices/_components/mockData';

export { parseKeywordLine } from '@/lib/colorRegistry';

/** 采购/订单侧传入的物料描述是否命中本条价格（名称或同义词列） */
export function hardwarePriceLabelMatches(
  rawLabel: string,
  item: Pick<PriceItem, 'name' | 'synonyms'>,
): boolean {
  const phrase = normalizeColorKeyword(rawLabel);
  if (!phrase) return false;

  const synonymTokens = parseKeywordLine(item.synonyms ?? '')
    .map((s) => normalizeColorKeyword(s))
    .filter(Boolean);

  const candidates = [...synonymTokens, normalizeColorKeyword(item.name)].sort((a, b) => b.length - a.length);

  for (const nk of candidates) {
    if (!nk) continue;
    if (phrase === nk) return true;
    if (phrase.includes(nk)) return true;
    if (nk.includes(phrase)) return true;
    const words = phrase.split(/\s+/).filter(Boolean);
    for (const w of words) {
      if (w === nk) return true;
    }
  }
  return false;
}

/** 价格管理页搜索框：是否命中编号、名称或同义词 */
export function hardwarePriceMatchesSearchText(
  item: Pick<PriceItem, 'code' | 'name' | 'synonyms' | 'category' | 'tab'>,
  searchRaw: string,
): boolean {
  const q = searchRaw.trim();
  if (!q) return true;
  if (item.tab !== '物料' || item.category !== '五金') {
    const low = q.toLowerCase();
    return item.name.toLowerCase().includes(low) || item.code.toLowerCase().includes(low);
  }

  const phrase = normalizeColorKeyword(q);
  if (!phrase) return true;

  if (normalizeColorKeyword(item.code).includes(phrase) || phrase.includes(normalizeColorKeyword(item.code))) {
    return true;
  }

  return hardwarePriceLabelMatches(q, item);
}
