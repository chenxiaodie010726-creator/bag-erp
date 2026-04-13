'use client';

/* ============================================================
 * 图片批量导入弹窗
 *
 * 表格格式（Excel / CSV）：
 *   Variant SKU | Image Src | Image Position | Color
 *
 * 逻辑：
 *  1. 上传文件 → 解析 → 预览匹配结果
 *  2. 按 SKU 在 products 中查找对应行
 *  3. 确认后将图片写入 productImagesByColor + imageUrl（主图）
 * ============================================================ */

import { useRef, useState } from 'react';
import type { ProductListItem } from './mockData';
import { parseImageImportFile, type SkuImageGroup } from '@/lib/productImageImport';
import { guessColorCodeFromSku } from '@/lib/colorDisplay';

interface ImportImagesModalProps {
  open: boolean;
  products: ProductListItem[];
  onClose: () => void;
  onApply: (updates: { productId: string; colorCode: string; images: string[] }[]) => void;
  /** 为未匹配的 SKU 创建"待补全"空壳产品记录 */
  onCreateStubs?: (stubs: ProductListItem[]) => void;
}

interface MatchedGroup {
  group: SkuImageGroup;
  productId: string | null;
  productName: string;
  colorCode: string;
  matched: boolean;
}

export default function ImportImagesModal({
  open,
  products,
  onClose,
  onApply,
  onCreateStubs,
}: ImportImagesModalProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [createStubs, setCreateStubs] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [matched, setMatched] = useState<MatchedGroup[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [skippedRows, setSkippedRows] = useState(0);
  const [fileName, setFileName] = useState('');

  function reset() {
    setMatched([]);
    setParseError(null);
    setTotalRows(0);
    setSkippedRows(0);
    setFileName('');
    if (fileRef.current) fileRef.current.value = '';
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleFile(file: File) {
    setFileName(file.name);
    setParsing(true);
    setParseError(null);
    setMatched([]);
    try {
      const result = await parseImageImportFile(file);
      setTotalRows(result.totalRows);
      setSkippedRows(result.skippedRows);

      // 建立 skuCode → (productId, colorCode) 映射表
      const skuMap = new Map<string, { productId: string; colorCode: string; productName: string }>();
      for (const p of products) {
        for (const sku of p.skus) {
          skuMap.set(sku.skuCode.toLowerCase(), {
            productId: p.id,
            colorCode: sku.colorCode,
            productName: `${p.patternCode} · ${p.name}`,
          });
        }
      }

      const groups: MatchedGroup[] = result.groups.map((g) => {
        const hit = skuMap.get(g.skuCode.toLowerCase());
        return {
          group: g,
          productId: hit?.productId ?? null,
          productName: hit?.productName ?? '—（SKU 未录入）',
          colorCode: hit?.colorCode ?? '',
          matched: !!hit,
        };
      });

      setMatched(groups);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : '解析失败，请检查文件格式');
    } finally {
      setParsing(false);
    }
  }

  function handleConfirm() {
    const updates: { productId: string; colorCode: string; images: string[] }[] = [];
    for (const m of matched) {
      if (m.matched && m.productId && m.colorCode && m.group.images.length > 0) {
        updates.push({ productId: m.productId, colorCode: m.colorCode, images: m.group.images });
      }
    }
    if (updates.length > 0) onApply(updates);

    /* 为未匹配的 SKU 创建待补全空壳记录 */
    if (createStubs && onCreateStubs) {
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
      let seq = 0;
      const stubs: ProductListItem[] = matched
        .filter((m) => !m.matched && m.group.images.length > 0)
        .map((m) => {
          seq++;
          const skuCode = m.group.skuCode;
          const colorCode = guessColorCodeFromSku(skuCode) ?? 'BLK';
          const colorPhrase = m.group.colorPhrase || undefined;
          const imagesByColor: Record<string, string[]> = { [colorCode]: m.group.images };
          const uid = `${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 6)}`;
          return {
            id: `stub-${uid}`,
            patternCode: '',
            name: '',
            category: '手袋',
            imageUrl: m.group.images[0] ?? null,
            productImagesByColor: imagesByColor,
            colors: [colorCode],
            bulkPrice: 0,
            dropshipPrice: 0,
            currency: 'USD',
            packWeight: '',
            packSize: '',
            status: 'active' as const,
            createdAt: today,
            skuCount: 1,
            skus: [{
              id: `stub-sku-${uid}`,
              skuName: skuCode,
              colorCode,
              colorPhrase,
              colorNameZh: '',
              skuCode,
              stock: 0,
              bulkPrice: 0,
              dropshipPrice: 0,
              status: 'active' as const,
              updatedAt: today,
            }],
          };
        });
      if (stubs.length > 0) onCreateStubs(stubs);
    }

    handleClose();
  }

  const matchedCount = matched.filter((m) => m.matched).length;
  const unmatchedCount = matched.length - matchedCount;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div
        className="w-full max-w-2xl bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: '88vh' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* 标题 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-800">批量导入图片</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              表格格式：Variant SKU · Image Src · Image Position · Color
            </p>
          </div>
          <button type="button" onClick={handleClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* 下载模板链接 */}
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-3 flex items-start gap-3">
            <div className="text-2xl shrink-0">🖼️</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-700 mb-1">图片导入表格格式说明</p>
              <ul className="text-xs text-gray-500 space-y-0.5 list-disc list-inside">
                <li><b>Variant SKU</b>：客户款号（与产品管理中录入的 SKU 一致）</li>
                <li><b>Image Src</b>：图片 URL（支持 Shopify CDN 等任意公网链接）</li>
                <li><b>Image Position</b>：图片展示顺序（1=主图，2、3...为附图）</li>
                <li><b>Color</b>：颜色名称（仅首行需要，续行可留空）</li>
              </ul>
              <p className="text-[11px] text-gray-400 mt-2">
                同一 SKU 可有多行（每行一张图），后续行 Variant SKU 列留空即可，系统自动续接上一 SKU。
              </p>
            </div>
          </div>

          {/* 上传区域 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">选择文件（Excel / CSV）</label>
            <div
              className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-colors"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) handleFile(f);
              }}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              {fileName ? (
                <p className="text-sm text-gray-700 font-medium">{fileName}</p>
              ) : (
                <>
                  <p className="text-sm text-gray-400">点击选择或拖拽文件到此处</p>
                  <p className="text-xs text-gray-300 mt-1">.xlsx · .xls · .csv</p>
                </>
              )}
            </div>
          </div>

          {/* 解析中 */}
          {parsing && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span className="animate-spin">⏳</span> 解析中…
            </div>
          )}

          {/* 解析错误 */}
          {parseError && (
            <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {parseError}
            </div>
          )}

          {/* 解析结果预览 */}
          {matched.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-3">
                <p className="text-xs text-gray-500">
                  共 <b>{totalRows}</b> 数据行 / <b>{matched.length}</b> 个 SKU
                  {skippedRows > 0 && <span className="text-orange-500"> · 跳过 {skippedRows} 行（无 URL）</span>}
                </p>
                <span className="text-xs text-green-600 font-medium">✓ 匹配 {matchedCount} 个</span>
                {unmatchedCount > 0 && (
                  <span className="text-xs text-orange-500">⚠ 未匹配 {unmatchedCount} 个（将跳过）</span>
                )}
              </div>

              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-3 py-2 text-left text-gray-500 font-medium">Variant SKU</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-medium">颜色</th>
                      <th className="px-3 py-2 text-center text-gray-500 font-medium">图片数</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-medium">匹配产品</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-medium">主图预览</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matched.map((m, i) => (
                      <tr key={i} className={[
                        'border-b border-gray-100 last:border-0',
                        m.matched ? '' : 'bg-orange-50',
                      ].join(' ')}>
                        <td className="px-3 py-2 font-mono text-gray-700 max-w-[160px] truncate">
                          {m.group.skuCode}
                        </td>
                        <td className="px-3 py-2 text-gray-600">{m.group.colorPhrase || '—'}</td>
                        <td className="px-3 py-2 text-center text-gray-600">{m.group.images.length}</td>
                        <td className="px-3 py-2 text-gray-700 max-w-[180px] truncate">
                          {m.matched ? (
                            <span className="text-green-700">{m.productName}</span>
                          ) : (
                            <span className="text-orange-500">{m.productName}</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {m.group.images[0] ? (
                            <img
                              src={m.group.images[0]}
                              alt=""
                              className="w-10 h-10 object-cover rounded border border-gray-200"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* 底部操作 */}
        <div className="flex flex-col gap-3 px-6 py-4 bg-gray-50 border-t border-gray-200 shrink-0">
          {/* 未匹配 SKU 选项 */}
          {onCreateStubs && unmatchedCount > 0 && matched.length > 0 && (
            <label className="flex items-start gap-2.5 cursor-pointer p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <input
                type="checkbox"
                checked={createStubs}
                onChange={(e) => setCreateStubs(e.target.checked)}
                className="w-4 h-4 mt-0.5 shrink-0 cursor-pointer"
              />
              <div>
                <span className="text-sm text-amber-800 font-medium">
                  为未匹配的 {unmatchedCount} 个 SKU 创建"待补全"记录
                </span>
                <p className="text-xs text-amber-600 mt-0.5">
                  这些 SKU 在系统中尚未录入。勾选后将带着图片进入"待补全"视图，
                  你可以随时在那里补全款号、名称和价格。
                </p>
              </div>
            </label>
          )}

          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400">
              {matchedCount > 0
                ? `将为 ${matchedCount} 个 SKU 写入图片`
                : '上传文件后预览匹配结果'}
              {createStubs && unmatchedCount > 0 && onCreateStubs
                ? ` · 创建 ${unmatchedCount} 条待补全记录`
                : ''}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-100 transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={matchedCount === 0 && !(createStubs && unmatchedCount > 0 && onCreateStubs)}
                className={[
                  'px-5 py-2 text-sm font-medium rounded-md transition-colors',
                  (matchedCount > 0 || (createStubs && unmatchedCount > 0 && onCreateStubs))
                    ? 'bg-gray-900 text-white hover:bg-gray-700'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed',
                ].join(' ')}
              >
                确认导入
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
