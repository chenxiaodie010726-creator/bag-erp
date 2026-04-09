'use client';

/* ============================================================
 * 供应商管理 — 供应商列表页面
 * 说明: 展示所有供应商，支持分类筛选、新增/编辑/删除、
 *       Excel 导入/模板下载、企业微信绑定、分类管理
 * 文件位置: src/app/(dashboard)/suppliers/page.tsx
 * URL: /suppliers
 * ============================================================ */

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useUndoManager, useUndoKeyboard } from '@/hooks/useUndoManager';
import UndoToast from '@/components/UndoToast';
import {
  MOCK_SUPPLIERS,
  SUPPLIER_CATEGORIES_MATERIAL,
  SUPPLIER_CATEGORIES_PROCESS,
  CATEGORY_COLORS,
} from './_components/mockData';
import type {
  SupplierItem,
  SupplierType,
  SupplierCategory,
  SupplierStatus,
} from './_components/mockData';
import { STORAGE_KEYS } from '@/lib/storageKeys';
import ImportSupplierModal from './_components/ImportSupplierModal';
import { downloadSupplierTemplate } from './_components/ImportSupplierModal';
import SupplierFormModal from './_components/SupplierFormModal';

const PAGE_SIZE_OPTIONS = [10, 20, 50];

function saveToStorage(data: SupplierItem[]) {
  try {
    localStorage.setItem(STORAGE_KEYS.SUPPLIERS, JSON.stringify(data));
  } catch { /* quota — silent */ }
}

/* ============================================================
 * 主页面
 * ============================================================ */
