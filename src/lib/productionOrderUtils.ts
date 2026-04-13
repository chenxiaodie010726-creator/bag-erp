/* ============================================================
 * 生产单工具函数
 *
 * 功能:
 *   - 生产单编号生成（TC + (年-20) + 月 + 序号）
 *   - localStorage 读写
 *   - 从客户订单 + 成本核算表 → 自动生成生产单 & 采购单
 * ============================================================ */

import { STORAGE_KEYS } from './storageKeys';
import type {
  ProductionOrder,
  ProductionOrderItem,
  ProcurementSheet,
  ProcurementItem,
  ProcurementType,
  CostSheet,
  ColorMaterialMapEntry,
} from '@/types';
import {
  calcMaterialTotalUsage as _calcMatTotal,
  calcMaterialUsage as _calcMatUsage,
  loadCostSheets,
} from './costSheetUtils';

// ============================================================
// ID & 编号生成
// ============================================================

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * 生成生产单编号
 * 格式: TC + (年份-20) + 月份(2位) + 序号(2位)
 * 例: 2026年4月第1单 = TC60401
 */
export function generateProductionOrderNumber(existingOrders: ProductionOrder[]): string {
  const now = new Date();
  const yearPart = now.getFullYear() - 2020;
  const monthPart = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `TC${yearPart}${monthPart}`;

  let maxSeq = 0;
  for (const o of existingOrders) {
    if (o.order_number.startsWith(prefix)) {
      const seqStr = o.order_number.slice(prefix.length);
      const seq = parseInt(seqStr, 10);
      if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
    }
  }

  const nextSeq = String(maxSeq + 1).padStart(2, '0');
  return `${prefix}${nextSeq}`;
}

// ============================================================
// localStorage 读写
// ============================================================

export function loadProductionOrders(): ProductionOrder[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PRODUCTION_ORDERS);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveProductionOrders(orders: ProductionOrder[]) {
  try {
    localStorage.setItem(STORAGE_KEYS.PRODUCTION_ORDERS, JSON.stringify(orders));
  } catch { /* quota */ }
}

export function getProductionOrder(id: string): ProductionOrder | undefined {
  return loadProductionOrders().find(o => o.id === id);
}

export function saveProductionOrder(order: ProductionOrder) {
  const orders = loadProductionOrders();
  const idx = orders.findIndex(o => o.id === order.id);
  if (idx >= 0) {
    orders[idx] = order;
  } else {
    orders.push(order);
  }
  saveProductionOrders(orders);
}

export function deleteProductionOrder(id: string) {
  const orders = loadProductionOrders().filter(o => o.id !== id);
  saveProductionOrders(orders);
}


// ============================================================
// 自动生成生产单（核心函数）
// ============================================================

interface OrderListItem {
  id: string;
  poNumber: string;
  customerName: string;
  orderDate: string;
  status: string;
  poQty: number;
}

interface OrderDetailSkuItem {
  id: string;
  sku: string;
  colorName: string;
  styleName: string;
  quantity: number;
  unitPrice: number;
}

/**
 * 自动扫描所有客户订单，为没有生产单的款号自动生成
 * 返回新生成的生产单数组
 */
