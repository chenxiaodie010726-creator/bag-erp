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

// ============================================================
// 成本核算表体系
// ============================================================

/** 成本表状态 */
export type CostSheetStatus = 'draft' | 'confirmed' | 'locked';

export const COST_SHEET_STATUS_MAP: Record<CostSheetStatus, string> = {
  draft: '草稿',
  confirmed: '已确认',
  locked: '已锁定',
};

/** 包装材料详情（来自「包装材料」Sheet） */
export interface PackagingDetails {
  // 布袋
  cloth_bag_logo_position?: string;   // LOGO位置/高度注上(CM)
  cloth_bag_logo_type?: string;       // LOGO型号
  cloth_bag_size?: string;            // 长*高(CM)
  cloth_bag_wrist_height?: string;    // 手腕中高
  // 胶袋
  plastic_bag_size?: string;          // 规格(CM)
  // 贴纸
  tag_sticker_qty?: number;           // 吊牌贴纸数量 (6*2.5CM)
  tape_sticker_qty?: number;          // 胶带贴纸数量 (10*3.5CM)
  carton_sticker_note?: string;       // 纸箱贴纸说明/数量 (10*3.5CM)
  // 洗水唛
  wash_label_po?: string;             // 印刷的PO#
  wash_label_size?: string;           // 规格(大/小)
  // 纸箱
  carton_size?: string;               // 尺寸(CM)
  carton_qty_per_box?: string;        // 每箱/数量
  // 包装信息
  package_size?: string;              // 包装尺寸(CM)
  package_weight_kg?: number;         // 重量kg
  notes?: string;
}

/** 成本表主表 */
export interface CostSheet {
  id: string;
  pattern_code: string;              // 纸格款号
  version: number;                   // 版本号，1=初始导入，2,3...=修改版本
  status: CostSheetStatus;
  date: string;                      // 制表日期
  pattern_pieces: number | null;     // 纸格件数
  knife_gap: string | null;          // 刀缝
  notes: string | null;
  created_at: string;
  updated_at: string;
  // 前端关联
  material_items?: CostSheetMaterialItem[];
  /**
   * 主料系列变体（与成本明细顶栏「常规 / NEON PINK…」对应）：非常规系列的物料行可覆盖部分字段；
   * 未覆盖的字段沿用 material_items（常规基准行）。key 与变体按钮一致：__standard__ 一般不存。
   */
  material_variant_overrides?: Record<string, Record<string, Partial<CostSheetMaterialItem>>>;
  /**
   * 「做法不同」变体：完整的物料明细行集合，key 为变体标识（如"压花"）。
   * 来自导入 Excel 中额外的「成本表(xxx)」Sheet，与 material_variant_overrides 互斥（后者用于价格微调）。
   */
  material_variant_full?: Record<string, CostSheetMaterialItem[]>;
  /**
   * 各变体的类型标记：'price_diff'=价格不同（系统自动检测）；'method_diff'=做法不同（Excel 独立 Sheet 导入）。
   */
  material_variant_type?: Record<string, 'price_diff' | 'method_diff'>;
  hardware_items?: CostSheetHardwareItem[];
  packaging_items?: CostSheetPackagingItem[];
  craft_items?: CostSheetCraftItem[];
  oil_edge?: CostSheetOilEdge | null;
  color_material_map?: ColorMaterialMapEntry[];
  /** 包装材料详情，来自「包装材料」Sheet */
  packaging_details?: PackagingDetails;
  /**
   * 生产要求（来自「生产要求」Sheet）
   * 两列自由行：左列为类别/项目名称（如五金、油边、注意事项），右列为说明；行数与项目完全不固定。
   */
  production_requirements?: ProductionRequirementItem[];
}

/** 生产要求一行（与 Excel 左列 + 右列对应） */
export interface ProductionRequirementItem {
  id: string;
  /** 左列：类别或项目名称，如「五金」「油边」「注意事项」 */
  label: string;
  /** 右列：详细要求，可多行 */
  content: string;
  sort_order: number;
}