export default function SuppliersPage() {

  /* ===== 数据源 ===== */
  const [suppliers, setSuppliersRaw] = useState<SupplierItem[]>(MOCK_SUPPLIERS);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.SUPPLIERS);
      if (stored) {
        const parsed = JSON.parse(stored) as SupplierItem[];
        if (Array.isArray(parsed) && parsed.length > 0) setSuppliersRaw(parsed);
      }
    } catch { /* fallback to mock */ }
  }, []);

  const setSuppliers = useCallback((updater: SupplierItem[] | ((prev: SupplierItem[]) => SupplierItem[])) => {
    setSuppliersRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveToStorage(next);
      return next;
    });
  }, []);

  const undoMgr = useUndoManager<SupplierItem[]>();

  function pushUndo(description: string) {
    undoMgr.push(suppliers, description);
  }

  const handleUndo = useCallback(() => {
    const entry = undoMgr.pop();
    if (entry) {
      setSuppliersRaw(entry.snapshot);
      saveToStorage(entry.snapshot);
    }
  }, [undoMgr]);

  useUndoKeyboard(handleUndo, undoMgr.canUndo);

  /* ===== Tab：物料供应商 / 工艺供应商 ===== */
  const [activeTab, setActiveTab] = useState<SupplierType>('物料供应商');

  /* ===== 弹窗状态 ===== */
  const [importOpen, setImportOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SupplierItem | null>(null);
  const [detailTarget, setDetailTarget] = useState<SupplierItem | null>(null);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [wechatBindTarget, setWechatBindTarget] = useState<SupplierItem | null>(null);
  const [licenseTarget, setLicenseTarget] = useState<SupplierItem | null>(null);

  /* ===== 自定义分类：物料 / 工艺 两套独立列表 ===== */
  const [customMaterialCategories, setCustomMaterialCategories] = useState<SupplierCategory[]>(
    [...SUPPLIER_CATEGORIES_MATERIAL],
  );
  const [customProcessCategories, setCustomProcessCategories] = useState<SupplierCategory[]>(
    [...SUPPLIER_CATEGORIES_PROCESS],
  );

  useEffect(() => {
    try {
      const mat = localStorage.getItem(STORAGE_KEYS.SUPPLIER_CATEGORIES_MATERIAL);
      if (mat) {
        const parsed = JSON.parse(mat) as SupplierCategory[];
        if (Array.isArray(parsed) && parsed.length > 0) setCustomMaterialCategories(parsed);
      } else {
        const legacy = localStorage.getItem('cf_erp_supplier_categories');
        if (legacy) {
          const parsed = JSON.parse(legacy) as SupplierCategory[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            setCustomMaterialCategories(parsed);
            localStorage.setItem(STORAGE_KEYS.SUPPLIER_CATEGORIES_MATERIAL, legacy);
          }
        }
      }
      const proc = localStorage.getItem(STORAGE_KEYS.SUPPLIER_CATEGORIES_PROCESS);
      if (proc) {
        const parsed = JSON.parse(proc) as SupplierCategory[];
        if (Array.isArray(parsed) && parsed.length > 0) setCustomProcessCategories(parsed);
      }
    } catch { /* fallback */ }
  }, []);

  /** 当前标签页对应的分类列表（筛选、快捷标签、表单下拉） */
  const activeCategoryList = useMemo(
    () => (activeTab === '物料供应商' ? customMaterialCategories : customProcessCategories),
    [activeTab, customMaterialCategories, customProcessCategories],
  );

  /* ===== 筛选条件 ===== */
  const [searchText, setSearchText] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('全部');
  const [filterStatus, setFilterStatus] = useState<string>('全部');
  const [filterWechat, setFilterWechat] = useState<string>('全部');
  const [filterExpanded, setFilterExpanded] = useState(false);

  /* ===== 分类快捷筛选 ===== */
  const [quickCategory, setQuickCategory] = useState<string>('全部');

  /* ===== 分页 ===== */
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  /* ===== 选择 ===== */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  /* ===== 更多操作弹出菜单 ===== */
  const [moreMenuId, setMoreMenuId] = useState<string | null>(null);

  useEffect(() => {
    if (!moreMenuId) return;
    function close() { setMoreMenuId(null); }
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [moreMenuId]);

  /* ===== 筛选逻辑 ===== */
  const filteredSuppliers = useMemo(() => {
    return suppliers.filter((s) => {
      if (s.type !== activeTab) return false;
      if (searchText) {
        const q = searchText.toLowerCase();
        if (!s.name.toLowerCase().includes(q) && !s.fullName.toLowerCase().includes(q)) return false;
      }
      if (filterCategory !== '全部' && s.category !== filterCategory) return false;
      if (filterStatus !== '全部' && s.status !== filterStatus) return false;
      if (filterWechat !== '全部') {
        if (filterWechat === '已绑定' && !s.wechatBound) return false;
        if (filterWechat === '未绑定' && s.wechatBound) return false;
      }
      if (quickCategory !== '全部' && s.category !== quickCategory) return false;
      return true;
    });
  }, [suppliers, activeTab, searchText, filterCategory, filterStatus, filterWechat, quickCategory]);

  useEffect(() => { setPage(1); }, [filteredSuppliers]);

  /* 切换 物料/工艺 标签时重置分类筛选，避免沿用上一种标签的分类值 */
  useEffect(() => {
    setFilterCategory('全部');
    setQuickCategory('全部');
  }, [activeTab]);

  /* ===== 分页切片 ===== */
  const totalPages = Math.max(1, Math.ceil(filteredSuppliers.length / pageSize));
  const pageItems = filteredSuppliers.slice((page - 1) * pageSize, page * pageSize);

  /* ===== 重置筛选 ===== */
  function handleReset() {
    setSearchText('');
    setFilterCategory('全部');
    setFilterStatus('全部');
    setFilterWechat('全部');
    setQuickCategory('全部');
    setPage(1);
  }

  /* ===== 刷新（重新从 localStorage 读取） ===== */
  function handleRefresh() {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.SUPPLIERS);
      if (stored) {
        const parsed = JSON.parse(stored) as SupplierItem[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSuppliersRaw(parsed);
          return;
        }
      }
      setSuppliersRaw(MOCK_SUPPLIERS);
    } catch {
      setSuppliersRaw(MOCK_SUPPLIERS);
    }
  }

  /* ===== 全选/取消 ===== */
  const allPageSelected = pageItems.length > 0 && pageItems.every((s) => selectedIds.has(s.id));

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        pageItems.forEach((s) => next.delete(s.id));
      } else {
        pageItems.forEach((s) => next.add(s.id));
      }
      return next;
    });
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /* ===== 切换供应商状态 ===== */
  function toggleStatus(id: string) {
    const target = suppliers.find((s) => s.id === id);
    pushUndo(`切换供应商状态: ${target?.name ?? id}`);
    setSuppliers((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, status: (s.status === '启用' ? '停用' : '启用') as SupplierStatus } : s,
      ),
    );
  }

  /* ===== 删除供应商 ===== */
  function handleDelete(id: string) {
    const target = suppliers.find((s) => s.id === id);
    if (!target) return;
    if (!confirm(`确认删除供应商「${target.name}」？删除后可撤回恢复。`)) return;
    pushUndo(`删除供应商: ${target.name}`);
    setSuppliers((prev) => prev.filter((s) => s.id !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setMoreMenuId(null);
  }

  /* ===== 批量删除 ===== */
  function handleBatchDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`确认删除选中的 ${selectedIds.size} 个供应商？删除后可撤回恢复。`)) return;
    pushUndo(`批量删除 ${selectedIds.size} 个供应商`);
    setSuppliers((prev) => prev.filter((s) => !selectedIds.has(s.id)));
    setSelectedIds(new Set());
  }

  /* ===== 导入回调 ===== */
  function handleImportConfirm(data: SupplierItem[]) {
    pushUndo(`导入 ${data.length} 个供应商`);
    setSuppliers((prev) => [...data, ...prev]);
    setPage(1);
  }

  /* ===== 新建回调 ===== */
  function handleCreateConfirm(newSupplier: SupplierItem) {
    pushUndo(`新建供应商: ${newSupplier.name}`);
    setSuppliers((prev) => [newSupplier, ...prev]);
    setCreateOpen(false);
    setPage(1);
  }

  /* ===== 编辑回调 ===== */
  function handleEditConfirm(updated: SupplierItem) {
    pushUndo(`编辑供应商: ${updated.name}`);
    setSuppliers((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    setEditTarget(null);
  }

  /* ===== 微信绑定回调 ===== */
  function handleWechatBind(id: string, wechatId: string, contactGroup: string, groupMembers: number) {
    const target = suppliers.find((s) => s.id === id);
    pushUndo(`${wechatId ? '绑定' : '解除绑定'}微信: ${target?.name ?? id}`);
    setSuppliers((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, wechatBound: !!wechatId, wechatId, contactGroup, groupMembers }
          : s,
      ),
    );
    setWechatBindTarget(null);
  }

  return (
    <div className="flex flex-col gap-4 min-h-0">

      {/* ========================================
          面包屑
          ======================================== */}
      <div className="flex items-center gap-1.5 text-sm text-gray-400">
        <span>供应商管理</span>
        <span>/</span>
        <span className="text-gray-600">供应商列表</span>
      </div>

      {/* ========================================
          顶部标签页 + 操作按钮
          ======================================== */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            {(['物料供应商', '工艺供应商'] as SupplierType[]).map((tab) => (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); setPage(1); setSelectedIds(new Set()); }}
                className={[
                  'text-lg font-bold px-4 py-2 rounded-md border-2 transition-colors',
                  activeTab === tab
                    ? 'border-blue-500 text-blue-600 bg-blue-50'
                    : 'border-transparent text-gray-400 hover:text-gray-600',
                ].join(' ')}
              >
                {tab}
              </button>
            ))}
          </div>
          <p className="text-sm text-gray-400">
            管理供应商信息，支持按分类筛选、绑定企业微信，便于协同沟通与业务往来。
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={downloadSupplierTemplate}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            <DownloadIcon /> 下载导入模板
          </button>
          <button
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            <UploadIcon /> 导入供应商
          </button>
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            + 新增供应商
          </button>
        </div>
      </div>

      {/* ========================================
          筛选条件区域
          ======================================== */}
      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
          <div className="flex items-center gap-1.5 text-sm text-gray-500">
            <FilterIcon />
            <span className="font-medium">筛选条件</span>
          </div>
          <button
            onClick={() => setFilterExpanded(!filterExpanded)}
            className="text-sm text-blue-500 hover:text-blue-700 transition-colors"
          >
            {filterExpanded ? '收起' : '展开'}
            <span className="ml-1 text-xs">{filterExpanded ? '▲' : '▼'}</span>
          </button>
        </div>

        {filterExpanded && (
          <div className="px-4 py-3">
            <div className="grid grid-cols-4 gap-4 items-end">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">供应商名称</label>
                <div className="relative">
                  <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="搜索供应商名称/公司全称"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">供应商分类</label>
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                >
                  <option value="全部">选择分类</option>
                  {activeCategoryList.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">状态</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                >
                  <option value="全部">全部</option>
                  <option value="启用">启用</option>
                  <option value="停用">停用</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">企业微信绑定</label>
                <select
                  value={filterWechat}
                  onChange={(e) => setFilterWechat(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                >
                  <option value="全部">全部</option>
                  <option value="已绑定">已绑定</option>
                  <option value="未绑定">未绑定</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 mt-3">
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

      {/* ========================================
          分类快捷筛选
          ======================================== */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-500 whitespace-nowrap flex items-center gap-1">
          <span className="text-xs text-gray-400">供应商分类</span>
          <span className="text-xs text-gray-300">筛选</span>
        </span>
        <div className="flex items-center gap-1.5 flex-wrap">
          {['全部', ...activeCategoryList].map((cat) => (
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
        <button
          onClick={() => setCategoryModalOpen(true)}
          className="ml-auto flex items-center gap-1 px-3 py-1 text-sm text-blue-600 border border-blue-200 rounded-md hover:bg-blue-50 transition-colors"
        >
          + 管理分类
        </button>
      </div>

      {/* ========================================
          供应商表格
          ======================================== */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden flex-1">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-800">供应商列表</h2>
            <span className="text-sm text-gray-400">（共 {filteredSuppliers.length} 条）</span>
          </div>
          <button
            onClick={handleRefresh}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            title="刷新"
          >
            <RefreshIcon />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
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
                <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap">供应商名称</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap">公司全称</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap">供应商分类</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap">默认账期</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap">企业微信</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap">联系人/微信群</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap">微信号</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap">营业执照</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap">状态</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center py-16 text-gray-400">
                    <div className="text-4xl mb-3">📭</div>
                    <p className="text-sm">没有符合条件的供应商</p>
                    <button onClick={handleReset} className="mt-2 text-sm text-blue-500 hover:underline">
                      清除筛选条件
                    </button>
                  </td>
                </tr>
              ) : (
                pageItems.map((supplier) => (
                  <tr key={supplier.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(supplier.id)}
                        onChange={() => toggleSelect(supplier.id)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        <SupplierAvatar name={supplier.name} category={supplier.category} />
                        <span className="font-medium text-gray-800">{supplier.name}</span>
                      </div>
                    </td>

                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{supplier.fullName}</td>

                    <td className="px-4 py-3">
                      <CategoryBadge category={supplier.category} />
                    </td>

                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">
                        {supplier.paymentTerm}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      {supplier.wechatBound ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                          已绑定
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                          未绑定
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      {supplier.contactGroup ? (
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded bg-green-100 flex items-center justify-center flex-shrink-0">
                            <GroupIcon />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs text-gray-700 truncate">{supplier.contactGroup}</p>
                            <p className="text-xs text-gray-400">{supplier.groupMembers} 人</p>
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      {supplier.wechatId ? (
                        <div className="flex items-center gap-1">
                          <WechatIcon />
                          <span className="text-xs text-gray-600">{supplier.wechatId}</span>
                        </div>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      {supplier.hasLicense ? (
                        <button
                          onClick={() => setLicenseTarget(supplier)}
                          className="text-xs text-blue-500 hover:text-blue-700 hover:underline transition-colors"
                        >
                          查看
                        </button>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleStatus(supplier.id)}
                        className="flex items-center gap-1.5 group"
                      >
                        <div className={[
                          'relative w-8 h-[18px] rounded-full transition-colors',
                          supplier.status === '启用' ? 'bg-blue-500' : 'bg-gray-300',
                        ].join(' ')}>
                          <div className={[
                            'absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform',
                            supplier.status === '启用' ? 'translate-x-[17px]' : 'translate-x-0.5',
                          ].join(' ')} />
                        </div>
                        <span className={[
                          'text-xs',
                          supplier.status === '启用' ? 'text-blue-600' : 'text-gray-400',
                        ].join(' ')}>
                          {supplier.status}
                        </span>
                      </button>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setEditTarget(supplier)}
                          className="text-sm text-blue-500 hover:text-blue-700 transition-colors"
                        >
                          编辑
                        </button>
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setMoreMenuId(moreMenuId === supplier.id ? null : supplier.id);
                            }}
                            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            更多 ▾
                          </button>
                          {moreMenuId === supplier.id && (
                            <div className="absolute right-0 top-full mt-1 w-28 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-20">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDetailTarget(supplier);
                                  setMoreMenuId(null);
                                }}
                                className="w-full text-left px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                              >
                                查看详情
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setWechatBindTarget(supplier);
                                  setMoreMenuId(null);
                                }}
                                className="w-full text-left px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                              >
                                绑定微信
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(supplier.id);
                                }}
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================
          底部：已选数量 + 批量操作 + 分页
          ======================================== */}
      <div className="flex items-center justify-between text-sm text-gray-600">
        <div className="flex items-center gap-3">
          <span className="text-gray-400">已选择 {selectedIds.size} 项</span>
          {selectedIds.size > 0 && (
            <button
              onClick={handleBatchDelete}
              className="px-3 py-1 text-xs text-red-500 border border-red-200 rounded-md hover:bg-red-50 transition-colors"
            >
              批量删除
            </button>
          )}
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <PageBtn disabled={page === 1} onClick={() => setPage((p) => p - 1)}>‹</PageBtn>
            {getPageNumbers(page, totalPages).map((p, i) =>
              p === '...' ? (
                <span key={`ellipsis_${i}`} className="px-2 py-1 text-gray-400">…</span>
              ) : (
                <PageBtn key={p} active={page === p} onClick={() => setPage(p as number)}>
                  {p}
                </PageBtn>
              ),
            )}
            <PageBtn disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>›</PageBtn>
          </div>

          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
            className="border border-gray-200 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
          >
            {PAGE_SIZE_OPTIONS.map((s) => (
              <option key={s} value={s}>{s} 条/页</option>
            ))}
          </select>
        </div>
      </div>

      {/* ========================================
          弹窗：导入供应商
          ======================================== */}
      <ImportSupplierModal
        open={importOpen}
        materialCategories={customMaterialCategories}
        processCategories={customProcessCategories}
        onClose={() => setImportOpen(false)}
        onConfirm={handleImportConfirm}
      />

      {/* ========================================
          弹窗：新增供应商
          ======================================== */}
      {createOpen && (
        <SupplierFormModal
          mode="create"
          materialCategories={customMaterialCategories}
          processCategories={customProcessCategories}
          onClose={() => setCreateOpen(false)}
          onConfirm={handleCreateConfirm}
        />
      )}

      {/* ========================================
          弹窗：编辑供应商
          ======================================== */}
      {editTarget && (
        <SupplierFormModal
          mode="edit"
          supplier={editTarget}
          materialCategories={customMaterialCategories}
          processCategories={customProcessCategories}
          onClose={() => setEditTarget(null)}
          onConfirm={handleEditConfirm}
        />
      )}

      {/* ========================================
          弹窗：查看供应商详情
          ======================================== */}
      {detailTarget && (
        <SupplierDetailModal
          supplier={detailTarget}
          onClose={() => setDetailTarget(null)}
          onEdit={() => {
            setEditTarget(detailTarget);
            setDetailTarget(null);
          }}
        />
      )}

      {/* ========================================
          弹窗：绑定微信
          ======================================== */}
      {wechatBindTarget && (
        <WechatBindModal
          supplier={wechatBindTarget}
          onClose={() => setWechatBindTarget(null)}
          onConfirm={(wechatId, contactGroup, groupMembers) => {
            handleWechatBind(wechatBindTarget.id, wechatId, contactGroup, groupMembers);
          }}
        />
      )}

      {/* ========================================
          弹窗：管理分类
          ======================================== */}
      {categoryModalOpen && (
        <ManageCategoryModal
          modalTitle={activeTab === '物料供应商' ? '管理物料供应商分类' : '管理工艺供应商分类'}
          categories={activeTab === '物料供应商' ? customMaterialCategories : customProcessCategories}
          onClose={() => setCategoryModalOpen(false)}
          onSave={(cats) => {
            try {
              if (activeTab === '物料供应商') {
                setCustomMaterialCategories(cats);
                localStorage.setItem(STORAGE_KEYS.SUPPLIER_CATEGORIES_MATERIAL, JSON.stringify(cats));
              } else {
                setCustomProcessCategories(cats);
                localStorage.setItem(STORAGE_KEYS.SUPPLIER_CATEGORIES_PROCESS, JSON.stringify(cats));
              }
            } catch { /* ignore */ }
            setCategoryModalOpen(false);
          }}
        />
      )}

      {/* ========================================
          弹窗：查看营业执照
          ======================================== */}
      {licenseTarget && (
        <LicenseViewModal
          supplier={licenseTarget}
          onClose={() => setLicenseTarget(null)}
        />
      )}

      {/* ===== 撤回操作提示 ===== */}
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
 * 查看详情弹窗
 * ============================================================ */
function SupplierDetailModal({
  supplier,
  onClose,
  onEdit,
}: {
  supplier: SupplierItem;
  onClose: () => void;
  onEdit: () => void;
}) {
  const colors = CATEGORY_COLORS[supplier.category] ?? { bg: 'bg-gray-100', text: 'text-gray-600' };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md bg-white rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-800">供应商详情</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-lg ${colors.bg} flex items-center justify-center`}>
              <span className={`text-lg font-bold ${colors.text}`}>{supplier.name.charAt(0)}</span>
            </div>
            <div>
              <p className="text-base font-semibold text-gray-800">{supplier.name}</p>
              <p className="text-sm text-gray-500">{supplier.fullName}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <DetailRow label="供应商类型" value={supplier.type} />
            <DetailRow label="供应商分类" value={supplier.category} />
            <DetailRow label="默认账期" value={supplier.paymentTerm} />
            <DetailRow label="状态" value={supplier.status} />
            <DetailRow label="创建日期" value={supplier.createdAt} />
            <DetailRow label="营业执照" value={supplier.hasLicense ? '已上传' : '未上传'} />
          </div>

          {supplier.wechatBound && (
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-medium text-gray-500 mb-2">企业微信信息</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <DetailRow label="微信号" value={supplier.wechatId} />
                <DetailRow label="联系群" value={supplier.contactGroup || '-'} />
                <DetailRow label="群成员" value={supplier.groupMembers > 0 ? `${supplier.groupMembers} 人` : '-'} />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-100 transition-colors"
          >
            关闭
          </button>
          <button
            onClick={onEdit}
            className="px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            编辑
          </button>
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
 * 绑定微信弹窗
 * ============================================================ */
function WechatBindModal({
  supplier,
  onClose,
  onConfirm,
}: {
  supplier: SupplierItem;
  onClose: () => void;
  onConfirm: (wechatId: string, contactGroup: string, groupMembers: number) => void;
}) {
  const [wechatId, setWechatId] = useState(supplier.wechatId);
  const [contactGroup, setContactGroup] = useState(supplier.contactGroup);
  const [groupMembers, setGroupMembers] = useState(supplier.groupMembers > 0 ? String(supplier.groupMembers) : '');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onConfirm(wechatId.trim(), contactGroup.trim(), parseInt(groupMembers, 10) || 0);
  }

  const inputCls = 'w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm bg-white rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-800">
            {supplier.wechatBound ? '修改微信绑定' : '绑定企业微信'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <p className="text-sm text-gray-500">为「{supplier.name}」绑定企业微信信息</p>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">微信号 *</label>
            <input
              required
              type="text"
              placeholder="如 wx_huaxin2024"
              value={wechatId}
              onChange={(e) => setWechatId(e.target.value)}
              className={inputCls}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">联系群名称</label>
            <input
              type="text"
              placeholder="如 华信贸易采购群"
              value={contactGroup}
              onChange={(e) => setContactGroup(e.target.value)}
              className={inputCls}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">群成员数</label>
            <input
              type="number"
              min="0"
              placeholder="0"
              value={groupMembers}
              onChange={(e) => setGroupMembers(e.target.value)}
              className={inputCls}
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            {supplier.wechatBound && (
              <button
                type="button"
                onClick={() => onConfirm('', '', 0)}
                className="mr-auto px-3 py-2 text-sm text-red-500 hover:text-red-700 transition-colors"
              >
                解除绑定
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-100 transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              确认绑定
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


/* ============================================================
 * 管理分类弹窗
 * ============================================================ */
function ManageCategoryModal({
  modalTitle,
  categories,
  onClose,
  onSave,
}: {
  modalTitle: string;
  categories: SupplierCategory[];
  onClose: () => void;
  onSave: (cats: SupplierCategory[]) => void;
}) {
  const [items, setItems] = useState<string[]>([...categories]);
  const [newCat, setNewCat] = useState('');

  /* ===== 批量添加：支持逗号、顿号、换行分隔 ===== */
  function addCategories() {
    const raw = newCat.trim();
    if (!raw) return;
    const parts = raw.split(/[,，、\n]+/).map((s) => s.trim()).filter(Boolean);
    const dupes: string[] = [];
    const toAdd: string[] = [];
    for (const p of parts) {
      if (items.includes(p) || toAdd.includes(p)) {
        dupes.push(p);
      } else {
        toAdd.push(p);
      }
    }
    if (toAdd.length > 0) setItems([...items, ...toAdd]);
    if (dupes.length > 0) alert(`以下分类已存在，已跳过：${dupes.join('、')}`);
    setNewCat('');
  }

  function removeCategory(idx: number) {
    setItems(items.filter((_, i) => i !== idx));
  }

  /* ===== 拖拽排序 ===== */
  const dragIdx = useRef<number | null>(null);
  const dragOverIdx = useRef<number | null>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [dropTargetIdx, setDropTargetIdx] = useState<number | null>(null);

  function handleDragStart(idx: number) {
    dragIdx.current = idx;
    setDraggingIdx(idx);
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    dragOverIdx.current = idx;
    setDropTargetIdx(idx);
  }

  function handleDragEnd() {
    const from = dragIdx.current;
    const to = dragOverIdx.current;
    if (from !== null && to !== null && from !== to) {
      const next = [...items];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      setItems(next);
    }
    dragIdx.current = null;
    dragOverIdx.current = null;
    setDraggingIdx(null);
    setDropTargetIdx(null);
  }

  /* ===== 按钮上下移动 ===== */
  function moveUp(idx: number) {
    if (idx === 0) return;
    const next = [...items];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    setItems(next);
  }

  function moveDown(idx: number) {
    if (idx === items.length - 1) return;
    const next = [...items];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    setItems(next);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md bg-white rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-800">{modalTitle}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <div className="px-6 py-5 space-y-3">
          {/* 输入区：支持批量（逗号/顿号/换行分隔） */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="输入新分类名称，多个用逗号分隔"
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategories(); } }}
              className="flex-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <button
              onClick={addCategories}
              className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex-shrink-0"
            >
              添加
            </button>
          </div>
          <p className="text-xs text-gray-400">支持批量输入，用逗号、顿号或换行分隔；拖拽条目可调整顺序</p>

          {/* 分类列表（可拖拽排序） */}
          <div className="max-h-72 overflow-y-auto space-y-1">
            {items.map((cat, idx) => (
              <div
                key={`${cat}_${idx}`}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragEnd={handleDragEnd}
                className={[
                  'flex items-center gap-2 px-3 py-2 rounded-md transition-colors select-none',
                  draggingIdx === idx ? 'opacity-40 bg-blue-50' : 'bg-gray-50',
                  dropTargetIdx === idx && draggingIdx !== idx ? 'ring-2 ring-blue-400 bg-blue-50' : '',
                ].join(' ')}
              >
                {/* 拖拽手柄 */}
                <span className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 flex-shrink-0" title="拖拽排序">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
                  </svg>
                </span>

                <span className="text-sm text-gray-700 flex-1">{cat}</span>

                {/* 上下移动按钮 */}
                <button
                  onClick={() => moveUp(idx)}
                  disabled={idx === 0}
                  className={[
                    'p-0.5 rounded transition-colors',
                    idx === 0 ? 'text-gray-200 cursor-not-allowed' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200',
                  ].join(' ')}
                  title="上移"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                  </svg>
                </button>
                <button
                  onClick={() => moveDown(idx)}
                  disabled={idx === items.length - 1}
                  className={[
                    'p-0.5 rounded transition-colors',
                    idx === items.length - 1 ? 'text-gray-200 cursor-not-allowed' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200',
                  ].join(' ')}
                  title="下移"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* 删除 */}
                <button
                  onClick={() => removeCategory(idx)}
                  className="text-gray-300 hover:text-red-500 transition-colors p-0.5"
                  title="删除"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
            {items.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">暂无分类，请添加</p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-t border-gray-200">
          <span className="text-xs text-gray-400">共 {items.length} 个分类</span>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-100 transition-colors"
            >
              取消
            </button>
            <button
              onClick={() => onSave(items as SupplierCategory[])}
              className="px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


/* ============================================================
 * 营业执照查看弹窗
 * ============================================================ */
function LicenseViewModal({
  supplier,
  onClose,
}: {
  supplier: SupplierItem;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md bg-white rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-800">营业执照 — {supplier.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <div className="px-6 py-8 flex flex-col items-center gap-4">
          <div className="w-full h-48 bg-gray-100 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-2">
            <svg className="w-12 h-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-sm text-gray-400">营业执照图片</p>
            <p className="text-xs text-gray-300">（暂未上传实际文件）</p>
          </div>

          <div className="w-full grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-gray-400">公司名称</p>
              <p className="text-gray-700 mt-0.5">{supplier.fullName}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">状态</p>
              <p className="text-gray-700 mt-0.5">{supplier.hasLicense ? '已上传' : '未上传'}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-100 transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}


/* ============================================================
 * 内部小组件
 * ============================================================ */

function SupplierAvatar({ name, category }: { name: string; category: SupplierCategory }) {
  const colors = CATEGORY_COLORS[category] ?? { bg: 'bg-gray-100', text: 'text-gray-600' };
  const initial = name.charAt(0);
  return (
    <div className={`w-8 h-8 rounded-lg ${colors.bg} flex items-center justify-center flex-shrink-0`}>
      <span className={`text-xs font-bold ${colors.text}`}>{initial}</span>
    </div>
  );
}

function CategoryBadge({ category }: { category: SupplierCategory }) {
  const colors = CATEGORY_COLORS[category] ?? { bg: 'bg-gray-100', text: 'text-gray-600' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors.bg} ${colors.text}`}>
      {category}
    </span>
  );
}

interface PageBtnProps {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
}
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
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) {
    pages.push(p);
  }
  if (current < total - 2) pages.push('...');
  pages.push(total);
  return pages;
}


/* ============================================================
 * SVG 图标组件
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

function GroupIcon() {
  return (
    <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
}

function WechatIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-green-500 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 01.213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 00.167-.054l1.903-1.114a.864.864 0 01.717-.098 10.16 10.16 0 002.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 01-1.162 1.178A1.17 1.17 0 014.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 01-1.162 1.178 1.17 1.17 0 01-1.162-1.178c0-.651.52-1.18 1.162-1.18zm3.68 4.025c-2.203 0-4.446.818-5.891 2.63-1.65 2.07-1.554 5.147.924 6.98a.55.55 0 01.192.607l-.26.937c-.014.047-.032.094-.032.143 0 .112.09.203.2.203.04 0 .078-.02.114-.037l1.346-.789a.595.595 0 01.494-.067c.81.222 1.676.345 2.57.345 4.006 0 7.258-2.648 7.258-5.912 0-3.226-3.177-6.04-6.915-6.04zm-2.934 3.07c.478 0 .866.393.866.878a.872.872 0 01-.866.877.872.872 0 01-.866-.877c0-.485.388-.877.866-.877zm5.281 0c.478 0 .866.393.866.878a.872.872 0 01-.866.877.872.872 0 01-.866-.877c0-.485.387-.877.866-.877z" />
    </svg>
  );
}
