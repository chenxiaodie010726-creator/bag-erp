'use client';

import { useState, useMemo } from 'react';

/* ============================================================
 * 类型定义
 * ============================================================ */

export type StageKey =
  | 'material'
  | 'cutting'
  | 'sewing'
  | 'finishing'
  | 'qc'
  | 'packaging'
  | 'done';

export const STAGE_META: { key: StageKey; label: string; color: string }[] = [
  { key: 'material',  label: '备料',  color: '#6366f1' },
  { key: 'cutting',   label: '裁剪',  color: '#f59e0b' },
  { key: 'sewing',    label: '缝制',  color: '#3b82f6' },
  { key: 'finishing', label: '整烫',  color: '#8b5cf6' },
  { key: 'qc',        label: '质检',  color: '#10b981' },
  { key: 'packaging', label: '包装',  color: '#f97316' },
  { key: 'done',      label: '完成',  color: '#22c55e' },
];

export interface ProductionStageRecord {
  key: StageKey;
  completedQty: number;
  plannedQty: number;
  completedAt?: string;
  operator?: string;
}

export type ItemStatus = 'pending' | 'in_progress' | 'completed' | 'paused';
export type OrderStatus = 'pending' | 'in_progress' | 'completed';

export interface ProductionItem {
  id: string;
  sku: string;
  colorNameZh?: string;
  colorNameEn?: string;
  colorHex?: string;
  imageUrl?: string | null;
  plannedQty: number;
  completedQty: number;
  currentStage: StageKey;
  status: ItemStatus;
  stages: ProductionStageRecord[];
}

export interface ProductionOrder {
  id: string;
  orderNo: string;
  poNumber: string;
  factoryName: string;
  plannedStartDate: string;
  plannedEndDate: string;
  actualStartDate?: string;
  status: OrderStatus;
  notes?: string;
  items: ProductionItem[];
}

/* ============================================================
 * Demo 数据
 * ============================================================ */

const DEMO_ORDERS: ProductionOrder[] = [
  {
    id: 'po_001',
    orderNo: 'MO-2026-001',
    poNumber: 'PO#TEST001',
    factoryName: '广州晟砜皮具厂',
    plannedStartDate: '2026-03-01',
    plannedEndDate: '2026-04-15',
    actualStartDate: '2026-03-03',
    status: 'in_progress',
    notes: '客户要求4月20日前到港',
    items: [
      {
        id: 'item_001',
        sku: 'TEST-RALLY-GRN',
        colorNameZh: '绿色',
        colorNameEn: 'GREEN',
        colorHex: '#16a34a',
        imageUrl: null,
        plannedQty: 500,
        completedQty: 320,
        currentStage: 'qc',
        status: 'in_progress',
        stages: [
          { key: 'material',  plannedQty: 500, completedQty: 500, completedAt: '2026-03-05', operator: '张三' },
          { key: 'cutting',   plannedQty: 500, completedQty: 500, completedAt: '2026-03-10', operator: '李四' },
          { key: 'sewing',    plannedQty: 500, completedQty: 480, completedAt: '2026-03-25', operator: '王五' },
          { key: 'finishing', plannedQty: 500, completedQty: 380, completedAt: '2026-04-01', operator: '赵六' },
          { key: 'qc',        plannedQty: 500, completedQty: 320 },
          { key: 'packaging', plannedQty: 500, completedQty: 0 },
          { key: 'done',      plannedQty: 500, completedQty: 0 },
        ],
      },
      {
        id: 'item_002',
        sku: 'TEST-RALLY-BLK',
        colorNameZh: '黑色',
        colorNameEn: 'BLACK',
        colorHex: '#111827',
        imageUrl: null,
        plannedQty: 300,
        completedQty: 300,
        currentStage: 'done',
        status: 'completed',
        stages: [
          { key: 'material',  plannedQty: 300, completedQty: 300, completedAt: '2026-03-05', operator: '张三' },
          { key: 'cutting',   plannedQty: 300, completedQty: 300, completedAt: '2026-03-08', operator: '李四' },
          { key: 'sewing',    plannedQty: 300, completedQty: 300, completedAt: '2026-03-20', operator: '王五' },
          { key: 'finishing', plannedQty: 300, completedQty: 300, completedAt: '2026-03-28', operator: '赵六' },
          { key: 'qc',        plannedQty: 300, completedQty: 300, completedAt: '2026-04-02', operator: '孙七' },
          { key: 'packaging', plannedQty: 300, completedQty: 300, completedAt: '2026-04-05', operator: '周八' },
          { key: 'done',      plannedQty: 300, completedQty: 300, completedAt: '2026-04-05' },
        ],
      },
    ],
  },
  {
    id: 'po_002',
    orderNo: 'MO-2026-002',
    poNumber: 'PO#TEST002',
    factoryName: '东莞顺达皮具厂',
    plannedStartDate: '2026-04-01',
    plannedEndDate: '2026-05-20',
    status: 'pending',
    items: [
      {
        id: 'item_003',
        sku: 'CF-TOTE-RED',
        colorNameZh: '红色',
        colorNameEn: 'RED',
        colorHex: '#dc2626',
        imageUrl: null,
        plannedQty: 200,
        completedQty: 0,
        currentStage: 'material',
        status: 'pending',
        stages: [
          { key: 'material',  plannedQty: 200, completedQty: 0 },
          { key: 'cutting',   plannedQty: 200, completedQty: 0 },
          { key: 'sewing',    plannedQty: 200, completedQty: 0 },
          { key: 'finishing', plannedQty: 200, completedQty: 0 },
          { key: 'qc',        plannedQty: 200, completedQty: 0 },
          { key: 'packaging', plannedQty: 200, completedQty: 0 },
          { key: 'done',      plannedQty: 200, completedQty: 0 },
        ],
      },
    ],
  },
];