export function autoGenerateProductionOrders(): ProductionOrder[] {
  const existingOrders = loadProductionOrders();
  const costSheets = loadCostSheets();
  const newOrders: ProductionOrder[] = [];

  // 读取所有客户订单
  let customerOrders: OrderListItem[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ORDERS);
    if (raw) customerOrders = JSON.parse(raw);
  } catch { /* ignore */ }

  if (customerOrders.length === 0) return [];

  // 读取产品库用于 SKU → 纸格款号 映射
  let products: any[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
    if (raw) products = JSON.parse(raw);
  } catch { /* ignore */ }

  for (const co of customerOrders) {
    // 读取该订单的SKU明细
    let orderItems: OrderDetailSkuItem[] = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.ORDER_DETAIL_PREFIX + co.id);
      if (raw) {
        const data = JSON.parse(raw);
        orderItems = (data.items || []).map((item: any) => ({
          id: item.id || generateId(),
          sku: item.sku || '',
          colorName: item.colorName || '',
          styleName: item.styleName || '',
          quantity: item.quantity || 0,
          unitPrice: item.unitPrice || 0,
        }));
      }
    } catch { /* ignore */ }

    if (orderItems.length === 0) continue;

    // 按纸格款号分组SKU
    const patternGroups: Record<string, {
      patternCode: string;
      items: OrderDetailSkuItem[];
    }> = {};

    for (const item of orderItems) {
      const product = products.find((p: any) =>
        p.skus?.some((s: any) =>
          (s.skuCode && s.skuCode === item.sku) ||
          (s.sku_code && s.sku_code === item.sku)
        )
      );
      const patternCode = product
        ? String(product.patternCode ?? product.pattern_code ?? '').trim()
        : '';
      // 没有绑定款号的SKU：用SKU code的前缀作为临时款号
      if (!patternCode) {
        const fallback = item.styleName || item.sku.replace(/-[^-]*$/, '') || item.sku;
        if (!patternGroups[`__sku_${fallback}`]) {
          patternGroups[`__sku_${fallback}`] = { patternCode: fallback, items: [] };
        }
        patternGroups[`__sku_${fallback}`].items.push(item);
        continue;
      }

      if (!patternGroups[patternCode]) {
        patternGroups[patternCode] = { patternCode, items: [] };
      }
      patternGroups[patternCode].items.push(item);
    }

    // 对每个款号检查是否已有生产单
    for (const group of Object.values(patternGroups)) {
      const alreadyExists = existingOrders.some(
        o => o.customer_order_id === co.id && o.pattern_code === group.patternCode
      ) || newOrders.some(
        o => o.customer_order_id === co.id && o.pattern_code === group.patternCode
      );

      if (alreadyExists) continue;

      // 查找对应的成本核算表（可能没有，没有也要生成生产单）
      const costSheet = findCostSheetByPatternCodeFromList(costSheets, group.patternCode);

      const orderId = generateId();
      const orderNumber = generateProductionOrderNumber([...existingOrders, ...newOrders]);
      const colorMap = costSheet?.color_material_map ?? [];

      const items = buildOrderItems(
        group.items.map(i => ({
          sku: i.sku,
          colorName: i.colorName,
          quantity: i.quantity,
        })),
        colorMap,
        orderId,
      );

      // 有成本核算表才生成采购单，没有则为空
      const procurementSheets = costSheet
        ? generateProcurementSheets(costSheet, items, orderId)
        : [];

      newOrders.push({
        id: orderId,
        order_number: orderNumber,
        customer_order_id: co.id,
        po_number: co.poNumber,
        pattern_code: group.patternCode,
        cost_sheet_id: costSheet?.id ?? null,
        status: 'unreviewed',
        order_date: new Date().toISOString().split('T')[0],
        delivery_date: null,
        factory_name: null,
        business_follower: null,
        production_requirements: {
          oil_edge: '',
          sewing_thread: '',
          embossing: '',
          embossing_die: '',
          packaging: '',
          notes: '',
          custom_fields: {},
        },
        embossing_dies: [],
        notes: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        items,
        procurement_sheets: procurementSheets,
      });
    }
  }

  if (newOrders.length > 0) {
    saveProductionOrders([...existingOrders, ...newOrders]);
  }

  return newOrders;
}


// ============================================================
// 从成本核算表生成采购单
// ============================================================

/** 根据物料类别判断采购单类型 */
function categorizeMaterial(category: string): ProcurementType {
  const cat = category.toLowerCase();
  if (cat.includes('五金') || cat.includes('拉链') || cat.includes('织带')) return 'hardware_zipper';
  if (cat.includes('包装')) return 'packaging';
  if (cat.includes('工艺')) return 'craft';
  return 'fabric_lining_accessory';
}

