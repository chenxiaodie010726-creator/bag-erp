/** 压唛编号范围（与图鉴一致时可把图片放到 public/emboss-stamps/<编号>.png） */

export const EMBOSS_STAMP_ID_MAX = 40;

export function embossStampIds(): string[] {
  return Array.from({ length: EMBOSS_STAMP_ID_MAX }, (_, i) => String(i + 1));
}

/** 左列为「压唛」时启用专用填写区与编号对照 */
export function isEmbossStampLabel(label: string): boolean {
  const t = label.trim();
  if (!t) return false;
  const core = t.replace(/[：:]\s*$/u, '').trim();
  return core === '压唛' || /^压唛\b/u.test(t);
}