/* ============================================================
 * 工具函数
 * ============================================================ */

function orderProgress(order: ProductionOrder): number {
  const total = order.items.reduce((s, i) => s + i.plannedQty, 0);
  const done  = order.items.reduce((s, i) => s + i.completedQty, 0);
  return total > 0 ? Math.round((done / total) * 100) : 0;
}

function itemProgress(item: ProductionItem): number {
  return item.plannedQty > 0
    ? Math.round((item.completedQty / item.plannedQty) * 100)
    : 0;
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: '待生产',
  in_progress: '生产中',
  completed: '已完成',
};

const STATUS_COLOR: Record<OrderStatus, string> = {
  pending: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-50 text-blue-700',
  completed: 'bg-green-50 text-green-700',
};

const ITEM_STATUS_LABEL: Record<ItemStatus, string> = {
  pending: '待开始',
  in_progress: '进行中',
  completed: '已完成',
  paused: '已暂停',
};

const ITEM_STATUS_COLOR: Record<ItemStatus, string> = {
  pending: 'bg-gray-100 text-gray-500',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  paused: 'bg-amber-100 text-amber-700',
};

function isOverdue(order: ProductionOrder): boolean {
  if (order.status === 'completed') return false;
  const today = new Date().toISOString().slice(0, 10);
  return order.plannedEndDate < today;
}

/* ============================================================
 * 组件：单个SKU行（含阶段进度）
 * ============================================================ */

