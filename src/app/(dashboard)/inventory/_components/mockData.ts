/* ============================================================
 * 订单库存页面 — 模拟数据 & 类型定义
 *
 * 层级结构说明：
 *   客户 PO 号（如 PO260305）    ← 由客户提供，格式无规律
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
  wo: string | null;                        // 公司生产订单号（如 TC250401，null 显示 "?"）
  patternCode: string | null;               // 纸格款号（公司内部款式代码，如 ABC01）
  imageUrl: string | null;                  // SKU 主图 URL
  sku: string;                              // SKU 编码（客户款号，如 AP1-BC-BLK）
  totalQty: number;                         // 订单总数量
  remaining: number;                        // 剩余库存（= 总数量 - 已出库合计）
  shipments: Record<string, number | null>; // key = ShipmentColumn.key，value = 出库数量
}

/** 一个客户 PO 的出货进度分组 */
export interface PoGroupData {
  poNumber: string;          // 客户 PO 号，如 "PO260305"（由客户提供）
  orderDate: string;         // 下单日期
  skuCount: number;          // SKU 数量
  totalQty: number;          // 订单总数量（合计）
  remaining: number;         // 剩余库存（合计）
  columns: ShipmentColumn[]; // 该 PO 下所有出库批次列（按日期排序）
  items: SkuItem[];          // 该 PO 下的 SKU 出货明细列表
}

/** 构建出库列唯一键 */
function k(date: string, shipmentNo: string): string {
  return `${date}||${shipmentNo}`;
}

/* ============================================================
 * 模拟数据
 *
 * PO 号：客户提供的订单号（如 PO260305），格式无固定规律
 * WO 号：公司生产订单号（如 TC250401），格式：客户编码+YY+MM+序号
 * SKU  ：客户款号（如 AP1-BC-BLK），标识具体款式的某颜色
 * ============================================================ */
