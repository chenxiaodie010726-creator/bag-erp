/* ============================================================
 * 套装详情页 — 双击列表行进入
 * ============================================================ */

'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { COLOR_MAP, type SetItem } from '../_components/mockData';
import { COLOR_NAME_ZH_MAP } from '../../products/_components/mockData';
import { loadSetById } from '../../products/_components/loadFromStorage';

const CURRENCY_SYMBOL: Record<string, string> = {
  USD: '$', CNY: '¥', EUR: '€', GBP: '£',
};
const LIGHT = new Set(['WHT', 'CRM', 'LPK', 'LBL', 'BGE']);

function resolveHex(code: string) {
  return COLOR_MAP[code] ?? (code.startsWith('#') ? code : '#9ca3af');
}

function deriveSetTags(s: { name: string }): string[] {
  const third = s.name.trim().slice(0, 4) || '组合';
  return ['套装', '组合', third];
}

/* ══════════════════════════════════════════════════
 * 可交互图库组件 — 按颜色分别存储图片
 * ══════════════════════════════════════════════════ */
function ImageGallery({ placeholder, colorKey }: { placeholder: string; colorKey: string }) {
  const [imagesByColor, setImagesByColor] = useState<Record<string, string[]>>({});
  const [activeIdxByColor, setActiveIdxByColor] = useState<Record<string, number>>({});
  const [dragging, setDragging] = useState(false);
  const mainInputRef = useRef<HTMLInputElement>(null);
  const thumbInputRef = useRef<HTMLInputElement>(null);

  const images = imagesByColor[colorKey] ?? [];
  const activeIdx = activeIdxByColor[colorKey] ?? 0;

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
      setImagesByColor((prev) => {
        const existing = prev[colorKey] ?? [];
        const newList = [...existing, ...urls];
        setActiveIdxByColor((pi) => ({ ...pi, [colorKey]: existing.length }));
        return { ...prev, [colorKey]: newList };
      });
    });
  }

  const prev = () => {
    const len = Math.max(images.length, 1);
    setActiveIdxByColor((pi) => ({ ...pi, [colorKey]: ((pi[colorKey] ?? 0) - 1 + len) % len }));
  };
  const next = () => {
    const len = Math.max(images.length, 1);
    setActiveIdxByColor((pi) => ({ ...pi, [colorKey]: ((pi[colorKey] ?? 0) + 1) % len }));
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
            <button key={i} type="button" onClick={() => setActiveIdxByColor((pi) => ({ ...pi, [colorKey]: i }))}
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

      {images.length === 0 && <p className="text-xs text-center text-gray-400">支持 JPG、PNG、WebP</p>}
    </div>
  );
}

/* ══════════════════════════════════════════════════
 * 右侧文件上传
 * ══════════════════════════════════════════════════ */