/** 判断物料类别是否需要按颜色展开 */
function needsColorExpansion(category: string): boolean {
  const cat = category.toLowerCase();
  return cat.includes('主料') || cat.includes('配料') || cat.includes('里布');
}

/**
 * 从成本核算表 + 颜色对照表 + 订单明细 → 生成采购单
 */
export function generateProcurementSheets(
  costSheet: CostSheet,
  orderItems: ProductionOrderItem[],
  productionOrderId: string,
): ProcurementSheet[] {
  const materials = costSheet.material_items ?? [];
  const hardwareItems = costSheet.hardware_items ?? [];
  const packagingItems = costSheet.packaging_items ?? [];
  const craftItems = costSheet.craft_items ?? [];
  const colorMap = costSheet.color_material_map ?? [];
  const totalQty = orderItems.reduce((s, i) => s + i.quantity, 0);

  const sheets: ProcurementSheet[] = [];

  // ---- 1. 面料里布辅料采购单 ----
  const fabricItems: ProcurementItem[] = [];
  const fabricMaterials = materials.filter(m => categorizeMaterial(m.category) === 'fabric_lining_accessory');

  // 按类别汇总单用量（损耗后），用于采购单
  const categoryUsageMap: Record<string, number> = {};
  for (const mat of fabricMaterials) {
    const totalUsage = _calcMatTotal(mat);
    categoryUsageMap[mat.category] = (categoryUsageMap[mat.category] || 0) + totalUsage;
  }

  for (const [category, unitUsage] of Object.entries(categoryUsageMap)) {
    if (needsColorExpansion(category)) {
      // 按颜色展开
      for (const item of orderItems) {
        const colorMapping = item.material_mapping || {};
        const mapEntry = colorMap.find(
          c => c.color_en === item.color_en || c.color_zh === item.color_zh
        );
        const materialCode = getMaterialCodeForCategory(category, mapEntry, colorMapping);

        fabricItems.push({
          id: generateId(),
          procurement_sheet_id: '',
          category,
          name: category,
          material_code: materialCode,
          color: item.color_zh || item.color_en,
          unit: guessMaterialUnit(category),
          unit_usage: unitUsage,
          order_quantity: item.quantity,
          total_quantity: roundUp4(unitUsage * item.quantity),
          confirmed_quantity: null,
          supplier_name: null,
          supplier_phone: null,
          notes: null,
          sort_order: fabricItems.length,
        });
      }
    } else {
      // 辅料类不按颜色展开，用总数量
      fabricItems.push({
        id: generateId(),
        procurement_sheet_id: '',
        category,
        name: category,
        material_code: null,
        color: null,
        unit: guessMaterialUnit(category),
        unit_usage: unitUsage,
        order_quantity: totalQty,
        total_quantity: roundUp4(unitUsage * totalQty),
        confirmed_quantity: null,
        supplier_name: null,
        supplier_phone: null,
        notes: null,
        sort_order: fabricItems.length,
      });
    }
  }

  if (fabricItems.length > 0) {
    const sheetId = generateId();
    fabricItems.forEach(i => i.procurement_sheet_id = sheetId);
    sheets.push({
      id: sheetId,
      production_order_id: productionOrderId,
      type: 'fabric_lining_accessory',
      supplier_name: null,
      supplier_phone: null,
      items: fabricItems,
      notes: null,
      created_at: new Date().toISOString(),
    });
  }

  // ---- 2. 五金拉链采购单 ----
  const hwItems: ProcurementItem[] = [];

  for (const hw of hardwareItems) {
    hwItems.push({
      id: generateId(),
      procurement_sheet_id: '',
      category: '五金',
      name: hw.name,
      material_code: hw.material_code,
      color: null,
      unit: '个',
      unit_usage: hw.quantity,
      order_quantity: totalQty,
      total_quantity: hw.quantity * totalQty,
      confirmed_quantity: null,
      supplier_name: null,
      supplier_phone: null,
      notes: null,
      sort_order: hwItems.length,
    });
  }

  // 拉链/织带（来自 material_items 中的拉链/织带类）
  const zipperMaterials = materials.filter(
    m => categorizeMaterial(m.category) === 'hardware_zipper'
  );
  for (const mat of zipperMaterials) {
    const totalUsage = _calcMatTotal(mat);

    if (mat.category.includes('拉链') || mat.part_name.includes('拉链')) {
      for (const item of orderItems) {
        hwItems.push({
          id: generateId(),
          procurement_sheet_id: '',
          category: mat.category,
          name: mat.part_name,
          material_code: mat.material_code,
          color: item.color_zh || item.color_en,
          unit: '码',
          unit_usage: totalUsage,
          order_quantity: item.quantity,
          total_quantity: roundUp4(totalUsage * item.quantity),
          confirmed_quantity: null,
          supplier_name: null,
          supplier_phone: null,
          notes: null,
          sort_order: hwItems.length,
        });
      }
    } else {
      hwItems.push({
        id: generateId(),
        procurement_sheet_id: '',
        category: mat.category,
        name: mat.part_name,
        material_code: mat.material_code,
        color: null,
        unit: '码',
        unit_usage: totalUsage,
        order_quantity: totalQty,
        total_quantity: roundUp4(totalUsage * totalQty),
        confirmed_quantity: null,
        supplier_name: null,
        supplier_phone: null,
        notes: null,
        sort_order: hwItems.length,
      });
    }
  }

  if (hwItems.length > 0) {
    const sheetId = generateId();
    hwItems.forEach(i => i.procurement_sheet_id = sheetId);
    sheets.push({
      id: sheetId,
      production_order_id: productionOrderId,
      type: 'hardware_zipper',
      supplier_name: null,
      supplier_phone: null,
      items: hwItems,
      notes: null,
      created_at: new Date().toISOString(),
    });
  }

  // ---- 3. 工艺采购单 ----
  const craftProcItems: ProcurementItem[] = [];
  for (const craft of craftItems) {
    craftProcItems.push({
      id: generateId(),
      procurement_sheet_id: '',
      category: '工艺',
      name: craft.name,
      material_code: craft.code,
      color: null,
      unit: '次',
      unit_usage: craft.quantity,
      order_quantity: totalQty,
      total_quantity: craft.quantity * totalQty,
      confirmed_quantity: null,
      supplier_name: null,
      supplier_phone: null,
      notes: null,
      sort_order: craftProcItems.length,
    });
  }

  // 油边也归入工艺
  if (costSheet.oil_edge) {
    const oe = costSheet.oil_edge;
    craftProcItems.push({
      id: generateId(),
      procurement_sheet_id: '',
      category: '工艺',
      name: '油边',
      material_code: null,
      color: null,
      unit: '寸',
      unit_usage: oe.total_length_inches * oe.quantity,
      order_quantity: totalQty,
      total_quantity: roundUp4(oe.total_length_inches * oe.quantity * totalQty),
      confirmed_quantity: null,
      supplier_name: null,
      supplier_phone: null,
      notes: null,
      sort_order: craftProcItems.length,
    });
  }

  if (craftProcItems.length > 0) {
    const sheetId = generateId();
    craftProcItems.forEach(i => i.procurement_sheet_id = sheetId);
    sheets.push({
      id: sheetId,
      production_order_id: productionOrderId,
      type: 'craft',
      supplier_name: null,
      supplier_phone: null,
      items: craftProcItems,
      notes: null,
      created_at: new Date().toISOString(),
    });
  }

  // ---- 4. 包装材料采购单 ----
  const pkgItems: ProcurementItem[] = [];
  for (const pkg of packagingItems) {
    const qty = pkg.quantity ?? 1;
    pkgItems.push({
      id: generateId(),
      procurement_sheet_id: '',
      category: '包装',
      name: pkg.name,
      material_code: pkg.code,
      color: null,
      unit: '个',
      unit_usage: qty,
      order_quantity: totalQty,
      total_quantity: qty * totalQty,
      confirmed_quantity: null,
      supplier_name: null,
      supplier_phone: null,
      notes: pkg.is_auto_calc ? '系统自动计算' : null,
      sort_order: pkgItems.length,
    });
  }

  if (pkgItems.length > 0) {
    const sheetId = generateId();
    pkgItems.forEach(i => i.procurement_sheet_id = sheetId);
    sheets.push({
      id: sheetId,
      production_order_id: productionOrderId,
      type: 'packaging',
      supplier_name: null,
      supplier_phone: null,
      items: pkgItems,
      notes: null,
      created_at: new Date().toISOString(),
    });
  }

  return sheets;
}


