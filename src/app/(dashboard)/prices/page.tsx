'use client';

/* ============================================================
 * 价格管理页面
 * 两个标签页：物料价格表 / 工艺价格表
 * URL: /prices
 * ============================================================ */

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useUndoManager, useUndoKeyboard } from '@/hooks/useUndoManager';
import UndoToast from '@/components/UndoToast';
import {
  ALL_MOCK_PRICES,
  MATERIAL_PRICE_COLUMNS,
  MATERIAL_FABRIC_TABLE_HEADERS,
  PROCESS_PRICE_COLUMNS,
  BRANDS,
  CATEGORY_SUBCATEGORIES,
  isMaterialTextileStyleCategory,
  PRICE_COLOR_CATEGORY_PRESETS,
  priceDuplicateKey,
} from './_components/mockData';
import type { PriceItem, PriceTab, PriceStatus } from './_components/mockData';
import {
  sortPricesForMergeDisplay,
  packPriceRowsIntoPages,
  computeCodeNameMergeMeta,
} from './_components/priceTableUtils';
import type { SupplierCategory, SupplierItem } from '../suppliers/_components/mockData';
import {
  SUPPLIER_CATEGORIES_MATERIAL,
  SUPPLIER_CATEGORIES_PROCESS,
  MOCK_SUPPLIERS,
} from '../suppliers/_components/mockData';
import { STORAGE_KEYS } from '@/lib/storageKeys';
import {
  downloadHardwarePriceImportTemplate,
  parseHardwarePriceWorkbook,
  parsedHardwareRowsToPriceItems,
} from '@/lib/hardwarePriceImport';
import { hardwarePriceMatchesSearchText } from '@/lib/hardwarePriceSynonyms';

/** 价格表用到的供应商 chip 结构 */
interface PriceSupplier { id: string; name: string; }

const PAGE_SIZE_OPTIONS = [10, 20, 50];

/* ============================================================
 * 主页面
 * ============================================================ */
