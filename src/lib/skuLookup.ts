import { MOCK_PRODUCTS, type ProductListItem } from '@/app/(dashboard)/products/_components/mockData';
import { MOCK_SETS, type SetItem } from '@/app/(dashboard)/sets/_components/mockData';
import { STORAGE_KEYS } from './storageKeys';

function loadProducts(): ProductListItem[] {
  try {
    const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.PRODUCTS) : null;
    return stored ? JSON.parse(stored) : MOCK_PRODUCTS;
  } catch {
    return MOCK_PRODUCTS;
  }
}

function loadSets(): SetItem[] {
  try {
    const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.SETS) : null;
    return stored ? JSON.parse(stored) : MOCK_SETS;
  } catch {
    return MOCK_SETS;
  }
}

/**
 * Build a Set of all known SKU codes from products and sets.
 * SKU matching is case-insensitive.
 */
export function getAllKnownSkus(): Set<string> {
  const skuSet = new Set<string>();

  const products = loadProducts();
  for (const p of products) {
    for (const sku of p.skus) {
      skuSet.add(sku.skuCode.toUpperCase());
      skuSet.add(sku.skuName.toUpperCase());
    }
  }

  const sets = loadSets();
  for (const s of sets) {
    skuSet.add(s.sku.toUpperCase());
    for (const sku of s.skus) {
      skuSet.add(sku.skuCode.toUpperCase());
    }
  }

  return skuSet;
}

/**
 * Check which SKUs from a list are NOT registered in the system.
 * Returns the SKU strings that are unregistered.
 */
export function findUnregisteredSkus(skuCodes: string[]): string[] {
  const known = getAllKnownSkus();
  return skuCodes.filter((sku) => !known.has(sku.toUpperCase()));
}