function SidebarFiles() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<{ name: string; size: string }[]>([
    { name: '套装清单.xlsx', size: '32 KB' },
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
      <button type="button" onClick={() => inputRef.current?.click()}
        className="w-full py-2 text-sm border border-dashed border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 hover:border-gray-400 transition-colors mb-3">
        + 上传文件
      </button>
      <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
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
export default function SetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === 'string' ? params.id : '';

  const [item, setItem] = useState<SetItem | null>(null);
  const [tab, setTab] = useState<'sku' | 'price' | 'stock' | 'log' | 'cost' | 'usage'>('sku');
  const [activeColor, setActiveColor] = useState<string>('');

  useEffect(() => {
    const loaded = loadSetById(id);
    setItem(loaded);
    if (loaded?.colors?.length) setActiveColor(loaded.colors[0]);
  }, [id]);

  if (!id) return <p className="text-sm text-gray-500">无效链接</p>;

  if (!item) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-gray-500">
        <p className="text-sm mb-4">未找到该套装，可能已被删除</p>
        <Link href="/sets" className="text-sm text-blue-600 hover:underline">返回套装列表</Link>
      </div>
    );
  }

  const sym = CURRENCY_SYMBOL[item.currency] ?? item.currency;

  return (
    <div className="flex flex-col gap-5 max-w-[1400px] mx-auto pb-10">
      {/* 面包屑 + 顶栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="text-sm text-gray-500 flex items-center gap-2">
          <Link href="/sets" className="hover:text-gray-800">套装列表</Link>
          <span className="text-gray-300">/</span>
          <span className="text-gray-800 font-medium">{item.sku}</span>
        </nav>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => router.push('/sets')}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">返回列表</button>
          <button type="button" className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">历史版本 ▾</button>
          <button type="button" className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">更多操作 ▾</button>
          <button type="button" className="px-4 py-1.5 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700">保存</button>
        </div>
      </div>

      <div className="flex gap-6 items-start">
        <div className="flex-1 min-w-0 space-y-4">
          <div className="space-y-3">
            {/* 图库 + 基础信息 */}
            <div className="flex flex-col lg:flex-row gap-5">
              <ImageGallery placeholder="🎁" colorKey={activeColor || (item.colors[0] ?? 'default')} />

              <div className="flex-1 space-y-3">
                <div className="flex flex-wrap items-start gap-3">
                  <h1 className="text-2xl font-semibold text-gray-900">{item.sku}</h1>
                  {item.status === 'active' ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-100">启用</span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 border border-gray-200">停用</span>
                  )}
                </div>
                <p className="text-base text-gray-600">{item.name}</p>

                {/* 颜色变体 — 点击切换主图 */}
                <div className="flex flex-wrap gap-1.5 items-center">
                  <span className="text-xs text-gray-400 mr-1">套装颜色</span>
                  {item.colors.map((code) => {
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

                {/* 字段信息 */}
                <div className="text-sm divide-y divide-gray-50 border border-gray-100 rounded-xl overflow-hidden">
                  <div className="flex items-start px-3 py-2 bg-white">
                    <span className="text-gray-400 w-20 shrink-0 text-xs mt-0.5">纸格款号</span>
                    <div className="flex flex-wrap gap-1.5">
                      {item.components.map((c) => (
                        <span key={c} className="px-2 py-0.5 bg-gray-100 rounded text-gray-800 text-xs">{c}</span>
                      ))}
                    </div>
                  </div>
                  {[
                    ['套装名称', item.name],
                    ['创建日期', item.createdAt],
                    ['采购币种', item.currency],
                    ['状态', item.status === 'active' ? '启用' : '停用'],
                  ].map(([label, val]) => (
                    <div key={String(label)} className="flex items-center px-3 py-2 bg-white hover:bg-gray-50/50">
                      <span className="text-gray-400 w-20 shrink-0 text-xs">{label}</span>
                      <span className={val === '启用' ? 'text-green-600' : val === '停用' ? 'text-gray-400' : 'text-gray-800'}>{val}</span>
                    </div>
                  ))}
                  <div className="flex items-start px-3 py-2 bg-white">
                    <span className="text-gray-400 w-20 shrink-0 text-xs mt-0.5">标签</span>
                    <div className="flex flex-wrap gap-1.5">
                      {deriveSetTags(item).map((t, i) => (
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
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">套装信息</h3>
                <ul className="space-y-1.5 text-sm">
                  <li className="flex justify-between gap-2"><span className="text-gray-400">款号数量</span><span className="text-gray-700">{item.components.length} 个</span></li>
                  <li className="flex justify-between gap-2"><span className="text-gray-400">颜色 SKU</span><span className="text-gray-700">{item.skus.length} 个</span></li>
                </ul>
              </div>
              <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">包装信息</h3>
                <ul className="space-y-1.5 text-sm">
                  <li className="flex justify-between gap-2"><span className="text-gray-400">包装尺寸</span><span className="text-gray-700">{item.packSize.replace(/×/g, '*')}</span></li>
                  <li className="flex justify-between gap-2"><span className="text-gray-400">包装重量</span><span className="text-gray-700">{item.packWeight}</span></li>
                </ul>
              </div>
              <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">纸箱设置</h3>
                <ul className="space-y-1.5 text-sm">
                  <li className="flex justify-between gap-2"><span className="text-gray-400">外箱尺寸</span><span className="text-gray-700">—</span></li>
                  <li className="flex justify-between gap-2"><span className="text-gray-400">装箱数</span><span className="text-gray-700">—</span></li>
                </ul>
              </div>
            </div>
          </div>

          {/* 标签页 */}
          <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
            <div className="flex border-b border-gray-100 overflow-x-auto">
              {([ ['sku', `SKU（${item.skus.length}）`], ['price', '价格管理'], ['stock', '库存记录'], ['log', '操作记录'], ['cost', '成本表'], ['usage', '用量表'] ] as const).map(([key, label]) => (
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
                  <table className="w-full min-w-[640px]">
                    <thead>
                      <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-400">
                        <th className="py-2 pr-3">色块</th>
                        <th className="py-2 pr-3">颜色</th>
                        <th className="py-2 pr-3">SKU</th>
                        <th className="py-2 pr-3 text-right">一件代发价</th>
                        <th className="py-2 pr-3 text-right">大货价</th>
                        <th className="py-2 pr-3 text-right">库存</th>
                        <th className="py-2 pr-3">状态</th>
                        <th className="py-2">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 text-sm">
                      {item.skus.map((sku) => {
                        const hex = resolveHex(sku.colorCode);
                        const light = LIGHT.has(sku.colorCode);
                        const zh = sku.colorNameZh ?? COLOR_NAME_ZH_MAP[sku.colorCode] ?? '—';
                        return (
                          <tr key={sku.id} className="hover:bg-gray-50/50">
                            <td className="py-2.5 pr-3">
                              <span className="inline-block w-7 h-7 rounded-md" style={{ backgroundColor: hex, border: light ? '1px solid #d1d5db' : 'none' }} />
                            </td>
                            <td className="py-2.5 pr-3 text-gray-800">{zh}</td>
                            <td className="py-2.5 pr-3 font-mono text-xs">{sku.skuCode}</td>
                            <td className="py-2.5 pr-3 text-right font-mono">{sym}{item.dropshipPrice.toFixed(2)}</td>
                            <td className="py-2.5 pr-3 text-right font-mono">{sym}{item.bulkPrice.toFixed(2)}</td>
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
                <span className="block text-gray-400">今天</span>
                <span>管理员 查看套装详情</span>
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
