/* ============================================================
 * 产品列表页面
 * 说明: 产品管理核心模块 — 管理所有款式及 SKU 信息、成本与价格
 *       参照设计稿实现：搜索/筛选/列表视图/分页/展开SKU
 * 文件位置: src/app/(dashboard)/products/page.tsx
 * URL: /products
 * ============================================================ */

'use client';

import { useState, useMemo, useEffect, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { guessColorCodeFromSku } from '@/lib/colorDisplay';
import ProductTable from './_components/ProductTable';
import Pagination from './_components/Pagination';
import AddSkuModal from './_components/AddSkuModal';
import EditProductModal from './_components/EditProductModal';
import type { EditProductPatch } from './_components/EditProductModal';
import {
  MOCK_PRODUCTS,
  CATEGORY_OPTIONS,
  STATUS_OPTIONS,
  COLOR_MAP,
  COLOR_NAME_ZH_MAP,
} from './_components/mockData';
import type { ProductListItem, SkuItem } from './_components/mockData';
import { mergeProductsByPatternCode } from './_components/mergeProductsByPattern';
import { SetsContent } from '../sets/page';
import { useUndoManager, useUndoKeyboard } from '@/hooks/useUndoManager';
import UndoToast from '@/components/UndoToast';
import { useColorRegistry } from '@/hooks/useColorRegistry';
import { resolveHexForProductSku } from '@/lib/colorDisplay';
import ImportImagesModal from './_components/ImportImagesModal';
import PendingCompletionView, { type PendingRowSave } from './_components/PendingCompletionView';
import SuspectedSetPendingView, { type SuspectedSetRowSave } from './_components/SuspectedSetPendingView';
import { parseSetPieceCountFromSku, isSuspectedSetPieceCount } from '@/lib/skuSetPieceCount';

const CURRENCY_SYMBOL_MAP: Record<string, string> = {
  USD: '$', CNY: '¥', EUR: '€', GBP: '£', JPY: '¥',
};

/** 待补全：款号或名称为空（从图片导入的空壳记录） */
function isPendingCompletion(p: ProductListItem) {
  return !p.patternCode.trim() || !p.name.trim();
}

function getPrimarySkuCode(p: ProductListItem): string {
  return p.skus[0]?.skuCode ?? p.skus[0]?.skuName ?? '';
}

/** 部分未补全：核心字段已填但辅助字段（包装重量/尺寸）仍空 */
function isPartiallyIncomplete(p: ProductListItem) {
  return (
    p.patternCode.trim() !== '' &&
    p.name.trim() !== '' &&
    p.bulkPrice > 0 &&
    (!p.packWeight.trim() || !p.packSize.trim())
  );
}

const STORAGE_KEY = 'cf_erp_products';

function saveToStorage(data: ProductListItem[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* quota exceeded — silent */ }
}

type ProductTab = 'single' | 'set';

export default function ProductsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400 text-sm">加载中…</div>}>
      <ProductsPageWrapper />
    </Suspense>
  );
}

function ProductsPageWrapper() {
  const [activeTab, setActiveTab] = useState<ProductTab>('single');

  return (
    <div className="flex flex-col gap-2">
      {/* ===== 页面标题 + Tab 切换 ===== */}
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {([
              { key: 'single' as ProductTab, label: '单品管理' },
              { key: 'set' as ProductTab, label: '套装管理' },
            ]).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={[
                  'text-base font-bold px-3 py-1.5 rounded-md border-2 transition-colors',
                  activeTab === tab.key
                    ? 'border-blue-500 text-blue-600 bg-blue-50'
                    : 'border-transparent text-gray-400 hover:text-gray-600',
                ].join(' ')}
              >
                {tab.label}
              </button>
            ))}
            <span className="text-xs text-gray-400 hidden sm:inline border-l border-gray-200 pl-3 ml-0.5">
              {activeTab === 'single'
                ? '单品款式、SKU、成本与价格'
                : '套装 SKU 与纸格款号'}
            </span>
          </div>
        </div>
      </div>

      {/* ===== Tab 内容 ===== */}
      <div style={{ display: activeTab === 'single' ? 'block' : 'none' }}>
        <ProductsPageContent />
      </div>
      <div style={{ display: activeTab === 'set' ? 'block' : 'none' }}>
        <SetsContent showHeader={false} />
      </div>
    </div>
  );
}

function ProductsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const colorRegistry = useColorRegistry();

  /** 从「未录入」点「录入」带入：SKU/单价/颜色；styleName 仅作参考展示，不写入产品名称 */
  const [orderPrefillForCreate, setOrderPrefillForCreate] = useState<{
    sku: string;
    styleName: string;
    colorName: string;
    unitPrice: number;
  } | null>(null);

  /* ===== 数据源（localStorage 持久化，刷新不丢失） ===== */
  const [products, setProductsRaw] = useState<ProductListItem[]>(MOCK_PRODUCTS);
  const undo = useUndoManager<ProductListItem[]>();

  /* 加载时从 localStorage 恢复；相同纸格款号合并为一行，避免多次从未录入建档产生重复行 */
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as ProductListItem[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          const merged = mergeProductsByPatternCode(parsed);
          setProductsRaw(merged);
          saveToStorage(merged);
        }
      }
    } catch { /* 降级为 MOCK 数据 */ }
  }, []);

  /* 每次修改同步写入 localStorage */
  function setProducts(updater: ProductListItem[] | ((prev: ProductListItem[]) => ProductListItem[])) {
    setProductsRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveToStorage(next);
      return next;
    });
  }

  /** Record current state before a mutation */
  function pushUndo(description: string) {
    undo.push(products, description);
  }

  const handleUndo = useCallback(() => {
    const entry = undo.pop();
    if (entry) {
      setProductsRaw(entry.snapshot);
      saveToStorage(entry.snapshot);
    }
  }, [undo]);

  useUndoKeyboard(handleUndo, undo.canUndo);

  const isStoredData = typeof window !== 'undefined' && !!localStorage.getItem(STORAGE_KEY);

  function handleClearStorage() {
    if (!confirm('确认清除所有已保存的修改，恢复演示数据？')) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    setProductsRaw(MOCK_PRODUCTS);
    setPage(1);
    setSelectedIds(new Set());
  }

  /* ===== 弹窗状态 ===== */
  const [addSkuModalProduct, setAddSkuModalProduct] = useState<ProductListItem | null>(null);
  const [editModalProduct, setEditModalProduct] = useState<ProductListItem | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [importImagesOpen, setImportImagesOpen] = useState(false);

  useEffect(() => {
    if (searchParams.get('fromOrder') !== '1') return;
    const sku = searchParams.get('sku')?.trim();
    if (!sku) return;
    const up = Number(searchParams.get('unitPrice'));
    setOrderPrefillForCreate({
      sku,
      styleName: searchParams.get('styleName') ?? '',
      colorName: searchParams.get('colorName') ?? '',
      unitPrice: Number.isFinite(up) ? up : 0,
    });
    setCreateModalOpen(true);
    router.replace('/products', { scroll: false });
  }, [searchParams, router]);

  /* ===== 批量编辑浮动面板 ===== */
  const [batchPanelOpen, setBatchPanelOpen] = useState(false);
  const [batchBulkPrice, setBatchBulkPrice] = useState('');
  const [batchDropshipPrice, setBatchDropshipPrice] = useState('');
  const batchPanelRef = useRef<HTMLDivElement>(null);

  /* 点击面板外部时自动关闭 */
  useEffect(() => {
    if (!batchPanelOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (batchPanelRef.current && !batchPanelRef.current.contains(e.target as Node)) {
        setBatchPanelOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [batchPanelOpen]);

  /* ===== 搜索 & 筛选 ===== */
  const [searchText, setSearchText] = useState('');
  const [batchSearchText, setBatchSearchText] = useState('');
  const [filterStatus, setFilterStatus] = useState('全部状态');
  const [filterCategory, setFilterCategory] = useState('全部');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');

  /* ===== 视图模式 ===== */
  const [viewMode, setViewMode] = useState<'list' | 'card' | 'pending' | 'pendingSets'>('list');

  /* ===== 卡片尺寸滑块（px，控制每列最小宽度） ===== */
  const [cardMinWidth, setCardMinWidth] = useState(220);

  /* ===== 排序 ===== */
  const [sortField, setSortField] = useState('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  function handleSort(field: string) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  /* ===== 分页 ===== */
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  /* ===== 勾选 ===== */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  function toggleItem(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll(selectAll: boolean) {
    if (selectAll) {
      setSelectedIds(new Set(pagedData.map((p) => p.id)));
    } else {
      setSelectedIds(new Set());
    }
  }

  /* ===== SKU 操作 ===== */

  function addSkuToProduct(
    productId: string,
    payload: { skuCode: string; colorCode: string; colorNameZh: string; stock: number; bulkPrice: number; dropshipPrice: number; status: 'active' | 'discontinued' }
  ) {
    pushUndo(`添加 SKU: ${payload.skuCode}`);
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== productId) return p;
        const colorCode = payload.colorCode.toUpperCase();
        const newSku: SkuItem = {
          id: `${p.id}-sku-${Date.now()}`,
          skuName: payload.skuCode,
          colorCode,
          colorNameZh: payload.colorNameZh || undefined,
          skuCode: payload.skuCode,
          stock: payload.stock,
          bulkPrice: payload.bulkPrice,
          dropshipPrice: payload.dropshipPrice,
          status: payload.status,
          updatedAt: new Date().toISOString().slice(0, 10).replace(/-/g, '/'),
        };
        const nextColors = p.colors.includes(colorCode) ? p.colors : [...p.colors, colorCode];
        const nextSkus = [...p.skus, newSku];
        return { ...p, colors: nextColors, skus: nextSkus, skuCount: nextSkus.length };
      })
    );
  }

  function bulkDeleteSkus(productId: string, skuIds: string[]) {
    if (skuIds.length === 0) return;
    if (!confirm(`确认删除已选 ${skuIds.length} 个 SKU？`)) return;
    pushUndo(`删除 ${skuIds.length} 个 SKU`);
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== productId) return p;
        const nextSkus = p.skus.filter((sku) => !skuIds.includes(sku.id));
        const colorSet = new Set(nextSkus.map((sku) => sku.colorCode));
        return { ...p, colors: p.colors.filter((c) => colorSet.has(c)), skus: nextSkus, skuCount: nextSkus.length };
      })
    );
  }

  function bulkModifySkus(productId: string, skuIds: string[], oldText: string, newText: string) {
    if (skuIds.length === 0) return;
    pushUndo(`批量修改 ${skuIds.length} 个 SKU 文本`);
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== productId) return p;
        const nextSkus = p.skus.map((sku) => {
          if (!skuIds.includes(sku.id)) return sku;
          if (oldText) {
            return {
              ...sku,
              skuName: sku.skuName.replaceAll(oldText, newText),
              skuCode: sku.skuCode.replaceAll(oldText, newText),
              updatedAt: new Date().toISOString().slice(0, 10).replace(/-/g, '/'),
            };
          }
          return {
            ...sku,
            skuName: `${sku.skuName}${newText}`,
            skuCode: `${sku.skuCode}${newText}`,
            updatedAt: new Date().toISOString().slice(0, 10).replace(/-/g, '/'),
          };
        });
        return { ...p, skus: nextSkus };
      })
    );
  }

  function updateSku(productId: string, skuId: string, patch: Partial<SkuItem>) {
    pushUndo('修改 SKU 信息');
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== productId) return p;
        return { ...p, skus: p.skus.map((sku) => (sku.id === skuId ? { ...sku, ...patch } : sku)) };
      })
    );
  }

  /* ===== 产品操作 ===== */

  function handleEditProductConfirm(productId: string, patch: EditProductPatch, syncSkuPrices: boolean) {
    const p = products.find((x) => x.id === productId);
    pushUndo(`编辑产品: ${p?.patternCode ?? productId}`);
    setProducts((prev) => {
      const next = prev.map((p) => {
        if (p.id !== productId) return p;
        const updatedSkus = syncSkuPrices
          ? p.skus.map((sku) => ({
              ...sku,
              skuName: `${patch.patternCode}-${sku.colorCode}`,
              bulkPrice: patch.bulkPrice,
              dropshipPrice: patch.dropshipPrice,
              updatedAt: new Date().toISOString().slice(0, 10).replace(/-/g, '/'),
            }))
          : p.skus.map((sku) => ({
              ...sku,
              skuName: `${patch.patternCode}-${sku.colorCode}`,
            }));
        return { ...p, ...patch, skus: updatedSkus };
      });
      return mergeProductsByPatternCode(next);
    });
  }

  function toggleProductStatus(productId: string) {
    const target = products.find((p) => p.id === productId);
    if (!target) return;
    const nextStatus: ProductListItem['status'] = target.status === 'active' ? 'discontinued' : 'active';
    if (!confirm(`确认将产品「${target.name}」${nextStatus === 'active' ? '启用' : '停用'}？`)) return;
    pushUndo(`${nextStatus === 'active' ? '启用' : '停用'}产品: ${target.patternCode}`);
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== productId) return p;
        return {
          ...p,
          status: nextStatus,
          skus: p.skus.map((sku) => ({
            ...sku,
            status: nextStatus,
            updatedAt: new Date().toISOString().slice(0, 10).replace(/-/g, '/'),
          })),
        };
      })
    );
  }

  function exportProducts() {
    const payload = JSON.stringify(filteredData, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `products-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ===== 待补全：产品名或款号为空的记录（拆成单品 / 疑似套装） ===== */
  const pendingProductsAll = useMemo(
    () => products.filter((p) => !p.patternCode.trim() || !p.name.trim()),
    [products]
  );
  const pendingSingleProducts = useMemo(
    () =>
      pendingProductsAll.filter((p) => {
        const n = parseSetPieceCountFromSku(getPrimarySkuCode(p));
        return !isSuspectedSetPieceCount(n);
      }),
    [pendingProductsAll]
  );
  const pendingSuspectedSetProducts = useMemo(
    () =>
      pendingProductsAll.filter((p) =>
        isSuspectedSetPieceCount(parseSetPieceCountFromSku(getPrimarySkuCode(p)))
      ),
    [pendingProductsAll]
  );

  /** 图片导入时，为未匹配 SKU 创建待补全空壳产品 */
  function handleCreateStubs(stubs: ProductListItem[]) {
    if (stubs.length === 0) return;
    pushUndo(`创建 ${stubs.length} 条待补全记录`);
    setProducts((prev) => [...prev, ...stubs]);
    const anySet = stubs.some((s) =>
      isSuspectedSetPieceCount(parseSetPieceCountFromSku(getPrimarySkuCode(s)))
    );
    setViewMode(anySet ? 'pendingSets' : 'pending');
  }

  /** 待补全视图：保存已填写完整的行 */
  function handleSavePendingRows(rows: PendingRowSave[]) {
    if (rows.length === 0) return;
    const savedIds = new Set(rows.map((r) => r.id));
    pushUndo(`从待补全保存 ${rows.length} 条产品`);
    setProducts((prev) => {
      const updated = prev.map((p) => {
        const row = rows.find((r) => r.id === p.id);
        if (!row) return p;
        return {
          ...p,
          patternCode: row.patternCode,
          name: row.name,
          category: row.category,
          bulkPrice: row.bulkPrice,
          dropshipPrice: row.dropshipPrice,
          currency: row.currency,
          packWeight: row.packWeight,
          packSize: row.packSize,
          skus: p.skus.map((sku) => ({
            ...sku,
            bulkPrice: row.bulkPrice,
            dropshipPrice: row.dropshipPrice,
          })),
        };
      });
      /* 同款号合并（相同 patternCode 的多条记录合并为一条） */
      return mergeProductsByPatternCode(updated);
    });
    /* 若单品待补全已全部保存，切回列表视图 */
    if (rows.length >= pendingSingleProducts.length) {
      setViewMode('list');
    }
  }

  /** 疑似套装待补全：保存 */
  function handleSaveSuspectedSetRows(rows: SuspectedSetRowSave[]) {
    if (rows.length === 0) return;
    pushUndo(`从疑似套装待补全保存 ${rows.length} 条产品`);
    setProducts((prev) => {
      const updated = prev.map((p) => {
        const row = rows.find((r) => r.id === p.id);
        if (!row) return p;
        const patternCode = row.patternCodes.map((c) => c.trim()).filter(Boolean).join(' · ');
        const piecePrices = row.pieceBulk.map((b, i) => ({
          bulk: b,
          dropship: row.pieceDropship[i] ?? 0,
        }));
        return {
          ...p,
          patternCode,
          patternCodesMulti: row.patternCodes.map((c) => c.trim()),
          setPieceCount: row.setPieceCount,
          setChildSkuLookups: row.childSkuLookups,
          setPiecePrices: piecePrices,
          name: row.name,
          category: row.category,
          bulkPrice: row.bulkPrice,
          dropshipPrice: row.dropshipPrice,
          currency: row.currency,
          packWeight: row.packWeight,
          packSize: row.packSize,
          skus: p.skus.map((sku) => ({
            ...sku,
            bulkPrice: row.bulkPrice,
            dropshipPrice: row.dropshipPrice,
          })),
        };
      });
      return mergeProductsByPatternCode(updated);
    });
    if (rows.length >= pendingSuspectedSetProducts.length) {
      setViewMode('list');
    }
  }

  /** 待补全视图：放弃（删除）记录 */
  function handleDiscardPendingRows(ids: string[]) {
    pushUndo(`放弃 ${ids.length} 条待补全记录`);
    setProducts((prev) => prev.filter((p) => !ids.includes(p.id)));
  }

  /** 图片批量导入：将解析后的图片写入对应产品的 productImagesByColor */
  function handleApplyImages(updates: { productId: string; colorCode: string; images: string[] }[]) {
    if (updates.length === 0) return;
    pushUndo(`批量导入图片（${updates.length} 个 SKU）`);
    setProducts((prev) =>
      prev.map((p) => {
        const relevantUpdates = updates.filter((u) => u.productId === p.id);
        if (relevantUpdates.length === 0) return p;
        const imagesByColor: Record<string, string[]> = { ...(p.productImagesByColor ?? {}) };
        for (const u of relevantUpdates) {
          imagesByColor[u.colorCode] = u.images;
        }
        // 主图取第一个颜色的第一张图
        const allColors = p.colors.length > 0 ? p.colors : Object.keys(imagesByColor);
        const firstColor = allColors[0] ?? Object.keys(imagesByColor)[0];
        const primaryImage = (imagesByColor[firstColor]?.[0]) ?? p.imageUrl ?? null;
        return {
          ...p,
          imageUrl: primaryImage,
          productImagesByColor: imagesByColor,
        };
      })
    );
  }

  function bulkDeleteProducts() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!confirm(`确认删除已选 ${ids.length} 个产品？此操作将同时删除其下所有 SKU。`)) return;
    pushUndo(`删除 ${ids.length} 个产品`);
    setProducts((prev) => prev.filter((p) => !ids.includes(p.id)));
    setSelectedIds(new Set());
  }

  function applyBulkEdit() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const hasBulk = batchBulkPrice.trim() !== '';
    const hasDrop = batchDropshipPrice.trim() !== '';
    if (!hasBulk && !hasDrop) return;
    const bulkPrice = hasBulk ? Number(batchBulkPrice) : 0;
    const dropshipPrice = hasDrop ? Number(batchDropshipPrice) : 0;
    if ((hasBulk && !Number.isFinite(bulkPrice)) || (hasDrop && !Number.isFinite(dropshipPrice))) return;
    pushUndo(`批量修改 ${ids.length} 个产品价格`);
    setProducts((prev) =>
      prev.map((p) => {
        if (!ids.includes(p.id)) return p;
        return {
          ...p,
          bulkPrice: hasBulk ? bulkPrice : p.bulkPrice,
          dropshipPrice: hasDrop ? dropshipPrice : p.dropshipPrice,
          skus: p.skus.map((sku) => ({
            ...sku,
            bulkPrice: hasBulk ? bulkPrice : sku.bulkPrice,
            dropshipPrice: hasDrop ? dropshipPrice : sku.dropshipPrice,
            updatedAt: new Date().toISOString().slice(0, 10).replace(/-/g, '/'),
          })),
        };
      })
    );
    setBatchBulkPrice('');
    setBatchDropshipPrice('');
    setBatchPanelOpen(false);
  }

  /* ===== 过滤 + 排序逻辑 ===== */
  const filteredData = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    const batchTerms = batchSearchText
      .split(/[\n,，]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const matchesTerm = (p: ProductListItem, term: string) => {
      if (!term) return true;
      return (
        p.patternCode.toLowerCase().includes(term) ||
        p.name.toLowerCase().includes(term) ||
        p.skus.some(
          (sku) =>
            sku.skuName.toLowerCase().includes(term) ||
            sku.skuCode.toLowerCase().includes(term)
        )
      );
    };

    return products.filter((p) => {
      if (keyword && !matchesTerm(p, keyword)) return false;
      if (batchTerms.length > 0 && !batchTerms.some((term) => matchesTerm(p, term))) return false;
      if (filterStatus === '启用' && p.status !== 'active') return false;
      if (filterStatus === '停用' && p.status !== 'discontinued') return false;
      if (filterStatus === '待补全' && !isPendingCompletion(p)) return false;
      if (filterStatus === '部分未补全' && !isPartiallyIncomplete(p)) return false;
      if (filterCategory !== '全部' && p.category !== filterCategory) return false;
      if (dateStart && p.createdAt.replace(/\//g, '-') < dateStart) return false;
      if (dateEnd && p.createdAt.replace(/\//g, '-') > dateEnd) return false;
      return true;
    });
  }, [products, searchText, batchSearchText, filterStatus, filterCategory, dateStart, dateEnd]);

  const sortedData = useMemo(() => {
    const arr = [...filteredData];
    arr.sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      switch (sortField) {
        case 'patternCode': va = a.patternCode; vb = b.patternCode; break;
        case 'name': va = a.name; vb = b.name; break;
        case 'bulkPrice': va = a.bulkPrice; vb = b.bulkPrice; break;
        case 'dropshipPrice': va = a.dropshipPrice; vb = b.dropshipPrice; break;
        case 'createdAt': va = a.createdAt; vb = b.createdAt; break;
        default: va = a.createdAt; vb = b.createdAt;
      }
      if (typeof va === 'number' && typeof vb === 'number') {
        return sortDir === 'asc' ? va - vb : vb - va;
      }
      const cmp = String(va).localeCompare(String(vb));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filteredData, sortField, sortDir]);

  const totalCount = sortedData.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedData = sortedData.slice((safePage - 1) * pageSize, safePage * pageSize);

  function handleReset() {
    setSearchText('');
    setBatchSearchText('');
    setFilterStatus('全部状态');
    setFilterCategory('全部');
    setDateStart('');
    setDateEnd('');
    setPage(1);
    setSelectedIds(new Set());
  }

  function handleRefresh() {
    setPage(1);
    setSelectedIds(new Set());
  }

  const totalProducts = filteredData.length;
  const highlightTerms = useMemo(
    () =>
      [
        searchText.trim(),
        ...batchSearchText.split(/[\n,，]+/).map((s) => s.trim()).filter(Boolean),
      ].filter(Boolean),
    [searchText, batchSearchText]
  );

  return (
    <div className="flex flex-col gap-3">

      {/* ===== 弹窗 ===== */}
      <ImportImagesModal
        open={importImagesOpen}
        products={products}
        onClose={() => setImportImagesOpen(false)}
        onApply={handleApplyImages}
        onCreateStubs={handleCreateStubs}
      />
      <AddSkuModal
        open={addSkuModalProduct !== null}
        product={addSkuModalProduct}
        onClose={() => setAddSkuModalProduct(null)}
        onConfirm={addSkuToProduct}
      />
      <EditProductModal
        open={editModalProduct !== null}
        product={editModalProduct}
        onClose={() => setEditModalProduct(null)}
        onConfirm={handleEditProductConfirm}
        onToggleStatus={toggleProductStatus}
      />
      {/* 新建产品使用同一个弹窗，product=null 时展示空白表单 */}
      <CreateProductModal
        open={createModalOpen}
        orderPrefill={orderPrefillForCreate}
        onClose={() => {
          setCreateModalOpen(false);
          setOrderPrefillForCreate(null);
        }}
        onConfirm={(product) => {
          const prefill = orderPrefillForCreate;
          pushUndo(`新建产品: ${product.patternCode}`);
          setProducts((prev) => {
            let row = product;
            if (prefill) {
              const o = prefill;
              const code = guessColorCodeFromSku(o.sku) ?? 'BLK';
              const zh =
                COLOR_NAME_ZH_MAP[code] ||
                (o.colorName?.trim() ? o.colorName.trim() : undefined);
              const sku: SkuItem = {
                id: `${product.id}-sku-${Date.now()}`,
                skuName: o.sku,
                skuCode: o.sku,
                colorCode: code,
                colorNameZh: zh,
                colorPhrase: o.colorName?.trim() || undefined,
                stock: 0,
                bulkPrice: product.bulkPrice,
                dropshipPrice: product.dropshipPrice,
                status: 'active',
                updatedAt: new Date().toISOString().slice(0, 10).replace(/-/g, '/'),
              };
              const colors = product.colors.includes(code)
                ? product.colors
                : [...product.colors, code];
              row = { ...product, skus: [sku], skuCount: 1, colors };
            }
            return mergeProductsByPatternCode([row, ...prev]);
          });
          setOrderPrefillForCreate(null);
          setPage(1);
        }}
      />

      {/* ===== 搜索 & 筛选区域（含导出/新建，避免顶部整行空白） ===== */}
      <div className="bg-white border border-gray-200 rounded-lg p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2 border-b border-gray-100">
          <span className="text-sm font-medium text-gray-700">筛选条件</span>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {isStoredData && (
              <button
                onClick={handleClearStorage}
                className="text-xs text-red-400 hover:text-red-600 border border-red-200 rounded px-2 py-0.5 transition-colors"
                title="清除已保存的修改，恢复演示数据"
              >
                ✕ 清除保存
              </button>
            )}
            <a
              href={`/templates/${encodeURIComponent('单品管理-导入模板.csv')}`}
              download="单品管理-导入模板.csv"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-md hover:bg-gray-50 transition-colors text-gray-600"
            >
              导入模板
            </a>
            <button
              onClick={() => setImportImagesOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-md hover:bg-gray-50 transition-colors text-gray-600"
            >
              🖼️ 批量导入图片
            </button>
            <button
              onClick={exportProducts}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-md hover:bg-gray-50 transition-colors text-gray-600"
            >
              ↓ 导出
            </button>
            <button
              onClick={() => setCreateModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-700 transition-colors font-medium"
            >
              + 新建产品
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-x-2 sm:gap-x-3 gap-y-2">
          <div className="w-full sm:w-[min(100%,220px)] shrink-0">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
              <input
                type="text"
                placeholder="搜索款号、产品名称或 SKU"
                value={searchText}
                onChange={(e) => { setSearchText(e.target.value); setPage(1); }}
                className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white"
              />
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5 leading-tight">款号 / 名称 / SKU</p>
          </div>

          <div className="w-full sm:w-[min(100%,260px)] shrink-0">
            <textarea
              placeholder="批量搜索（款号/SKU，逗号或换行）"
              value={batchSearchText}
              onChange={(e) => { setBatchSearchText(e.target.value); setPage(1); }}
              rows={2}
              className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white resize-none leading-snug"
            />
            <p className="text-[11px] text-gray-400 mt-0.5 leading-tight">多值用逗号或换行分隔</p>
          </div>

          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-gray-500 font-medium">分类</label>
            <select
              value={filterCategory}
              onChange={(e) => { setFilterCategory(e.target.value); setPage(1); }}
              className="px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white min-w-[100px]"
            >
              {CATEGORY_OPTIONS.map((opt) => <option key={opt}>{opt}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-gray-500 font-medium">状态</label>
            <select
              value={filterStatus}
              onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
              className="px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white min-w-[120px]"
            >
              {STATUS_OPTIONS.map((opt) => <option key={opt}>{opt}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-gray-500 font-medium">创建日期</label>
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={dateStart}
                onChange={(e) => { setDateStart(e.target.value); setPage(1); }}
                className="px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white"
              />
              <span className="text-gray-400 text-xs shrink-0">→</span>
              <input
                type="date"
                value={dateEnd}
                onChange={(e) => { setDateEnd(e.target.value); setPage(1); }}
                className="px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white"
              />
            </div>
          </div>

          <div className="flex flex-col gap-0.5 justify-end">
            <label className="text-xs text-transparent font-medium select-none">_</label>
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleReset}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-md hover:bg-gray-50 transition-colors text-gray-600"
              >
                重置
              </button>
              <button
                onClick={() => setPage(1)}
                className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-700 transition-colors font-medium"
              >
                🔍 搜索
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ===== 工具栏 ===== */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center border border-gray-200 rounded-md overflow-hidden">
            <button
              onClick={() => setViewMode('list')}
              className={[
                'px-3 py-1.5 text-sm transition-colors',
                viewMode === 'list' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50',
              ].join(' ')}
            >
              ☰ 列表
            </button>
            <button
              onClick={() => setViewMode('card')}
              className={[
                'px-3 py-1.5 text-sm transition-colors',
                viewMode === 'card' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50',
              ].join(' ')}
            >
              ▦ 卡片
            </button>
          </div>

          {/* 待补全入口 — 仅「单品」待补全（SKU 首段横杠后数字为 1 或无法识别件数） */}
          <button
            type="button"
            onClick={() => {
              if (viewMode === 'pending') setViewMode('list');
              else setViewMode('pending');
            }}
            className={[
              'relative flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-md transition-colors',
              viewMode === 'pending'
                ? 'bg-amber-500 text-white border-amber-500'
                : pendingSingleProducts.length > 0
                  ? 'border-amber-400 text-amber-700 bg-amber-50 hover:bg-amber-100'
                  : 'border-gray-200 text-gray-400 hover:bg-gray-50',
            ].join(' ')}
          >
            ✎ 待补全
            {pendingSingleProducts.length > 0 && (
              <span
                className={[
                  'inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[11px] font-bold rounded-full',
                  viewMode === 'pending' ? 'bg-white text-amber-600' : 'bg-amber-500 text-white',
                ].join(' ')}
              >
                {pendingSingleProducts.length}
              </span>
            )}
          </button>

          {/* 疑似套装待补全：SKU 首段横杠后数字 ≥2 */}
          <button
            type="button"
            onClick={() => {
              if (viewMode === 'pendingSets') setViewMode('list');
              else setViewMode('pendingSets');
            }}
            className={[
              'relative flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-md transition-colors',
              viewMode === 'pendingSets'
                ? 'bg-violet-600 text-white border-violet-600'
                : pendingSuspectedSetProducts.length > 0
                  ? 'border-violet-400 text-violet-800 bg-violet-50 hover:bg-violet-100'
                  : 'border-gray-200 text-gray-400 hover:bg-gray-50',
            ].join(' ')}
          >
            待补全 · 疑似套装
            {pendingSuspectedSetProducts.length > 0 && (
              <span
                className={[
                  'inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[11px] font-bold rounded-full',
                  viewMode === 'pendingSets' ? 'bg-white text-violet-700' : 'bg-violet-600 text-white',
                ].join(' ')}
              >
                {pendingSuspectedSetProducts.length}
              </span>
            )}
          </button>

          <span className="text-sm text-gray-500">
            共 <b className="text-gray-700">{totalProducts}</b> 个款式
          </span>

          {/* 批量操作入口：仅勾选后可用，点击展开浮动面板 */}
          <div className="relative" ref={batchPanelRef}>
            <button
              type="button"
              disabled={selectedIds.size === 0}
              onClick={() => selectedIds.size > 0 && setBatchPanelOpen((v) => !v)}
              className={[
                'px-3 py-1.5 text-sm border rounded-md transition-colors',
                selectedIds.size === 0
                  ? 'border-gray-100 text-gray-300 cursor-not-allowed'
                  : batchPanelOpen
                    ? 'border-gray-400 bg-gray-100 text-gray-800'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50',
              ].join(' ')}
            >
              批量操作{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''} ▾
            </button>

            {/* 浮动面板：不遮挡表格，点击外部自动关闭 */}
            {batchPanelOpen && (
              <div
                className="absolute left-0 top-full mt-1.5 z-30 w-72 bg-white rounded-xl border border-gray-200 shadow-xl"
                onKeyDown={(e) => e.stopPropagation()}
              >
                <div className="px-4 pt-4 pb-2">
                  <p className="text-xs font-semibold text-gray-500 mb-3">
                    批量编辑 · 已选 <span className="text-gray-800">{selectedIds.size}</span> 个产品
                  </p>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">统一设置大货价（留空跳过）</label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        placeholder="输入新价格"
                        value={batchBulkPrice}
                        onChange={(e) => setBatchBulkPrice(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                        className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">统一设置一件代发价（留空跳过）</label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        placeholder="输入新价格"
                        value={batchDropshipPrice}
                        onChange={(e) => setBatchDropshipPrice(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                        className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 mt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setBatchPanelOpen(false);
                      bulkDeleteProducts();
                    }}
                    className="px-3 py-1.5 text-xs text-red-500 border border-red-200 rounded-md hover:bg-red-50 transition-colors"
                  >
                    🗑 删除选中
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setBatchPanelOpen(false)}
                      className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={applyBulkEdit}
                      disabled={!batchBulkPrice.trim() && !batchDropshipPrice.trim()}
                      className={[
                        'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                        (batchBulkPrice.trim() || batchDropshipPrice.trim())
                          ? 'bg-gray-900 text-white hover:bg-gray-700'
                          : 'bg-gray-100 text-gray-300 cursor-not-allowed',
                      ].join(' ')}
                    >
                      应用修改
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {selectedIds.size > 0 && (
            <span className="text-xs text-blue-500">已选 {selectedIds.size} 项</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* 卡片尺寸滑块 — 仅卡片视图显示 */}
          {viewMode === 'card' && (
            <div className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 rounded-md bg-white">
              <span className="text-gray-400 text-xs select-none">小</span>
              <input
                type="range"
                min={110}
                max={300}
                step={10}
                value={cardMinWidth}
                onChange={(e) => setCardMinWidth(Number(e.target.value))}
                className="w-24 h-1.5 accent-gray-700 cursor-pointer"
              />
              <span className="text-gray-400 text-xs select-none">大</span>
            </div>
          )}
          <button
            onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
            className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-200 rounded-md hover:bg-gray-50 transition-colors text-gray-600"
          >
            ⇅ 排序
          </button>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-200 rounded-md hover:bg-gray-50 transition-colors text-gray-600"
          >
            ↻ 刷新
          </button>
        </div>
      </div>

      {/* ===== 撤回操作提示 ===== */}
      <UndoToast
        canUndo={undo.canUndo}
        nextDescription={undo.nextDescription}
        undoCount={undo.undoCount}
        onUndo={handleUndo}
        lastUndone={undo.lastUndone}
        onDismiss={undo.dismissLastUndone}
      />

      {/* ===== 待补全视图（单品） ===== */}
      {viewMode === 'pending' && (
        <PendingCompletionView
          data={pendingSingleProducts}
          onSaveRows={handleSavePendingRows}
          onDiscardRows={handleDiscardPendingRows}
        />
      )}

      {/* ===== 待补全视图（疑似套装） ===== */}
      {viewMode === 'pendingSets' && (
        <SuspectedSetPendingView
          data={pendingSuspectedSetProducts}
          allProducts={products}
          onSaveRows={handleSaveSuspectedSetRows}
          onDiscardRows={handleDiscardPendingRows}
        />
      )}

      {/* ===== 数据表格 ===== */}
      <div
        className={[
          'bg-white border border-gray-200 rounded-lg',
          viewMode === 'pending' || viewMode === 'pendingSets' ? 'hidden' : '',
        ].join(' ')}
      >
        {viewMode === 'list' ? (
          <>
            <ProductTable
              data={pagedData}
              selectedIds={selectedIds}
              onToggleItem={toggleItem}
              onToggleAll={toggleAll}
              sortField={sortField}
              sortDir={sortDir}
              onSort={handleSort}
              highlightTerms={highlightTerms}
              onRequestAddSku={(productId) => {
                const p = products.find((x) => x.id === productId);
                if (p) setAddSkuModalProduct(p);
              }}
              onBulkDeleteSkus={bulkDeleteSkus}
              onBulkModifySkus={bulkModifySkus}
              onUpdateSku={updateSku}
              onEditProduct={(product) => setEditModalProduct(product)}
            />
            <div className="px-4">
              <Pagination
                total={totalCount}
                page={safePage}
                pageSize={pageSize}
                onPageChange={(p) => { setPage(p); setSelectedIds(new Set()); }}
                onPageSizeChange={(s) => { setPageSize(s); setPage(1); setSelectedIds(new Set()); }}
              />
            </div>
          </>
        ) : (
          <>
            <div
              className="grid gap-3 p-4"
              style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${cardMinWidth}px, 1fr))` }}
            >
              {pagedData.map((product) => {
                const sym = CURRENCY_SYMBOL_MAP[product.currency] ?? product.currency;
                const LIGHT_SET = new Set(['WHT', 'CRM', 'LPK', 'LBL', 'BGE']);
                const isSelected = selectedIds.has(product.id);
                const terms = highlightTerms.map((t) => t.toLowerCase());
                const highlighted = terms.length > 0 && terms.some(
                  (t) => product.patternCode.toLowerCase().includes(t) || product.name.toLowerCase().includes(t)
                );
                return (
                  <div
                    key={product.id}
                    onDoubleClick={() => router.push(`/products/${product.id}`)}
                    className={[
                      'relative flex flex-col bg-white rounded-2xl border shadow-sm overflow-hidden transition-all hover:shadow-md',
                      isSelected ? 'border-blue-300 ring-2 ring-blue-100' : highlighted ? 'border-amber-300 ring-2 ring-amber-50' : 'border-gray-100',
                    ].join(' ')}
                  >
                    {/* 勾选 */}
                    <div className="absolute top-2.5 left-2.5 z-10">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleItem(product.id)}
                        className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500 bg-white"
                      />
                    </div>

                    {/* 图片区 — 正方形，作为视觉主体 */}
                    <div className="w-full aspect-square bg-gray-50 flex items-center justify-center overflow-hidden select-none">
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-5xl">👜</span>
                      )}
                    </div>

                    {/* 状态角标 */}
                    <div className="absolute top-2.5 right-2.5">
                      {product.status === 'active' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs text-green-600 bg-green-50 rounded-full border border-green-100">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> 启用
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs text-gray-400 bg-gray-50 rounded-full border border-gray-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-300" /> 停用
                        </span>
                      )}
                    </div>

                    {/* 信息区 */}
                    <div className="flex flex-col gap-1.5 px-2.5 py-2 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-semibold text-gray-900 text-sm truncate">{product.patternCode}</span>
                        <button
                          type="button"
                          onClick={() => navigator.clipboard.writeText(product.patternCode)}
                          className="text-xs text-blue-400 hover:text-blue-600 shrink-0 transition-colors"
                        >
                          复制
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 truncate leading-tight">{product.name}</p>
                      <div className="flex items-center gap-1 flex-wrap">
                        {(product.skus?.length ?? 0) > 0
                          ? (product.skus ?? []).slice(0, 6).map((s) => {
                              const hex = resolveHexForProductSku(s, colorRegistry);
                              const light =
                                LIGHT_SET.has(s.colorCode) ||
                                (hex.startsWith('#') &&
                                  (() => {
                                    try {
                                      const r = parseInt(hex.slice(1, 3), 16);
                                      const g = parseInt(hex.slice(3, 5), 16);
                                      const b = parseInt(hex.slice(5, 7), 16);
                                      return (r * 299 + g * 587 + b * 114) / 1000 > 200;
                                    } catch {
                                      return false;
                                    }
                                  })());
                              return (
                                <span
                                  key={s.id}
                                  title={s.skuName || s.colorCode}
                                  className="inline-block w-4 h-4 rounded shrink-0"
                                  style={{ backgroundColor: hex, border: light ? '1px solid #d1d5db' : 'none' }}
                                />
                              );
                            })
                          : product.colors.slice(0, 6).map((code) => {
                              const hex = COLOR_MAP[code] ?? (code.startsWith('#') ? code : '#9ca3af');
                              const isLight = LIGHT_SET.has(code);
                              return (
                                <span
                                  key={code}
                                  title={code}
                                  className="inline-block w-4 h-4 rounded shrink-0"
                                  style={{ backgroundColor: hex, border: isLight ? '1px solid #d1d5db' : 'none' }}
                                />
                              );
                            })}
                        {(product.skus?.length ?? 0) > 6 ? (
                          <span className="text-xs text-gray-400">+{(product.skus ?? []).length - 6}</span>
                        ) : product.colors.length > 6 ? (
                          <span className="text-xs text-gray-400">+{product.colors.length - 6}</span>
                        ) : null}
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-500 pt-1.5 border-t border-gray-50 mt-auto">
                        <span>大货 <b className="text-gray-800 font-mono">{sym}{product.bulkPrice.toFixed(2)}</b></span>
                        <span>代发 <b className="text-gray-800 font-mono">{sym}{product.dropshipPrice.toFixed(2)}</b></span>
                      </div>
                    </div>

                    {/* 操作按钮 */}
                    <div className="px-2.5 pb-2.5">
                      <button
                        type="button"
                        onClick={() => setEditModalProduct(product)}
                        className="w-full py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        ✏️ 编辑信息
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="px-4">
              <Pagination
                total={totalCount}
                page={safePage}
                pageSize={pageSize}
                onPageChange={(p) => { setPage(p); setSelectedIds(new Set()); }}
                onPageSizeChange={(s) => { setPageSize(s); setPage(1); setSelectedIds(new Set()); }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}


