/* ============================================================
 * 图片批量导入解析工具
 * 表格格式（来自 Shopify 导出或自行整理）：
 *   Variant SKU | Image Src | Image Position | Color
 *
 * 规则：
 *  - Variant SKU 非空的行为新 SKU 的起始行，同时携带 Position=1 的主图
 *  - SKU 为空的续行复用上一行的 SKU，追加图片（Position 递增）
 *  - Color 只记录 SKU 首行非空的值
 *  - 解析结果按 skuCode 分组，每组包含 colorPhrase + 有序图片 URL 数组
 * ============================================================ */

import * as XLSX from 'xlsx';

export interface SkuImageGroup {
  skuCode: string;
  colorPhrase: string;          // 颜色原文，如 "Orange" / "BLACK"
  images: string[];             // 按 Image Position 排序后的图片 URL
}

export interface ImageImportResult {
  groups: SkuImageGroup[];
  totalRows: number;            // 源文件数据行数（不含表头）
  skippedRows: number;          // 跳过的无效行数
}

/** 解析 Excel / CSV 文件，返回 SKU → 图片分组数据 */
export function parseImageImportFile(file: File): Promise<ImageImportResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<(string | number)[]>(ws, {
          header: 1,
          defval: '',
        }) as (string | number)[][];

        if (rows.length < 2) {
          resolve({ groups: [], totalRows: 0, skippedRows: 0 });
          return;
        }

        // 读取表头，不区分大小写地定位列
        const header = rows[0].map((h) => String(h).trim().toLowerCase());
        const colSku = findCol(header, ['variant sku', 'sku', 'variant_sku', 'skucode', 'sku code']);
        const colSrc = findCol(header, ['image src', 'image_src', 'imagesrc', 'image url', 'url', 'src']);
        const colPos = findCol(header, ['image position', 'image_position', 'position', 'pos', 'order']);
        const colColor = findCol(header, [
          'color (product.metafields.my_fields.color)',
          'color',
          'colour',
          '颜色',
        ]);

        if (colSku === -1 || colSrc === -1) {
          reject(new Error('找不到必要列（Variant SKU / Image Src），请检查表头。'));
          return;
        }

        const groupMap = new Map<string, SkuImageGroup>();
        let currentSku = '';
        let skippedRows = 0;
        const dataRows = rows.slice(1);

        for (const row of dataRows) {
          const skuRaw = String(row[colSku] ?? '').trim();
          const src = String(row[colSrc] ?? '').trim();
          const posRaw = colPos !== -1 ? row[colPos] : '';
          // position 可能是数字或字符串，空值时视为 0（追加模式）
          const pos = posRaw !== '' && posRaw !== null && posRaw !== undefined
            ? Number(posRaw)
            : 0;
          const color = colColor !== -1 ? String(row[colColor] ?? '').trim() : '';

          if (skuRaw) {
            currentSku = skuRaw;
          }

          // 必须有 SKU 和有效的图片 URL（以 http 开头）
          if (!currentSku || !src || !src.startsWith('http')) {
            skippedRows++;
            continue;
          }

          if (!groupMap.has(currentSku)) {
            groupMap.set(currentSku, {
              skuCode: currentSku,
              colorPhrase: color,
              images: [],
            });
          }

          const group = groupMap.get(currentSku)!;

          // 首行（有 SKU 值）且有颜色时覆盖
          if (skuRaw && color) {
            group.colorPhrase = color;
          }

          // 按 position 插入（position <= 0 时按出现顺序追加）
          if (pos > 0) {
            // 直接用 Map 暂存 position→url，避免数组空位问题
            // 使用 _posMap 辅助字段（运行时扩展，不影响接口）
            const posMap = (group as SkuImageGroup & { _pos?: Map<number, string> })._pos ??
              ((group as SkuImageGroup & { _pos?: Map<number, string> })._pos = new Map());
            posMap.set(pos, src);
          } else {
            group.images.push(src);
          }
        }

        // 合并 position 排序的图片（按 position 升序排在 append 图片之前）
        const groups: SkuImageGroup[] = [];
        for (const groupRaw of groupMap.values()) {
          const group = groupRaw as SkuImageGroup & { _pos?: Map<number, string> };
          if (group._pos && group._pos.size > 0) {
            const sorted = Array.from(group._pos.entries())
              .sort((a, b) => a[0] - b[0])
              .map(([, url]) => url)
              .filter(Boolean);
            // position 图片在前，append 图片在后（通常 append 图片是 pos=0 的）
            group.images = [...sorted, ...group.images.filter(Boolean)];
            delete group._pos;
          } else {
            group.images = group.images.filter(Boolean);
          }
          if (group.images.length > 0) groups.push(group);
        }

        resolve({
          groups,
          totalRows: dataRows.length,
          skippedRows,
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsArrayBuffer(file);
  });
}

function findCol(header: string[], candidates: string[]): number {
  for (const c of candidates) {
    const idx = header.indexOf(c.toLowerCase());
    if (idx !== -1) return idx;
  }
  return -1;
}
