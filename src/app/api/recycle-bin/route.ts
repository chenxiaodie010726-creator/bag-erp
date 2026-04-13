import { createServerSupabase } from '@/lib/supabaseServer';

/** 支持回收站的表及其显示名称 */
const RECYCLABLE_TABLES = [
  { table: 'suppliers', label: '供应商', nameField: 'name' },
  { table: 'patterns', label: '产品', nameField: 'name' },
  { table: 'skus', label: 'SKU', nameField: 'sku_code' },
  { table: 'customer_orders', label: '客户订单', nameField: 'po_number' },
  { table: 'work_orders', label: '生产订单', nameField: 'work_order_number' },
] as const;

export interface RecycleBinItem {
  id: string;
  table: string;
  label: string;
  name: string;
  deleted_at: string;
}

/** GET /api/recycle-bin — 获取所有已删除项 */
export async function GET() {
  const supabase = createServerSupabase();
  const allItems: RecycleBinItem[] = [];

  for (const { table, label, nameField } of RECYCLABLE_TABLES) {
    const { data, error } = await supabase
      .from(table)
      .select(`id, ${nameField}, deleted_at`)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });

    if (error) continue; // 表不存在或查询失败时跳过

    if (data) {
      for (const row of data) {
        allItems.push({
          id: row.id,
          table,
          label,
          name: (row as Record<string, string>)[nameField] ?? row.id,
          deleted_at: row.deleted_at,
        });
      }
    }
  }

  // 按删除时间倒序排列
  allItems.sort((a, b) => new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime());

  return Response.json(allItems);
}
