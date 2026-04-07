/* ============================================================
 * 客户 PO 号格式与匹配
 * 规范展示：PO# + 数字，例如 PO#260503（# 分隔 PO 与流水号）
 * ============================================================ */

/** 将任意常见输入规范为 PO#数字 */
export function normalizePoNumber(input: string): string {
  const t = input.trim().replace(/\s+/g, '');
  if (!t) return t;

  /* PO#260503、PO260503、#260503 */
  let m = t.match(/^(?:PO#|PO|#)(\d+)$/i);
  if (m) return `PO#${m[1]}`;

  /* 纯数字（至少 4 位，避免误伤短数字） */
  m = t.match(/^(\d{4,})$/);
  if (m) return `PO#${m[1]}`;

  return t;
}

/**
 * 判断筛选框内容是否应按「完整 PO」做精确匹配（避免 PO26050 同时命中 PO#260501 与 PO#260502）
 */
export function isFullPoFilterInput(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  return /^(?:PO#?|PO|#)?\d{4,}$/i.test(t);
}

/**
 * PO 筛选：空则通过；完整 PO 则精确匹配规范形式；否则子串匹配（展示用含 #）
 */
export function poMatchesFilter(poNumber: string, filterRaw: string): boolean {
  const filter = filterRaw.trim();
  if (!filter) return true;

  const canonicalPo = normalizePoNumber(poNumber);

  if (isFullPoFilterInput(filter)) {
    return canonicalPo === normalizePoNumber(filter);
  }

  const f = filter.toLowerCase();
  const c = canonicalPo.toLowerCase();
  /* 同时兼容未输入 # 的粘贴 */
  return c.includes(f) || c.replace('#', '').includes(f.replace(/#/g, ''));
}
