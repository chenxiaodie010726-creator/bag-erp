/* ============================================================
 * 订单库存页面 — 模拟数据 & 类型定义
 *
 * 层级结构说明：
 *   客户 PO 号（如 PO#260305）   ← 由客户提供；规范：PO# + 数字
 *     └── 公司订单号（如 TC250401）← 系统生成，格式：客户编码+YY+MM+序号
 *           └── SKU 编码（如 AP1-BC-BLK）← 由客户提供，标识具体款式+颜色
 * ============================================================ */

/** 右侧动态列：一次出库批次 */
export interface ShipmentColumn {
  shipmentId: string;   // 出库批次 ID
  date: string;         // 出库日期，如 "2025/05/10"
  shipmentNo: string;   // 客户出库单号，如 "SQ250510-001"
  key: string;          // 唯一键，格式 "date||shipmentNo"
}

/** 表格中的一行：一个 SKU 的出货进度 */
export interface SkuItem {
  id: string;                               // work_order_item_id
  wo: string | null;                        // 公司生产订单号（如 TC250401，null 时组件显示"未关联"）
  patternCode: string | null;               // 纸格款号（公司内部款式代码，如 ABC01）
  imageUrl: string | null;                  // SKU 主图 URL
  sku: string;                              // SKU 编码（客户款号，如 AP1-BC-BLK）
  totalQty: number;                         // 订单数量（生产下单数量）
  receivedQty: number;                      // 实际入库数量（验收后真正进仓的数量）
  //   差数 = totalQty - receivedQty，在组件中计算，不存储，避免数据冗余
  //   剩余库存 = receivedQty - sum(shipments)，同上
  remaining: number;                        // 剩余库存（= 入库数量 - 已出库合计）
  customerCode: string | null;             // 客户编码（Excel 导入等场景，无值时传 null）
  shipments: Record<string, number | null>; // key = ShipmentColumn.key，value = 出库数量
}

/** 一个客户 PO 的出货进度分组 */
export interface PoGroupData {
  poNumber: string;          // 客户 PO 号，如 "PO#260305"（规范：PO# + 数字）
  orderDate: string;         // 下单日期
  skuCount: number;          // SKU 数量
  totalQty: number;          // 订单总数量（合计）= sum(items.totalQty)
  receivedQty: number;       // 实际入库总量（合计）= sum(items.receivedQty)
  remaining: number;         // 剩余库存（合计）= sum(items.remaining) = receivedQty - shipped
  columns: ShipmentColumn[]; // 该 PO 下所有出库批次列，必须按 date ASC 排序（接 API 时加 ORDER BY shipment_date ASC）
  items: SkuItem[];          // 该 PO 下的 SKU 出货明细列表
}

/** 构建出库列唯一键，格式：`date||shipmentNo` */
export function buildShipmentKey(date: string, shipmentNo: string): string {
  return `${date}||${shipmentNo}`;
}

/* ============================================================
 * 模拟数据
 *
 * PO 号：客户提供的订单号（如 PO#260305），规范为 PO# + 数字
 * WO 号：公司生产订单号（如 TC250401），格式：客户编码+YY+MM+序号
 * SKU  ：客户款号（如 AP1-BC-BLK），标识具体款式的某颜色
 * ============================================================ */
/* ----------------------------------------------------------------
 * 数量关系说明（重要）：
 *   totalQty    = 订单数量（生产下单数）
 *   receivedQty = 实际入库数量（工厂验收后真正进仓数，可能 ≠ totalQty）
 *   差数        = totalQty - receivedQty（在组件中计算，正数=入库不足，负数=超收）
 *   remaining   = receivedQty - sum(shipments) = 真实剩余库存
 * ---------------------------------------------------------------- */
