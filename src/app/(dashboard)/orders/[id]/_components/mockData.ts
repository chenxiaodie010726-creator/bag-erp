/* ============================================================
 * 订单明细模拟数据（测试用：仅 PO#TEST001 一张订单）
 * 文件位置: src/app/(dashboard)/orders/[id]/_components/mockData.ts
 * ============================================================ */

export interface ShipmentBatch {
  date: string;       // e.g. "4/15/26"
  qty: number | null; // null = "-"（该批次无此 SKU）
}

export interface OrderDetailItem {
  id: string;
  sku: string;
  colorName: string;
  styleName: string;
  unitPrice: number;   // EXW 单价
  quantity: number;    // 总 QTY
  shipments: ShipmentBatch[];
  remarks: string;
}

export interface OrderDetailData {
  shipmentDates: string[];
  items: OrderDetailItem[];
}

/* ============================================================
 * PO#TEST001 — 测试数据
 * 2 个 SKU 行：
 *   TEST-RALLY-GRN (GREEN)  — 已注册，80 pcs
 *   TEST-HILO-BLK  (BLACK)  — 未注册，160 pcs
 * 总量 240 件，总额 $3,120
 * ============================================================ */
const PO_TEST001: OrderDetailData = {
  shipmentDates: ['4/15/26'],
  items: [
    {
      id: 'td01',
      sku: 'TEST-RALLY-GRN',
      colorName: 'GREEN',
      styleName: 'RALLY SHOULDER BAG',
      unitPrice: 13.00,
      quantity: 80,
      shipments: [{ date: '4/15/26', qty: 80 }],
      remarks: '0.5',
    },
    {
      id: 'td02',
      sku: 'TEST-HILO-BLK',
      colorName: 'BLACK',
      styleName: 'HILO HOBO',
      unitPrice: 13.00,
      quantity: 160,
      shipments: [{ date: '4/15/26', qty: 160 }],
      remarks: '0.55',
    },
  ],
};

/* ============================================================
 * 公开的查询函数
 * ============================================================ */
const HARDCODED_MAP: Record<string, OrderDetailData> = {
  order_test_0: PO_TEST001,
};

export function generateOrderDetail(
  _orderId: string,
  _batches: number,
  _totalAmount: number,
  _totalQty: number,
): OrderDetailData {
  return { shipmentDates: [], items: [] };
}

export function getOrderDetail(
  orderId: string,
  batches: number,
  totalAmount: number,
  totalQty: number,
): OrderDetailData {
  return HARDCODED_MAP[orderId] ?? generateOrderDetail(orderId, batches, totalAmount, totalQty);
}
