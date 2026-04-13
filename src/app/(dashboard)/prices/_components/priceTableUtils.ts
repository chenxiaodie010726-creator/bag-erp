/* ============================================================
 * 价格表：排序、分组分页、类型/编号/名称列合并元数据
 * ============================================================ */

import type { PriceItem } from './mockData';

/** 同一展示组：编号 + 名称相同且多于一行时合并单元格 */
export function priceMergeGroupKey(p: Pick<PriceItem, 'code' | 'name'>): string {
  return `${p.code}\0${p.name}`;
}

const COLOR_SORT: Record<string, number> = { 黑色: 0, 杂色: 1 };

/** 先按编号、名称，再按颜色/规格（黑色 → 杂色 → 其它） */
export function sortPricesForMergeDisplay(rows: PriceItem[]): PriceItem[] {
  return [...rows].sort((a, b) => {
    const c = a.code.localeCompare(b.code, 'zh-CN');
    if (c !== 0) return c;
    const n = a.name.localeCompare(b.name, 'zh-CN');
    if (n !== 0) return n;
    const ca = COLOR_SORT[a.colorCategory ?? ''] ?? 50;
    const cb = COLOR_SORT[b.colorCategory ?? ''] ?? 50;
    if (ca !== cb) return ca - cb;
    return (a.colorCategory ?? '').localeCompare(b.colorCategory ?? '', 'zh-CN');
  });
}

/**
 * 分页时尽量不拆散「同一编号+名称」的一组行；若单组行数超过 pageSize 则按行硬拆。
 */
export function packPriceRowsIntoPages(rows: PriceItem[], pageSize: number): PriceItem[][] {
  if (rows.length === 0) return [[]];
  const pages: PriceItem[][] = [];
  let buf: PriceItem[] = [];
  let i = 0;
  while (i < rows.length) {
    const k = priceMergeGroupKey(rows[i]);
    let j = i + 1;
    while (j < rows.length && priceMergeGroupKey(rows[j]) === k) j++;
    const group = rows.slice(i, j);
    i = j;

    if (group.length > pageSize) {
      if (buf.length) {
        pages.push(buf);
        buf = [];
      }
      for (let x = 0; x < group.length; x += pageSize) {
        pages.push(group.slice(x, x + pageSize));
      }
      continue;
    }

    if (buf.length + group.length > pageSize && buf.length > 0) {
      pages.push(buf);
      buf = [...group];
    } else {
      buf.push(...group);
    }
  }
  if (buf.length) pages.push(buf);
  return pages.length ? pages : [[]];
}

/** 当前页内：类型/编号/名称是否合并（与「同编号+名称」组同步） */
export function computeCodeNameMergeMeta(pageRows: PriceItem[]): Map<
  string,
  { showType: boolean; showCode: boolean; showName: boolean; span: number }
> {
  const meta = new Map<string, { showType: boolean; showCode: boolean; showName: boolean; span: number }>();
  let i = 0;
  while (i < pageRows.length) {
    const k = priceMergeGroupKey(pageRows[i]);
    let j = i + 1;
    while (j < pageRows.length && priceMergeGroupKey(pageRows[j]) === k) j++;
    const group = pageRows.slice(i, j);
    const span = j - i;
    const merge = span > 1;
    for (let x = 0; x < group.length; x++) {
      const id = group[x].id;
      if (merge && x === 0) {
        meta.set(id, { showType: true, showCode: true, showName: true, span });
      } else if (merge) {
        meta.set(id, { showType: false, showCode: false, showName: false, span: 0 });
      } else {
        meta.set(id, { showType: true, showCode: true, showName: true, span: 1 });
      }
    }
    i = j;
  }
  return meta;
}
