import { createServerSupabase } from '@/lib/supabaseServer';
import { NextRequest } from 'next/server';

/** GET /api/packing-list — 获取装箱单列表 */
export async function GET() {
  const supabase = createServerSupabase();

  // 注意：packing_lists 表可能尚未在 schema.sql 中创建
  // 如果表不存在，返回空数组以保持向后兼容
  const { data, error } = await supabase
    .from('packing_lists')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    // 表不存在时返回空数组
    if (error.message.includes('does not exist')) {
      return Response.json([]);
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json(data);
}

/** POST /api/packing-list — 创建装箱单 */
export async function POST(request: NextRequest) {
  const supabase = createServerSupabase();
  const body = await request.json();
  const { items, ...listData } = body;

  const { data: list, error } = await supabase
    .from('packing_lists')
    .insert(listData)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  if (items && Array.isArray(items)) {
    const rows = items.map((item: Record<string, unknown>) => ({
      ...item,
      packing_list_id: list.id,
    }));
    await supabase.from('packing_list_items').insert(rows);
  }

  return Response.json(list, { status: 201 });
}
