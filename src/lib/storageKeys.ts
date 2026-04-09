export const STORAGE_KEYS = {
  PRODUCTS: 'cf_erp_products',
  SETS: 'cf_erp_sets',
  ORDERS: 'cf_erp_orders_v1',
  ORDER_DETAIL_PREFIX: 'cf_erp_order_detail_',
  INVENTORY: 'cf_erp_inventory',
  UNREGISTERED_SKUS: 'cf_erp_unregistered_skus',
  /** 未录入页用户点击删除（忽略）的条目 id */
  UNREGISTERED_DISMISSED_IDS: 'cf_erp_unregistered_dismissed_ids',
  PACKING_LISTS: 'cf_erp_packing_lists',
  SUPPLIERS: 'cf_erp_suppliers',
  /** 物料供应商 — 自定义分类列表（localStorage JSON 数组） */
  SUPPLIER_CATEGORIES_MATERIAL: 'cf_erp_supplier_categories_material',
  /** 工艺供应商 — 自定义分类列表 */
  SUPPLIER_CATEGORIES_PROCESS: 'cf_erp_supplier_categories_process',
} as const;