/* ============================================================
 * 新建产品弹窗（内联，避免额外文件）
 * ============================================================ */
interface OrderPrefillInput {
  sku: string;
  styleName: string;
  colorName: string;
  unitPrice: number;
}

interface CreateProductModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (product: ProductListItem) => void;
  /** 从客户订单「未录入」跳转：预填大货价等；产品名称须自填（与订单 Style Name 不是同一字段） */
  orderPrefill: OrderPrefillInput | null;
}

const CURRENCIES_CREATE = ['USD', 'CNY', 'EUR', 'GBP', 'JPY'];
const CATEGORIES_CREATE = CATEGORY_OPTIONS.filter((c) => c !== '全部');

function CreateProductModal({ open, onClose, onConfirm, orderPrefill }: CreateProductModalProps) {
  const [patternCode, setPatternCode] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('手袋');
  const [currency, setCurrency] = useState('USD');
  const [packWeight, setPackWeight] = useState('');
  const [packSize, setPackSize] = useState('');
  const [bulkPrice, setBulkPrice] = useState('');
  const [dropshipPrice, setDropshipPrice] = useState('');

  useEffect(() => {
    if (!open) return;
    if (orderPrefill) {
      setPatternCode('');
      /* 产品名称：内部款式统称（与纸格款号同属一款），勿用订单 Style Name（按 SKU 一行一个） */
      setName('');
      setCategory('手袋');
      setCurrency('USD');
      setPackWeight('');
      setPackSize('');
      const bulk = orderPrefill.unitPrice;
      setBulkPrice(String(bulk));
      /* 一件代发价：用建议倍率，非订单 EXW 单价；用户可改 */
      const sug =
        bulk > 0 ? (Math.round(bulk * 1.22 * 100) / 100).toFixed(2) : '';
      setDropshipPrice(sug);
    } else {
      setPatternCode('');
      setName('');
      setCategory('手袋');
      setCurrency('USD');
      setPackWeight('');
      setPackSize('');
      setBulkPrice('');
      setDropshipPrice('');
    }
  }, [open, orderPrefill]);

  const isValid = patternCode.trim() && name.trim() &&
    Number.isFinite(Number(bulkPrice)) && bulkPrice !== '' &&
    Number.isFinite(Number(dropshipPrice)) && dropshipPrice !== '';

  function handleConfirm() {
    if (!isValid) return;
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
    const id = `p${String(Date.now()).slice(-6)}`;
    onConfirm({
      id, patternCode: patternCode.trim(), name: name.trim(), category,
      imageUrl: null, colors: [], bulkPrice: Number(bulkPrice),
      dropshipPrice: Number(dropshipPrice), currency, packWeight: packWeight.trim(),
      packSize: packSize.trim(), status: 'active', createdAt: today, skuCount: 0, skus: [],
    });
    onClose();
  }

  if (!open) return null;

  const inputCls = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-800">
              {orderPrefill ? '新建产品（从订单引入）' : '新建产品'}
            </h2>
            {orderPrefill && (
              <p className="text-xs text-gray-500 mt-1 space-y-1">
                <span>
                  已带入 SKU <span className="font-mono text-gray-700">{orderPrefill.sku}</span>
                  {orderPrefill.colorName ? (
                    <> · 颜色参考：{orderPrefill.colorName}</>
                  ) : null}
                  ；创建后将自动增加一条对应 SKU（大货价与下表一致，一件代发价独立填写）。
                </span>
                {orderPrefill.styleName.trim() ? (
                  <span className="block text-amber-800/90">
                    订单 Style Name（本 SKU，仅供参考，勿当作产品名称）：{orderPrefill.styleName.trim()}
                  </span>
                ) : null}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">纸格款号 *</label>
              <input type="text" value={patternCode} onChange={(e) => setPatternCode(e.target.value)} className={inputCls} placeholder="如 CITYBAG-AP1" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">产品名称（内部）*</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputCls}
                placeholder="内部款式名称，与纸格款号同属一款"
              />
              <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
                与订单总览里的 Style Name 不同：Style Name 随客户 SKU 一行一个；此处为全公司统一的款式名称。
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">分类</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
                {CATEGORIES_CREATE.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">采购币种</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputCls}>
                {CURRENCIES_CREATE.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">包装重量</label>
              <input type="text" placeholder="如 0.85 kg" value={packWeight} onChange={(e) => setPackWeight(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">包装尺寸</label>
              <input type="text" placeholder="如 25×18×12 cm" value={packSize} onChange={(e) => setPackSize(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">大货价 *</label>
              <input type="number" min={0} step={0.01} value={bulkPrice} onChange={(e) => setBulkPrice(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} className={inputCls} />
              {orderPrefill && (
                <p className="text-[11px] text-blue-600 mt-0.5">默认已填订单 EXW 单价，作为本产品大货价</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">一件代发价 *</label>
              <input type="number" min={0} step={0.01} value={dropshipPrice} onChange={(e) => setDropshipPrice(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} className={inputCls} />
              {orderPrefill && (
                <p className="text-[11px] text-gray-500 mt-0.5">建议值（大货×1.22），非订单字段，请按实际代发价核对</p>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 border-t border-gray-200">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-100 transition-colors">取消</button>
          <button
            type="button"
            onClick={handleConfirm} disabled={!isValid}
            className={['px-5 py-2 text-sm font-medium rounded-md transition-colors',
              isValid ? 'bg-gray-900 text-white hover:bg-gray-700' : 'bg-gray-200 text-gray-400 cursor-not-allowed'].join(' ')}
          >
            创建
          </button>
        </div>
      </div>
    </div>
  );
}
