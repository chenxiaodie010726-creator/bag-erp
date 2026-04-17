'use client';

/* ============================================================
 * 生产单详情页面（参考成本核算表风格）
 *
 * Tab 结构：
 *   1. 生产单主表 — 基本信息 + SKU颜色数量 + 生产要求
 *   2. 单用量明细 — 按类别汇总单用量
 *   3. 面料里布辅料 — 采购单
 *   4. 五金拉链   — 采购单
 *   5. 工艺采购   — 采购单
 *   6. 包装材料   — 采购单
 * ============================================================ */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  getProductionOrder,
  saveProductionOrder,
  findCostSheetByPatternCode,
  calcUsageSummary,
  loadProductionOrders,
  saveProductionOrders,
  regenerateProcurementForPattern,
  generateProcurementSheets,
} from '@/lib/productionOrderUtils';
import { saveCostSheets, loadCostSheets } from '@/lib/costSheetUtils';
import type {
  ProductionOrder,
  ProductionOrderStatus,
  ProductionOrderItem,
  ProcurementSheet,
  ProcurementItem,
  CostSheet,
} from '@/types';

const STATUS_MAP: Record<ProductionOrderStatus, string> = {
  unreviewed: '未审核',
  reviewed: '已审核',
};
const STATUS_COLORS: Record<ProductionOrderStatus, string> = {
  unreviewed: 'bg-orange-100 text-orange-700',
  reviewed: 'bg-green-100 text-green-700',
};

type TabKey = 'main' | 'usage' | 'fabric' | 'hardware' | 'craft' | 'packaging';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'main', label: '生产单' },
  { key: 'usage', label: '单用量明细' },
  { key: 'fabric', label: '面料里布辅料' },
  { key: 'hardware', label: '五金拉链' },
  { key: 'craft', label: '工艺采购' },
  { key: 'packaging', label: '包装材料' },
];

function fmt4(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '-';
  return n.toFixed(4);
}