// ============================================================
// 辅助函数
// ============================================================

function roundUp4(n: number): number {
  return Math.ceil(n * 10000) / 10000;
}

/** 根据类别从颜色对照表获取物料编号 */
function getMaterialCodeForCategory(
  category: string,
  mapEntry: ColorMaterialMapEntry | undefined,
  colorMapping: Record<string, string>,
): string | null {
  if (!mapEntry) {
    for (const [key, val] of Object.entries(colorMapping)) {
      if (key.includes(category) || category.includes(key)) return val;
    }
    return null;
  }
  for (const [key, val] of Object.entries(mapEntry.mappings)) {
    if (key.includes('主料') && category.includes('主料')) return val;
    if (key.includes('配料') && category.includes('配料')) return val;
    if (key.includes('里布') && category.includes('里布')) return val;
    if (key.includes('车线') && category.includes('车线')) return val;
  }
  return null;
}

/** 根据类别猜测单位 */
function guessMaterialUnit(category: string): string {
  if (category.includes('皮') || category.includes('主料') || category.includes('配料')) return '平尺';
  if (category.includes('里布') || category.includes('布')) return '码';
  if (category.includes('拉链') || category.includes('织带')) return '码';
  if (category.includes('五金')) return '个';
  if (category.includes('纸')) return '张';
  return '个';
}