function SkuProgressRow({ item }: { item: ProductionItem }) {
  const pct = itemProgress(item);

  return (
    <div className="py-3 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-3 mb-2">
        {/* 色块 / 图片 */}
        <div
          className="w-8 h-8 rounded flex-shrink-0 border border-gray-200"
          style={{ backgroundColor: item.colorHex ?? '#9ca3af' }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <span className="font-medium text-sm text-gray-800">{item.sku}</span>
            {(item.colorNameZh || item.colorNameEn) && (
              <span className="text-xs text-gray-500">
                {item.colorNameZh ?? item.colorNameEn}
              </span>
            )}
            <span className={`text-xs px-1.5 py-0.5 rounded ${ITEM_STATUS_COLOR[item.status]}`}>
              {ITEM_STATUS_LABEL[item.status]}
            </span>
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            计划 {item.plannedQty} 件 · 已完成 {item.completedQty} 件 · 完成率 {pct}%
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <span className="text-lg font-bold text-gray-700">{pct}%</span>
        </div>
      </div>

      {/* 阶段进度条 */}
      <div className="flex gap-1 items-center">
        {item.stages.map((stage, idx) => {
          const meta = STAGE_META.find(m => m.key === stage.key)!;
          const stagePct = stage.plannedQty > 0
            ? Math.min(100, Math.round((stage.completedQty / stage.plannedQty) * 100))
            : 0;
          const isCurrentStage = item.currentStage === stage.key;

          return (
            <div key={stage.key} className="flex-1 min-w-0" title={`${meta.label}：${stage.completedQty}/${stage.plannedQty}`}>
              <div className="text-center mb-1">
                <span
                  className={`text-[10px] font-medium ${
                    isCurrentStage ? 'text-blue-600' : stagePct === 100 ? 'text-green-600' : 'text-gray-400'
                  }`}
                >
                  {meta.label}
                </span>
              </div>
              <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${stagePct}%`,
                    backgroundColor: stagePct === 100 ? '#22c55e' : meta.color,
                  }}
                />
              </div>
              <div className="text-center mt-0.5">
                <span className="text-[10px] text-gray-400">{stagePct}%</span>
              </div>
              {/* 连接线 */}
              {idx < item.stages.length - 1 && (
                <div className="sr-only" />
              )}
            </div>
          );
        })}
      </div>

      {/* 当前阶段标注 */}
      {item.status !== 'completed' && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-blue-600">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
          当前阶段：{STAGE_META.find(m => m.key === item.currentStage)?.label}
        </div>
      )}
    </div>
  );
}

/* ============================================================
 * 组件：单个生产单卡片
 * ============================================================ */

function ProductionOrderCard({ order }: { order: ProductionOrder }) {
  const [expanded, setExpanded] = useState(false);
  const pct = orderProgress(order);
  const overdue = isOverdue(order);
  const totalPlanned = order.items.reduce((s, i) => s + i.plannedQty, 0);
  const totalDone    = order.items.reduce((s, i) => s + i.completedQty, 0);

  return (
    <div className={`bg-white rounded-xl border ${overdue ? 'border-red-200' : 'border-gray-200'} shadow-sm overflow-hidden`}>
      {/* 卡片头 */}
      <div
        className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors select-none"
        onClick={() => setExpanded(v => !v)}
      >
        {/* 折叠箭头 */}
        <span className={`text-gray-400 text-xs transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}>
          ▶
        </span>

        {/* 基本信息 */}
        <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-0.5">
          <div>
            <div className="text-xs text-gray-400">生产单号</div>
            <div className="font-semibold text-gray-800 text-sm">{order.orderNo}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400">关联PO</div>
            <div className="text-sm text-indigo-600 font-medium">{order.poNumber}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400">工厂</div>
            <div className="text-sm text-gray-700 truncate">{order.factoryName}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400">计划周期</div>
            <div className={`text-sm ${overdue ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
              {order.plannedStartDate} → {order.plannedEndDate}
              {overdue && <span className="ml-1 text-xs text-red-500">逾期</span>}
            </div>
          </div>
        </div>

        {/* 进度区 */}
        <div className="flex-shrink-0 flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <div className="text-xs text-gray-400 mb-1">{totalDone} / {totalPlanned} 件</div>
            <div className="w-28 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${pct}%`,
                  backgroundColor: pct === 100 ? '#22c55e' : '#3b82f6',
                }}
              />
            </div>
          </div>
          <div className="text-2xl font-bold w-14 text-right"
            style={{ color: pct === 100 ? '#16a34a' : pct > 0 ? '#2563eb' : '#9ca3af' }}>
            {pct}%
          </div>
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLOR[order.status]}`}>
            {STATUS_LABEL[order.status]}
          </span>
        </div>
      </div>

      {/* 展开的SKU明细 */}
      {expanded && (
        <div className="px-5 pb-4 border-t border-gray-100">
          {order.notes && (
            <div className="mt-3 mb-3 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded px-3 py-2">
              备注：{order.notes}
            </div>
          )}
          <div className="mt-1">
            {order.items.map(item => (
              <SkuProgressRow key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
 * 主页面
 * ============================================================ */

export default function ProductionProgressPage() {
  const [searchOrderNo, setSearchOrderNo]     = useState('');
  const [searchPoNumber, setSearchPoNumber]   = useState('');
  const [searchSku, setSearchSku]             = useState('');
  const [filterFactory, setFilterFactory]     = useState('全部');
  const [filterStatus, setFilterStatus]       = useState<'全部' | OrderStatus>('全部');
  const [filterOverdue, setFilterOverdue]     = useState(false);

  /* 工厂选项（从数据中动态抽取） */
  const factories = useMemo(() => {
    const set = new Set(DEMO_ORDERS.map(o => o.factoryName));
    return ['全部', ...Array.from(set)];
  }, []);

  /* 过滤 */
  const filtered = useMemo(() => {
    return DEMO_ORDERS.filter(o => {
      if (searchOrderNo && !o.orderNo.toLowerCase().includes(searchOrderNo.toLowerCase())) return false;
      if (searchPoNumber && !o.poNumber.toLowerCase().includes(searchPoNumber.toLowerCase())) return false;
      if (searchSku) {
        const hasSku = o.items.some(i =>
          i.sku.toLowerCase().includes(searchSku.toLowerCase()) ||
          (i.colorNameZh ?? '').includes(searchSku) ||
          (i.colorNameEn ?? '').toLowerCase().includes(searchSku.toLowerCase())
        );
        if (!hasSku) return false;
      }
      if (filterFactory !== '全部' && o.factoryName !== filterFactory) return false;
      if (filterStatus !== '全部' && o.status !== filterStatus) return false;
      if (filterOverdue && !isOverdue(o)) return false;
      return true;
    });
  }, [searchOrderNo, searchPoNumber, searchSku, filterFactory, filterStatus, filterOverdue]);

  /* 统计 */
  const stats = useMemo(() => {
    const all = DEMO_ORDERS;
    return {
      total:      all.length,
      pending:    all.filter(o => o.status === 'pending').length,
      inProgress: all.filter(o => o.status === 'in_progress').length,
      completed:  all.filter(o => o.status === 'completed').length,
      overdue:    all.filter(isOverdue).length,
      totalItems: all.reduce((s, o) => s + o.items.reduce((ss, i) => ss + i.plannedQty, 0), 0),
      doneItems:  all.reduce((s, o) => s + o.items.reduce((ss, i) => ss + i.completedQty, 0), 0),
    };
  }, []);

  function handleReset() {
    setSearchOrderNo('');
    setSearchPoNumber('');
    setSearchSku('');
    setFilterFactory('全部');
    setFilterStatus('全部');
    setFilterOverdue(false);
  }

  return (
    <div className="p-6 space-y-5 bg-gray-50 min-h-screen">

      {/* ===== 页头 ===== */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">生产进度</h1>
          <p className="text-sm text-gray-500 mt-0.5">追踪各生产单及 SKU 的实时生产阶段与完成情况</p>
        </div>
      </div>

      {/* ===== 统计卡片 ===== */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: '生产单总数', value: stats.total,      color: 'text-gray-800',  bg: 'bg-white' },
          { label: '待生产',    value: stats.pending,    color: 'text-gray-600',  bg: 'bg-white' },
          { label: '生产中',    value: stats.inProgress, color: 'text-blue-600',  bg: 'bg-blue-50' },
          { label: '已完成',    value: stats.completed,  color: 'text-green-600', bg: 'bg-green-50' },
          { label: '逾期',      value: stats.overdue,    color: 'text-red-600',   bg: 'bg-red-50' },
          { label: '计划总件数', value: stats.totalItems, color: 'text-gray-700',  bg: 'bg-white' },
          { label: '已完成件数', value: stats.doneItems,  color: 'text-indigo-600',bg: 'bg-indigo-50' },
        ].map(card => (
          <div key={card.label} className={`${card.bg} rounded-xl border border-gray-200 px-4 py-3`}>
            <div className="text-xs text-gray-400 mb-1">{card.label}</div>
            <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* ===== 筛选栏 ===== */}
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <input
            type="text"
            placeholder="生产单号"
            value={searchOrderNo}
            onChange={e => setSearchOrderNo(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <input
            type="text"
            placeholder="客户PO号"
            value={searchPoNumber}
            onChange={e => setSearchPoNumber(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <input
            type="text"
            placeholder="SKU / 颜色"
            value={searchSku}
            onChange={e => setSearchSku(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <select
            value={filterFactory}
            onChange={e => setFilterFactory(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            {factories.map(f => <option key={f}>{f}</option>)}
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as typeof filterStatus)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            <option value="全部">全部状态</option>
            <option value="pending">待生产</option>
            <option value="in_progress">生产中</option>
            <option value="completed">已完成</option>
          </select>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={filterOverdue}
                onChange={e => setFilterOverdue(e.target.checked)}
                className="accent-red-500"
              />
              仅显示逾期
            </label>
            <button
              onClick={handleReset}
              className="text-xs text-gray-400 hover:text-gray-600 underline"
            >
              重置
            </button>
          </div>
        </div>
      </div>

      {/* ===== 阶段图例 ===== */}
      <div className="flex flex-wrap gap-3 items-center">
        <span className="text-xs text-gray-400 mr-1">生产阶段：</span>
        {STAGE_META.map((m, idx) => (
          <span key={m.key} className="flex items-center gap-1 text-xs text-gray-600">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: m.color }} />
            {m.label}
            {idx < STAGE_META.length - 1 && <span className="ml-1 text-gray-300">→</span>}
          </span>
        ))}
      </div>

      {/* ===== 列表 ===== */}
      {filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400 text-sm">
          暂无符合条件的生产单
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(order => (
            <ProductionOrderCard key={order.id} order={order} />
          ))}
        </div>
      )}
    </div>
  );
}
