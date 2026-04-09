/* ============================================================
 * 晟砜皮具 ERP — 全局 TypeScript 类型定义
 *
 * 核心层级结构：
 *   客户订单(CustomerOrder/PO)
 *     └── 公司生产订单(WorkOrder)      格式：客户编码+YY+MM+序号，如 TC250401
 *           └── 纸格款号(Pattern)       公司内部款式代码，如 ABC01
 *                 └── SKU               客户款号（含颜色），如 AP1-BC-BLK
 *
 * 说明: 所有类型与 supabase/schema.sql 保持一致
 * ============================================================ */


// ============================================================
// 基础实体
// ============================================================

/** 客户 */
export interface Customer {
  id: string;
  name: string;
  customer_code: string;          // 客户编码，用于生成公司订单号前缀（如 TC）
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  wechat_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** 供应商 */
export interface Supplier {
  id: string;
  name: string;
  supplier_code: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  wechat_id: string | null;
  category: string | null;        // 皮料/里布/五金/拉链/胶水/线/包装
  notes: string | null;
  created_at: string;
  updated_at: string;
}


// ============================================================
// 产品体系：纸格款号 → SKU
// ============================================================

/** 纸格款号（公司内部款式代码）
 *  一个款式对应多个 SKU 颜色变体
 *  示例：ABC01 款式下有 AP1-BC-BLK、AP1-BC-RED 等 SKU */
export interface Pattern {
  id: string;
  pattern_code: string;           // 纸格款号，如 ABC01
  name: string;                   // 款式名称
  category: string | null;        // 手袋/钱包/皮带/卡包/其他
  image_url: string | null;
  description: string | null;
  status: 'active' | 'discontinued';
  created_at: string;
  updated_at: string;
  // 前端关联展示（非数据库字段）
  skus?: Sku[];
}

/** SKU（客户款号）
 *  标识某款式的某一颜色/规格变体，编码由客户自定义
 *  示例：AP1-BC-BLK（ABC01款 黑色）*/
export interface Sku {
  id: string;
  sku_code: string;               // 客户款号，如 AP1-BC-BLK（格式由客户定义）
  pattern_id: string;
  color: string | null;           // 颜色，如 BLK、RED
  specifications: Record<string, string>;  // 其他规格
  unit_price: number;
  image_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // 前端关联展示
  pattern?: Pattern;
}

/** SKU 用料 BOM（每个 SKU 的物料清单）
 *  BOM 挂在 SKU 级别，因为同款不同颜色的部分物料不同 */
export interface SkuMaterial {
  id: string;
  sku_id: string;
  material_name: string;
  material_type: string | null;   // 皮料/里布/五金/拉链/胶水/线/包装
  specification: string | null;
  unit: string | null;
  quantity_per_unit: number;
  supplier_id: string | null;
  unit_cost: number;
  notes: string | null;
  // 前端关联展示
  supplier?: Supplier;
}

/** 工艺工序（挂在纸格款号级别，同款式共用工序）*/
export interface ProcessStep {
  id: string;
  pattern_id: string;
  step_order: number;
  step_name: string;
  description: string | null;
  estimated_minutes: number;
}


// ============================================================
// 订单体系：客户订单(PO) → 公司生产订单(WO) → 明细(SKU)
// ============================================================

/** 订单状态枚举 */
export type OrderStatus =
  | 'pending'        // 待确认
  | 'confirmed'      // 已确认
  | 'in_production'  // 生产中
  | 'quality_check'  // 质检中
  | 'shipped'        // 已发货
  | 'completed'      // 已完成
  | 'cancelled';     // 已取消

/** 订单状态 → 中文映射 */
export const ORDER_STATUS_MAP: Record<OrderStatus, string> = {
  pending:        '待确认',
  confirmed:      '已确认',
  in_production:  '生产中',
  quality_check:  '质检中',
  shipped:        '已发货',
  completed:      '已完成',
  cancelled:      '已取消',
};

/** 生产订单状态（不含 shipped，生产订单不直接对应发货）*/
export type WorkOrderStatus =
  | 'pending'        // 待生产
  | 'confirmed'      // 已确认
  | 'in_production'  // 生产中
  | 'quality_check'  // 质检中
  | 'completed'      // 已完成
  | 'cancelled';     // 已取消

export const WORK_ORDER_STATUS_MAP: Record<WorkOrderStatus, string> = {
  pending:        '待生产',
  confirmed:      '已确认',
  in_production:  '生产中',
  quality_check:  '质检中',
  completed:      '已完成',
  cancelled:      '已取消',
};

/** 客户订单（PO）
 *  由客户提供 PO 号，一个 PO 下可有多个公司生产订单（每个款式一张）*/
export interface CustomerOrder {
  id: string;
  po_number: string;              // 客户 PO 号，格式由客户自定义，如 PO260305
  customer_id: string | null;
  order_date: string;
  delivery_date: string | null;
  status: OrderStatus;
  total_amount: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // 前端关联展示
  customer?: Customer;
  work_orders?: WorkOrder[];
}

/** 公司生产订单（WO）
 *  系统自动生成订单号，格式：客户编码 + YY + MM + 序号
 *  示例：TC250401（TC客户 2025年4月 第1单）
 *  一张生产订单对应一个纸格款号（一个款式） */
export interface WorkOrder {
  id: string;
  work_order_number: string;      // 公司订单号，如 TC250401
  customer_order_id: string;
  pattern_id: string;
  status: WorkOrderStatus;
  planned_start_date: string | null;
  planned_end_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // 前端关联展示
  customer_order?: CustomerOrder;
  pattern?: Pattern;
  items?: WorkOrderItem[];
}

/** 生产订单明细（SKU级别）
 *  记录每张生产订单内各 SKU 的订单数量 */
export interface WorkOrderItem {
  id: string;
  work_order_id: string;
  sku_id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  notes: string | null;
  // 前端关联展示
  sku?: Sku;
  work_order?: WorkOrder;
}


// ============================================================
// 出库体系：出库批次 → 出库明细
// ============================================================

/** 出库批次
 *  一个 PO 可分多批次出库，每次有日期和客户出库单号 */
export interface Shipment {
  id: string;
  customer_order_id: string;
  shipment_date: string;
  shipment_number: string;        // 客户出库单号，如 SQ250510-001
  notes: string | null;
  created_at: string;
  updated_at: string;
  // 前端关联展示
  items?: ShipmentItem[];
}

/** 出库明细
 *  记录每次出库批次中各 SKU 的实际出库数量 */
export interface ShipmentItem {
  id: string;
  shipment_id: string;
  work_order_item_id: string;
  quantity: number;
  notes: string | null;
  // 前端关联展示
  work_order_item?: WorkOrderItem;
}


// ============================================================
// 库存体系
// ============================================================

/** 原材料库存 */
export interface RawInventory {
  id: string;
  material_name: string;
  material_type: string | null;   // 皮料/里布/五金/拉链/胶水/线/包装
  specification: string | null;
  supplier_id: string | null;
  warehouse: string;
  quantity: number;
  unit: string;
  min_stock: number;
  updated_at: string;
  // 前端关联展示
  supplier?: Supplier;
}

/** 原材料库存变动记录 */
export interface RawInventoryMovement {
  id: string;
  inventory_id: string;
  movement_type: 'in' | 'out' | 'adjust';  // 入库/出库/盘点调整
  quantity: number;
  reason: string | null;
  operator: string | null;
  related_work_order_id: string | null;
  created_at: string;
}


// ============================================================
// 出货进度视图（供库存页面使用的聚合类型）
// ============================================================

/** 出库进度视图：某 SKU 在某 PO 下的出货汇总
 *  由 work_order_items + shipment_items 聚合计算而来 */
export interface SkuShipmentProgress {
  work_order_item_id: string;
  work_order_number: string;       // 公司订单号，如 TC250401
  sku_code: string;                // 客户款号，如 AP1-BC-BLK
  sku_image_url: string | null;
  ordered_qty: number;             // 订单总数量
  shipped_qty: number;             // 已出库合计
  remaining_qty: number;           // 剩余库存 = ordered - shipped
  /** 各出库批次的数量，key = "shipment_date||shipment_number" */
  shipments: Record<string, number | null>;
}

/** 按 PO 分组的出货进度（用于库存页面展示）*/
export interface PoShipmentGroup {
  po_id: string;
  po_number: string;               // 客户 PO 号
  customer_name: string | null;
  order_date: string;
  delivery_date: string | null;
  total_ordered_qty: number;
  total_remaining_qty: number;
  sku_count: number;
  /** 该 PO 下所有出库批次列（按日期排序，用于表头） */
  shipment_columns: Array<{
    shipment_id: string;
    shipment_date: string;
    shipment_number: string;
    key: string;                   // = "shipment_date||shipment_number"
  }>;
  items: SkuShipmentProgress[];
}

// ============================================================
// 装箱单体系：装箱单 → 装箱明细
// ============================================================

/** 装箱单状态 */
export type PackingListStatus = 'draft' | 'confirmed' | 'applied';

export const PACKING_LIST_STATUS_MAP: Record<PackingListStatus, string> = {
  draft: '草稿',
  confirmed: '已确认',
  applied: '已应用',
};

/** 装箱单主表 */
export interface PackingList {
  id: string;
  packing_list_no: string;          // 装箱单号，如 PL250510-001
  po_number: string;                 // 关联客户PO号
  /** 客户出库号（inbound#），与出货进度中的客户出库单号一致，如 SQ250510-001 */
  shipment_number: string | null;
  shipment_date: string | null;      // 出货日期
  status: PackingListStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  /** 修改 PO 导入的 SKU/单价 的审计记录 */
  default_change_log?: PackingListDefaultChangeEntry[];
  // 前端关联展示
  items?: PackingListItem[];
}

/** 装箱单：修改默认值（SKU/单价）记录 */
export interface PackingListDefaultChangeEntry {
  id: string;
  at: string;
  operator: string;
  item_id: string;
  message: string;
}

/** 装箱单明细 */
export interface PackingListItem {
  id: string;
  packing_list_id: string;
  sku: string;                       // SKU编码（客户款号）
  /** 从 PO 导入时的参考 SKU；非空则 SKU/单价需通过「修改默认值」编辑 */
  ref_sku_from_po?: string | null;
  /** 从订单明细带入的参考单价 */
  ref_unit_price_from_po?: number | null;
  carton_qty: number;                // 箱数（混装箱的非首行为0）
  pcs_per_carton: number;            // 每箱数量
  unit_price: number;                // 单价
  gross_weight_per_carton: number;   // 每箱毛重(kg)
  product_weight: number;            // 产品单重(kg)
  carton_size: string;               // 纸箱尺寸，如 "55*48*40" (cm)
  outer_carton_size: string | null;  // 外箱尺寸（可选）
  mixed_group: string | null;        // 混装组标记（A/B/C...），null表示非混装
  sort_order: number;
  notes: string | null;
}
