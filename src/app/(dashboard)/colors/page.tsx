/* ============================================================
 * 颜色管理 — 多词根 / 同义词 → 色值，供订单颜色列与 SKU 色块匹配
 * URL: /colors
 * ============================================================ */

'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import Link from 'next/link';
import {
  DEFAULT_SEED,
  normalizeColorKeyword,
  normalizeHexInput,
  parseKeywordLine,
  keywordsToInputLine,
  COLOR_REGISTRY_COMMON_PRESET_LIMIT,
  type ColorRegistryEntry,
} from '@/lib/colorRegistry';
import { useColors } from '@/hooks/api/useColors';
import { useUndoManager, useUndoKeyboard } from '@/hooks/useUndoManager';
import UndoToast from '@/components/UndoToast';

function newId(): string {
  return `cr-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const PLACEHOLDER_HEX = '#808080';

/**
 * 关键词输入框：编辑时用本地字符串，避免「解析后再 join」抹掉行尾逗号/未写完的片段，
 * 否则会出现「两个同义词后再输入逗号立刻被吃掉、无法继续填第三个」的现象。
 */
function ColorKeywordTextarea({
  rowId,
  keywords,
  onCommitLine,
}: {
  rowId: string;
  keywords: string[];
  onCommitLine: (line: string) => void;
}) {
  const keywordsKey = useMemo(() => JSON.stringify(keywords), [keywords]);
  const [text, setText] = useState(() => keywordsToInputLine(keywords));

  useEffect(() => {
    const kws = JSON.parse(keywordsKey) as string[];
    setText(keywordsToInputLine(kws));
  }, [rowId, keywordsKey]);

  return (
    <textarea
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onCommitLine(text)}
      rows={2}
      placeholder="黑色, BLACK, 黑"
      className="w-full min-h-[3rem] border border-gray-200 rounded-md px-2.5 py-1.5 text-gray-800 placeholder:text-gray-400 resize-y"
    />
  );
}

export default function ColorsPage() {
  const { entries: serverEntries, loading, error, replaceAll, refresh } = useColors();
  const [draft, setDraft] = useState<ColorRegistryEntry[]>([]);
  const [dirty, setDirty] = useState(false);
  /** 顶部「编辑」开启后整表可改；删除仅在此模式下可用 */
  const [batchEdit, setBatchEdit] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');

  const undoMgr = useUndoManager<ColorRegistryEntry[]>();

  useEffect(() => {
    if (loading) return;
    if (!dirty) {
      setDraft(serverEntries.map((e) => ({ ...e, keywords: [...e.keywords] })));
    }
  }, [loading, serverEntries, dirty]);

  const persist = useCallback((next: ColorRegistryEntry[], undoDesc?: string) => {
    if (undoDesc) {
      undoMgr.push(draft, undoDesc);
    }
    setDraft(next);
    setDirty(true);
  }, [draft, undoMgr]);

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      await replaceAll(draft);
      setDirty(false);
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1200);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }, [draft, replaceAll, saving]);

  const handleUndo = useCallback(() => {
    const entry = undoMgr.pop();
    if (entry) {
      setDraft(entry.snapshot.map((e) => ({ ...e, keywords: [...e.keywords] })));
      setDirty(true);
    }
  }, [undoMgr]);

  useUndoKeyboard(handleUndo, undoMgr.canUndo);

  /* 拖拽排序（与供应商「管理分类」弹窗同一套交互） */
  const dragIdx = useRef<number | null>(null);
  const dragOverIdx = useRef<number | null>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [dropTargetIdx, setDropTargetIdx] = useState<number | null>(null);
  /** 顶栏 + 可选「批量导入」块高度，供表头 sticky 的 top 偏移（与主区域滚动条配合） */
  const stickyToolbarRef = useRef<HTMLDivElement>(null);
  /** 首帧占位，避免 top:0 时表头与顶栏重叠；ResizeObserver 会立刻校正 */
  const [stickyToolbarH, setStickyToolbarH] = useState(96);

  useLayoutEffect(() => {
    const el = stickyToolbarRef.current;
    if (!el) return;
    const sync = () => setStickyToolbarH(el.offsetHeight);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [batchEdit, savedFlash]);

  function handleDragStart(idx: number) {
    if (!batchEdit) return;
    dragIdx.current = idx;
    setDraggingIdx(idx);
  }

  function handleDragOver(e: DragEvent, idx: number) {
    if (!batchEdit) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    dragOverIdx.current = idx;
    setDropTargetIdx(idx);
  }

  function handleDragEnd() {
    const from = dragIdx.current;
    const to = dragOverIdx.current;
    if (from !== null && to !== null && from !== to && batchEdit) {
      const next = [...draft];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved!);
      persist(next, '调整颜色顺序');
    }
    dragIdx.current = null;
    dragOverIdx.current = null;
    setDraggingIdx(null);
    setDropTargetIdx(null);
  }

  function moveRowByIndex(idx: number, delta: -1 | 1) {
    if (!batchEdit) return;
    const next = idx + delta;
    if (next < 0 || next >= draft.length) return;
    const copy = [...draft];
    const a = copy[idx]!;
    const b = copy[next]!;
    copy[idx] = b;
    copy[next] = a;
    persist(copy, '调整颜色顺序');
  }

  function addRow() {
    const id = newId();
    persist([...draft, { id, keywords: [], hex: PLACEHOLDER_HEX }], '添加颜色映射');
    setBatchEdit(true);
  }

  function updateRow(id: string, patch: Partial<Pick<ColorRegistryEntry, 'keywords' | 'hex'>>) {
    persist(draft.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function updateKeywordsFromLine(id: string, line: string) {
    const kws = parseKeywordLine(line);
    updateRow(id, { keywords: kws });
  }

  function removeRow(id: string) {
    if (!batchEdit) return;
    if (!window.confirm('确定删除该条颜色映射？删除后可撤回恢复。')) return;
    const target = draft.find((e) => e.id === id);
    persist(draft.filter((e) => e.id !== id), `删除颜色: ${target?.keywords[0] ?? id}`);
  }

  function resetDefaults() {
    if (
      !window.confirm(
        '恢复为系统默认的两条示例（BLACK / 黑色 与 GREEN / 绿色）？当前列表将被替换为示例内容；点「保存到服务器」后才会写入数据库。重置后可撤回恢复。',
      )
    ) {
      return;
    }
    undoMgr.push(draft, '恢复默认颜色映射');
    setDraft(DEFAULT_SEED.map((e) => ({ ...e, keywords: [...e.keywords] })));
    setDirty(true);
  }

  function applyBulkImport() {
    const lines = bulkText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      window.alert('请先粘贴或输入内容：每行一组颜色，同义词用逗号隔开。');
      return;
    }

    const used = new Set<string>();
    for (const e of draft) {
      for (const k of e.keywords) {
        used.add(normalizeColorKeyword(k));
      }
    }

    const newRows: ColorRegistryEntry[] = [];
    let skippedLines = 0;

    for (const line of lines) {
      const parsed = parseKeywordLine(line);
      const novel = parsed.filter((k) => !used.has(normalizeColorKeyword(k)));
      for (const k of novel) {
        used.add(normalizeColorKeyword(k));
      }
      if (novel.length === 0) {
        skippedLines += 1;
        continue;
      }
      newRows.push({ id: newId(), keywords: novel, hex: PLACEHOLDER_HEX });
    }

    if (newRows.length === 0) {
      window.alert(
        skippedLines > 0
          ? '没有新增条目：这些词在已有映射中都已存在。'
          : '未能解析出有效关键词，请检查格式。',
      );
      return;
    }

    persist([...draft, ...newRows], `批量导入 ${newRows.length} 条颜色`);
    setBulkText('');
    setBulkOpen(false);
    setBatchEdit(true);
    const msg =
      skippedLines > 0
        ? `已添加 ${newRows.length} 条（${skippedLines} 行因关键词已全部存在而跳过），请为每条设置色值。`
        : `已添加 ${newRows.length} 条，默认色值为占位灰，请按需编辑。`;
    window.alert(msg);
  }

  /** 表头每个 th 共用：sticky 必须加在 th 上；勿给 thead 加 z-index，否则会盖住首行数据 */
  const thStickyStyle = { top: stickyToolbarH, zIndex: 10 } as const;

  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col gap-4">
      {loading && (
        <p className="text-sm text-gray-500" role="status">
          正在从服务器加载颜色…
        </p>
      )}
      {/*
        仅顶栏（面包屑 + 操作按钮）sticky。批量导入放在下方随页面滚动，避免整块过高且干扰表头 top 计算。
        表头：border-separate + 每个 th 单独 sticky（collapse+thead sticky 在 Chrome 下易与首行重叠）。
      */}
      <div
        ref={stickyToolbarRef}
        className="sticky top-0 z-40 -mx-6 px-6 -mt-6 pt-6 pb-3 bg-white/95 backdrop-blur-md border-b border-gray-200/90 shadow-[0_1px_0_rgba(0,0,0,0.04)]"
      >
        <header>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <nav className="text-sm text-gray-500 flex items-center gap-2 mb-0.5">
                <Link href="/products" className="hover:text-gray-800">
                  产品管理
                </Link>
                <span className="text-gray-300">/</span>
                <span className="text-gray-800">颜色管理</span>
              </nav>
              <h1 className="text-xl font-bold text-gray-800 leading-tight">颜色管理</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2 justify-end shrink-0">
              {error && (
                <span className="text-xs text-red-600 max-w-[14rem] truncate" title={error}>
                  {error}
                </span>
              )}
              {error && (
                <button
                  type="button"
                  onClick={() => void refresh()}
                  className="text-xs px-2 py-1 border border-red-200 rounded text-red-700 hover:bg-red-50"
                >
                  重试
                </button>
              )}
              {dirty && <span className="text-xs text-amber-600">未保存</span>}
              {savedFlash && (
                <span className="text-xs text-green-600 animate-pulse">已保存到服务器</span>
              )}
              <button
                type="button"
                disabled={!dirty || saving || loading}
                onClick={() => void handleSave()}
                className={[
                  'text-sm px-4 py-2 rounded-md font-medium',
                  !dirty || saving || loading
                    ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700',
                ].join(' ')}
              >
                {saving ? '保存中…' : '保存到服务器'}
              </button>
              {batchEdit ? (
                <button
                  type="button"
                  onClick={() => setBatchEdit(false)}
                  className="text-sm px-3 py-2 border border-gray-300 rounded-md text-gray-800 bg-white hover:bg-gray-50 font-medium"
                >
                  完成
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setBatchEdit(true)}
                  className="text-sm px-3 py-2 border border-gray-900 rounded-md text-gray-900 hover:bg-gray-100 font-medium"
                  title="开启后可编辑整表；删除仅在此模式下可用"
                >
                  编辑
                </button>
              )}
              <button
                type="button"
                onClick={() => setBulkOpen((o) => !o)}
                className="text-sm px-3 py-2 border border-gray-200 rounded-md text-gray-700 hover:bg-gray-50 bg-white"
              >
                {bulkOpen ? '收起批量导入' : '批量导入'}
              </button>
              <button
                type="button"
                onClick={resetDefaults}
                className="text-sm px-3 py-2 border border-gray-200 rounded-md text-gray-600 hover:bg-gray-50 bg-white"
              >
                恢复示例
              </button>
              <button
                type="button"
                onClick={addRow}
                className="text-sm px-4 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-700 font-medium"
              >
                + 添加映射
              </button>
            </div>
          </div>
        </header>
      </div>

      {bulkOpen && (
        <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-4 space-y-2">
          <p className="text-sm text-gray-700">
            每行<strong>一组颜色</strong>：同义词写在同一行，用逗号或顿号隔开。导入后为占位色{' '}
            <code className="text-xs bg-white px-1 rounded border">{PLACEHOLDER_HEX}</code>
            ，请再在表格里改准确色值。已存在的关键词会自动跳过，避免重复。
          </p>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={8}
            placeholder={`黑色, BLACK, 黑\nRED, 红色\nNAVY, 藏青\nROYAL BLUE`}
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm font-mono text-gray-800 placeholder:text-gray-400 bg-white"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={applyBulkImport}
              className="text-sm px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
            >
              导入到列表
            </button>
            <button
              type="button"
              onClick={() => setBulkText('')}
              className="text-sm px-3 py-2 text-gray-600 hover:bg-white/80 rounded-md"
            >
              清空文本
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col xl:flex-row gap-6 items-start">
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          <div className="bg-white border border-gray-200 rounded-lg overflow-visible shadow-sm">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-500">
              <th
                style={thStickyStyle}
                className="sticky border-b border-gray-100 bg-gray-50 px-2 py-3 w-[4.5rem] text-center align-top shadow-[inset_0_-1px_0_rgba(0,0,0,0.06)]"
              >
                <span className="block">顺序</span>
                {batchEdit && (
                  <span className="block font-normal text-[10px] text-gray-400 mt-0.5 leading-tight">
                    按住左侧可调整顺序
                  </span>
                )}
              </th>
              <th
                style={thStickyStyle}
                className="sticky border-b border-gray-100 bg-gray-50 px-4 py-3 w-[36%] align-top shadow-[inset_0_-1px_0_rgba(0,0,0,0.06)]"
              >
                关键词（同义词同一行，逗号分隔）
              </th>
              <th
                style={thStickyStyle}
                className="sticky border-b border-gray-100 bg-gray-50 px-4 py-3 w-[24%] align-top shadow-[inset_0_-1px_0_rgba(0,0,0,0.06)]"
              >
                色值 (#RRGGBB)
              </th>
              <th
                style={thStickyStyle}
                className="sticky border-b border-gray-100 bg-gray-50 px-4 py-3 w-24 align-top shadow-[inset_0_-1px_0_rgba(0,0,0,0.06)]"
              >
                预览
              </th>
              <th
                style={thStickyStyle}
                className="sticky border-b border-gray-100 bg-gray-50 px-4 py-3 w-28 text-right align-top shadow-[inset_0_-1px_0_rgba(0,0,0,0.06)]"
              >
                操作
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {draft.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-gray-400 text-sm">
                  暂无映射，请「批量导入」或「添加映射」
                </td>
              </tr>
            ) : (
              draft.map((row, rowIndex) => {
                const previewBg = normalizeHexInput(row.hex) ?? '#e5e7eb';
                const keywordLine = keywordsToInputLine(row.keywords);
                return (
                  <tr
                    key={row.id}
                    onDragOver={(e) => handleDragOver(e, rowIndex)}
                    className={[
                      'hover:bg-gray-50/50 transition-colors',
                      draggingIdx === rowIndex ? 'opacity-50 bg-blue-50/70' : '',
                      dropTargetIdx === rowIndex && draggingIdx !== rowIndex
                        ? 'ring-2 ring-inset ring-blue-400 bg-blue-50/60'
                        : '',
                    ].join(' ')}
                  >
                    <td className="px-2 py-2.5 align-top text-center">
                      {batchEdit ? (
                        <div className="flex flex-col items-center gap-1 pt-0.5">
                          <div className="flex items-center gap-1">
                            {/* 拖拽手柄（与供应商分类管理一致） */}
                            <span
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.effectAllowed = 'move';
                                e.dataTransfer.setData('text/plain', row.id);
                                handleDragStart(rowIndex);
                              }}
                              onDragEnd={handleDragEnd}
                              className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 shrink-0"
                              title="按住拖拽排序"
                            >
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                                <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
                              </svg>
                            </span>
                            <div className="flex flex-col gap-0">
                              <button
                                type="button"
                                disabled={rowIndex === 0}
                                onClick={() => moveRowByIndex(rowIndex, -1)}
                                className={[
                                  'p-0.5 rounded transition-colors',
                                  rowIndex === 0
                                    ? 'text-gray-200 cursor-not-allowed'
                                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200',
                                ].join(' ')}
                                title="上移"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                disabled={rowIndex >= draft.length - 1}
                                onClick={() => moveRowByIndex(rowIndex, 1)}
                                className={[
                                  'p-0.5 rounded transition-colors',
                                  rowIndex >= draft.length - 1
                                    ? 'text-gray-200 cursor-not-allowed'
                                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200',
                                ].join(' ')}
                                title="下移"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                            </div>
                          </div>
                          <span className="text-[10px] text-gray-400 tabular-nums">{rowIndex + 1}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 tabular-nums inline-block pt-1">{rowIndex + 1}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      {batchEdit ? (
                        <ColorKeywordTextarea
                          rowId={row.id}
                          keywords={row.keywords}
                          onCommitLine={(line) => updateKeywordsFromLine(row.id, line)}
                        />
                      ) : (
                        <div className="w-full min-h-[3rem] rounded-md border border-gray-100 bg-gray-50/80 px-2.5 py-1.5 text-gray-800 whitespace-pre-wrap">
                          {keywordLine.trim() ? (
                            keywordLine
                          ) : (
                            <span className="text-gray-400">（未设置关键词）</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      {batchEdit ? (
                        <div className="flex items-center gap-2 min-w-0">
                          <input
                            type="text"
                            value={row.hex}
                            onChange={(e) => {
                              const v = e.target.value;
                              const norm = normalizeHexInput(v);
                              updateRow(row.id, { hex: norm ?? v });
                            }}
                            placeholder="#1a1a1a"
                            aria-label="十六进制色值"
                            className="flex-1 min-w-0 border border-gray-200 rounded-md px-2.5 py-1.5 font-mono text-xs"
                          />
                          <input
                            type="color"
                            value={normalizeHexInput(row.hex) ?? PLACEHOLDER_HEX}
                            onChange={(e) => updateRow(row.id, { hex: e.target.value.toLowerCase() })}
                            className="h-9 w-12 cursor-pointer rounded border border-gray-300 p-0.5 bg-white shrink-0"
                            title="选色"
                          />
                        </div>
                      ) : (
                        <span className="inline-flex items-center font-mono text-xs text-gray-700 tabular-nums">
                          {row.hex}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      <div className="inline-flex flex-col items-start gap-1 select-none">
                        <span className="text-[10px] text-gray-400">预览</span>
                        <div
                          className="h-11 w-11 rounded-md border border-dashed border-gray-300 bg-gray-50 shadow-inner pointer-events-none"
                          style={{ backgroundColor: previewBg }}
                          title="当前色值效果（只读）；改色请先点顶部「编辑」"
                          aria-hidden
                        />
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right align-top">
                      {batchEdit ? (
                        <button
                          type="button"
                          onClick={() => removeRow(row.id)}
                          className="text-xs text-red-500 hover:text-red-700 hover:underline"
                        >
                          删除
                        </button>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
          </div>

          <p className="text-xs text-gray-400">
            匹配规则：不区分大小写；订单颜色整句或分词命中任一同义词即使用该色值；较长词优先匹配。若某行未填关键词，该行不会参与匹配。
          </p>
        </div>

        {/* 说明（右侧；宽屏下随滚动略 sticky，避免被表格挤到下方） */}
        <aside className="w-full xl:w-80 shrink-0 xl:sticky xl:self-start xl:top-24 space-y-3">
          <div className="rounded-lg border border-gray-200 bg-gray-50/90 p-4 text-sm text-gray-600 space-y-3 leading-relaxed">
            <p className="font-medium text-gray-800">使用说明</p>
            <p>
              同一行可填写多个<strong>同义词</strong>（英文逗号、中文逗号、顿号或分号分隔），共用一个色值，例如{' '}
              <code className="text-xs bg-white px-1 rounded border border-gray-200">BLACK, 黑色</code>。
              系统匹配订单「颜色」列时<strong>不区分大小写</strong>。
            </p>
            <p>
              列表<strong>从上到下</strong>为优先级：靠前的颜色会优先出现在「添加 SKU → 常用颜色」中（最多展示前{' '}
              {COLOR_REGISTRY_COMMON_PRESET_LIMIT} 条）。编辑模式下可<strong>按住左侧手柄拖拽</strong>排序，或用箭头微调。
            </p>
            {batchEdit ? (
              <p className="text-amber-900/90 bg-amber-50/80 border border-amber-100 rounded-md px-2.5 py-2">
                正在批量编辑：可直接修改表格；删除仅在编辑模式下可用，点顶部固定栏「完成」退出。修改后请点「保存到服务器」同步到数据库。
              </p>
            ) : (
              <p className="text-gray-500">
                点顶部固定栏「编辑」后可修改颜色与关键词、调整顺序；删除需先进入编辑模式。编辑完成后点「保存到服务器」写入数据库（删除会进入回收站）。
              </p>
            )}
          </div>
        </aside>
      </div>

      <UndoToast
        canUndo={undoMgr.canUndo}
        nextDescription={undoMgr.nextDescription}
        undoCount={undoMgr.undoCount}
        onUndo={handleUndo}
        lastUndone={undoMgr.lastUndone}
        onDismiss={undoMgr.dismissLastUndone}
      />
    </div>
  );
}