/** 根据纸格款号从给定列表中查找最新版本的成本核算表 */
function findCostSheetByPatternCodeFromList(sheets: CostSheet[], patternCode: string): CostSheet | undefined {
  const matching = sheets.filter(s => s.pattern_code === patternCode);
  if (matching.length === 0) return undefined;
  return matching.sort((a, b) => b.version - a.version)[0];
}

/**
 * 根据成本核算表纸格款号查找最新版本（从localStorage）
 */
export function findCostSheetByPatternCode(patternCode: string): CostSheet | undefined {
  const sheets = loadCostSheets();
  return findCostSheetByPatternCodeFromList(sheets, patternCode);
}

/**
 * 从客户订单明细 + 成本核算表颜色对照表 → 生成 ProductionOrderItem[]
 */
export function buildOrderItems(
  orderDetailItems: Array<{
    sku: string;
    colorName: string;
    quantity: number;
  }>,
  colorMap: ColorMaterialMapEntry[],
  productionOrderId: string,
): ProductionOrderItem[] {
  return orderDetailItems.map((item) => {
    const mapEntry = colorMap.find(
      c => c.color_en?.toUpperCase() === item.colorName?.toUpperCase()
        || c.color_zh === item.colorName
    );

    return {
      id: generateId(),
      production_order_id: productionOrderId,
      sku_code: item.sku,
      color_zh: mapEntry?.color_zh || item.colorName || '',
      color_en: mapEntry?.color_en || item.colorName || '',
      quantity: item.quantity,
      batches: [],
      material_mapping: mapEntry?.mappings ?? {},
      notes: null,
    };
  });
}

