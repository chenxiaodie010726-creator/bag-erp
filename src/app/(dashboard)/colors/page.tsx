/* ============================================================
 * 颜色管理 — 多词根 / 同义词 → 色值，供订单颜色列与 SKU 色块匹配
 * URL: /colors
 * ============================================================ */

'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  loadColorRegistry,
  normalizeColorKeyword,
  normalizeHexInput,
  parseKeywordLine,
  saveColorRegistry,
  keywordsToInputLine,
  type ColorRegistryEntry,
} from '@/lib/colorRegistry';
import { useUndoManager, useUndoKeyboard } from '@/hooks/useUndoManager';
import UndoToast from '@/components/UndoToast';

function newId(): string {
  return `cr-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const PLACEHOLDER_HEX = '#808080';

export default function ColorsPage() {
  const [entries, setEntries] = useState<ColorRegistryEntry[]>(() => loadColorRegistry());
  const [savedFlash, setSavedFlash] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');

  const undoMgr = useUndoManager<ColorRegistryEntry[]>();

  const persist = useCallback((next: ColorRegistryEntry[], undoDesc?: string) => {
    if (undoDesc) {
      undoMgr.push(entries, undoDesc);
    }
    setEntries(next);
    saveColorRegistry(next);
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1200);
  }, [entries, undoMgr]);

  const handleUndo = useCallback(() => {
    const entry = undoMgr.pop();
    if (entry) {
      setEntries(entry.snapshot);
      saveColorRegistry(entry.snapshot);
    }
  }, [undoMgr]);

  useUndoKeyboard(handleUndo, undoMgr.canUndo);

  const sorted = useMemo(() => {
    return [...entries].sort((a, b) => {
      const ka = a.keywords[0] ?? '';
      const kb = b.keywords[0] ?? '';
      return ka.localeCompare(kb, 'zh-CN');
    });
  }, [entries]);

  function addRow() {
    persist([...entries, { id: newId(), keywords: [], hex: PLACEHOLDER_HEX }], '添加颜色映射');
  }

  function updateRow(id: string, patch: Partial<Pick<ColorRegistryEntry, 'keywords' | 'hex'>>) {
    persist(entries.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function updateKeywordsFromLine(id: string, line: string) {
    const kws = parseKeywordLine(line);
    updateRow(id, { keywords: kws });
  }

  function removeRow(id: string) {
    if (!window.confirm('确定删除该条颜色映射？删除后可撤回恢复。')) return;
    const target = entries.find((e) => e.id === id);
    persist(entries.filter((e) => e.id !== id), `删除颜色: ${target?.keywords[0] ?? id}`);
  }

  function resetDefaults() {
    if (!window.confirm('恢复为系统默认的一条示例（BLACK + 黑色）？已自定义的条目将被覆盖。重置后可撤回恢复。')) return;
    undoMgr.push(entries, '恢复默认颜色映射');
    try {
      localStorage.removeItem('cf_erp_color_registry');
    } catch {
      /* ignore */
    }
    const fresh = loadColorRegistry();
    setEntries(fresh);
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1200);
  }

  function applyBulkImport() {
    const lines = bulkText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      window.alert('请先粘贴或输入内容：每行一组颜色，同义词用逗号隔开。');
      return;
    }

    const used = new Set<string>();
    for (const e of entries) {
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

    persist([...entries, ...newRows], `批量导入 ${newRows.length} 条颜色`);
    setBulkText('');
    setBulkOpen(false);
    const msg =
      skippedLines > 0
        ? `已添加 ${newRows.length} 条（${skippedLines} 行因关键词已全部存在而跳过），请为每条设置色值。`
        : `已添加 ${newRows.length} 条，默认色值为占位灰，请按需编辑。`;
    window.alert(msg);
  }

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <nav className="text-sm text-gray-500 flex items-center gap-2 mb-1">
            <Link href="/products" className="hover:text-gray-800">
              产品管理
            </Link>
            <span className="text-gray-300">/</span>
            <span className="text-gray-800">颜色管理</span>
          </nav>
          <h1 className="text-xl font-bold text-gray-800">颜色管理</h1>
          <p className="text-sm text-gray-500 mt-1 max-w-xl">
            同一行可填写多个<strong>同义词</strong>（英文逗号、中文逗号或顿号分隔），共用一个色值，例如{' '}
            <code className="text-xs bg-gray-100 px-1 rounded">BLACK, 黑色</code>。
            系统匹配订单「颜色」列时不区分大小写。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 justify-end">
          {savedFlash && (
            <span className="text-xs text-green-600 animate-pulse">已保存</span>
          )}
          <button
            type="button"
            onClick={() => setBulkOpen((o) => !o)}
            className="text-sm px-3 py-2 border border-gray-200 rounded-md text-gray-700 hover:bg-gray-50"
          >
            {bulkOpen ? '收起批量导入' : '批量导入'}
          </button>
          <button
            type="button"
            onClick={resetDefaults}
            className="text-sm px-3 py-2 border border-gray-200 rounded-md text-gray-600 hover:bg-gray-50"
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

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/80 text-left text-xs font-medium text-gray-500">
              <th className="px-4 py-3 w-[40%]">关键词（同义词同一行，逗号分隔）</th>
              <th className="px-4 py-3 w-[26%]">色值 (#RRGGBB)</th>
              <th className="px-4 py-3 w-24">预览</th>
              <th className="px-4 py-3 w-28 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-gray-400 text-sm">
                  暂无映射，请「批量导入」或「添加映射」
                </td>
              </tr>
            ) : (
              sorted.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-2.5 align-top">
                    <textarea
                      value={keywordsToInputLine(row.keywords)}
                      onChange={(e) => updateKeywordsFromLine(row.id, e.target.value)}
                      rows={2}
                      placeholder="黑色, BLACK, 黑"
                      className="w-full min-h-[3rem] border border-gray-200 rounded-md px-2.5 py-1.5 text-gray-800 placeholder:text-gray-400 resize-y"
                    />
                  </td>
                  <td className="px-4 py-2.5 align-top">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={row.hex}
                        onChange={(e) => {
                          const v = e.target.value;
                          const norm = normalizeHexInput(v);
                          updateRow(row.id, { hex: norm ?? v });
                        }}
                        placeholder="#1a1a1a"
                        className="flex-1 min-w-0 border border-gray-200 rounded-md px-2.5 py-1.5 font-mono text-xs"
                      />
                      <input
                        type="color"
                        value={normalizeHexInput(row.hex) ?? PLACEHOLDER_HEX}
                        onChange={(e) => updateRow(row.id, { hex: e.target.value.toLowerCase() })}
                        className="h-9 w-12 cursor-pointer rounded border border-gray-200 p-0.5 bg-white shrink-0"
                        title="选色"
                      />
                    </div>
                  </td>
                  <td className="px-4 py-2.5 align-top">
                    <span
                      className="inline-block w-10 h-10 rounded-md border border-gray-200 shadow-inner"
                      style={{
                        backgroundColor: normalizeHexInput(row.hex) ?? '#e5e7eb',
                      }}
                    />
                  </td>
                  <td className="px-4 py-2.5 text-right align-top">
                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      className="text-xs text-red-500 hover:text-red-700 hover:underline"
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400">
        匹配规则：不区分大小写；订单颜色整句或分词命中任一同义词即使用该色值；较长词优先匹配。若某行未填关键词，该行不会参与匹配。
      </p>

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