export const MOCK_PO_GROUPS: PoGroupData[] = [
  {
    poNumber: 'PO260501',           // 客户 PO 号
    orderDate: '2025/05/01',
    skuCount: 5,
    totalQty: 5800,
    remaining: 1150,
    columns: [
      { shipmentId: 's1', date: '2025/05/10', shipmentNo: 'SQ250510-001', key: k('2025/05/10', 'SQ250510-001') },
      { shipmentId: 's2', date: '2025/05/30', shipmentNo: 'SQ250630-001', key: k('2025/05/30', 'SQ250630-001') },
      { shipmentId: 's3', date: '2025/06/10', shipmentNo: 'SQ250610-001', key: k('2025/06/10', 'SQ250610-001') },
      { shipmentId: 's4', date: '2025/06/20', shipmentNo: 'SQ250620-001', key: k('2025/06/20', 'SQ250620-001') },
    ],
    items: [
      {
        id: '1', wo: 'TC250501', patternCode: 'ABC01', imageUrl: null, sku: 'AP1-BC-BLK',
        totalQty: 1000, remaining: 200,
        shipments: {
          [k('2025/05/10', 'SQ250510-001')]: 300,
          [k('2025/05/30', 'SQ250630-001')]: 300,
          [k('2025/06/10', 'SQ250610-001')]: 200,
          [k('2025/06/20', 'SQ250620-001')]: 0,
        },
      },
      {
        id: '2', wo: 'TC250501', patternCode: 'ABC01', imageUrl: null, sku: 'AP1-BC-RED',
        totalQty: 2000, remaining: 450,
        shipments: {
          [k('2025/05/10', 'SQ250510-001')]: 800,
          [k('2025/05/30', 'SQ250630-001')]: 500,
          [k('2025/06/10', 'SQ250610-001')]: 250,
          [k('2025/06/20', 'SQ250620-001')]: 0,
        },
      },
      {
        id: '3', wo: 'TC250502', patternCode: 'WL0305', imageUrl: null, sku: 'WL1-RD-BRN',
        totalQty: 500, remaining: 80,
        shipments: {
          [k('2025/05/10', 'SQ250510-001')]: 200,
          [k('2025/05/30', 'SQ250630-001')]: 220,
          [k('2025/06/10', 'SQ250610-001')]: null,
          [k('2025/06/20', 'SQ250620-001')]: null,
        },
      },
      {
        id: '4', wo: 'TC250502', patternCode: 'WL0305', imageUrl: null, sku: 'WL1-RD-BLK',
        totalQty: 1500, remaining: 300,
        shipments: {
          [k('2025/05/10', 'SQ250510-001')]: 600,
          [k('2025/05/30', 'SQ250630-001')]: 300,
          [k('2025/06/10', 'SQ250610-001')]: 300,
          [k('2025/06/20', 'SQ250620-001')]: null,
        },
      },
      {
        id: '5', wo: null, patternCode: 'CB0201', imageUrl: null, sku: 'CB2-SM-TAN',
        totalQty: 800, remaining: 120,
        shipments: {
          [k('2025/05/10', 'SQ250510-001')]: 400,
          [k('2025/05/30', 'SQ250630-001')]: 280,
          [k('2025/06/10', 'SQ250610-001')]: null,
          [k('2025/06/20', 'SQ250620-001')]: null,
        },
      },
    ],
  },
  {
    poNumber: 'PO260502',           // 客户 PO 号
    orderDate: '2025/05/05',
    skuCount: 3,
    totalQty: 2700,
    remaining: 300,
    columns: [
      { shipmentId: 's5', date: '2025/05/12', shipmentNo: 'SQ250512-001', key: k('2025/05/12', 'SQ250512-001') },
      { shipmentId: 's6', date: '2025/06/01', shipmentNo: 'SQ250601-001', key: k('2025/06/01', 'SQ250601-001') },
      { shipmentId: 's7', date: '2025/06/13', shipmentNo: 'SQ250613-001', key: k('2025/06/13', 'SQ250613-001') },
    ],
    items: [
      {
        id: '6', wo: 'TC250503', patternCode: 'AP0201', imageUrl: null, sku: 'AP2-LG-BLK',
        totalQty: 1200, remaining: 150,
        shipments: {
          [k('2025/05/12', 'SQ250512-001')]: 500,
          [k('2025/06/01', 'SQ250601-001')]: 350,
          [k('2025/06/13', 'SQ250613-001')]: 200,
        },
      },
      {
        id: '7', wo: null, patternCode: 'AP0201', imageUrl: null, sku: 'AP2-LG-RED',
        totalQty: 600, remaining: 60,
        shipments: {
          [k('2025/05/12', 'SQ250512-001')]: 300,
          [k('2025/06/01', 'SQ250601-001')]: 240,
          [k('2025/06/13', 'SQ250613-001')]: null,
        },
      },
      {
        id: '8', wo: 'TC250504', patternCode: 'BT0301', imageUrl: null, sku: 'BT3-WD-BRN',
        totalQty: 900, remaining: 90,
        shipments: {
          [k('2025/05/12', 'SQ250512-001')]: 400,
          [k('2025/06/01', 'SQ250601-001')]: 320,
          [k('2025/06/13', 'SQ250613-001')]: 90,
        },
      },
    ],
  },
  {
    poNumber: 'PO260503',           // 客户 PO 号
    orderDate: '2025/05/08',
    skuCount: 2,
    totalQty: 1700,
    remaining: 170,
    columns: [
      { shipmentId: 's8',  date: '2025/05/15', shipmentNo: 'SQ250515-001', key: k('2025/05/15', 'SQ250515-001') },
      { shipmentId: 's9',  date: '2025/06/05', shipmentNo: 'SQ250605-001', key: k('2025/06/05', 'SQ250605-001') },
      { shipmentId: 's10', date: '2025/06/18', shipmentNo: 'SQ250618-001', key: k('2025/06/18', 'SQ250618-001') },
      { shipmentId: 's11', date: '2025/06/28', shipmentNo: 'SQ250628-001', key: k('2025/06/28', 'SQ250628-001') },
    ],
    items: [
      {
        id: '9', wo: 'TC250505', patternCode: 'CW0401', imageUrl: null, sku: 'CW4-FL-BLK',
        totalQty: 1000, remaining: 100,
        shipments: {
          [k('2025/05/15', 'SQ250515-001')]: 400,
          [k('2025/06/05', 'SQ250605-001')]: 300,
          [k('2025/06/18', 'SQ250618-001')]: 200,
          [k('2025/06/28', 'SQ250628-001')]: 100,
        },
      },
      {
        id: '10', wo: null, patternCode: 'CW0401', imageUrl: null, sku: 'CW4-FL-BRN',
        totalQty: 700, remaining: 70,
        shipments: {
          [k('2025/05/15', 'SQ250515-001')]: 300,
          [k('2025/06/05', 'SQ250605-001')]: 250,
          [k('2025/06/18', 'SQ250618-001')]: 80,
          [k('2025/06/28', 'SQ250628-001')]: null,
        },
      },
    ],
  },
];