/** 物料明细行（主料/配料/里布/辅料/拉链/织带等，类别不固定） */
export interface CostSheetMaterialItem {
  id: string;
  cost_sheet_id: string;
  category: string;                  // 类别名称，自由填写
  part_name: string;                 // 部件名称
  length: number;                    // 长
  width: number | null;              // 宽（拉链类可能无宽度）
  pieces: number;                    // 件数
  fabric_width: number | null;       // 布幅（拉链类可能无布幅）
  waste_rate: number;                // 损耗率，如0.03=3%
  material_code: string | null;      // 物料编号（可选，也可通过对照表匹配）
  unit_price: number | null;         // 单价（系统自动匹配，导入时忽略）
  oil_edge_inches: number | null;    // 油边寸数
  glue_price: number | null;         // 过胶单价
  /** 行备注（可选；旧数据可能无此字段） */
  remarks?: string | null;
  sort_order: number;
}

/** 五金明细行 */
export interface CostSheetHardwareItem {
  id: string;
  cost_sheet_id: string;
  /** 物料编号（与价格管理物料编码一致时可自动带出单价） */
  material_code: string | null;
  /** 图片 URL（可选） */
  image_url: string | null;
  name: string;
  quantity: number;
  unit_price: number;
  remarks?: string | null;
  sort_order: number;
}

/** 包装明细行 */
export interface CostSheetPackagingItem {
  id: string;
  cost_sheet_id: string;
  code: string | null;               // 包装编号如B01
  name: string;
  quantity: number | null;            // 外箱贴纸由系统根据装箱数计算
  unit_price: number | null;
  is_auto_calc: boolean;             // 是否系统自动计算（如外箱贴纸）
  remarks?: string | null;
  sort_order: number;
}

/** 工艺明细行 */
export interface CostSheetCraftItem {
  id: string;
  cost_sheet_id: string;
  image_url: string | null;          // 工艺参考图 URL（与五金一致）
  code: string;                      // 工艺编号或款号
  name: string;
  quantity: number;
  unit_price: number;
  is_pattern_bound: boolean;         // 编号=款号本身时为true
  remarks?: string | null;
  sort_order: number;
}

/** 油边 */
export interface CostSheetOilEdge {
  id: string;
  cost_sheet_id: string;
  total_length_inches: number;       // 总长寸数
  quantity: number;                  // 数量（默认1）
  unit_price: number;                // 单价（默认0.01）
  remarks?: string | null;
}

/** 颜色-物料对照表条目 */
export interface ColorMaterialMapEntry {
  id: string;
  cost_sheet_id: string;
  color_zh: string;                  // 中文颜色名
  color_en: string;                  // 英文颜色名
  mappings: Record<string, string>;  // 动态键值对，如 { "主料编号": "6601-黑色", "五金颜色": "浅金" }
  /**
   * 引用的成本表 Sheet 名称（如"成本表(压花)"），用于多成本表格式的导入与展示。
   * 为空时默认使用常规基准成本表。
   */
  cost_sheet_ref?: string;
}

// ============================================================
// 生产单体系
// ============================================================

/** 生产单状态 */
export type ProductionOrderStatus = 'unreviewed' | 'reviewed';

export const PRODUCTION_ORDER_STATUS_MAP: Record<ProductionOrderStatus, string> = {
  unreviewed: '未审核',
  reviewed: '已审核',
};

/** 生产单主表
 *  一张生产单对应一个纸格款号（Pattern），包含多个颜色/SKU
 *  编号格式：TC + (年份-20) + 月份(2位) + 序号(2位)
 *  示例：TC60401 = 2026年4月第1单 */
