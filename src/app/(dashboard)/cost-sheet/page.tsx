/* ============================================================
 * 成本核算表列表页
 * URL: /cost-sheet
 * ============================================================ */

'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import {
  loadCostSheets,
  saveCostSheets,
  calcCostSheetTotal,
  generateId,
  loadLaborCosts,
  saveLaborCosts,
} from '@/lib/costSheetUtils';
import { parseMultiSheetCostSheetExcel } from '@/lib/costSheetImport';
import { downloadCostSheetTemplate } from '@/lib/costSheetTemplate';
import type { CostSheet, LaborCostSetting } from '@/types';

export default function CostSheetListPage() {
  const [sheets, setSheets] = useState<CostSheet[]>([]);
  const [search, setSearch] = useState('');
  const [laborModalOpen, setLaborModalOpen] = useState(false);
  const [laborCosts, setLaborCosts] = useState<LaborCostSetting[]>([]);

  useEffect(() => {
    setSheets(loadCostSheets());
    setLaborCosts(loadLaborCosts());
  }, []);

  // 按纸格款号分组，只显示最新版本
  const groupedSheets = useMemo(() => {
    const map = new Map<string, CostSheet>();
    for (const s of sheets) {
      const existing = map.get(s.pattern_code);
      if (!existing || s.version > existing.version) {
        map.set(s.pattern_code, s);
      }
    }
    let result = Array.from(map.values());

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((s) => s.pattern_code.toLowerCase().includes(q));
    }

    return result.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [sheets, search]);

  function handleDelete(patternCode: string) {
    if (!confirm(`确定删除款号 ${patternCode} 的所有成本表版本？`)) return;
    const next = sheets.filter((s) => s.pattern_code !== patternCode);
    setSheets(next);
    saveCostSheets(next);
  }

  // Excel导入
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      const XLSX = await import('xlsx');
      const newSheets: CostSheet[] = [];

      for (const file of Array.from(files)) {
        const data = await file.arrayBuffer();
        const wb = XLSX.read(data, { type: 'array' });

        // 将所有 Sheet 转为 { name, rows } 数组，交由 parseMultiSheetCostSheetExcel 统一识别
        const allSheets = wb.SheetNames.map((name) => ({
          name: name.replace(/^\uFEFF/, '').trim(),
          rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' }) as (string | number | null)[][],
        }));

        const parsed = parseMultiSheetCostSheetExcel(allSheets);

        if (!parsed.pattern_code) {
          alert(`文件 "${file.name}" 中未找到纸格款号，已跳过`);
          continue;
        }

        // 检查是否已有该款号的成本表，如果有则版本+1
        const existingVersions = sheets.filter((s) => s.pattern_code === parsed.pattern_code);
        if (existingVersions.length > 0) {
          const maxV = Math.max(...existingVersions.map((v) => v.version));
          parsed.version = maxV + 1;
        }

        newSheets.push(parsed);
      }

      if (newSheets.length > 0) {
        const all = [...newSheets, ...sheets];
        setSheets(all);
        saveCostSheets(all);
        alert(`成功导入 ${newSheets.length} 个成本表`);
      }
    } catch (err) {
      alert('导入失败：' + (err instanceof Error ? err.message : String(err)));
    }

    e.target.value = '';
  }

  // 人工费用设置
  function handleSaveLaborCosts() {
    saveLaborCosts(laborCosts);
    setLaborModalOpen(false);
  }

  function updateLaborCost(id: string, field: keyof LaborCostSetting, value: string | number) {
    setLaborCosts((prev) =>
      prev.map((l) => (l.id === id ? { ...l, [field]: value } : l))
    );
  }

  function addLaborCost() {
    setLaborCosts((prev) => [
      ...prev,
      { id: generateId(), name: '', unit_price: 0, effective_from: new Date().toISOString().slice(0, 10), effective_to: null, created_at: new Date().toISOString().slice(0, 10) },
    ]);
  }

  function removeLaborCost(id: string) {
    setLaborCosts((prev) => prev.filter((l) => l.id !== id));
  }

  const STATUS_STYLE: Record<string, string> = {
    draft: 'bg-amber-100 text-amber-700',
    confirmed: 'bg-blue-100 text-blue-700',
    locked: 'bg-green-100 text-green-700',
  };
  const STATUS_LABEL: Record<string, string> = {
    draft: '草稿',
    confirmed: '已确认',
    locked: '已锁定',
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-gray-800">成本核算表</h1>
          <span className="text-sm text-gray-400">管理每个款号的BOM成本明细</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLaborModalOpen(true)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-md hover:bg-gray-50 transition-colors text-gray-600"
          >
            ⚙ 人工费用设置
          </button>
          <button
            type="button"
            onClick={() => void downloadCostSheetTemplate()}
            className="px-3 py-2 text-sm border border-gray-200 rounded-md hover:bg-gray-50 transition-colors text-gray-600"
            title="下载空白导入模板，填写后再导入"
          >
            ↓ 下载导入模板
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="px-4 py-2 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-700 transition-colors font-medium"
          >
            ↑ 导入成本表
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            multiple
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
      </div>

      {/* 搜索 */}
      <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
        <div className="relative max-w-md">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input
            type="text"
            placeholder="搜索纸格款号..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
          />
        </div>
      </div>

      {/* 列表 */}
      {groupedSheets.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg py-16 text-center text-gray-400">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-sm font-medium text-gray-600">暂无成本表</p>
          <p className="text-xs text-gray-400 mt-1">点击「导入成本表」上传Excel模板</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groupedSheets.map((sheet) => {
            const totals = calcCostSheetTotal(sheet);
            const versionCount = sheets.filter((s) => s.pattern_code === sheet.pattern_code).length;
            const materialCount = (sheet.material_items ?? []).length;
            const categoryCount = new Set((sheet.material_items ?? []).map((i) => i.category)).size;

            return (
              <div key={sheet.pattern_code} className="bg-white border border-gray-200 rounded-lg px-5 py-4 hover:shadow-sm transition-shadow">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <Link
                      href={`/cost-sheet/${sheet.id}`}
                      className="font-bold text-gray-800 hover:text-blue-600 transition-colors text-lg"
                    >
                      {sheet.pattern_code}
                    </Link>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[sheet.status] ?? ''}`}>
                      {STATUS_LABEL[sheet.status] ?? sheet.status}
                    </span>
                    {versionCount > 1 && (
                      <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                        v{sheet.version} (共{versionCount}个版本)
                      </span>
                    )}
                    <span className="text-xs text-gray-400">{categoryCount}类物料 · {materialCount}个部件</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-500 flex-shrink-0">
                    <div className="text-right">
                      <p className="text-xs text-gray-400">材料成本</p>
                      <p className="font-semibold text-gray-700">¥{totals.materialTotal.toFixed(2)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400">总成本</p>
                      <p className="font-semibold text-red-600">¥{totals.grandTotal.toFixed(2)}</p>
                    </div>
                    <span className="text-xs text-gray-400">{sheet.date || sheet.created_at}</span>
                    <Link
                      href={`/cost-sheet/${sheet.id}`}
                      className="px-3 py-1.5 text-xs border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
                    >
                      查看
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDelete(sheet.pattern_code)}
                      className="px-3 py-1.5 text-xs text-red-500 border border-red-200 rounded-md hover:bg-red-50 transition-colors"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 人工费用设置弹窗 */}
      {laborModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setLaborModalOpen(false); }}
          role="presentation"
        >
          <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-base font-semibold text-gray-800">人工费用设置</h2>
              <button type="button" onClick={() => setLaborModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-3 max-h-[60vh] overflow-y-auto">
              <p className="text-xs text-gray-400">人工费用会自动应用到所有成本表的总计中</p>
              {laborCosts.map((lc) => (
                <div key={lc.id} className="flex items-center gap-3">
                  <input
                    type="text"
                    value={lc.name}
                    onChange={(e) => updateLaborCost(lc.id, 'name', e.target.value)}
                    placeholder="费用名称"
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
                  />
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={lc.unit_price}
                    onChange={(e) => updateLaborCost(lc.id, 'unit_price', Number(e.target.value) || 0)}
                    className="w-24 px-3 py-2 text-sm border border-gray-200 rounded-md text-center focus:outline-none focus:ring-1 focus:ring-gray-400"
                  />
                  <span className="text-xs text-gray-400">元/个</span>
                  <button
                    type="button"
                    onClick={() => removeLaborCost(lc.id)}
                    className="text-red-400 hover:text-red-600 text-sm"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addLaborCost}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                + 添加费用项
              </button>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 border-t border-gray-200">
              <button type="button" onClick={() => setLaborModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-100 transition-colors">取消</button>
              <button type="button" onClick={handleSaveLaborCosts} className="px-5 py-2 text-sm font-medium rounded-md bg-gray-900 text-white hover:bg-gray-700 transition-colors">保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