export default function PricesPage() {

  /* ===== 数据源 ===== */
  const [prices, setPricesRaw] = useState<PriceItem[]>(ALL_MOCK_PRICES);
  const undoMgr = useUndoManager<PriceItem[]>();

  function setPrices(updater: PriceItem[] | ((prev: PriceItem[]) => PriceItem[])) {
    setPricesRaw(updater);
  }

  function pushUndo(description: string) {
    undoMgr.push(prices, description);
  }

  const handleUndo = useCallback(() => {
    const entry = undoMgr.pop();
    if (entry) {
      setPricesRaw(entry.snapshot);
    }
  }, [undoMgr]);

  useUndoKeyboard(handleUndo, undoMgr.canUndo);

  /* ===== Tab ===== */
  const [activeTab, setActiveTab] = useState<PriceTab>('物料');

  /* ===== 供应商数据：从 localStorage 读取，与供应商列表页共享 ===== */
  const [allSuppliers, setAllSuppliers] = useState<SupplierItem[]>(MOCK_SUPPLIERS);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.SUPPLIERS);
      if (stored) {
        const parsed = JSON.parse(stored) as SupplierItem[];
        if (Array.isArray(parsed) && parsed.length > 0) setAllSuppliers(parsed);
      }
    } catch { /* fallback */ }
  }, []);

  /* ===== 分类列表：与供应商列表页共享 localStorage ===== */
  const [customMaterialCategories, setCustomMaterialCategories] = useState<string[]>(
    [...SUPPLIER_CATEGORIES_MATERIAL],
  );
  const [customProcessCategories, setCustomProcessCategories] = useState<string[]>(
    [...SUPPLIER_CATEGORIES_PROCESS],
  );

  useEffect(() => {
    try {
      const mat = localStorage.getItem(STORAGE_KEYS.SUPPLIER_CATEGORIES_MATERIAL);
      if (mat) {
        const parsed = JSON.parse(mat) as SupplierCategory[];
        if (Array.isArray(parsed) && parsed.length > 0) setCustomMaterialCategories(parsed);
      }
      const proc = localStorage.getItem(STORAGE_KEYS.SUPPLIER_CATEGORIES_PROCESS);
      if (proc) {
        const parsed = JSON.parse(proc) as SupplierCategory[];
        if (Array.isArray(parsed) && parsed.length > 0) setCustomProcessCategories(parsed);
      }
    } catch { /* fallback */ }
  }, []);

  const categoryList = activeTab === '物料' ? customMaterialCategories : customProcessCategories;

  /* ===== 筛选 ===== */
  const [searchText, setSearchText] = useState('');
  const [filterCategory, setFilterCategory] = useState('全部');
  const [filterType, setFilterType] = useState('全部');
  const [filterSpec, setFilterSpec] = useState('');
  const [filterBrand, setFilterBrand] = useState('全部');
  const [filterSupplier, setFilterSupplier] = useState('全部');
  const [filterStatus, setFilterStatus] = useState('全部');
  const [filterExpanded, setFilterExpanded] = useState(false);

  /* ===== 快捷分类（一级） ===== */
  const [quickCategory, setQuickCategory] = useState('全部');

  /* ===== 快捷子分类（二级，仅部分一级分类有） ===== */
  const [quickSubCategory, setQuickSubCategory] = useState('全部');

  /** 筛选到面料/里布/面布等布类时，表头为常规价/其他/幅宽；其它物料分类仍为浅金/白呖三档 */
  const isTextileStyleMaterialView =
    activeTab === '物料' &&
    (isMaterialTextileStyleCategory(quickCategory) || isMaterialTextileStyleCategory(filterCategory));

  const priceColumns = useMemo(() => {
    if (activeTab === '工艺') return PROCESS_PRICE_COLUMNS;
    return isTextileStyleMaterialView ? MATERIAL_FABRIC_TABLE_HEADERS : MATERIAL_PRICE_COLUMNS;
  }, [activeTab, isTextileStyleMaterialView]);

  /** 五金等：展示「颜色/规格」列（布类用幅宽列，不重复） */
  const showColorSpecColumn = activeTab === '物料' && !isTextileStyleMaterialView;

  /** 五金专用：同义词列 */
  const showSynonymsColumn = activeTab === '物料' && quickCategory === '五金';

  const importHardwareInputRef = useRef<HTMLInputElement>(null);

  /** 当前一级分类对应的子分类列表，无则为空数组 */
  const currentSubCategories: string[] = useMemo(
    () => (quickCategory !== '全部' ? (CATEGORY_SUBCATEGORIES[quickCategory] ?? []) : []),
    [quickCategory],
  );

  /* 切换一级分类时重置子分类 */
  useEffect(() => {
    setQuickSubCategory('全部');
  }, [quickCategory]);

  /* ===== 快捷供应商 ===== */
  const [quickSupplier, setQuickSupplier] = useState('全部');
  const [showAllSuppliers, setShowAllSuppliers] = useState(false);
  const MAX_VISIBLE_SUPPLIERS = 5;

  /* 切换分类时重置供应商选择 */
  useEffect(() => {
    setQuickSupplier('全部');
    setShowAllSuppliers(false);
  }, [quickCategory]);

  /**
   * allTabSuppliers：当前 Tab 下全部供应商（用于筛选区下拉，不受分类 chip 影响）
   */
  const allTabSuppliers: PriceSupplier[] = useMemo(() => {
    const tabType = activeTab === '物料' ? '物料供应商' : '工艺供应商';
    const seen = new Set<string>();
    const result: PriceSupplier[] = [];
    for (const s of allSuppliers) {
      if (s.type === tabType && !seen.has(s.id)) {
        seen.add(s.id);
        result.push({ id: s.id, name: s.name });
      }
    }
    return result;
  }, [allSuppliers, activeTab]);

  /**
   * supplierList：供应商 chip 列表
   * - 当前 Tab 类型的供应商
   * - 若选中了某分类（quickCategory），只显示该分类的供应商
   */
  const supplierList: PriceSupplier[] = useMemo(() => {
    const tabType = activeTab === '物料' ? '物料供应商' : '工艺供应商';
    const filtered = allSuppliers.filter((s) => {
      if (s.type !== tabType) return false;
      if (quickCategory !== '全部' && s.category !== quickCategory) return false;
      return true;
    });
    const seen = new Set<string>();
    const result: PriceSupplier[] = [];
    for (const s of filtered) {
      if (!seen.has(s.id)) {
        seen.add(s.id);
        result.push({ id: s.id, name: s.name });
      }
    }
    return result;
  }, [allSuppliers, activeTab, quickCategory]);

  /* ===== 分页 ===== */
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [jumpText, setJumpText] = useState('');

  /* ===== 选择 ===== */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  /* ===== 更多操作弹出 ===== */
  const [moreMenuId, setMoreMenuId] = useState<string | null>(null);
  useEffect(() => {
    if (!moreMenuId) return;
    const close = () => setMoreMenuId(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [moreMenuId]);

  /* ===== 弹窗 ===== */
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PriceItem | null>(null);
  const [detailTarget, setDetailTarget] = useState<PriceItem | null>(null);

  /* ===== 切 Tab 重置 ===== */
  useEffect(() => {
    setFilterCategory('全部');
    setFilterType('全部');
    setFilterSpec('');
    setFilterBrand('全部');
    setFilterSupplier('全部');
    setFilterStatus('全部');
    setQuickCategory('全部');
    setQuickSubCategory('全部');
    setQuickSupplier('全部');
    setSearchText('');
    setPage(1);
    setSelectedIds(new Set());
    setShowAllSuppliers(false);
  }, [activeTab]);

  /* ===== 唯一类型列表 ===== */
  const typeOptions = useMemo(() => {
    const set = new Set<string>();
    prices.filter((p) => (activeTab === '物料' ? p.tab === '物料' : p.tab === '工艺'))
      .forEach((p) => set.add(p.materialType));
    return Array.from(set).sort();
  }, [prices, activeTab]);

  /* ===== 筛选逻辑 ===== */
  const filteredPrices = useMemo(() => {
    return prices.filter((p) => {
      if (p.tab !== activeTab) return false;
      if (searchText) {
        if (!hardwarePriceMatchesSearchText(p, searchText)) return false;
      }
      if (filterCategory !== '全部' && p.category !== filterCategory) return false;
      if (filterType !== '全部' && p.materialType !== filterType) return false;
      if (filterSpec && !p.spec.toLowerCase().includes(filterSpec.toLowerCase())) return false;
      if (filterBrand !== '全部' && p.brand !== filterBrand) return false;
      if (filterSupplier !== '全部') {
        const sup = allTabSuppliers.find((s) => s.id === filterSupplier);
        if (!sup) return false;
        if (p.supplierId !== filterSupplier && p.supplierName !== sup.name) return false;
      }
      if (filterStatus !== '全部' && p.status !== filterStatus) return false;
      if (quickCategory !== '全部' && p.category !== quickCategory) return false;
      if (quickSubCategory !== '全部' && p.subCategory !== quickSubCategory) return false;
      if (quickSupplier !== '全部') {
        const sup = supplierList.find((s) => s.id === quickSupplier);
        if (!sup) return false;
        if (p.supplierId !== quickSupplier && p.supplierName !== sup.name) return false;
      }
      return true;
    });
  }, [prices, activeTab, searchText, filterCategory, filterType, filterSpec, filterBrand, filterSupplier, filterStatus, quickCategory, quickSubCategory, quickSupplier, allTabSuppliers, supplierList]);

  const sortedFilteredPrices = useMemo(
    () => sortPricesForMergeDisplay(filteredPrices),
    [filteredPrices],
  );

  const priceTablePages = useMemo(
    () => packPriceRowsIntoPages(sortedFilteredPrices, pageSize),
    [sortedFilteredPrices, pageSize],
  );

  const totalPages = Math.max(1, priceTablePages.length);
  const pageItems = priceTablePages[page - 1] ?? [];

  const codeNameMergeMeta = useMemo(
    () => computeCodeNameMergeMeta(pageItems),
    [pageItems],
  );

  useEffect(() => { setPage(1); }, [filteredPrices]);

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  /* ===== 重置 ===== */
  function handleReset() {
    setSearchText('');
    setFilterCategory('全部');
    setFilterType('全部');
    setFilterSpec('');
    setFilterBrand('全部');
    setFilterSupplier('全部');
    setFilterStatus('全部');
    setQuickCategory('全部');
    setQuickSubCategory('全部');
    setQuickSupplier('全部');
    setPage(1);
  }

  /* ===== 全选 ===== */
  const allPageSelected = pageItems.length > 0 && pageItems.every((p) => selectedIds.has(p.id));
  function toggleSelectAll() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) { pageItems.forEach((p) => next.delete(p.id)); }
      else { pageItems.forEach((p) => next.add(p.id)); }
      return next;
    });
  }
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  /* ===== 删除 ===== */
  function handleDelete(id: string) {
    const target = prices.find((p) => p.id === id);
    if (!target) return;
    if (!confirm(`确认删除价格「${target.name}」？删除后可撤回恢复。`)) return;
    pushUndo(`删除价格: ${target.name}`);
    setPrices((prev) => prev.filter((p) => p.id !== id));
    setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
    setMoreMenuId(null);
  }

  function handleBatchDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`确认删除选中的 ${selectedIds.size} 条价格数据？删除后可撤回恢复。`)) return;
    pushUndo(`批量删除 ${selectedIds.size} 条价格`);
    setPrices((prev) => prev.filter((p) => !selectedIds.has(p.id)));
    setSelectedIds(new Set());
  }

  /* ===== 状态切换 ===== */
  function toggleStatus(id: string) {
    const target = prices.find((p) => p.id === id);
    pushUndo(`切换价格状态: ${target?.name ?? id}`);
    setPrices((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, status: (p.status === '有效' ? '无效' : '有效') as PriceStatus } : p,
      ),
    );
  }

  /* ===== 跳转页码 ===== */
  function handleJump() {
    const n = parseInt(jumpText, 10);
    if (Number.isFinite(n) && n >= 1 && n <= totalPages) setPage(n);
    setJumpText('');
  }

  /* ===== 导出(fake) ===== */
  const handleExport = useCallback(() => { alert(`即将导出 ${filteredPrices.length} 条数据（功能待接入）`); }, [filteredPrices.length]);
  const handleDownloadTemplate = useCallback(() => {
    if (activeTab === '物料' && quickCategory === '五金') {
      downloadHardwarePriceImportTemplate();
      return;
    }
    const headers = [
      '编号', '名称', 'color_category', '类型', '分类', '子分类', '单位', '规格', '品牌',
      'price1', 'price2', 'price3', 'fabric_width', '备注',
    ];
    const example = [
      'LCK-001', 'YKK金属拉链头3#', '黑色', '拉链头', '五金', '拉头', '个', '3#', 'YKK',
      '1.20', '1.60', '1.85', '', '',
    ];
    const BOM = '\uFEFF';
    const csv = `${BOM}${headers.join(',')}\n${example.map((c) => (c.includes(',') ? `"${c}"` : c)).join(',')}\n`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'price-import-template.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }, [activeTab, quickCategory]);

  const handleImport = useCallback(() => {
    if (activeTab !== '物料') {
      alert('当前仅支持导入「物料价格表」。请切换到物料后再试。');
      return;
    }
    importHardwareInputRef.current?.click();
  }, [activeTab]);

  const handleHardwareImportFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
        alert('请上传 .xlsx 或 .xls 文件');
        return;
      }
      const buf = await file.arrayBuffer();
      const parsed = parseHardwarePriceWorkbook(buf);
      if (parsed.errors.length > 0 && parsed.rows.length === 0) {
        alert(parsed.errors.map((x) => x.message).join('\n'));
        return;
      }
      const { items, warnings } = parsedHardwareRowsToPriceItems(parsed.rows, allSuppliers);
      if (items.length === 0) {
        alert([...parsed.errors.map((x) => x.message), ...warnings].join('\n') || '没有可导入的行');
        return;
      }
      const msg = [
        `即将导入 ${items.length} 条五金价格（分类固定为「五金」，子分类默认为「特殊五金」）。`,
        warnings.length ? `\n提示：\n${warnings.join('\n')}` : '',
      ].join('');
      if (!confirm(msg)) return;
      pushUndo(`导入五金价格 ${items.length} 条`);
      setPricesRaw((prev) => [...items, ...prev]);
      if (parsed.errors.length || warnings.length) {
        alert(
          [
            `成功导入 ${items.length} 条。`,
            ...parsed.errors.map((x) => x.message),
            ...warnings,
          ].join('\n'),
        );
      }
    },
    [allSuppliers, pushUndo],
  );

  /* ===== 格式化价格 ===== */
  function fmtPrice(v: number | null) {
    if (v === null || v === undefined) return <span className="text-gray-300">/</span>;
    return <span>¥ {v.toFixed(2)}</span>;
  }

  /* ===== 可见供应商 ===== */
  const visibleSuppliers = showAllSuppliers
    ? supplierList
    : supplierList.slice(0, MAX_VISIBLE_SUPPLIERS);

  return (
    <div className="flex flex-col gap-4 min-h-0">
      <input
        ref={importHardwareInputRef}
        type="file"
        accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        className="hidden"
        aria-hidden
        onChange={handleHardwareImportFile}
      />

      {/* ===== 面包屑 ===== */}
      <div className="flex items-center gap-1.5 text-sm text-gray-400">
        <span>供应商管理</span>
        <span>/</span>
        <span className="text-gray-600">价格管理</span>
      </div>

      {/* ===== 顶部 Tab + 操作按钮 ===== */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            {(['物料', '工艺'] as PriceTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={[
                  'text-lg font-bold px-4 py-2 rounded-md border-2 transition-colors',
                  activeTab === tab
                    ? 'border-blue-500 text-blue-600 bg-blue-50'
                    : 'border-transparent text-gray-400 hover:text-gray-600',
                ].join(' ')}
              >
                {tab}价格表
              </button>
            ))}
          </div>
          <p className="text-sm text-gray-400">
            管理各供应商的{activeTab === '物料' ? '物料' : '工艺'}价格信息，支持按物料、供应商、分类等维度查询和导出，便于采购决策。
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleDownloadTemplate}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            <DownloadIcon /> 下载导入模板
          </button>
          <button
            onClick={handleImport}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            <UploadIcon /> 导入价格表
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            <ExportIcon /> 导出当前数据
          </button>
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            + 新增价格
          </button>
        </div>
      </div>

      {/* ===== 筛选条件区域 ===== */}
      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-100">
          <div className="flex items-center gap-1.5 text-sm text-gray-500">
            <FilterIcon />
            <span className="font-medium">筛选条件</span>
          </div>
          <button
            type="button"
            onClick={() => setFilterExpanded(!filterExpanded)}
            className="text-sm text-blue-500 hover:text-blue-700 transition-colors whitespace-nowrap"
          >
            {filterExpanded ? '收起' : '展开'}
            <span className="ml-1 text-xs">{filterExpanded ? '▲' : '▼'}</span>
          </button>
        </div>

        {filterExpanded && (
          <div className="px-4 py-3 space-y-3">
            {/* 第一行 */}
            <div className="grid grid-cols-4 gap-4 items-end">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">{activeTab === '物料' ? '物料' : '工艺'}名称/编号</label>
                <div className="relative">
                  <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder={`请输入名称/编号`}
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">{activeTab === '物料' ? '物料' : '工艺'}分类</label>
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                >
                  <option value="全部">选择分类</option>
                  {categoryList.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">类型</label>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                >
                  <option value="全部">全部</option>
                  {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">规格</label>
                <input
                  type="text"
                  placeholder="请输入规格"
                  value={filterSpec}
                  onChange={(e) => setFilterSpec(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
            </div>

            {/* 第二行 */}
            <div className="grid grid-cols-4 gap-4 items-end">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">品牌</label>
                <select
                  value={filterBrand}
                  onChange={(e) => setFilterBrand(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                >
                  <option value="全部">选择品牌</option>
                  {BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">供应商</label>
                <select
                  value={filterSupplier}
                  onChange={(e) => setFilterSupplier(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                >
                  <option value="全部">选择供应商</option>
                  {allTabSuppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">有效期</label>
                <div className="flex items-center gap-1">
                  <input type="date" className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400" />
                  <span className="text-gray-400 text-xs">→</span>
                  <input type="date" className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400" />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">状态</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                >
                  <option value="全部">全部</option>
                  <option value="有效">有效</option>
                  <option value="无效">无效</option>
                </select>
              </div>
            </div>

            {/* 按钮 */}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={handleReset}
                className="px-4 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
              >
                重置
              </button>
              <button
                onClick={() => setPage(1)}
                className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
              >
                查询
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ===== 物料/工艺分类快捷筛选（始终可见，与供应商列表页共享分类） ===== */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-500 whitespace-nowrap flex items-center gap-1">
          <span className="text-xs text-gray-400">{activeTab === '物料' ? '物料' : '工艺'}分类</span>
          <span className="text-xs text-gray-300">筛选</span>
        </span>
        <div className="flex items-center gap-1.5 flex-wrap">
          {['全部', ...categoryList].map((cat) => (
            <button
              key={cat}
              onClick={() => { setQuickCategory(cat); setPage(1); }}
              className={[
                'px-3 py-1 rounded-full text-sm transition-colors',
                quickCategory === cat
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
              ].join(' ')}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* ===== 二级子分类（仅当前一级分类有子分类时显示） ===== */}
      {currentSubCategories.length > 0 && (
        <div className="flex items-center gap-3 -mt-1">
          <span className="text-sm text-gray-500 whitespace-nowrap flex items-center gap-1 pl-2 border-l-2 border-blue-400">
            <span className="text-xs text-blue-500 font-medium">{quickCategory}</span>
            <span className="text-xs text-gray-300">›</span>
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {['全部', ...currentSubCategories].map((sub) => (
              <button
                key={sub}
                onClick={() => { setQuickSubCategory(sub); setPage(1); }}
                className={[
                  'px-3 py-1 rounded-full text-sm transition-colors',
                  quickSubCategory === sub
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200',
                ].join(' ')}
              >
                {sub}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ===== 供应商快捷筛选 ===== */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-500 whitespace-nowrap font-medium">供应商：</span>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => { setQuickSupplier('全部'); setPage(1); }}
            className={[
              'px-3 py-1 rounded-full text-sm transition-colors',
              quickSupplier === '全部'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
            ].join(' ')}
          >
            全部
          </button>
          {visibleSuppliers.map((s) => (
            <button
              key={s.id}
              onClick={() => { setQuickSupplier(quickSupplier === s.id ? '全部' : s.id); setPage(1); }}
              className={[
                'px-3 py-1 rounded-full text-sm transition-colors',
                quickSupplier === s.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
              ].join(' ')}
            >
              {s.name}
            </button>
          ))}
          {supplierList.length > MAX_VISIBLE_SUPPLIERS && !showAllSuppliers && (
            <button
              onClick={() => setShowAllSuppliers(true)}
              className="px-3 py-1 rounded-full text-sm text-blue-500 bg-blue-50 hover:bg-blue-100 transition-colors"
            >
              + 更多
            </button>
          )}
          {showAllSuppliers && supplierList.length > MAX_VISIBLE_SUPPLIERS && (
            <button
              onClick={() => setShowAllSuppliers(false)}
              className="px-3 py-1 rounded-full text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              收起
            </button>
          )}
        </div>
        <button
          onClick={() => { setQuickSupplier('全部'); setQuickCategory('全部'); setPage(1); }}
          className="ml-auto text-gray-400 hover:text-gray-600 transition-colors"
          title="刷新"
        >
          <RefreshIcon />
        </button>
      </div>

      {/* ===== 价格表格 ===== */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden flex-1">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-800">价格表</h2>
            <span className="text-sm text-gray-400">（共 {filteredPrices.length.toLocaleString()} 条）</span>
          </div>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <button
                onClick={handleBatchDelete}
                className="px-3 py-1.5 text-sm text-red-500 border border-red-200 rounded-md hover:bg-red-50 transition-colors"
              >
                批量删除 ({selectedIds.size})
              </button>
            )}
            <div className="relative">
              <button
                className="px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
                onClick={() => alert('批量操作（功能待接入）')}
              >
                批量操作 ▾
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[960px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap w-[88px]">类型</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap w-14">图片</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap">编号</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap">名称</th>
                {showSynonymsColumn && (
                  <th className="px-3 py-3 text-left font-medium text-gray-600 whitespace-nowrap max-w-[180px]">同义词</th>
                )}
                {showColorSpecColumn && (
                  <th className="px-3 py-3 text-left font-medium text-gray-600 whitespace-nowrap w-[100px]">颜色/规格</th>
                )}
                <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap w-16">单位</th>
                {priceColumns.map((col) => (
                  <th key={col} className="px-3 py-3 text-left font-medium text-gray-600 whitespace-nowrap">{col}</th>
                ))}
                <th className="px-3 py-3 text-left font-medium text-gray-600 whitespace-nowrap">备注</th>
                <th className="px-3 py-3 text-left font-medium text-gray-600 whitespace-nowrap w-20">状态</th>
                <th className="px-3 py-3 text-left font-medium text-gray-600 whitespace-nowrap w-28">操作</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.length === 0 ? (
                <tr>
                  <td colSpan={9 + priceColumns.length + (showColorSpecColumn ? 1 : 0) + (showSynonymsColumn ? 1 : 0)} className="text-center py-16 text-gray-400">
                    <div className="text-4xl mb-3">📭</div>
                    <p className="text-sm">没有符合条件的价格数据</p>
                    <button onClick={handleReset} className="mt-2 text-sm text-blue-500 hover:underline">
                      清除筛选条件
                    </button>
                  </td>
                </tr>
              ) : (
                pageItems.map((item) => {
                  const m = codeNameMergeMeta.get(item.id) ?? { showType: true, showCode: true, showName: true, span: 1 };
                  const cc = (item.colorCategory ?? '').trim();
                  const rowBg =
                    cc === '黑色' ? 'bg-slate-50/80' : cc === '杂色' ? 'bg-amber-50/60' : '';
                  return (
                    <tr
                      key={item.id}
                      className={['border-b border-gray-100 hover:bg-gray-50/90 transition-colors', rowBg].join(' ')}
                    >
                      <td className="px-4 py-3 align-middle">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.id)}
                          onChange={() => toggleSelect(item.id)}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>

                      {m.showType ? (
                        <td
                          className="px-4 py-3 text-gray-800 whitespace-nowrap align-middle border-r border-gray-100/60"
                          rowSpan={m.span}
                        >
                          {item.materialType}
                        </td>
                      ) : null}

                      <td className="px-4 py-3 align-middle">
                        <div className="w-10 h-10 rounded bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0 overflow-hidden">
                          {item.image ? (
                            <img src={item.image} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          )}
                        </div>
                      </td>

                      {m.showCode ? (
                        <td
                          className="px-4 py-3 text-gray-500 font-mono text-xs align-middle border-r border-gray-100/80"
                          rowSpan={m.span}
                        >
                          {item.code}
                        </td>
                      ) : null}
                      {m.showName ? (
                        <td className="px-4 py-3 text-gray-800 font-medium align-middle leading-snug max-w-[200px]" rowSpan={m.span}>
                          {item.name}
                        </td>
                      ) : null}

                      {showSynonymsColumn && (
                        <td className="px-3 py-3 text-gray-600 align-middle text-xs leading-snug max-w-[180px]" rowSpan={m.span}>
                          {item.synonyms?.trim() ? item.synonyms : <span className="text-gray-300">—</span>}
                        </td>
                      )}

                      {showColorSpecColumn && (
                        <td className="px-3 py-3 text-gray-700 align-middle whitespace-nowrap">
                          {cc ? <span className="font-medium">{cc}</span> : <span className="text-gray-300">—</span>}
                        </td>
                      )}

                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap align-middle">{item.unit}</td>

                      {isTextileStyleMaterialView ? (
                        <>
                          <td className="px-3 py-3 whitespace-nowrap text-orange-600 font-medium align-middle">{fmtPrice(item.price1)}</td>
                          <td className="px-3 py-3 whitespace-nowrap text-orange-600 font-medium align-middle">{fmtPrice(item.price3)}</td>
                          <td className="px-3 py-3 text-gray-600 whitespace-nowrap max-w-[120px] truncate align-middle">
                            {item.fabricWidth?.trim() ? item.fabricWidth : <span className="text-gray-300">-</span>}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-3 whitespace-nowrap text-orange-600 font-medium align-middle">{fmtPrice(item.price1)}</td>
                          <td className="px-3 py-3 whitespace-nowrap text-orange-600 font-medium align-middle">{fmtPrice(item.price2)}</td>
                          <td className="px-3 py-3 whitespace-nowrap text-orange-600 font-medium align-middle">{fmtPrice(item.price3)}</td>
                        </>
                      )}

                      <td className="px-3 py-3 text-gray-500 whitespace-nowrap max-w-[120px] truncate align-middle">
                        {item.remark || <span className="text-gray-300">-</span>}
                      </td>

                      <td className="px-3 py-3 align-middle">
                        <span className={[
                          'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                          item.status === '有效' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500',
                        ].join(' ')}>
                          {item.status}
                        </span>
                      </td>

                      <td className="px-3 py-3 align-middle">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setEditTarget(item)}
                            className="text-sm text-blue-500 hover:text-blue-700 transition-colors"
                          >
                            编辑
                          </button>
                          <div className="relative">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setMoreMenuId(moreMenuId === item.id ? null : item.id);
                              }}
                              className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
                            >
                              更多 ▾
                            </button>
                            {moreMenuId === item.id && (
                              <div className="absolute right-0 top-full mt-1 w-28 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-20">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setDetailTarget(item); setMoreMenuId(null); }}
                                  className="w-full text-left px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                                >
                                  查看详情
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); toggleStatus(item.id); setMoreMenuId(null); }}
                                  className="w-full text-left px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                                >
                                  {item.status === '有效' ? '设为无效' : '设为有效'}
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                                  className="w-full text-left px-3 py-1.5 text-sm text-red-500 hover:bg-red-50"
                                >
                                  删除
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ===== 分页 ===== */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <span>已选择 <span className="font-medium text-gray-700">{selectedIds.size}</span> 项</span>
            {selectedIds.size > 0 && (
              <button onClick={() => setSelectedIds(new Set())} className="text-blue-500 hover:underline">清空</button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              className="border border-gray-200 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
            >
              {PAGE_SIZE_OPTIONS.map((s) => (
                <option key={s} value={s}>{s} 条/页</option>
              ))}
            </select>

            <div className="flex items-center gap-0.5">
              <PageBtn disabled={page <= 1} onClick={() => setPage(1)}>«</PageBtn>
              <PageBtn disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</PageBtn>
              {getPageNumbers(page, totalPages).map((n, idx) =>
                n === '...'
                  ? <span key={`dots-${idx}`} className="px-1 text-gray-400 text-sm">…</span>
                  : <PageBtn key={n} active={n === page} onClick={() => setPage(n as number)}>{n}</PageBtn>,
              )}
              <PageBtn disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>›</PageBtn>
              <PageBtn disabled={page >= totalPages} onClick={() => setPage(totalPages)}>»</PageBtn>
            </div>

            <div className="flex items-center gap-1 text-sm text-gray-500">
              <span>跳至</span>
              <input
                type="text"
                value={jumpText}
                onChange={(e) => setJumpText(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => { if (e.key === 'Enter') handleJump(); }}
                className="w-12 px-1.5 py-1 text-center border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <span>页</span>
            </div>
          </div>
        </div>
      </div>

      {/* ===== 弹窗：新增 / 编辑 ===== */}
      {(createOpen || editTarget) && (
        <PriceFormModal
          mode={editTarget ? 'edit' : 'create'}
          item={editTarget}
          activeTab={activeTab}
          priceColumns={priceColumns}
          categoryList={categoryList}
          supplierList={supplierList}
          allPrices={prices}
          onClose={() => { setCreateOpen(false); setEditTarget(null); }}
          onConfirm={(item) => {
            if (editTarget) {
              pushUndo(`编辑价格: ${item.name}`);
              setPrices((prev) => prev.map((p) => (p.id === item.id ? item : p)));
            } else {
              pushUndo(`新增价格: ${item.name}`);
              setPrices((prev) => [item, ...prev]);
            }
            setCreateOpen(false);
            setEditTarget(null);
          }}
        />
      )}

      {/* ===== 弹窗：详情 ===== */}
      {detailTarget && (
        <PriceDetailModal
          item={detailTarget}
          priceColumns={priceColumns}
          fabricMaterialDetail={detailTarget.tab === '物料' && isMaterialTextileStyleCategory(detailTarget.category)}
          onClose={() => setDetailTarget(null)}
          onEdit={() => { setEditTarget(detailTarget); setDetailTarget(null); }}
        />
      )}

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


/* ============================================================
 * 新增/编辑弹窗
 * ============================================================ */
const FORM_INPUT = 'w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white';

function PriceFormModal({
  mode,
  item,
  activeTab,
  priceColumns,
  categoryList,
  supplierList,
  allPrices,
  onClose,
  onConfirm,
}: {
  mode: 'create' | 'edit';
  item: PriceItem | null;
  activeTab: PriceTab;
  priceColumns: readonly string[];
  categoryList: readonly string[];
  supplierList: PriceSupplier[];
  allPrices: PriceItem[];
  onClose: () => void;
  onConfirm: (item: PriceItem) => void;
}) {
  const [form, setForm] = useState(() => {
    if (item) {
      return {
        ...item,
        price1: item.price1 ?? '',
        price2: item.price2 ?? '',
        price3: item.price3 ?? '',
        fabricWidth: item.fabricWidth ?? '',
        colorCategory: item.colorCategory ?? '',
        synonyms: item.synonyms ?? '',
      };
    }
    return {
      materialType: '',
      code: '',
      name: '',
      unit: '个',
      category: categoryList[0] ?? '',
      spec: '',
      brand: '',
      supplierId: supplierList[0]?.id ?? '',
      supplierName: supplierList[0]?.name ?? '',
      price1: '' as string | number | null,
      price2: '' as string | number | null,
      price3: '' as string | number | null,
      fabricWidth: '',
      colorCategory: '',
      synonyms: '',
      remark: '',
      status: '有效' as PriceStatus,
    };
  });

  const isTextileStyleMaterial = activeTab === '物料' && isMaterialTextileStyleCategory(form.category);
  const showColorSpecField = activeTab === '物料' && !isTextileStyleMaterial;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.code.trim()) {
      alert('请填写编号和名称');
      return;
    }
    const sup = supplierList.find((s) => s.id === form.supplierId);
    const fw = form.fabricWidth?.trim() ?? '';
    const colorTrim = (form.colorCategory ?? '').trim();
    const synTrim = form.synonyms?.trim() ?? '';
    const result: PriceItem = {
      id: item?.id ?? `price_${Date.now()}`,
      tab: activeTab,
      materialType: form.materialType.trim() || form.name.trim(),
      code: form.code.trim(),
      name: form.name.trim(),
      unit: form.unit.trim() || '个',
      category: form.category as string,
      spec: form.spec?.trim() ?? '',
      brand: form.brand?.trim() ?? '',
      supplierId: form.supplierId,
      supplierName: sup?.name ?? form.supplierName ?? '',
      price1: form.price1 === '' || form.price1 === null ? null : Number(form.price1),
      price2: isTextileStyleMaterial ? null : (form.price2 === '' || form.price2 === null ? null : Number(form.price2)),
      price3: form.price3 === '' || form.price3 === null ? null : Number(form.price3),
      fabricWidth: isTextileStyleMaterial ? (fw || null) : undefined,
      colorCategory: activeTab === '物料' && !isTextileStyleMaterial ? (colorTrim || null) : undefined,
      synonyms: activeTab === '物料' && form.category === '五金' ? (synTrim || null) : undefined,
      remark: form.remark?.trim() ?? '',
      status: (form.status ?? '有效') as PriceStatus,
      createdAt: item?.createdAt ?? new Date().toISOString().slice(0, 10),
    };

    if (activeTab === '物料' && !isTextileStyleMaterial) {
      const k = priceDuplicateKey({ code: result.code, colorCategory: result.colorCategory });
      const dup = allPrices.some(
        (p) =>
          p.tab === '物料' &&
          p.id !== result.id &&
          priceDuplicateKey(p) === k,
      );
      if (dup) {
        alert('物料价格中「编号 + 颜色/规格」组合已存在，请调整后再保存。');
        return;
      }
    }

    onConfirm(result);
  }

  const title = mode === 'create' ? '新增价格' : '编辑价格';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-800">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="编号 *">
              <input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="如 TC-0001" className={FORM_INPUT} />
            </FormField>
            <FormField label="名称 *">
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如 TC嘴头草写圆角" className={FORM_INPUT} />
            </FormField>
            <FormField label="类型">
              <input value={form.materialType} onChange={(e) => setForm({ ...form, materialType: e.target.value })} placeholder="如 TC嘴头" className={FORM_INPUT} />
            </FormField>
            <FormField label="分类">
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={FORM_INPUT}>
                {categoryList.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </FormField>
            {activeTab === '物料' && form.category === '五金' && (
              <div className="col-span-2">
                <FormField label="同义词">
                  <textarea
                    value={form.synonyms ?? ''}
                    onChange={(e) => setForm({ ...form, synonyms: e.target.value })}
                    placeholder="历史叫法，多个用逗号、顿号或分号分隔；匹配时不区分英文大小写"
                    rows={2}
                    className={FORM_INPUT}
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    与颜色管理相同规则：整句或分词命中任一同义词即可；较长词优先。
                  </p>
                </FormField>
              </div>
            )}
            <FormField label="单位">
              <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="个" className={FORM_INPUT} />
            </FormField>
            <FormField label="规格">
              <input value={form.spec ?? ''} onChange={(e) => setForm({ ...form, spec: e.target.value })} placeholder="如 2.5*3cm" className={FORM_INPUT} />
            </FormField>
            <FormField label="品牌">
              <input value={form.brand ?? ''} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="如 TC" className={FORM_INPUT} />
            </FormField>
            <FormField label="供应商">
              <select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })} className={FORM_INPUT}>
                {supplierList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </FormField>
            {showColorSpecField && (
              <div className="col-span-2">
                <FormField label="颜色/规格">
                  <select
                    value={form.colorCategory ?? ''}
                    onChange={(e) => setForm({ ...form, colorCategory: e.target.value })}
                    className={FORM_INPUT}
                  >
                    <option value="">未区分（单行）</option>
                    {PRICE_COLOR_CATEGORY_PRESETS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-gray-400 mt-1">与编号共同唯一；导入列名 color_category</p>
                </FormField>
              </div>
            )}
          </div>

          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-medium text-gray-500 mb-3">价格信息</p>
            {isTextileStyleMaterial ? (
              <div className="grid grid-cols-3 gap-4">
                <FormField label="常规价">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={form.price1 ?? ''}
                    onChange={(e) => setForm({ ...form, price1: e.target.value })}
                    className={FORM_INPUT}
                  />
                </FormField>
                <FormField label="其他">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={form.price3 ?? ''}
                    onChange={(e) => setForm({ ...form, price3: e.target.value })}
                    className={FORM_INPUT}
                  />
                </FormField>
                <FormField label="幅宽">
                  <input
                    value={form.fabricWidth ?? ''}
                    onChange={(e) => setForm({ ...form, fabricWidth: e.target.value })}
                    placeholder="如 54英寸"
                    className={FORM_INPUT}
                  />
                </FormField>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                {priceColumns.map((col, idx) => {
                  const key = `price${idx + 1}` as 'price1' | 'price2' | 'price3';
                  return (
                    <FormField key={col} label={col}>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={form[key] ?? ''}
                        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                        className={FORM_INPUT}
                      />
                    </FormField>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="备注">
              <input value={form.remark ?? ''} onChange={(e) => setForm({ ...form, remark: e.target.value })} placeholder="备注信息" className={FORM_INPUT} />
            </FormField>
            <FormField label="状态">
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as PriceStatus })} className={FORM_INPUT}>
                <option value="有效">有效</option>
                <option value="无效">无效</option>
              </select>
            </FormField>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-100 transition-colors">取消</button>
            <button type="submit" className="px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
              {mode === 'create' ? '创建' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


/* ============================================================
 * 详情弹窗
 * ============================================================ */
function PriceDetailModal({
  item,
  priceColumns,
  fabricMaterialDetail,
  onClose,
  onEdit,
}: {
  item: PriceItem;
  priceColumns: readonly string[];
  /** 物料·面料：展示常规价/其他/幅宽 */
  fabricMaterialDetail: boolean;
  onClose: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md bg-white rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-800">价格详情</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <DetailRow label="编号" value={item.code} />
            <DetailRow label="名称" value={item.name} />
            {item.tab === '物料' && item.category === '五金' && (
              <DetailRow label="同义词" value={item.synonyms?.trim() || '-'} />
            )}
            <DetailRow label="类型" value={item.materialType} />
            <DetailRow label="分类" value={item.category} />
            <DetailRow label="单位" value={item.unit} />
            <DetailRow label="规格" value={item.spec || '-'} />
            <DetailRow label="品牌" value={item.brand || '-'} />
            <DetailRow label="供应商" value={item.supplierName} />
            {!fabricMaterialDetail && item.tab === '物料' && (
              <DetailRow label="颜色/规格" value={item.colorCategory?.trim() || '-'} />
            )}
            {fabricMaterialDetail ? (
              <>
                <DetailRow label="常规价" value={item.price1 !== null ? `¥ ${item.price1!.toFixed(2)}` : '-'} />
                <DetailRow label="其他" value={item.price3 !== null ? `¥ ${item.price3!.toFixed(2)}` : '-'} />
                <DetailRow label="幅宽" value={item.fabricWidth?.trim() || '-'} />
              </>
            ) : (
              <>
                <DetailRow label={priceColumns[0]} value={item.price1 !== null ? `¥ ${item.price1!.toFixed(2)}` : '-'} />
                <DetailRow label={priceColumns[1]} value={item.price2 !== null ? `¥ ${item.price2!.toFixed(2)}` : '-'} />
                <DetailRow label={priceColumns[2]} value={item.price3 !== null ? `¥ ${item.price3!.toFixed(2)}` : '-'} />
              </>
            )}
            <DetailRow label="备注" value={item.remark || '-'} />
            <DetailRow label="状态" value={item.status} />
            <DetailRow label="创建日期" value={item.createdAt} />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-100 transition-colors">关闭</button>
          <button onClick={onEdit} className="px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">编辑</button>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-gray-700 mt-0.5">{value}</p>
    </div>
  );
}


/* ============================================================
 * 辅助小组件
 * ============================================================ */
function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-600">{label}</label>
      {children}
    </div>
  );
}

interface PageBtnProps { children: React.ReactNode; onClick?: () => void; active?: boolean; disabled?: boolean; }
function PageBtn({ children, onClick, active, disabled }: PageBtnProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        'min-w-8 h-8 flex items-center justify-center rounded-md text-sm transition-colors',
        active ? 'bg-blue-600 text-white font-medium' : '',
        disabled ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 hover:bg-gray-100',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function getPageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '...')[] = [1];
  if (current > 3) pages.push('...');
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) pages.push(p);
  if (current < total - 2) pages.push('...');
  pages.push(total);
  return pages;
}


/* ============================================================
 * SVG Icons
 * ============================================================ */
function DownloadIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function SearchIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={`w-4 h-4 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}
