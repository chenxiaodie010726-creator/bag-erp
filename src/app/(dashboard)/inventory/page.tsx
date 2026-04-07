'use client';

/* ============================================================
 * 出货进度总览页面
 * 功能：按客户 PO 维度查看每个 SKU 的分批出库记录
 * URL：/inventory
 * ============================================================ */

import { useState, useMemo, useRef, useEffect } from 'react';
import PoGroup from './_components/PoGroup';
import ImportModal from './_components/ImportModal';
import { MOCK_PO_GROUPS } from './_components/mockData';
import type { PoGroupData } from './_components/mockData';
import { exportInventoryToExcel, filterPoGroupsBySkuIds } from '@/lib/excelUtils';
import { poMatchesFilter } from '@/lib/poNumber';

export default function InventoryPage() {

  /* ===== 数据源（初始使用模拟数据，导入后替换并持久化到 localStorage） ===== */
  const [poGroups, setPoGroups] = useState<PoGroupData[]>(MOCK_PO_GROUPS);

  /* 页面加载时，从 localStorage 恢复上次导入的数据（如有） */
  useEffect(() => {
    try {
      const stored = localStorage.getItem('cf_erp_inventory');
      if (stored) {
        const parsed: PoGroupData[] = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setPoGroups(parsed);
        }
      }
    } catch {
      /* localStorage 读取失败时静默降级到模拟数据，不影响使用 */
    }
  }, []);

  /* ===== 弹窗状态 ===== */
  const [importModalOpen, setImportModalOpen] = useState(false);

  /* ===== 筛选面板状态 ===== */
  const [filterOpen, setFilterOpen] = useState(true);

  /* ===== 筛选条件 ===== */
  const [filterPos, setFilterPos] = useState<string[]>([]);   // 客户 PO 号（多值，每行一个）
  const [filterSkus, setFilterSkus] = useState<string[]>([]);  // SKU 编码（多值）
  const [filterPatternCode, setFilterPatternCode] = useState(''); // 纸格款号关键词
  const [filterWo, setFilterWo] = useState('');               // 生产订单号关键词
  const [filterShipped, setFilterShipped] = useState('全部'); // 出货状态
  const [filterStock, setFilterStock] = useState('全部');     // 库存状态

  /* ===== 表格行勾选（用于「导出选中」） ===== */
  const [selectedSkuIds, setSelectedSkuIds] = useState<Set<string>>(() => new Set());

  function toggleSkuSelected(id: string) {
    setSelectedSkuIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleGroupSkuSelected(itemIds: string[], selectAll: boolean) {
    setSelectedSkuIds((prev) => {
      const next = new Set(prev);
      if (selectAll) itemIds.forEach((id) => next.add(id));
      else itemIds.forEach((id) => next.delete(id));
      return next;
    });
  }

  function handleExportAll() {
    exportInventoryToExcel(filteredGroups, '出货进度-全部.xlsx');
  }

  function handleExportSelected() {
    if (selectedSkuIds.size === 0) {
      alert('请先勾选要导出的行');
      return;
    }
    const only = filterPoGroupsBySkuIds(filteredGroups, selectedSkuIds);
    if (only.length === 0) {
      alert('没有可导出的数据');
      return;
    }
    exportInventoryToExcel(only, '出货进度-已选.xlsx');
  }

  /* ===== 导入确认回调：更新状态 + 持久化到 localStorage ===== */
  function handleImportConfirm(data: PoGroupData[]) {
    setPoGroups(data);
    handleReset();
    try {
      /* 将导入数据存入 localStorage，刷新后不丢失 */
      localStorage.setItem('cf_erp_inventory', JSON.stringify(data));
    } catch {
      /* 存储空间不足时静默忽略，数据仍在内存中可用 */
    }
  }

  /* ===== 过滤逻辑 ===== */
  const filteredGroups = useMemo(() => {
    const skuSet = filterSkus.length > 0
      ? new Set(filterSkus.map((s) => s.toLowerCase()))
      : null;

    return poGroups
      .filter((po) => {
        if (filterPos.length > 0 && !filterPos.some((line) => poMatchesFilter(po.poNumber, line))) return false;
        return true;
      })
      .map((po) => {
        const filteredItems = po.items.filter((item) => {
          /* 多值 SKU 筛选：item.sku 必须在 skuSet 中 */
          if (skuSet && !skuSet.has(item.sku.toLowerCase())) return false;

          /* 纸格款号关键词筛选 */
          if (filterPatternCode && !item.patternCode?.toLowerCase().includes(filterPatternCode.toLowerCase())) return false;

          /* 生产订单号关键词筛选 */
          if (filterWo && item.wo && !item.wo.toLowerCase().includes(filterWo.toLowerCase())) return false;
          if (filterWo && !item.wo) return false;

          /* 出货状态筛选 */
          if (filterShipped === '有出库') {
            if (!Object.values(item.shipments).some((v) => v !== null && v > 0)) return false;
          }
          if (filterShipped === '无出库') {
            if (Object.values(item.shipments).some((v) => v !== null && v > 0)) return false;
          }

          /* 库存状态筛选 */
          if (filterStock === '有库存' && item.remaining <= 0) return false;
          if (filterStock === '无库存' && item.remaining > 0) return false;

          return true;
        });
        return { ...po, items: filteredItems };
      })
      .filter((po) => po.items.length > 0);
  }, [poGroups, filterPos, filterSkus, filterPatternCode, filterWo, filterShipped, filterStock]);

  /* 筛选结果变化时，去掉已不可见行的勾选，避免导出幽灵 id */
  useEffect(() => {
    const visible = new Set(filteredGroups.flatMap((g) => g.items.map((i) => i.id)));
    setSelectedSkuIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (visible.has(id)) next.add(id);
        else changed = true;
      });
      if (!changed && next.size === prev.size) return prev;
      return next;
    });
  }, [filteredGroups]);

  /* ===== 统计 ===== */
  const totalOrders = filteredGroups.length;
  const totalSkus = filteredGroups.reduce((sum, po) => sum + po.items.length, 0);

  /* ===== 重置筛选 ===== */
  /* 重置筛选条件（不清除导入数据） */
  function handleReset() {
    setFilterPos([]);
    setFilterSkus([]);
    setFilterPatternCode('');
    setFilterWo('');
    setFilterShipped('全部');
    setFilterStock('全部');
    setSelectedSkuIds(new Set());
  }

  /* 清除导入数据，恢复模拟数据 */
  function handleClearImport() {
    if (!confirm('确认清除已导入数据，恢复为演示数据吗？')) return;
    try { localStorage.removeItem('cf_erp_inventory'); } catch { /* ignore */ }
    setPoGroups(MOCK_PO_GROUPS);
    handleReset();
  }

  /* 判断当前是否使用了导入数据（用于决定是否显示「清除」按钮） */
  const isImported = poGroups !== MOCK_PO_GROUPS;

  return (
    <div className="flex flex-col gap-4">

      {/* ========================================
          顶部操作栏
          ======================================== */}
      <div className="flex items-center justify-between">

        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-gray-800">出货进度总览</h1>
          <span className="text-sm text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
            共 <b className="text-gray-700">{totalOrders}</b> 个订单，
            <b className="text-gray-700">{totalSkus}</b> 个 SKU
            {selectedSkuIds.size > 0 && (
              <>
                ，已选 <b className="text-blue-600">{selectedSkuIds.size}</b> 行
              </>
            )}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <TopBarButton icon="🔽" label="筛选" onClick={() => setFilterOpen((v) => !v)} active={filterOpen} />
          <TopBarButton icon="↺" label="重置" onClick={handleReset} />
          {/* 仅在使用导入数据时显示「清除导入」按钮 */}
          {isImported && (
            <button
              onClick={handleClearImport}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-500 border border-red-200 rounded-md hover:bg-red-50 transition-colors"
              title="清除导入数据，恢复演示数据"
            >
              ✕ 清除导入
            </button>
          )}
          <button
            onClick={() => setImportModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            ↑ 导入
          </button>
          <button
            type="button"
            onClick={handleExportAll}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            ↓ 导出全部
          </button>
          <button
            type="button"
            onClick={handleExportSelected}
            disabled={selectedSkuIds.size === 0}
            title={selectedSkuIds.size === 0 ? '请先在表格中勾选行' : '仅导出已勾选的行'}
            className={[
              'flex items-center gap-1.5 px-3 py-2 text-sm rounded-md font-medium transition-colors',
              selectedSkuIds.size === 0
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-gray-900 text-white hover:bg-gray-700',
            ].join(' ')}
          >
            ↓ 导出选中
          </button>
        </div>
      </div>

      {/* ===== 导入弹窗 ===== */}
      <ImportModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onConfirm={handleImportConfirm}
      />

      {/* ========================================
          筛选区域（可折叠）
          ======================================== */}
      {filterOpen && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">

          {/* 第一行：核心筛选项 */}
          <div className="grid grid-cols-5 gap-3">

            {/* 1. 客户 PO 号（多值，与 SKU 筛选相同交互） */}
            <FilterItem label={
              <span className="flex items-center gap-1.5">
                客户 PO 号
                {filterPos.length > 0 && (
                  <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 text-[10px] font-bold bg-blue-500 text-white rounded-full">
                    {filterPos.length}
                  </span>
                )}
              </span>
            }>
              <MultiLineTextFilter variant="po" values={filterPos} onChange={setFilterPos} />
            </FilterItem>

            {/* 2. SKU 编码（多值筛选，占 2 列） */}
            <div className="col-span-2">
              <FilterItem label={
                <span className="flex items-center gap-1.5">
                  SKU 编码
                  {filterSkus.length > 0 && (
                    <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 text-[10px] font-bold bg-blue-500 text-white rounded-full">
                      {filterSkus.length}
                    </span>
                  )}
                </span>
              }>
                <MultiLineTextFilter variant="sku" values={filterSkus} onChange={setFilterSkus} />
              </FilterItem>
            </div>

            {/* 3. 纸格款号 */}
            <FilterItem label="纸格款号">
              <input
                type="text"
                placeholder="支持搜索"
                value={filterPatternCode}
                onChange={(e) => setFilterPatternCode(e.target.value)}
                className={INPUT_CLS}
              />
            </FilterItem>

            {/* 4. 生产订单号 */}
            <FilterItem label="生产订单号">
              <input
                type="text"
                placeholder="支持搜索"
                value={filterWo}
                onChange={(e) => setFilterWo(e.target.value)}
                className={INPUT_CLS}
              />
            </FilterItem>
          </div>

          {/* 第二行：辅助筛选项 */}
          <div className="grid grid-cols-5 gap-3 items-end">
            <FilterItem label="下单日期">
              <div className="flex items-center gap-1">
                <input type="date" className={INPUT_CLS} />
                <span className="text-gray-400 text-xs shrink-0">→</span>
                <input type="date" className={INPUT_CLS} />
              </div>
            </FilterItem>
            <FilterItem label="交货日期">
              <div className="flex items-center gap-1">
                <input type="date" className={INPUT_CLS} />
                <span className="text-gray-400 text-xs shrink-0">→</span>
                <input type="date" className={INPUT_CLS} />
              </div>
            </FilterItem>
            <FilterItem label="出货状态">
              <select
                value={filterShipped}
                onChange={(e) => setFilterShipped(e.target.value)}
                className={INPUT_CLS}
              >
                <option>全部</option>
                <option>有出库</option>
                <option>无出库</option>
              </select>
            </FilterItem>
            <FilterItem label="库存状态">
              <select
                value={filterStock}
                onChange={(e) => setFilterStock(e.target.value)}
                className={INPUT_CLS}
              >
                <option>全部</option>
                <option>有库存</option>
                <option>无库存</option>
              </select>
            </FilterItem>
            <div className="flex justify-end items-end">
              <button
                onClick={() => setFilterOpen(false)}
                className="px-3 py-2 text-sm text-gray-500 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
              >
                收起 ↑
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================
          PO 分组列表
          ======================================== */}
      {filteredGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <div className="text-4xl mb-3">📭</div>
          <p className="text-sm">没有符合条件的订单</p>
          <button
            onClick={handleReset}
            className="mt-3 text-sm text-blue-500 hover:underline"
          >
            清除筛选条件
          </button>
        </div>
      ) : (
        filteredGroups.map((po) => (
          <PoGroup
            key={po.poNumber}
            data={po}
            selectedIds={selectedSkuIds}
            onToggleItem={toggleSkuSelected}
            onToggleGroupAll={toggleGroupSkuSelected}
          />
        ))
      )}

    </div>
  );
}


