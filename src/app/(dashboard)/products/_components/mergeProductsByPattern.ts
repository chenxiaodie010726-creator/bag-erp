/* ============================================================
 * 按「纸格款号」合并产品行：同一款号只保留一行，SKU 归入同一条记录。
 * 解决从未录入多次建档、或误填相同款号导致列表出现多行的问题。
 * ============================================================ */

import type { ProductListItem, SkuItem } from './mockData';

export function patternKey(patternCode: string): string {
  return patternCode.trim().toLowerCase();
}

function skuDedupeKey(s: SkuItem): string {
  return `${(s.skuName ?? '').trim().toLowerCase()}|${String(s.colorCode ?? '').trim().toLowerCase()}`;
}

function recalcDerived(p: ProductListItem): ProductListItem {
  const fromSkus = [...new Set(p.skus.map((s) => String(s.colorCode ?? '').trim()).filter(Boolean))];
  const colors =
    p.colors.length > 0 ? [...new Set([...p.colors, ...fromSkus])] : fromSkus;
  return {
    ...p,
    skuCount: p.skus.length,
    /* 与 SKU 行数可能仍不一致（多条 SKU 同色码时）；列表展示以 ColorDots(skus) 为准 */
    colors,
  };
}

/**
 * 合并相同纸格款号的多条产品记录为一条（保留创建时间最早的一条作为主记录，合并其 SKU）。
 * 款号为空的记录按 id 单独保留，互不合并。
 */
export function mergeProductsByPatternCode(products: ProductListItem[]): ProductListItem[] {
  type GroupKey = string;
  const buckets = new Map<GroupKey, ProductListItem[]>();

  for (const p of products) {
    const pk = patternKey(p.patternCode);
    const key: GroupKey = pk || `__nopattern_${p.id}`;
    const arr = buckets.get(key);
    if (!arr) buckets.set(key, [p]);
    else arr.push(p);
  }

  const out: ProductListItem[] = [];

  for (const [, group] of buckets) {
    if (group.length === 1) {
      out.push(recalcDerived(group[0]!));
      continue;
    }

    /* 主记录：创建日期最早的一条（同日则 id 较小者），产品名称以主记录为准 */
    group.sort((a, b) => {
      const ca = a.createdAt.replace(/\//g, '-');
      const cb = b.createdAt.replace(/\//g, '-');
      const t = ca.localeCompare(cb);
      if (t !== 0) return t;
      return a.id.localeCompare(b.id);
    });

    const primary = group[0]!;
    const seenSku = new Set<string>();
    const mergedSkus: SkuItem[] = [];

    for (const p of group) {
      for (const s of p.skus) {
        const dk = skuDedupeKey(s);
        if (seenSku.has(dk)) continue;
        seenSku.add(dk);
        mergedSkus.push(s);
      }
    }

    const images: Record<string, string[]> = { ...(primary.productImagesByColor ?? {}) };
    for (const p of group.slice(1)) {
      if (p.productImagesByColor) {
        Object.assign(images, p.productImagesByColor);
      }
    }

    const imageUrl =
      primary.imageUrl ??
      group.map((g) => g.imageUrl).find((u) => u != null && String(u).trim() !== '') ??
      null;

    out.push(
      recalcDerived({
        ...primary,
        patternCode: primary.patternCode.trim(),
        skus: mergedSkus,
        imageUrl,
        productImagesByColor: Object.keys(images).length > 0 ? images : primary.productImagesByColor,
      })
    );
  }

  return out;
}