/**
 * 计算单用量汇总（按物料类别分组）
 */
export function calcUsageSummary(costSheet: CostSheet) {
  const materials = costSheet.material_items ?? [];
  const grouped: Record<string, { category: string; sumUsage: number; sumTotalUsage: number; unit: string }> = {};

  for (const mat of materials) {
    const totalUsage = _calcMatTotal(mat);
    const usage = _calcMatUsage(mat);

    if (!grouped[mat.category]) {
      grouped[mat.category] = {
        category: mat.category,
        sumUsage: 0,
        sumTotalUsage: 0,
        unit: guessMaterialUnit(mat.category),
      };
    }
    grouped[mat.category].sumUsage += usage;
    grouped[mat.category].sumTotalUsage += totalUsage;
  }

  return Object.values(grouped);
}

/**
 * 当新录入成本核算表后，为没有采购单的生产单重新生成采购单
 * 返回更新过的生产单数组
 */
export function regenerateProcurementForPattern(patternCode: string): ProductionOrder[] {
  const costSheet = findCostSheetByPatternCode(patternCode);
  if (!costSheet) return [];

  const allOrders = loadProductionOrders();
  const updated: ProductionOrder[] = [];

  for (const order of allOrders) {
    if (order.pattern_code !== patternCode) continue;
    if (order.cost_sheet_id && order.procurement_sheets && order.procurement_sheets.length > 0) continue;

    // 重新关联成本表 & 生成采购单
    order.cost_sheet_id = costSheet.id;
    order.procurement_sheets = generateProcurementSheets(costSheet, order.items ?? [], order.id);

    // 从颜色对照表更新 items 的 material_mapping
    const colorMap = costSheet.color_material_map ?? [];
    for (const item of (order.items ?? [])) {
      const mapEntry = colorMap.find(
        c => c.color_en?.toUpperCase() === item.color_en?.toUpperCase()
          || c.color_zh === item.color_zh
      );
      if (mapEntry) {
        item.material_mapping = mapEntry.mappings;
      }
    }

    order.updated_at = new Date().toISOString();
    updated.push(order);
  }

  if (updated.length > 0) {
    saveProductionOrders(allOrders);
  }

  return updated;
}

/**
 * 按PO分组生产单
 */
export function groupProductionOrdersByPO(orders: ProductionOrder[]): {
  poNumber: string;
  customerOrderId: string | null;
  orderDate: string;
  orders: ProductionOrder[];
  totalQty: number;
  patternCount: number;
  colorCount: number;
  statusSummary: { unreviewed: number; reviewed: number };
}[] {
  const groups: Record<string, ProductionOrder[]> = {};
  for (const o of orders) {
    const key = o.po_number || '__no_po';
    if (!groups[key]) groups[key] = [];
    groups[key].push(o);
  }

  return Object.entries(groups).map(([poNumber, poOrders]) => {
    const totalQty = poOrders.reduce(
      (s, o) => s + (o.items?.reduce((ss, i) => ss + i.quantity, 0) ?? 0), 0
    );
    const colorCount = poOrders.reduce(
      (s, o) => s + (o.items?.length ?? 0), 0
    );
    const unreviewed = poOrders.filter(o => o.status === 'unreviewed').length;
    const reviewed = poOrders.filter(o => o.status === 'reviewed').length;

    return {
      poNumber: poNumber === '__no_po' ? '(无PO号)' : poNumber,
      customerOrderId: poOrders[0]?.customer_order_id ?? null,
      orderDate: poOrders[0]?.order_date ?? '',
      orders: poOrders.sort((a, b) => a.pattern_code.localeCompare(b.pattern_code)),
      totalQty,
      patternCount: poOrders.length,
      colorCount,
      statusSummary: { unreviewed, reviewed },
    };
  }).sort((a, b) => b.orderDate.localeCompare(a.orderDate));
}
