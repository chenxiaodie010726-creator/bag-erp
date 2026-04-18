import type { OrderDetailData } from '@/app/(dashboard)/orders/[id]/_components/mockData';
import type { OrderItem } from '@/app/(dashboard)/orders/_components/mockData';
import type { PoGroupData, SkuItem } from '@/app/(dashboard)/inventory/_components/mockData';
import { COLOR_NAME_ZH_MAP } from '@/app/(dashboard)/products/_components/mockData';
import type { ProductListItem } from '@/app/(dashboard)/products/_components/mockData';
import { guessColorCodeFromSku } from '@/lib/colorDisplay';
import { STORAGE_KEYS } from './storageKeys';
import { loadInventoryFromStorage } from './inventoryStorage';
import { findUnregisteredSkus } from './skuLookup';

export interface UnregisteredSkuEntry {
  id: string;
  sku: string;
  colorName: string;
  styleName: string;
  unitPrice: number;
  quantity: number;
  poNumber: string;
  orderId: string;
  orderDate: string;
  discoveredAt: string;
}

function loadInventory(): PoGroupData[] {
  return loadInventoryFromStorage();
}

function loadProducts(): ProductListItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

function lookupProductImage(sku: string, products: ProductListItem[]): string | null {
  for (const p of products) {
    if (p.skus.some((s) => s.skuName.toUpperCase() === sku.toUpperCase())) {
      return p.imageUrl;
    }
  }
  return null;
}

function saveInventory(data: PoGroupData[]) {
  try {
    localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(data));
  } catch { /* quota */ }
}

function loadUnregistered(): UnregisteredSkuEntry[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.UNREGISTERED_SKUS);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveUnregistered(data: UnregisteredSkuEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEYS.UNREGISTERED_SKUS, JSON.stringify(data));
  } catch { /* quota */ }
}

/**
 * After importing order detail, sync data to inventory and check for unregistered SKUs.
 * Returns a list of unregistered SKU codes found.
 */
export function syncOrderToInventory(
  order: OrderItem,
  detail: OrderDetailData,
): { unregisteredSkus: UnregisteredSkuEntry[] } {
  const skuCodes = detail.items.map((item) => item.sku);
  const unregisteredCodes = findUnregisteredSkus(skuCodes);
  const unregisteredSet = new Set(unregisteredCodes.map((s) => s.toUpperCase()));

  const now = new Date().toISOString();

  /* ---- Handle unregistered SKUs ---- */
  if (unregisteredSet.size > 0) {
    const existing = loadUnregistered();
    const existingKeys = new Set(existing.map((e) => `${e.poNumber}||${e.sku}`.toUpperCase()));

    const newEntries: UnregisteredSkuEntry[] = detail.items
      .filter((item) => unregisteredSet.has(item.sku.toUpperCase()))
      .filter((item) => !existingKeys.has(`${order.poNumber}||${item.sku}`.toUpperCase()))
      .map((item) => ({
        id: `unreg_${order.id}_${item.id}_${Date.now()}`,
        sku: item.sku,
        colorName: item.colorName,
        styleName: item.styleName,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        poNumber: order.poNumber,
        orderId: order.id,
        orderDate: order.orderDate,
        discoveredAt: now,
      }));

    if (newEntries.length > 0) {
      saveUnregistered([...existing, ...newEntries]);
    }
  }

  /* ---- Create/update inventory entry for this PO ---- */
  const inventory = loadInventory();
  const products = loadProducts();
  const existingIdx = inventory.findIndex(
    (po) => po.poNumber.toUpperCase() === order.poNumber.toUpperCase()
  );

  const items: SkuItem[] = detail.items.map((item, idx) => {
    const code = guessColorCodeFromSku(item.sku);
    const zh = code && COLOR_NAME_ZH_MAP[code] ? COLOR_NAME_ZH_MAP[code] : null;
    return {
      id: `${order.id}-inv-${idx}`,
      wo: null,
      patternCode: null,
      imageUrl: lookupProductImage(item.sku, products),
      sku: item.sku,
      colorCode: code,
      colorNameEn: item.colorName?.trim() || null,
      colorNameZh: zh,
      totalQty: item.quantity,
      receivedQty: 0,
      remaining: 0,
      customerCode: null,
      factoryName: null,
      shipments: {},
    };
  });

  const poGroup: PoGroupData = {
    poNumber: order.poNumber,
    orderDate: order.orderDate,
    skuCount: items.length,
    totalQty: items.reduce((s, i) => s + i.totalQty, 0),
    receivedQty: 0,
    remaining: 0,
    columns: [],
    items,
  };

  if (existingIdx >= 0) {
    inventory[existingIdx] = poGroup;
  } else {
    inventory.unshift(poGroup);
  }

  saveInventory(inventory);

  const unregisteredSkus = unregisteredSet.size > 0
    ? loadUnregistered().filter(
        (e) =>
          e.poNumber.toUpperCase() === order.poNumber.toUpperCase() &&
          unregisteredSet.has(e.sku.toUpperCase())
      )
    : [];

  return { unregisteredSkus };
}
