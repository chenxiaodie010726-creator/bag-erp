/* ============================================================
 * 产品详情页 — 双击列表行进入
 * ============================================================ */

'use client';

import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  COLOR_MAP,
  COLOR_NAME_MAP,
  type ProductListItem,
  type SkuItem,
} from '../_components/mockData';
import AddSkuModal, { type AddSkuPayload } from '../_components/AddSkuModal';
import SkuChineseColorCell from '../_components/SkuChineseColorCell';
import { loadProductById, saveProduct } from '../_components/loadFromStorage';
import { resolveHexForProductSku, isLightColorHex } from '@/lib/colorDisplay';
import { useColorRegistry } from '@/hooks/useColorRegistry';

const CURRENCY_SYMBOL: Record<string, string> = {
  USD: '$', CNY: '¥', EUR: '€', GBP: '£', JPY: '¥',
};
const LIGHT = new Set(['WHT', 'CRM', 'LPK', 'LBL', 'BGE']);
const EMPTY_GALLERY: string[] = [];

function deriveProductTags(p: ProductListItem): string[] {
  return [p.category, '热销', '现货'].filter(Boolean);
}

function historyStorageKey(productId: string) {
  return `cf_erp_product_history_${productId}`;
}

type HistoryEntry = { at: string; product: ProductListItem };

const MAX_HISTORY = 15;

function loadHistoryEntries(productId: string): HistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(historyStorageKey(productId));
    if (!raw) return [];
    const p = JSON.parse(raw) as { entries?: HistoryEntry[] };
    return Array.isArray(p?.entries) ? p.entries : [];
  } catch {
    return [];
  }
}

function persistHistoryEntries(productId: string, entries: HistoryEntry[]) {
  try {
    localStorage.setItem(historyStorageKey(productId), JSON.stringify({ entries: entries.slice(0, MAX_HISTORY) }));
  } catch { /* quota */ }
}

function pushHistorySnapshot(productId: string, product: ProductListItem) {
  const snap = JSON.parse(JSON.stringify(product)) as ProductListItem;
  const entries = loadHistoryEntries(productId);
  entries.unshift({ at: new Date().toISOString(), product: snap });
  persistHistoryEntries(productId, entries);
}

function deriveListImageUrl(colors: string[], byColor: Record<string, string[]>): string | null {
  for (const c of colors) {
    const arr = byColor[c];
    if (arr?.length) return arr[0] ?? null;
  }
  for (const arr of Object.values(byColor)) {
    if (arr?.length) return arr[0] ?? null;
  }
  return null;
}

function seedImagesByColor(product: ProductListItem): Record<string, string[]> {
  const existing = product.productImagesByColor;
  if (existing && Object.keys(existing).length > 0) {
    return { ...existing };
  }
  const out: Record<string, string[]> = {};
  for (const c of product.colors) out[c] = [];
  if (product.imageUrl) {
    const first = product.colors[0] ?? 'default';
    out[first] = [product.imageUrl];
  }
  return out;
}

/* ══════════════════════════════════════════════════
 * 可交互图库 — 受控：图片由父组件持久化到产品与 localStorage
 * ══════════════════════════════════════════════════ */
