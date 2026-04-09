/* ============================================================
 * 订单库存页面 — 类型定义
 * 数据来源：订单详情同步（syncOrderToInventory），不再独立存储假数据
 * ============================================================ */

/** 右侧动态列：一次出库批次 */
export interface ShipmentColumn {
  shipmentId: string;
  date: string;
  shipmentNo: string;
  key: string;
}

/** 表格中的一行：一个 SKU 的出货进度 */
export interface SkuItem {
  id: string;
  wo: string | null;
  patternCode: string | null;
  imageUrl: string | null;
  sku: string;
  colorCode?: string | null;
  colorNameEn?: string | null;
  colorNameZh?: string | null;
  totalQty: number;
  receivedQty: number;
  remaining: number;
  customerCode: string | null;
  factoryName?: string | null;
  shipments: Record<string, number | null>;
}

/** 一个客户 PO 的出货进度分组 */
export interface PoGroupData {
  poNumber: string;
  orderDate: string;
  skuCount: number;
  totalQty: number;
  receivedQty: number;
  remaining: number;
  columns: ShipmentColumn[];
  items: SkuItem[];
}

/** 构建出库列唯一键 */
export function buildShipmentKey(date: string, shipmentNo: string): string {
  return `${date}||${shipmentNo}`;
}

/** 库存数据全部由订单同步写入，初始为空 */
export const MOCK_PO_GROUPS: PoGroupData[] = [];
