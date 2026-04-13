/* ============================================================
 * 客户 SKU 套装件数：第一个 "-" 之后，以连续数字开头表示件数
 *   1 = 单品；2+ = 套装（两件套、三件套等）
 * 例：26SPM1687-1RD-80D-ORG → 1；26SPM1687-3RD-... → 3
 * ============================================================ */

/**
 * @returns 解析到的件数；无法识别时返回 null（不当作套装逻辑处理）
 */
export function parseSetPieceCountFromSku(sku: string): number | null {
  const s = sku.trim();
  if (!s) return null;
  const i = s.indexOf('-');
  if (i < 0) return null;
  const rest = s.slice(i + 1);
  const m = rest.match(/^(\d+)/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

/** 是否「疑似套装」待补全（件数 ≥ 2） */
export function isSuspectedSetPieceCount(n: number | null): boolean {
  return n !== null && n >= 2;
}
