import { createServerSupabase } from '@/lib/supabaseServer';

/** 支持回收站的表及其显示名称 */
const RECYCLABLE_TABLES = [
  { table: 'suppliers', label: '供应商', nameField: 'name' },
  { table: 'patterns', label: '产品', nameField: 'name' },
  { table: 'skus', label: 'SKU', nameField: 'sku_code' },
  { table: 'customer_orders', label: '客户订单', nameField: 'po_number' },
  { table: 'work_orders', label: '生产订单', nameField: 'work_order_number' },
  { table: 'colors', label: '颜色', nameField: 'keywords' },
] as const;

export interface RecycleBinItem {
  id: string;
  table: string;
  label: string;
  name: string;
  deleted_at: string;
}

/** GET /api/recycle-bin — 获取所有已删除项（并行查询所有表） */
export async function GET() {
  const supabase = createServerSupabase();

  // 并行查询所有表，快 ≈6 倍
  const results = await Promise.all(
    RECYCLABLE_TABLES.map(({ table, label, nameField }) =>
      supabase
        .from(table)
        .select(`id, ${nameField}, deleted_at`)
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false })
        .then(({ data, error }) => ({ table, label, nameField, data, error }))
    )
  );

  const allItems: RecycleBinItem[] = [];
  for (const { table, label, nameField, data, error } of results) {
    if (error || !data) continue; // 表不存在或查询失败时跳过
    for (const row of data) {
      const raw = (row as Record<string, unknown>)[nameField];
      // 数组字段（如 colors.keywords）拼成 "BLACK, 黑色"
      const displayName = Array.isArray(raw)
        ? raw.filter((x) => typeof x === 'string' && x.trim()).join(', ')
        : (typeof raw === 'string' && raw) || row.id;
      allItems.push({
        id: row.id,
        table,
        label,
        name: displayName,
        deleted_at: row.deleted_at,
      });
    }
  }

  // 按删除时间倒序排列
  allItems.sort((a, b) => new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime());

  return Response.json(allItems);
}