export interface ProductionOrder {
  id: string;
  order_number: string;              // 生产单号，如 TC60401
  customer_order_id: string | null;  // 关联客户订单ID
  po_number: string;                 // 客户PO号
  pattern_code: string;              // 纸格款号
  cost_sheet_id: string | null;      // 关联成本核算表ID
  status: ProductionOrderStatus;
  order_date: string;                // 下单日期
  delivery_date: string | null;      // 交货日期
  factory_name: string | null;       // 工厂名称
  business_follower: string | null;  // 业务跟单
  /** 生产要求（多行文本） */
  production_requirements: ProductionRequirements;
  /** 压唛信息 */
  embossing_dies: EmbossingDieEntry[];
  notes: string | null;
  created_at: string;
  updated_at: string;
  // 前端关联
  items?: ProductionOrderItem[];
  procurement_sheets?: ProcurementSheet[];
}

/** 生产要求 */
export interface ProductionRequirements {
  oil_edge: string;                  // 油边要求
  sewing_thread: string;             // 车线/好易车线要求
  embossing: string;                 // 压花要求
  embossing_die: string;             // 压唛要求
  packaging: string;                 // 包装要求
  notes: string;                     // 注意事项
  custom_fields: Record<string, string>;  // 自定义字段
}

/** 压唛（铜模）条目 */
export interface EmbossingDieEntry {
  id: string;
  die_number: string;                // 压唛编号，如 2#
  name: string;                      // 名称描述
  image_url: string | null;          // 图片
  notes: string | null;
}

/** 生产单明细行（每个颜色/SKU一行）*/
export interface ProductionOrderItem {
  id: string;
  production_order_id: string;
  sku_code: string;                  // SKU编码（客户款号）
  color_zh: string;                  // 中文颜色
  color_en: string;                  // 英文颜色
  quantity: number;                  // 生产数量
  /** 批次信息（分批生产时使用） */
  batches: ProductionBatch[];
  /** 颜色物料映射（从成本表颜色对照表来） */
  material_mapping: Record<string, string>;
  notes: string | null;
}

/** 分批生产 */
export interface ProductionBatch {
  id: string;
  batch_number: number;              // 批次号
  quantity: number;                  // 该批次数量
  planned_date: string | null;       // 计划生产日期
  status: 'pending' | 'in_production' | 'completed';
}

/** 采购单类型 */
export type ProcurementType =
  | 'fabric_lining_accessory'  // 面料里布辅料
  | 'hardware_zipper'          // 五金拉链
  | 'craft'                    // 工艺
  | 'packaging';               // 包装材料

export const PROCUREMENT_TYPE_MAP: Record<ProcurementType, string> = {
  fabric_lining_accessory: '面料里布辅料',
  hardware_zipper: '五金拉链',
  craft: '工艺',
  packaging: '包装材料',
};

/** 采购单 */
export interface ProcurementSheet {
  id: string;
  production_order_id: string;
  type: ProcurementType;
  supplier_name: string | null;
  supplier_phone: string | null;
  items: ProcurementItem[];
  notes: string | null;
  created_at: string;
}

/** 采购单明细行 */
export interface ProcurementItem {
  id: string;
  procurement_sheet_id: string;
  category: string;                  // 类别（主料/配料/里布/辅料/五金/拉链/织带/工艺/包装）
  name: string;                      // 物料/工艺名称
  material_code: string | null;      // 物料编号/颜色编号
  color: string | null;              // 颜色
  unit: string | null;               // 单位
  unit_usage: number;                // 单用量（损耗后）
  order_quantity: number;            // 订单数量
  total_quantity: number;            // 合计 = 单用量 × 订单数量
  confirmed_quantity: number | null; // 确认采购量（可手动调整）
  supplier_name: string | null;      // 具体供应商
  supplier_phone: string | null;     // 供应商电话
  notes: string | null;
  sort_order: number;
}

/** 人工费用设置 */
export interface LaborCostSetting {
  id: string;
  name: string;                      // 如"人工"、"QC包装"、"加工"
  unit_price: number;
  effective_from: string;            // 生效开始日期
  effective_to: string | null;       // 生效结束日期，null=至今
  created_at: string;
}