export const MOCK_PO_GROUPS: PoGroupData[] = [
  {
    poNumber: 'PO#260501',
    orderDate: '2025/05/01',
    skuCount: 5,
    totalQty: 5800,
    receivedQty: 5750,  // 入库少了 50（差数 = 50）
    remaining: 1120,    // = receivedQty(5750) - shipped(4630)
    columns: [
      { shipmentId: 's1', date: '2025/05/10', shipmentNo: 'SQ250510-001', key: buildShipmentKey('2025/05/10', 'SQ250510-001') },
      { shipmentId: 's2', date: '2025/05/30', shipmentNo: 'SQ250630-001', key: buildShipmentKey('2025/05/30', 'SQ250630-001') },
      { shipmentId: 's3', date: '2025/06/10', shipmentNo: 'SQ250610-001', key: buildShipmentKey('2025/06/10', 'SQ250610-001') },
      { shipmentId: 's4', date: '2025/06/20', shipmentNo: 'SQ250620-001', key: buildShipmentKey('2025/06/20', 'SQ250620-001') },
    ],
    items: [
      {
        // 正常：入库 = 订单，剩余 = 入库 - 已出
        id: '1', wo: 'TC250501', patternCode: 'ABC01', imageUrl: null, sku: 'AP1-BC-BLK',
        totalQty: 1000, receivedQty: 1000,
        remaining: 200,  // 1000 - (300+300+200+0) = 200
        customerCode: null,
        shipments: {
          [buildShipmentKey('2025/05/10', 'SQ250510-001')]: 300,
          [buildShipmentKey('2025/05/30', 'SQ250630-001')]: 300,
          [buildShipmentKey('2025/06/10', 'SQ250610-001')]: 200,
          [buildShipmentKey('2025/06/20', 'SQ250620-001')]: 0,
        },
      },
      {
        // 正常：入库 = 订单
        id: '2', wo: 'TC250501', patternCode: 'ABC01', imageUrl: null, sku: 'AP1-BC-RED',
        totalQty: 2000, receivedQty: 2000,
        remaining: 450,  // 2000 - (800+500+250+0) = 450
        customerCode: null,
        shipments: {
          [buildShipmentKey('2025/05/10', 'SQ250510-001')]: 800,
          [buildShipmentKey('2025/05/30', 'SQ250630-001')]: 500,
          [buildShipmentKey('2025/06/10', 'SQ250610-001')]: 250,
          [buildShipmentKey('2025/06/20', 'SQ250620-001')]: 0,
        },
      },
      {
        // 差数：订单500，入库只有490（少10件，可能有残次品）
        id: '3', wo: 'TC250502', patternCode: 'WL0305', imageUrl: null, sku: 'WL1-RD-BRN',
        totalQty: 500, receivedQty: 490,
        remaining: 70,   // 490 - (200+220) = 70
        customerCode: null,
        shipments: {
          [buildShipmentKey('2025/05/10', 'SQ250510-001')]: 200,
          [buildShipmentKey('2025/05/30', 'SQ250630-001')]: 220,
          [buildShipmentKey('2025/06/10', 'SQ250610-001')]: null,
          [buildShipmentKey('2025/06/20', 'SQ250620-001')]: null,
        },
      },
      {
        // 正常
        id: '4', wo: 'TC250502', patternCode: 'WL0305', imageUrl: null, sku: 'WL1-RD-BLK',
        totalQty: 1500, receivedQty: 1500,
        remaining: 300,  // 1500 - (600+300+300) = 300
        customerCode: null,
        shipments: {
          [buildShipmentKey('2025/05/10', 'SQ250510-001')]: 600,
          [buildShipmentKey('2025/05/30', 'SQ250630-001')]: 300,
          [buildShipmentKey('2025/06/10', 'SQ250610-001')]: 300,
          [buildShipmentKey('2025/06/20', 'SQ250620-001')]: null,
        },
      },
      {
        // 差数：订单800，入库760（少40件）
        id: '5', wo: null, patternCode: 'CB0201', imageUrl: null, sku: 'CB2-SM-TAN',
        totalQty: 800, receivedQty: 760,
        remaining: 100,  // 760 - (400+260) = 100
        customerCode: null,
        shipments: {
          [buildShipmentKey('2025/05/10', 'SQ250510-001')]: 400,
          [buildShipmentKey('2025/05/30', 'SQ250630-001')]: 260,
          [buildShipmentKey('2025/06/10', 'SQ250610-001')]: null,
          [buildShipmentKey('2025/06/20', 'SQ250620-001')]: null,
        },
      },
    ],
  },
  {
    poNumber: 'PO#260502',
    orderDate: '2025/05/05',
    skuCount: 3,
    totalQty: 2700,
    receivedQty: 2640,  // 少60件
    remaining: 240,     // 2640 - 2400(shipped)
    columns: [
      { shipmentId: 's5', date: '2025/05/12', shipmentNo: 'SQ250512-001', key: buildShipmentKey('2025/05/12', 'SQ250512-001') },
      { shipmentId: 's6', date: '2025/06/01', shipmentNo: 'SQ250601-001', key: buildShipmentKey('2025/06/01', 'SQ250601-001') },
      { shipmentId: 's7', date: '2025/06/13', shipmentNo: 'SQ250613-001', key: buildShipmentKey('2025/06/13', 'SQ250613-001') },
    ],
    items: [
      {
        id: '6', wo: 'TC250503', patternCode: 'AP0201', imageUrl: null, sku: 'AP2-LG-BLK',
        totalQty: 1200, receivedQty: 1200,
        remaining: 150,  // 1200 - (500+350+200) = 150
        customerCode: null,
        shipments: {
          [buildShipmentKey('2025/05/12', 'SQ250512-001')]: 500,
          [buildShipmentKey('2025/06/01', 'SQ250601-001')]: 350,
          [buildShipmentKey('2025/06/13', 'SQ250613-001')]: 200,
        },
      },
      {
        // 差数：订单600，入库540（差60）；出货正好把入库全出完
        id: '7', wo: null, patternCode: 'AP0201', imageUrl: null, sku: 'AP2-LG-RED',
        totalQty: 600, receivedQty: 540,
        remaining: 0,    // 540 - (300+240) = 0
        customerCode: null,
        shipments: {
          [buildShipmentKey('2025/05/12', 'SQ250512-001')]: 300,
          [buildShipmentKey('2025/06/01', 'SQ250601-001')]: 240,
          [buildShipmentKey('2025/06/13', 'SQ250613-001')]: null,
        },
      },
      {
        id: '8', wo: 'TC250504', patternCode: 'BT0301', imageUrl: null, sku: 'BT3-WD-BRN',
        totalQty: 900, receivedQty: 900,
        remaining: 90,   // 900 - (400+320+90) = 90
        customerCode: null,
        shipments: {
          [buildShipmentKey('2025/05/12', 'SQ250512-001')]: 400,
          [buildShipmentKey('2025/06/01', 'SQ250601-001')]: 320,
          [buildShipmentKey('2025/06/13', 'SQ250613-001')]: 90,
        },
      },
    ],
  },
  {
    poNumber: 'PO#260503',
    orderDate: '2025/05/08',
    skuCount: 2,
    totalQty: 1700,
    receivedQty: 1700,  // 入库 = 订单（正常）
    remaining: 70,
    columns: [
      { shipmentId: 's8',  date: '2025/05/15', shipmentNo: 'SQ250515-001', key: buildShipmentKey('2025/05/15', 'SQ250515-001') },
      { shipmentId: 's9',  date: '2025/06/05', shipmentNo: 'SQ250605-001', key: buildShipmentKey('2025/06/05', 'SQ250605-001') },
      { shipmentId: 's10', date: '2025/06/18', shipmentNo: 'SQ250618-001', key: buildShipmentKey('2025/06/18', 'SQ250618-001') },
      { shipmentId: 's11', date: '2025/06/28', shipmentNo: 'SQ250628-001', key: buildShipmentKey('2025/06/28', 'SQ250628-001') },
    ],
    items: [
      {
        id: '9', wo: 'TC250505', patternCode: 'CW0401', imageUrl: null, sku: 'CW4-FL-BLK',
        totalQty: 1000, receivedQty: 1000,
        remaining: 0,    // 1000 - (400+300+200+100) = 0
        customerCode: null,
        shipments: {
          [buildShipmentKey('2025/05/15', 'SQ250515-001')]: 400,
          [buildShipmentKey('2025/06/05', 'SQ250605-001')]: 300,
          [buildShipmentKey('2025/06/18', 'SQ250618-001')]: 200,
          [buildShipmentKey('2025/06/28', 'SQ250628-001')]: 100,
        },
      },
      {
        id: '10', wo: null, patternCode: 'CW0401', imageUrl: null, sku: 'CW4-FL-BRN',
        totalQty: 700, receivedQty: 700,
        remaining: 70,   // 700 - (300+250+80) = 70
        customerCode: null,
        shipments: {
          [buildShipmentKey('2025/05/15', 'SQ250515-001')]: 300,
          [buildShipmentKey('2025/06/05', 'SQ250605-001')]: 250,
          [buildShipmentKey('2025/06/18', 'SQ250618-001')]: 80,
          [buildShipmentKey('2025/06/28', 'SQ250628-001')]: null,
        },
      },
    ],
  },
];