function ImageGallery({
  placeholder,
  colorKey,
  images,
  onImagesChange,
}: {
  placeholder: string;
  colorKey: string;
  images: string[];
  onImagesChange: (next: string[]) => void;
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const mainInputRef = useRef<HTMLInputElement>(null);
  const thumbInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setActiveIdx(0);
  }, [colorKey]);

  useEffect(() => {
    setActiveIdx((i) => {
      if (images.length === 0) return 0;
      return Math.min(i, images.length - 1);
    });
  }, [images]);

  useEffect(() => {
    if (!lightboxOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setLightboxOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxOpen]);

  function readFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const readers = Array.from(files).map(
      (file) => new Promise<string>((res) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result as string);
        fr.readAsDataURL(file);
      }),
    );
    Promise.all(readers).then((urls) => {
      const existing = images;
      const newList = [...existing, ...urls];
      onImagesChange(newList);
      setActiveIdx(existing.length);
    });
  }

  const prev = () => {
    const len = Math.max(images.length, 1);
    setActiveIdx((i) => (i - 1 + len) % len);
  };
  const next = () => {
    const len = Math.max(images.length, 1);
    setActiveIdx((i) => (i + 1) % len);
  };

  function lightboxPrev(e: React.MouseEvent) {
    e.stopPropagation();
    const len = images.length;
    if (len <= 1) return;
    setActiveIdx((i) => (i - 1 + len) % len);
  }
  function lightboxNext(e: React.MouseEvent) {
    e.stopPropagation();
    const len = images.length;
    if (len <= 1) return;
    setActiveIdx((i) => (i + 1) % len);
  }

  return (
    <div className="mx-auto w-full max-w-[200px] shrink-0 space-y-2 lg:mx-0">
      <div
        className={[
          'relative aspect-square rounded-xl border-2 transition-colors overflow-hidden cursor-pointer select-none',
          dragging ? 'border-blue-400 bg-blue-50' : 'border-dashed border-gray-200 bg-gray-50',
        ].join(' ')}
        onClick={() => !images.length && mainInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); readFiles(e.dataTransfer.files); }}
      >
        {images.length > 0 ? (
          <>
            <button
              type="button"
              title="点击查看大图"
              className="absolute inset-0 z-10 block w-full h-full p-0 border-0 cursor-zoom-in bg-transparent"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxOpen(true);
              }}
            >
              <img src={images[activeIdx]} alt="" className="w-full h-full object-cover pointer-events-none" />
            </button>
            {images.length > 1 && (
              <>
                <button type="button" onClick={(e) => { e.stopPropagation(); prev(); }}
                  className="absolute left-2 top-1/2 z-20 -translate-y-1/2 w-7 h-7 flex items-center justify-center bg-white/80 hover:bg-white rounded-full shadow text-gray-600 text-sm transition-colors">‹</button>
                <button type="button" onClick={(e) => { e.stopPropagation(); next(); }}
                  className="absolute right-2 top-1/2 z-20 -translate-y-1/2 w-7 h-7 flex items-center justify-center bg-white/80 hover:bg-white rounded-full shadow text-gray-600 text-sm transition-colors">›</button>
              </>
            )}
            <div className="absolute bottom-2 right-2 z-20 px-2 py-0.5 bg-black/40 text-white text-xs rounded-full">{activeIdx + 1}/{images.length}</div>
            <button type="button" onClick={(e) => { e.stopPropagation(); mainInputRef.current?.click(); }}
              className="absolute bottom-2 left-2 z-20 px-2 py-0.5 bg-black/40 hover:bg-black/60 text-white text-xs rounded-full transition-colors">+ 上传</button>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-2 text-gray-400">
            <span className="text-3xl leading-none">{placeholder}</span>
            <span className="text-center text-sm font-medium text-gray-500">
              {colorKey === 'default' ? '点击上传 颜色主图' : `点击上传 ${colorKey} 颜色主图`}
            </span>
          </div>
        )}
        <input ref={mainInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => readFiles(e.target.files)} />
      </div>

      {images.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {images.map((src, i) => (
            <button key={i} type="button"
              onClick={() => setActiveIdx(i)}
              className={['w-9 h-9 rounded-md shrink-0 border-2 overflow-hidden transition-colors',
                i === activeIdx ? 'border-gray-800' : 'border-transparent hover:border-gray-300'].join(' ')}>
              <img src={src} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
          <button type="button" onClick={() => thumbInputRef.current?.click()}
            className="w-9 h-9 rounded-md shrink-0 border-2 border-dashed border-gray-200 flex items-center justify-center text-gray-300 hover:border-gray-400 hover:text-gray-400 transition-colors text-lg">+</button>
          <input ref={thumbInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => readFiles(e.target.files)} />
        </div>
      )}

      {images.length === 0 && (
        <p className="text-xs text-center text-gray-400 leading-relaxed">
          支持 JPG、PNG、WebP；保存后写入产品与列表
        </p>
      )}

      {lightboxOpen && images.length > 0 && images[activeIdx] && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="图片预览"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 text-white text-2xl leading-none hover:bg-white/20 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              setLightboxOpen(false);
            }}
            aria-label="关闭"
          >
            ×
          </button>
          {images.length > 1 && (
            <>
              <button
                type="button"
                className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-11 h-11 flex items-center justify-center rounded-full bg-white/15 text-white text-xl hover:bg-white/25 transition-colors"
                onClick={lightboxPrev}
                aria-label="上一张"
              >
                ‹
              </button>
              <button
                type="button"
                className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-11 h-11 flex items-center justify-center rounded-full bg-white/15 text-white text-xl hover:bg-white/25 transition-colors"
                onClick={lightboxNext}
                aria-label="下一张"
              >
                ›
              </button>
            </>
          )}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/80 text-sm">
            {activeIdx + 1} / {images.length}
          </div>
          <img
            src={images[activeIdx]}
            alt=""
            className="max-w-full max-h-[90vh] w-auto h-auto object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════
 * 右侧文件上传
 * ══════════════════════════════════════════════════ */
function SidebarFiles() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<{ name: string; size: string }[]>([
    { name: '尺寸表.xlsx', size: '45 KB' },
    { name: '主图.psd', size: '2.4 MB' },
  ]);

  function handleFiles(fl: FileList | null) {
    if (!fl) return;
    const newFiles = Array.from(fl).map((f) => ({
      name: f.name,
      size: f.size > 1024 * 1024
        ? `${(f.size / 1024 / 1024).toFixed(1)} MB`
        : `${Math.round(f.size / 1024)} KB`,
    }));
    setFiles((prev) => [...prev, ...newFiles]);
  }

  function getIcon(name: string) {
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'psd'].includes(ext)) return '🖼';
    if (['xlsx', 'xls', 'csv'].includes(ext)) return '📊';
    if (['pdf'].includes(ext)) return '📄';
    return '📁';
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-gray-800">相关文件</h3>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="mb-3 w-full rounded-lg border border-dashed border-gray-200 py-2 text-sm text-gray-500 transition-colors hover:border-gray-300 hover:bg-gray-50"
      >
        + 上传文件
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <p className="text-xs text-gray-400 mb-2">支持 JPG、PNG、PSD、AI、XLSX 等</p>
      <ul className="space-y-1">
        {files.map((f, i) => (
          <li key={i} className="flex items-center justify-between gap-2 py-1 border-b border-gray-50 last:border-0">
            <span className="flex items-center gap-1.5 text-xs text-gray-600 truncate">
              {getIcon(f.name)} <span className="truncate">{f.name}</span>
            </span>
            <span className="text-xs text-gray-400 shrink-0">{f.size}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ══════════════════════════════════════════════════
 * 主页面
 * ══════════════════════════════════════════════════ */
export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === 'string' ? params.id : '';
  const colorRegistry = useColorRegistry();

  const [product, setProduct] = useState<ProductListItem | null>(null);
  const [tab, setTab] = useState<'sku' | 'price' | 'stock' | 'log' | 'cost' | 'usage'>('sku');
  /** 与 SKU 行一一对应；图库仍按该 SKU 的 colorCode 取 productImagesByColor */
  const [activeSkuId, setActiveSkuId] = useState<string>('');
  /** 与保存、列表主图同步 */
  const [imagesByColor, setImagesByColor] = useState<Record<string, string[]>>({});
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [saveFlash, setSaveFlash] = useState<string | null>(null);
  const [addSkuOpen, setAddSkuOpen] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loaded = loadProductById(id);
    setProduct(loaded);
    if (loaded) {
      setImagesByColor(seedImagesByColor(loaded));
      setActiveSkuId(loaded.skus[0]?.id ?? '');
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setHistoryEntries(loadHistoryEntries(id));
  }, [id]);

  useEffect(() => {
    if (!historyOpen) return;
    function close(e: MouseEvent) {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) setHistoryOpen(false);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [historyOpen]);

  const handleSave = useCallback(() => {
    if (!product) return;
    const prevDisk = loadProductById(product.id);
    if (prevDisk) pushHistorySnapshot(product.id, prevDisk);

    const primary = deriveListImageUrl(product.colors, imagesByColor);
    const next: ProductListItem = {
      ...product,
      imageUrl: primary,
      productImagesByColor: { ...imagesByColor },
    };
    saveProduct(next);
    setProduct(next);
    setHistoryEntries(loadHistoryEntries(product.id));
    setSaveFlash('已保存到本机');
    window.setTimeout(() => setSaveFlash(null), 2500);
  }, [product, imagesByColor]);

  const handleRestoreVersion = useCallback((entry: HistoryEntry) => {
    if (!confirm('确定恢复到此版本？未保存的当前编辑将丢失。')) return;
    const restored = JSON.parse(JSON.stringify(entry.product)) as ProductListItem;
    saveProduct(restored);
    setProduct(restored);
    setImagesByColor(seedImagesByColor(restored));
    setHistoryOpen(false);
    setSaveFlash('已恢复历史版本');
    window.setTimeout(() => setSaveFlash(null), 2500);
  }, []);

  const handleAddSku = useCallback(
    (productId: string, payload: AddSkuPayload) => {
      if (!product || product.id !== productId) return;
      const colorCode = payload.colorCode.toUpperCase();
      const newSku: SkuItem = {
        id: `${product.id}-sku-${Date.now()}`,
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
      const nextColors = product.colors.includes(colorCode) ? product.colors : [...product.colors, colorCode];
      const nextSkus = [...product.skus, newSku];
      const mergedImages = { ...imagesByColor, [colorCode]: imagesByColor[colorCode] ?? [] };
      const next: ProductListItem = {
        ...product,
        colors: nextColors,
        skus: nextSkus,
        skuCount: nextSkus.length,
        productImagesByColor: mergedImages,
        imageUrl: deriveListImageUrl(nextColors, mergedImages),
      };
      saveProduct(next);
      setProduct(next);
      setImagesByColor(mergedImages);
      setActiveSkuId(newSku.id);
    },
    [product, imagesByColor],
  );

  if (!id) return <p className="text-sm text-gray-500">无效链接</p>;

  if (!product) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-gray-500">
        <p className="text-sm mb-4">未找到该产品，可能已被删除</p>
        <Link href="/products" className="text-sm text-blue-600 hover:underline">返回产品列表</Link>
      </div>
    );
  }

  const sym = CURRENCY_SYMBOL[product.currency] ?? product.currency;

  const activeSku = product.skus.find((s) => s.id === activeSkuId) ?? product.skus[0];
  const galleryColorKey = (activeSku?.colorCode?.trim() || product.colors[0] || 'default') as string;

  const metaCell = (label: string, children: ReactNode) => (
    <div className="min-w-0">
      <div className="text-[11px] leading-none text-gray-400">{label}</div>
      <div className="mt-1 min-w-0 text-sm leading-tight text-gray-800">{children}</div>
    </div>
  );

  return (
    <div className="mx-auto max-w-[1440px] px-4 pb-10 pt-2 sm:px-6">
      <AddSkuModal
        open={addSkuOpen}
        product={product}
        onClose={() => setAddSkuOpen(false)}
        onConfirm={handleAddSku}
      />

      {/* 顶栏：面包屑 + 操作（参考稿：浅色底栏分隔） */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-4">
        <nav className="flex items-center gap-2 text-sm text-gray-500">
          <Link href="/products" className="transition-colors hover:text-gray-800">
            产品列表
          </Link>
          <span className="text-gray-300">/</span>
          <span className="font-medium text-gray-900">{product.patternCode}</span>
        </nav>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => router.push('/products')}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-50"
          >
            返回列表
          </button>
          <div className="relative" ref={historyRef}>
            <button
              type="button"
              onClick={() => {
                setHistoryEntries(loadHistoryEntries(id));
                setHistoryOpen((v) => !v);
              }}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-50"
            >
              历史版本 ▾
            </button>
            {historyOpen && (
              <div className="absolute right-0 top-full z-40 mt-1 max-h-72 w-80 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 text-left shadow-lg">
                <p className="border-b border-gray-100 px-3 py-2 text-xs text-gray-500">
                  保存时自动记录（最多 {MAX_HISTORY} 条），点击可恢复
                </p>
                {historyEntries.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-gray-400">暂无历史，保存产品后会生成快照</p>
                ) : (
                  historyEntries.map((e, i) => (
                    <button
                      key={`${e.at}-${i}`}
                      type="button"
                      onClick={() => handleRestoreVersion(e)}
                      className="w-full border-b border-gray-50 px-3 py-2 text-left text-sm last:border-0 hover:bg-gray-50"
                    >
                      <span className="block font-medium text-gray-800">
                        {new Date(e.at).toLocaleString('zh-CN', { hour12: false })}
                      </span>
                      <span className="text-xs text-gray-500">
                        主图 {e.product.imageUrl ? '有' : '无'}
                        {e.product.productImagesByColor
                          ? ` · ${Object.values(e.product.productImagesByColor).reduce((s, a) => s + (a?.length ?? 0), 0)} 张图`
                          : ''}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            className="cursor-not-allowed rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-400"
            title="敬请期待"
          >
            更多操作 ▾
          </button>
          {saveFlash && <span className="text-xs font-medium text-green-600">{saveFlash}</span>}
          <button
            type="button"
            onClick={() => setAddSkuOpen(true)}
            className="rounded-lg border border-gray-300 bg-white px-4 py-1.5 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50"
          >
            + 添加 SKU
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-gray-800"
          >
            保存
          </button>
        </div>
      </header>

      <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        {/* 主列 */}
        <div className="min-w-0 flex-1 space-y-6">
          {/* 主信息卡：左主图 | 右为「标题+颜色变体同行」→副标题与创建日期→字段→三信息卡 */}
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-6">
              <div className="mx-auto shrink-0 lg:mx-0 lg:w-[200px]">
                <ImageGallery
                  placeholder="👜"
                  colorKey={galleryColorKey}
                  images={imagesByColor[galleryColorKey] ?? EMPTY_GALLERY}
                  onImagesChange={(next) => {
                    setImagesByColor((prev) => ({ ...prev, [galleryColorKey]: next }));
                  }}
                />
              </div>

              <div className="min-w-0 flex-1 space-y-3">
                {/* 第 1 行：左侧标题+状态，右侧颜色变体（与设计稿箭头一致） */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-wrap items-center gap-3">
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">{product.patternCode}</h1>
                    {product.status === 'active' ? (
                      <span className="inline-flex items-center rounded-full border border-green-100 bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
                        启用
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                        停用
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                    <span className="text-xs text-gray-400">颜色变体</span>
                    {product.skus.length === 0 ? (
                      <span className="text-xs text-gray-400">暂无 SKU</span>
                    ) : (
                      product.skus.map((sku) => {
                        const hex = resolveHexForProductSku(sku, colorRegistry);
                        const light = LIGHT.has(sku.colorCode) || isLightColorHex(hex);
                        const isActive =
                          activeSkuId === sku.id || (!activeSkuId && sku.id === product.skus[0]?.id);
                        return (
                          <button
                            key={sku.id}
                            type="button"
                            title={sku.skuName || sku.colorCode}
                            onClick={() => setActiveSkuId(sku.id)}
                            className={[
                              'h-8 w-8 rounded-md transition-all sm:h-9 sm:w-9',
                              isActive
                                ? 'ring-2 ring-gray-700 ring-offset-2'
                                : 'opacity-85 hover:opacity-100',
                            ].join(' ')}
                            style={{
                              backgroundColor: hex,
                              boxShadow: light ? 'inset 0 0 0 1px #d1d5db' : undefined,
                            }}
                          />
                        );
                      })
                    )}
                  </div>
                </div>

                {/* 第 2 行：副标题 + 创建日期 */}
                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                  <p className="min-w-0 text-base text-gray-600">{product.name}</p>
                  <div className="shrink-0 text-sm sm:text-right">
                    <span className="text-gray-400">创建日期 </span>
                    <span className="tabular-nums text-gray-800">{product.createdAt}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-x-4 gap-y-2 border-t border-gray-100 pt-2 sm:grid-cols-3 sm:gap-x-6 sm:gap-y-2">
                  {metaCell(
                    '纸格款号',
                    <span className="flex flex-wrap items-center gap-1.5 font-medium">
                      {product.patternCode}
                      <button
                        type="button"
                        className="text-xs font-normal text-blue-600 hover:underline"
                        onClick={() => navigator.clipboard.writeText(product.patternCode)}
                      >
                        复制
                      </button>
                    </span>,
                  )}
                  {metaCell('产品名称', product.name)}
                  {metaCell('采购币种', product.currency)}
                  {metaCell('分类', product.category)}
                  {metaCell(
                    '状态',
                    product.status === 'active' ? (
                      <span className="text-green-600">启用</span>
                    ) : (
                      <span className="text-gray-400">停用</span>
                    ),
                  )}
                  {metaCell(
                    '标签',
                    <div className="flex flex-wrap gap-1">
                      {deriveProductTags(product).map((t, i) => (
                        <span
                          key={i}
                          className="rounded-full border border-gray-200 bg-gray-100 px-1.5 py-px text-[11px] leading-tight text-gray-700"
                        >
                          {t}
                        </span>
                      ))}
                    </div>,
                  )}
                </div>

                {/* 三卡：主图右侧列内、元数据网格正下方 */}
                <div className="grid grid-cols-1 gap-3 border-t border-gray-100 pt-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-gray-100 bg-gray-50/40 p-3">
                    <h3 className="mb-2 text-xs font-semibold text-gray-800">包装信息</h3>
                    <ul className="space-y-1.5 text-xs sm:text-sm">
                      <li className="flex justify-between gap-2">
                        <span className="text-gray-500">包装尺寸</span>
                        <span className="text-right text-gray-800">{product.packSize ? product.packSize.replace(/×/g, '*') : '—'}</span>
                      </li>
                      <li className="flex justify-between gap-2">
                        <span className="text-gray-500">包装重量</span>
                        <span className="text-right text-gray-800">{product.packWeight || '—'}</span>
                      </li>
                    </ul>
                  </div>
                  <div className="rounded-lg border border-gray-100 bg-gray-50/40 p-3">
                    <h3 className="mb-2 text-xs font-semibold text-gray-800">纸箱设置</h3>
                    <ul className="space-y-1.5 text-xs sm:text-sm">
                      <li className="flex justify-between gap-2">
                        <span className="text-gray-500">外箱尺寸</span>
                        <span className="text-right text-gray-800">50*40*35 cm</span>
                      </li>
                      <li className="flex justify-between gap-2">
                        <span className="text-gray-500">装箱数</span>
                        <span className="text-right text-gray-800">20 PCS/CTN</span>
                      </li>
                    </ul>
                  </div>
                  <div className="rounded-lg border border-gray-100 bg-gray-50/40 p-3">
                    <h3 className="mb-2 text-xs font-semibold text-gray-800">产品信息</h3>
                    <ul className="space-y-1.5 text-xs sm:text-sm">
                      <li className="flex justify-between gap-2">
                        <span className="text-gray-500">材质</span>
                        <span className="text-right text-gray-800">PU 皮革（示例）</span>
                      </li>
                      <li className="flex justify-between gap-2">
                        <span className="text-gray-500">单品重量</span>
                        <span className="text-right text-gray-800">{product.packWeight || '—'}</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 标签页 */}
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex overflow-x-auto border-b border-gray-100">
              {([ ['sku', `SKU（${product.skus.length}）`], ['price', '价格管理'], ['stock', '库存记录'], ['log', '操作记录'], ['cost', '成本表'], ['usage', '用量表'] ] as const).map(([key, label]) => (
                <button key={key} type="button" onClick={() => setTab(key)}
                  className={['px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
                    tab === key ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'].join(' ')}>
                  {label}
                </button>
              ))}
            </div>
            <div className="p-4">
              {tab === 'sku' && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px]">
                    <thead>
                      <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-400">
                        <th className="py-2 pr-3">色块</th>
                        <th className="py-2 pr-3">颜色</th>
                        <th className="py-2 pr-3">Color</th>
                        <th className="py-2 pr-3">SKU</th>
                        <th className="py-2 pr-3 text-right">一件代发价</th>
                        <th className="py-2 pr-3 text-right">大货价</th>
                        <th className="py-2 pr-3 text-right">库存</th>
                        <th className="py-2 pr-3">状态</th>
                        <th className="py-2">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 text-sm">
                      {product.skus.map((sku) => {
                        const hex = resolveHexForProductSku(sku, colorRegistry);
                        const light = LIGHT.has(sku.colorCode) || isLightColorHex(hex);
                        const en =
                          COLOR_NAME_MAP[sku.colorCode] ??
                          (sku.colorPhrase?.trim() || sku.colorCode);
                        return (
                          <tr key={sku.id} className="hover:bg-gray-50/50">
                            <td className="py-2.5 pr-3">
                              <span className="inline-block w-7 h-7 rounded-md" style={{ backgroundColor: hex, border: light ? '1px solid #d1d5db' : 'none' }} />
                            </td>
                            <td className="py-2.5 pr-3 text-gray-800">
                              <SkuChineseColorCell sku={sku} />
                            </td>
                            <td className="py-2.5 pr-3 text-gray-500">{en}</td>
                            <td className="py-2.5 pr-3 font-mono text-xs">{sku.skuCode}</td>
                            <td className="py-2.5 pr-3 text-right font-mono">{sym}{sku.dropshipPrice.toFixed(2)}</td>
                            <td className="py-2.5 pr-3 text-right font-mono">{sym}{sku.bulkPrice.toFixed(2)}</td>
                            <td className="py-2.5 pr-3 text-right font-mono">{sku.stock}</td>
                            <td className="py-2.5 pr-3">
                              {sku.status === 'active'
                                ? <span className="text-xs text-green-600">启用</span>
                                : <span className="text-xs text-gray-400">停用</span>}
                            </td>
                            <td className="py-2.5 text-gray-400 text-xs whitespace-nowrap">编辑 ···</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {tab === 'price' && <p className="text-sm text-gray-400 py-8 text-center">价格管理（待接入）</p>}
              {tab === 'stock' && <p className="text-sm text-gray-400 py-8 text-center">库存记录（待接入）</p>}
              {tab === 'log' && <p className="text-sm text-gray-400 py-8 text-center">操作记录（待接入）</p>}
              {tab === 'cost' && <p className="text-sm text-gray-400 py-8 text-center">成本表（待接入）</p>}
              {tab === 'usage' && <p className="text-sm text-gray-400 py-8 text-center">用量表（待接入）</p>}
            </div>
          </div>
        </div>

        {/* 右侧边栏（参考稿：相关文件 + 操作记录） */}
        <aside className="w-full shrink-0 space-y-4 lg:w-72 lg:max-w-[20rem] xl:max-w-[22rem]">
          <SidebarFiles />
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-gray-800">操作记录</h3>
            <ul className="ml-1 space-y-3 border-l border-gray-200 pl-3 text-xs text-gray-500">
              <li>
                <span className="block text-gray-400">今天 10:23</span>
                <span>管理员 查看详情页</span>
              </li>
              <li>
                <span className="block text-gray-400">2024/04/12</span>
                <span>系统 初始化 SKU 数据</span>
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