function fmtQty(n: number): string {
  if (!Number.isFinite(n)) return '-';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

/* ============================================================ */
export default function ProductionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [order, setOrder] = useState<ProductionOrder | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('main');
  const [editing, setEditing] = useState(false);
  const [costSheet, setCostSheet] = useState<CostSheet | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const o = getProductionOrder(id);
    if (!o) { router.push('/production'); return; }
    setOrder(o);
    if (o.pattern_code) {
      const cs = findCostSheetByPatternCode(o.pattern_code);
      setCostSheet(cs ?? null);
    }
  }, [id, router]);

  /* 录入成本表 */
  const handleImportCostSheet = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !order) return;

    try {
      const XLSX = await import('xlsx');
      const { parseMultiSheetCostSheetExcel } = await import('@/lib/costSheetImport');

      const existingSheets = loadCostSheets();
      const newSheets: CostSheet[] = [];

      for (const file of Array.from(files)) {
        const data = await file.arrayBuffer();
        const wb = XLSX.read(data, { type: 'array' });
        const allSheets = wb.SheetNames.map((name) => ({
          name: name.replace(/^\uFEFF/, '').trim(),
          rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' }) as (string | number | null)[][],
        }));

        const parsed = parseMultiSheetCostSheetExcel(allSheets);
        if (!parsed.pattern_code) parsed.pattern_code = order.pattern_code;

        const matching = [...existingSheets, ...newSheets].filter(
          s => s.pattern_code === parsed.pattern_code
        );
        if (matching.length > 0) {
          parsed.version = Math.max(...matching.map(s => s.version)) + 1;
        }

        newSheets.push(parsed);
      }

      if (newSheets.length > 0) {
        saveCostSheets([...newSheets, ...existingSheets]);

        // 重新生成采购单
        const updated = regenerateProcurementForPattern(order.pattern_code);

        // 刷新当前页面数据
        const refreshed = getProductionOrder(id);
        if (refreshed) {
          setOrder(refreshed);
          const cs = findCostSheetByPatternCode(refreshed.pattern_code);
          setCostSheet(cs ?? null);
        }

        alert(`成功导入成本表！已为 ${updated.length} 张生产单生成采购单。`);
      }
    } catch (err) {
      alert('导入失败：' + (err instanceof Error ? err.message : '未知错误'));
    }
    e.target.value = '';
  }, [order, id]);

  const totalQty = useMemo(
    () => order?.items?.reduce((s, i) => s + i.quantity, 0) ?? 0,
    [order]
  );

  const usageSummary = useMemo(
    () => costSheet ? calcUsageSummary(costSheet) : [],
    [costSheet]
  );

  /* 获取某类型的采购单 */
  const getProcSheet = useCallback((type: string): ProcurementSheet | undefined => {
    return order?.procurement_sheets?.find(s => s.type === type);
  }, [order]);

  /* 审核/取消审核 */
  const handleToggleStatus = useCallback(() => {
    if (!order) return;
    const updated = {
      ...order,
      status: (order.status === 'unreviewed' ? 'reviewed' : 'unreviewed') as ProductionOrderStatus,
      updated_at: new Date().toISOString(),
    };
    saveProductionOrder(updated);
    setOrder(updated);
  }, [order]);

  /* 更新生产要求 */
  const handleUpdateRequirements = useCallback((field: string, value: string) => {
    if (!order) return;
    const updated = {
      ...order,
      production_requirements: {
        ...order.production_requirements,
        [field]: value,
      },
      updated_at: new Date().toISOString(),
    };
    setOrder(updated);
  }, [order]);

  const handleSave = useCallback(() => {
    if (!order) return;
    saveProductionOrder(order);
    setEditing(false);
  }, [order]);

  if (!order) {
    return <div className="p-6 text-center text-gray-400">加载中...</div>;
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* 隐藏的文件输入 */}
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.xlsm"
        multiple
        hidden
        onChange={handleImportCostSheet}
      />

      {/* 面包屑 */}
      <div className="text-sm text-gray-500 mb-4">
        <Link href="/production" className="hover:text-blue-600">生产单管理</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-800 font-medium">{order.order_number}</span>
      </div>

      {/* 缺成本表警告 */}
      {!order.cost_sheet_id && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-red-700">
            <span className="text-lg">⚠️</span>
            <span>
              款号 <span className="font-mono font-medium">{order.pattern_code}</span> 尚未关联成本核算表，
              无法生成采购单。请先录入成本表。
            </span>
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors shrink-0"
          >
            录入成本表
          </button>
        </div>
      )}

      {/* 顶部信息区（参考成本核算表风格） */}
      <div className="bg-white border rounded-lg p-5 mb-5">
        <div className="flex items-start justify-between">
          {/* 左侧基本信息 */}
          <div className="flex items-start gap-6">
            {/* 款图占位 */}
            <div className="w-24 h-24 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 text-xs shrink-0">
              款
            </div>
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-lg font-bold">{order.order_number}</span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[order.status]}`}>
                  {STATUS_MAP[order.status]}
                </span>
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-600 mb-1">
                <span>PO: <span className="font-medium text-gray-800">{order.po_number}</span></span>
                <span>款号: <span className="font-mono text-gray-800">{order.pattern_code}</span></span>
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-500">
                <span>下单日期: {order.order_date}</span>
                {order.factory_name && <span>工厂: {order.factory_name}</span>}
              </div>
              {/* 颜色标签 */}
              <div className="flex items-center gap-2 mt-2">
                {order.items?.map(item => (
                  <span
                    key={item.id}
                    className="px-2 py-0.5 bg-gray-100 rounded text-xs"
                  >
                    {item.color_zh || item.color_en} × {item.quantity}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* 右侧：颜色物料对照表 + 操作按钮 */}
          <div className="flex items-start gap-4">
            {/* 颜色对照快览 */}
            {costSheet?.color_material_map && costSheet.color_material_map.length > 0 && (
              <div className="text-xs border rounded p-2 min-w-[180px]">
                <div className="text-gray-500 mb-1 font-medium">颜色(中文) / Color(英文)</div>
                {costSheet.color_material_map.map(c => (
                  <div key={c.id} className="flex justify-between py-0.5">
                    <span>{c.color_zh}</span>
                    <span className="text-gray-500">{c.color_en}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-col gap-2">
              <button
                onClick={handleToggleStatus}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  order.status === 'unreviewed'
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {order.status === 'unreviewed' ? '✓ 审核通过' : '取消审核'}
              </button>
              {costSheet ? (
                <Link
                  href={`/cost-sheet/${costSheet.id}`}
                  className="px-4 py-2 rounded-lg text-sm font-medium border text-center hover:bg-gray-50 transition-colors"
                >
                  查看成本表
                </Link>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors"
                >
                  录入成本表
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 汇总数据栏 */}
        <div className="flex items-center gap-0 mt-4 border-t pt-4">
          {[
            { label: '总数量', value: String(totalQty), highlight: false },
            { label: '颜色数', value: `${order.items?.length ?? 0}色`, highlight: false },
            { label: '采购单', value: `${order.procurement_sheets?.length ?? 0}份`, highlight: false },
          ].map((item, i) => (
            <div key={i} className="flex-1 text-center border-r last:border-r-0">
              <div className="text-xs text-gray-500">{item.label}</div>
              <div className={`text-lg font-bold mt-0.5 ${item.highlight ? 'text-red-600' : 'text-gray-800'}`}>
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tab导航 */}
      <div className="flex items-center gap-0 border-b mb-0">
        {TABS.map(tab => {
          const isActive = activeTab === tab.key;
          // 显示采购单条目数
          let badge = '';
          if (tab.key === 'fabric') badge = String(getProcSheet('fabric_lining_accessory')?.items?.length ?? 0);
          if (tab.key === 'hardware') badge = String(getProcSheet('hardware_zipper')?.items?.length ?? 0);
          if (tab.key === 'craft') badge = String(getProcSheet('craft')?.items?.length ?? 0);
          if (tab.key === 'packaging') badge = String(getProcSheet('packaging')?.items?.length ?? 0);

          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={[
                'px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                isActive
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
              ].join(' ')}
            >
              {tab.label}
              {badge && badge !== '0' && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">{badge}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab内容 */}
      <div className="bg-white border border-t-0 rounded-b-lg">
        {activeTab === 'main' && <TabMain order={order} editing={editing} setEditing={setEditing} onUpdate={handleUpdateRequirements} onSave={handleSave} />}
        {activeTab === 'usage' && <TabUsage usageSummary={usageSummary} totalQty={totalQty} orderItems={order.items ?? []} />}
        {activeTab === 'fabric' && <TabProcurement sheet={getProcSheet('fabric_lining_accessory')} title="面料里布辅料采购单" />}
        {activeTab === 'hardware' && <TabProcurement sheet={getProcSheet('hardware_zipper')} title="五金拉链采购单" />}
        {activeTab === 'craft' && <TabProcurement sheet={getProcSheet('craft')} title="工艺采购单" />}
        {activeTab === 'packaging' && <TabProcurement sheet={getProcSheet('packaging')} title="包装材料采购单" />}
      </div>
    </div>
  );
}


/* ============================================================
 * Tab: 生产单主表
 * ============================================================ */
function TabMain({
  order,
  editing,
  setEditing,
  onUpdate,
  onSave,
}: {
  order: ProductionOrder;
  editing: boolean;
  setEditing: (v: boolean) => void;
  onUpdate: (field: string, value: string) => void;
  onSave: () => void;
}) {
  const req = order.production_requirements;

  return (
    <div className="p-5">
      {/* 编辑按钮 */}
      <div className="flex justify-end mb-4">
        {editing ? (
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)} className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50">取消</button>
            <button onClick={onSave} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">保存</button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50">编辑</button>
        )}
      </div>

      {/* SKU / 颜色 / 数量表 */}
      <div className="mb-6">
        <h3 className="text-sm font-bold text-gray-700 mb-3">颜色数量明细</h3>
        <table className="w-full text-sm border rounded">
          <thead>
            <tr className="bg-gray-50 text-left text-gray-500 text-xs">
              <th className="py-2.5 px-4">SKU</th>
              <th className="py-2.5 px-4">颜色(中文)</th>
              <th className="py-2.5 px-4">颜色(英文)</th>
              <th className="py-2.5 px-4">数量</th>
              <th className="py-2.5 px-4">主料编号</th>
              <th className="py-2.5 px-4">配料编号</th>
              <th className="py-2.5 px-4">里布编号</th>
              <th className="py-2.5 px-4">车线编号</th>
              <th className="py-2.5 px-4">五金颜色</th>
            </tr>
          </thead>
          <tbody>
            {(order.items ?? []).map(item => (
              <tr key={item.id} className="border-t hover:bg-gray-50">
                <td className="py-2.5 px-4 font-mono text-xs">{item.sku_code}</td>
                <td className="py-2.5 px-4">{item.color_zh || '-'}</td>
                <td className="py-2.5 px-4">{item.color_en || '-'}</td>
                <td className="py-2.5 px-4 font-medium">{item.quantity}</td>
                <td className="py-2.5 px-4 text-xs text-gray-600">{item.material_mapping?.['主料编号'] || '-'}</td>
                <td className="py-2.5 px-4 text-xs text-gray-600">{item.material_mapping?.['配料编号'] || '-'}</td>
                <td className="py-2.5 px-4 text-xs text-gray-600">{item.material_mapping?.['里布编号'] || '-'}</td>
                <td className="py-2.5 px-4 text-xs text-gray-600">{item.material_mapping?.['车线编号'] || '-'}</td>
                <td className="py-2.5 px-4 text-xs text-gray-600">{item.material_mapping?.['五金颜色'] || '-'}</td>
              </tr>
            ))}
            <tr className="border-t bg-gray-50 font-medium">
              <td className="py-2.5 px-4 text-red-600">小计</td>
              <td className="py-2.5 px-4" />
              <td className="py-2.5 px-4" />
              <td className="py-2.5 px-4 text-red-600">
                {(order.items ?? []).reduce((s, i) => s + i.quantity, 0)}
              </td>
              <td colSpan={5} />
            </tr>
          </tbody>
        </table>
      </div>

      {/* 生产要求 */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-gray-700">生产要求</h3>
        {[
          { key: 'oil_edge', label: '油边' },
          { key: 'sewing_thread', label: '车线/好易车线' },
          { key: 'embossing', label: '压花' },
          { key: 'embossing_die', label: '压唛' },
          { key: 'packaging', label: '包装要求' },
          { key: 'notes', label: '注意事项' },
        ].map(field => (
          <div key={field.key} className="flex gap-4">
            <div className="w-28 shrink-0 text-sm text-gray-500 pt-1">{field.label}</div>
            <div className="flex-1">
              {editing ? (
                <textarea
                  value={(req as any)[field.key] || ''}
                  onChange={e => onUpdate(field.key, e.target.value)}
                  rows={field.key === 'notes' ? 4 : 2}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-y"
                />
              ) : (
                <div className="text-sm text-gray-800 whitespace-pre-wrap min-h-[28px]">
                  {(req as any)[field.key] || <span className="text-gray-400">-</span>}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


/* ============================================================
 * Tab: 单用量明细
 * ============================================================ */
function TabUsage({
  usageSummary,
  totalQty,
  orderItems,
}: {
  usageSummary: { category: string; sumUsage: number; sumTotalUsage: number; unit: string }[];
  totalQty: number;
  orderItems: ProductionOrderItem[];
}) {
  return (
    <div className="p-5">
      <div className="mb-4">
        <h3 className="text-sm font-bold text-gray-700 mb-1">物料（按类别）</h3>
        <p className="text-xs text-gray-500">
          单用量、损耗单用量与成本明细各类小计一致；单位按该行类别下物料从价格库匹配
        </p>
      </div>

      <table className="w-full text-sm border rounded mb-8">
        <thead>
          <tr className="bg-gray-50 text-left text-gray-500 text-xs">
            <th className="py-2.5 px-4">类别</th>
            <th className="py-2.5 px-4 text-right">单用量</th>
            <th className="py-2.5 px-4">单位</th>
            <th className="py-2.5 px-4 text-right">损耗单用量</th>
          </tr>
        </thead>
        <tbody>
          {usageSummary.map(row => (
            <tr key={row.category} className="border-t hover:bg-gray-50">
              <td className="py-2.5 px-4 font-medium">{row.category}</td>
              <td className="py-2.5 px-4 text-right">{fmt4(row.sumUsage)}</td>
              <td className="py-2.5 px-4 text-gray-500">{row.unit || '—'}</td>
              <td className="py-2.5 px-4 text-right">{fmt4(row.sumTotalUsage)}</td>
            </tr>
          ))}
          {usageSummary.length === 0 && (
            <tr><td colSpan={4} className="py-8 text-center text-gray-400">暂无数据（请先关联成本核算表）</td></tr>
          )}
        </tbody>
      </table>

      {/* 按颜色的需求量预览 */}
      {usageSummary.length > 0 && orderItems.length > 0 && (
        <>
          <h3 className="text-sm font-bold text-gray-700 mb-3">各颜色需求量预览</h3>
          <p className="text-xs text-gray-500 mb-3">
            需求量 = 损耗单用量 × 订单数量（仅展示按颜色区分的类别：主料/配料/里布）
          </p>
          <table className="w-full text-sm border rounded">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500 text-xs">
                <th className="py-2.5 px-4">类别</th>
                <th className="py-2.5 px-4">颜色</th>
                <th className="py-2.5 px-4 text-right">损耗单用量</th>
                <th className="py-2.5 px-4 text-right">订单数量</th>
                <th className="py-2.5 px-4 text-right">需求量</th>
                <th className="py-2.5 px-4">单位</th>
              </tr>
            </thead>
            <tbody>
              {usageSummary
                .filter(r => r.category.includes('主料') || r.category.includes('配料') || r.category.includes('里布'))
                .flatMap(row =>
                  orderItems.map(item => (
                    <tr key={`${row.category}-${item.id}`} className="border-t hover:bg-gray-50">
                      <td className="py-2 px-4">{row.category}</td>
                      <td className="py-2 px-4">{item.color_zh || item.color_en}</td>
                      <td className="py-2 px-4 text-right">{fmt4(row.sumTotalUsage)}</td>
                      <td className="py-2 px-4 text-right">{item.quantity}</td>
                      <td className="py-2 px-4 text-right font-medium">
                        {fmtQty(row.sumTotalUsage * item.quantity)}
                      </td>
                      <td className="py-2 px-4 text-gray-500">{row.unit}</td>
                    </tr>
                  ))
                )}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}


/* ============================================================
 * Tab: 采购单（通用组件，面料/五金/工艺/包装 共用）
 * ============================================================ */
function TabProcurement({
  sheet,
  title,
}: {
  sheet: ProcurementSheet | undefined;
  title: string;
}) {
  if (!sheet || !sheet.items || sheet.items.length === 0) {
    return (
      <div className="p-5 text-center py-12 text-gray-400">
        <div className="text-2xl mb-2">📦</div>
        <div>{title} — 暂无数据</div>
        <div className="text-xs mt-1">成本核算表中没有对应类别的物料</div>
      </div>
    );
  }

  // 按类别分组
  const groups: Record<string, ProcurementItem[]> = {};
  for (const item of sheet.items) {
    const cat = item.category;
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  }

  return (
    <div className="p-5">
      <h3 className="text-sm font-bold text-gray-700 mb-4">{title}</h3>

      {Object.entries(groups).map(([category, items]) => (
        <div key={category} className="mb-6">
          <div className="text-xs font-medium text-gray-500 mb-2 px-1">{category}</div>
          <table className="w-full text-sm border rounded">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500 text-xs">
                <th className="py-2 px-4">名称</th>
                <th className="py-2 px-4">物料编号/颜色</th>
                <th className="py-2 px-4 text-right">单用量(损耗后)</th>
                <th className="py-2 px-4 text-right">订单数量</th>
                <th className="py-2 px-4 text-right">需求总量</th>
                <th className="py-2 px-4">单位</th>
                <th className="py-2 px-4">供应商</th>
                <th className="py-2 px-4">备注</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="border-t hover:bg-gray-50">
                  <td className="py-2 px-4">{item.name}</td>
                  <td className="py-2 px-4">
                    <div className="flex flex-col">
                      {item.material_code && <span className="text-xs font-mono">{item.material_code}</span>}
                      {item.color && <span className="text-xs text-gray-500">{item.color}</span>}
                      {!item.material_code && !item.color && <span className="text-gray-400">-</span>}
                    </div>
                  </td>
                  <td className="py-2 px-4 text-right">{fmt4(item.unit_usage)}</td>
                  <td className="py-2 px-4 text-right">{item.order_quantity}</td>
                  <td className="py-2 px-4 text-right font-medium">{fmtQty(item.total_quantity)}</td>
                  <td className="py-2 px-4 text-gray-500">{item.unit || '-'}</td>
                  <td className="py-2 px-4 text-xs text-gray-500">{item.supplier_name || '-'}</td>
                  <td className="py-2 px-4 text-xs text-gray-500">{item.notes || '-'}</td>
                </tr>
              ))}
              {/* 合计行 */}
              <tr className="border-t bg-gray-50 font-medium text-xs">
                <td className="py-2 px-4 text-red-600">小计</td>
                <td className="py-2 px-4" />
                <td className="py-2 px-4" />
                <td className="py-2 px-4" />
                <td className="py-2 px-4 text-right text-red-600">
                  {fmtQty(items.reduce((s, i) => s + i.total_quantity, 0))}
                </td>
                <td colSpan={3} />
              </tr>
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