/* ============================================================
 * 多行文本筛选（客户 PO / SKU 共用）
 * 支持手动输入、粘贴多行、导入 .txt 文件
 * ============================================================ */
const MULTI_LINE_FILTER_COPY = {
  sku: {
    summary: (n: number) => `已筛选 ${n} 个 SKU`,
    panelHint: '每行输入一个 SKU 编码，支持直接粘贴',
    placeholder: 'AP1-BC-BLK\nAP1-BC-RED\n26SP-W1678-1PRSE-AP1-BLK1-ONS-TK\n...',
    countNoun: 'SKU',
  },
  po: {
    summary: (n: number) => `已筛选 ${n} 个 PO`,
    panelHint: '每行输入一个客户 PO 号（如 PO#260501），支持直接粘贴',
    placeholder: 'PO#260501\nPO#260502\n260501',
    countNoun: 'PO',
  },
} as const;

interface MultiLineTextFilterProps {
  variant: keyof typeof MULTI_LINE_FILTER_COPY;
  values: string[];
  onChange: (v: string[]) => void;
}

function MultiLineTextFilter({ variant, values, onChange }: MultiLineTextFilterProps) {
  const copy = MULTI_LINE_FILTER_COPY[variant];
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleOpen() {
    setDraft(values.join('\n'));
    setOpen(true);
  }

  function parseDraft(text: string): string[] {
    return text.split(/[\n,；;]/).map((s) => s.trim()).filter(Boolean);
  }

  function handleConfirm() {
    onChange(parseDraft(draft));
    setOpen(false);
  }

  function handleClear() {
    setDraft('');
    onChange([]);
    setOpen(false);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = (ev.target?.result as string) ?? '';
      setDraft((prev) => (prev.trim() ? prev.trimEnd() + '\n' + text : text));
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        handleConfirm();
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draft]);

  const draftCount = parseDraft(draft).length;

  return (
    <div ref={containerRef} className="relative">

      <button
        type="button"
        onClick={handleOpen}
        className={[
          'w-full px-2 py-1.5 text-sm border rounded-md text-left transition-colors',
          values.length > 0
            ? 'border-blue-400 bg-blue-50 text-blue-700'
            : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300',
        ].join(' ')}
      >
        {values.length === 0
          ? '支持多个，每行一个'
          : copy.summary(values.length)
        }
      </button>

      {open && (
        <div className="absolute top-full left-0 z-30 mt-1 bg-white border border-gray-300 rounded-lg shadow-xl p-3 w-96">

          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-600">
              {copy.panelHint}
            </span>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 border border-blue-200 rounded px-2 py-0.5 transition-colors"
            >
              📂 导入文件
            </button>
          </div>

          <textarea
            autoFocus
            rows={7}
            className="w-full px-2.5 py-2 text-xs font-mono border border-gray-200 rounded-md resize-none focus:outline-none focus:ring-1 focus:ring-blue-400 leading-[1.6] placeholder:text-gray-300"
            placeholder={copy.placeholder}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />

          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-gray-400">
              {draftCount > 0 ? `${draftCount} 个 ${copy.countNoun}` : '暂无内容'}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClear}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                清空
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded-md hover:bg-gray-700 transition-colors font-medium"
              >
                确定筛选
              </button>
            </div>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept=".txt,.csv"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      )}
    </div>
  );
}


/* ============================================================
 * 内部小组件：顶部操作按钮
 * ============================================================ */
interface TopBarButtonProps {
  icon: string;
  label: string;
  onClick: () => void;
  active?: boolean;
}
function TopBarButton({ icon, label, onClick, active }: TopBarButtonProps) {
  return (
    <button
      onClick={onClick}
      className={[
        'flex items-center gap-1.5 px-3 py-2 text-sm border rounded-md transition-colors',
        active
          ? 'border-gray-400 bg-gray-100 text-gray-800'
          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
      ].join(' ')}
    >
      <span className="text-xs">{icon}</span>
      {label}
    </button>
  );
}


/* ============================================================
 * 内部小组件：筛选项容器
 * ============================================================ */
interface FilterItemProps {
  label: React.ReactNode;
  children: React.ReactNode;
}
function FilterItem({ label, children }: FilterItemProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-gray-500 font-medium">{label}</label>
      {children}
    </div>
  );
}

const INPUT_CLS = 'w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white';
