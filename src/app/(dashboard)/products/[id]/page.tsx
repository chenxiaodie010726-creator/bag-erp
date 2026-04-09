/* ============================================================
 * 产品详情页 — 双击列表行进入
 * ============================================================ */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  COLOR_MAP,
  COLOR_NAME_MAP,
  COLOR_NAME_ZH_MAP,
  type ProductListItem,
} from '../_components/mockData';
import { loadProductById, saveProduct } from '../_components/loadFromStorage';
import { resolveHexForProductSku, isLightColorHex } from '@/lib/colorDisplay';
import { useColorRegistry } from '@/hooks/useColorRegistry';

const CURRENCY_SYMBOL: Record<string, string> = {
  USD: '$', CNY: '¥', EUR: '€', GBP: '£', JPY: '¥',
};
const LIGHT = new Set(['WHT', 'CRM', 'LPK', 'LBL', 'BGE']);
const EMPTY_GALLERY: string[] = [];

function resolveHex(code: string) {
  return COLOR_MAP[code] ?? (code.startsWith('#') ? code : '#9ca3af');
}

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

  return (
    <div className="w-full lg:w-[260px] shrink-0 space-y-2">
      <div
        className={[
          'relative aspect-square rounded-2xl border-2 transition-colors overflow-hidden cursor-pointer select-none',
          dragging ? 'border-blue-400 bg-blue-50' : 'border-dashed border-gray-200 bg-gray-50',
        ].join(' ')}
        onClick={() => !images.length && mainInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); readFiles(e.dataTransfer.files); }}
      >
        {images.length > 0 ? (
          <>
            <img src={images[activeIdx]} alt="" className="w-full h-full object-cover" onClick={(e) => e.stopPropagation()} />
            {images.length > 1 && (
              <>
                <button type="button" onClick={(e) => { e.stopPropagation(); prev(); }}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center bg-white/80 hover:bg-white rounded-full shadow text-gray-600 text-sm transition-colors">‹</button>
                <button type="button" onClick={(e) => { e.stopPropagation(); next(); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center bg-white/80 hover:bg-white rounded-full shadow text-gray-600 text-sm transition-colors">›</button>
              </>
            )}
            <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/40 text-white text-xs rounded-full">{activeIdx + 1}/{images.length}</div>
            <button type="button" onClick={(e) => { e.stopPropagation(); mainInputRef.current?.click(); }}
              className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/40 hover:bg-black/60 text-white text-xs rounded-full transition-colors">+ 上传</button>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-gray-400">
            <span className="text-5xl">{placeholder}</span>
            <span className="text-xs text-center px-4">点击上传 {colorKey} 颜色主图</span>
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

      {images.length === 0 && <p className="text-xs text-center text-gray-400">支持 JPG、PNG、WebP；保存后写入产品与列表</p>}
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
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-800 mb-3">相关文件</h3>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="w-full py-2 text-sm border border-dashed border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 hover:border-gray-400 transition-colors mb-3"
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
  const [activeColor, setActiveColor] = useState<string>('');
  /** 与保存、列表主图同步 */
  const [imagesByColor, setImagesByColor] = useState<Record<string, string[]>>({});
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [saveFlash, setSaveFlash] = useState<string | null>(null);
  const historyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loaded = loadProductById(id);
    setProduct(loaded);
    if (loaded) {
      setImagesByColor(seedImagesByColor(loaded));
      if (loaded.colors?.length) setActiveColor(loaded.colors[0]);
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

  return (
    <div className="flex flex-col gap-5 max-w-[1400px] mx-auto pb-10">
      {/* 面包屑 + 顶栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="text-sm text-gray-500 flex items-center gap-2">
          <Link href="/products" className="hover:text-gray-800">产品列表</Link>
          <span className="text-gray-300">/</span>
          <span className="text-gray-800 font-medium">{product.patternCode}</span>
        </nav>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button type="button" onClick={() => router.push('/products')}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">返回列表</button>
          <div className="relative" ref={historyRef}>
            <button
              type="button"
              onClick={() => {
                setHistoryEntries(loadHistoryEntries(id));
                setHistoryOpen((v) => !v);
              }}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
            >
              历史版本 ▾
            </button>
            {historyOpen && (
              <div className="absolute right-0 top-full mt-1 z-40 w-80 max-h-72 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg py-1 text-left">
                <p className="px-3 py-2 text-xs text-gray-500 border-b border-gray-100">保存时自动记录（最多 {MAX_HISTORY} 条），点击可恢复</p>
                {historyEntries.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-gray-400">暂无历史，保存产品后会生成快照</p>
                ) : (
                  historyEntries.map((e, i) => (
                    <button
                      key={`${e.at}-${i}`}
                      type="button"
                      onClick={() => handleRestoreVersion(e)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0"
                    >
                      <span className="block text-gray-800 font-medium">
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
          <button type="button" className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-400 cursor-not-allowed" title="敬请期待">
            更多操作 ▾
          </button>
          {saveFlash && (
            <span className="text-xs text-green-600 font-medium">{saveFlash}</span>
          )}
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-1.5 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700"
          >
            保存
          </button>
        </div>
      </div>

      <div className="flex gap-6 items-start">
        {/* 主内容区 */}
        <div className="flex-1 min-w-0 space-y-4">
          <div className="space-y-3">
            {/* 图库 + 基础信息 */}
            <div className="flex flex-col lg:flex-row gap-5">
              <ImageGallery
                placeholder="👜"
                colorKey={activeColor || (product.colors[0] ?? 'default')}
                images={imagesByColor[activeColor || (product.colors[0] ?? 'default')] ?? EMPTY_GALLERY}
                onImagesChange={(next) => {
                  const key = activeColor || (product.colors[0] ?? 'default');
                  setImagesByColor((prev) => ({ ...prev, [key]: next }));
                }}
              />

              <div className="flex-1 space-y-3">
                <div className="flex flex-wrap items-start gap-3">
                  <h1 className="text-2xl font-semibold text-gray-900">{product.patternCode}</h1>
                  {product.status === 'active' ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-100">启用</span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 border border-gray-200">停用</span>
                  )}
                </div>
                <p className="text-base text-gray-600">{product.name}</p>

                {/* 颜色变体 — 点击切换主图 */}
                <div className="flex flex-wrap gap-1.5 items-center">
                  <span className="text-xs text-gray-400 mr-1">颜色变体</span>
                  {product.colors.map((code) => {
                    const hex = resolveHex(code);
                    const light = LIGHT.has(code);
                    const isActive = activeColor === code;
                    return (
                      <button
                        key={code}
                        type="button"
                        title={`切换到 ${code}`}
                        onClick={() => setActiveColor(code)}
                        className={[
                          'w-8 h-8 rounded-md transition-all',
                          isActive
                            ? 'ring-2 ring-offset-2 ring-gray-600 scale-110'
                            : 'hover:scale-105 opacity-80 hover:opacity-100',
                        ].join(' ')}
                        style={{
                          backgroundColor: hex,
                          boxShadow: light ? 'inset 0 0 0 1px #d1d5db' : undefined,
                        }}
                      />
                    );
                  })}
                </div>

                {/* 字段信息：紧凑 table-like 布局 */}
                <div className="text-sm divide-y divide-gray-50 border border-gray-100 rounded-xl overflow-hidden">
                  {[
                    ['纸格款号', <span className="font-medium text-gray-800 flex items-center gap-2" key="pc">
                        {product.patternCode}
                        <button type="button" className="text-xs text-blue-500 hover:underline"
                          onClick={() => navigator.clipboard.writeText(product.patternCode)}>复制</button>
                      </span>],
                    ['产品名称', <span className="text-gray-800" key="nm">{product.name}</span>],
                    ['分类', <span className="text-gray-800" key="cat">{product.category}</span>],
                    ['创建日期', <span className="text-gray-800" key="cd">{product.createdAt}</span>],
                    ['采购币种', <span className="text-gray-800" key="cur">{product.currency}</span>],
                    ['状态', product.status === 'active'
                      ? <span className="text-green-600" key="st">启用</span>
                      : <span className="text-gray-400" key="st">停用</span>],
                  ].map(([label, val]) => (
                    <div key={String(label)} className="flex items-center px-3 py-2 bg-white hover:bg-gray-50/50">
                      <span className="text-gray-400 w-20 shrink-0 text-xs">{label}</span>
                      <span className="flex-1">{val}</span>
                    </div>
                  ))}
                  <div className="flex items-start px-3 py-2 bg-white">
                    <span className="text-gray-400 w-20 shrink-0 text-xs mt-0.5">标签</span>
                    <div className="flex flex-wrap gap-1.5">
                      {deriveProductTags(product).map((t, i) => (
                        <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded-full border border-gray-200">{t}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 规格三栏 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">产品信息</h3>
                <ul className="space-y-1.5 text-sm">
                  <li className="flex justify-between gap-2"><span className="text-gray-400">材质</span><span className="text-gray-700">PU 皮革（示例）</span></li>
                  <li className="flex justify-between gap-2"><span className="text-gray-400">单品重量</span><span className="text-gray-700">{product.packWeight}</span></li>
                </ul>
              </div>
              <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">包装信息</h3>
                <ul className="space-y-1.5 text-sm">
                  <li className="flex justify-between gap-2"><span className="text-gray-400">包装尺寸</span><span className="text-gray-700">{product.packSize.replace(/×/g, '*')}</span></li>
                  <li className="flex justify-between gap-2"><span className="text-gray-400">包装重量</span><span className="text-gray-700">{product.packWeight}</span></li>
                </ul>
              </div>
              <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">纸箱设置</h3>
                <ul className="space-y-1.5 text-sm">
                  <li className="flex justify-between gap-2"><span className="text-gray-400">外箱尺寸</span><span className="text-gray-700">50*40*35 cm</span></li>
                  <li className="flex justify-between gap-2"><span className="text-gray-400">装箱数</span><span className="text-gray-700">20 PCS/CTN</span></li>
                </ul>
              </div>
            </div>
          </div>

          {/* 标签页 */}
          <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
            <div className="flex border-b border-gray-100 overflow-x-auto">
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
                        const zh = sku.colorNameZh ?? COLOR_NAME_ZH_MAP[sku.colorCode] ?? '—';
                        const en =
                          COLOR_NAME_MAP[sku.colorCode] ??
                          (sku.colorPhrase?.trim() || sku.colorCode);
                        return (
                          <tr key={sku.id} className="hover:bg-gray-50/50">
                            <td className="py-2.5 pr-3">
                              <span className="inline-block w-7 h-7 rounded-md" style={{ backgroundColor: hex, border: light ? '1px solid #d1d5db' : 'none' }} />
                            </td>
                            <td className="py-2.5 pr-3 text-gray-800">{zh}</td>
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

        {/* 右侧边栏 */}
        <aside className="hidden xl:block w-64 shrink-0 space-y-4">
          <SidebarFiles />
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">操作记录</h3>
            <ul className="space-y-3 text-xs text-gray-500 border-l border-gray-200 pl-3 ml-1">
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
