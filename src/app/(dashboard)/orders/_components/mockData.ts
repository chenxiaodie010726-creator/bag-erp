/* ============================================================
 * 客户订单模拟数据
 * 文件位置: src/app/(dashboard)/orders/_components/mockData.ts
 * ============================================================ */

export type OrderStatus = '已确认' | '待确认' | '部分发货' | '已发货' | '已取消';

export interface OrderItem {
  id: string;
  poNumber: string;
  amount: number;
  poQty: number;
  batches: number;
  status: OrderStatus;
  orderDate: string;   // YYYY-MM-DD
  customerName: string;
}

const CUSTOMERS = [
  'ABC Trading Co.',
  'Global Bags Ltd.',
  'Fashion World Inc.',
  'Luxury Goods LLC',
  'Style Group',
  'Premium Retailers',
  'Trendsetters Co.',
  'Metro Boutique',
  'Elite Imports',
  'Chic Collections',
  'Pacific Distributors',
  'Urban Leather Co.',
  'Prestige Accessories',
  'Coastal Trading Ltd.',
  'Downtown Retail Group',
];

const STATUSES: OrderStatus[] = ['已确认', '待确认', '部分发货', '已发货', '已取消'];

/* 前 10 条与截图一致的已知订单 */
const KNOWN_ORDERS: Omit<OrderItem, 'id'>[] = [
  { poNumber: 'PO#031826', amount: 32785, poQty: 32, batches: 2, status: '已确认',   orderDate: '2024-04-10', customerName: 'ABC Trading Co.'      },
  { poNumber: 'PO#031825', amount: 28450, poQty: 28, batches: 1, status: '待确认',   orderDate: '2024-04-08', customerName: 'Global Bags Ltd.'     },
  { poNumber: 'PO#031824', amount: 45620, poQty: 45, batches: 3, status: '部分发货', orderDate: '2024-04-05', customerName: 'Fashion World Inc.'   },
  { poNumber: 'PO#031823', amount: 18950, poQty: 18, batches: 1, status: '已发货',   orderDate: '2024-04-01', customerName: 'Luxury Goods LLC'      },
  { poNumber: 'PO#031822', amount: 36780, poQty: 36, batches: 2, status: '部分发货', orderDate: '2024-03-28', customerName: 'Style Group'           },
  { poNumber: 'PO#031821', amount: 22150, poQty: 22, batches: 1, status: '已取消',   orderDate: '2024-03-25', customerName: 'Premium Retailers'     },
  { poNumber: 'PO#031820', amount: 31240, poQty: 31, batches: 2, status: '待确认',   orderDate: '2024-03-20', customerName: 'Trendsetters Co.'      },
  { poNumber: 'PO#031819', amount: 15680, poQty: 16, batches: 1, status: '待确认',   orderDate: '2024-03-18', customerName: 'Metro Boutique'        },
  { poNumber: 'PO#031818', amount: 27890, poQty: 28, batches: 2, status: '已发货',   orderDate: '2024-03-15', customerName: 'Elite Imports'         },
  { poNumber: 'PO#031817', amount: 19450, poQty: 19, batches: 1, status: '已确认',   orderDate: '2024-03-12', customerName: 'Chic Collections'      },
];

/* 生成其余 118 条（确定性算法，刷新不变） */
function generateRemaining(): OrderItem[] {
  const result: OrderItem[] = [];
  for (let i = 0; i < 118; i++) {
    const poNum = 31816 - i;
    const seed = i + 1;
    const amount   = 10000 + ((seed * 7691 + 3) % 38000);
    const poQty    = 12    + ((seed * 17)        % 38);
    const batches  = (seed % 4) + 1;
    const statusIdx  = (seed * 3 + 7)  % 5;
    const customerIdx = (seed * 11 + 5) % 15;

    /* 日期：跨越 2024-01-01 ~ 2024-04-09（100 天） */
    const dayOffset = Math.floor(i * 99 / 117);
    const d = new Date('2024-01-01');
    d.setDate(d.getDate() + dayOffset);
    const orderDate = d.toISOString().slice(0, 10);

    result.push({
      id: `order_${poNum}`,
      poNumber: `PO#${String(poNum).padStart(6, '0')}`,
      amount,
      poQty,
      batches,
      status: STATUSES[statusIdx],
      orderDate,
      customerName: CUSTOMERS[customerIdx],
    });
  }
  return result;
}

export const MOCK_ORDERS: OrderItem[] = [
  ...KNOWN_ORDERS.map((o, i) => ({ id: `order_known_${i}`, ...o })),
  ...generateRemaining(),
];
