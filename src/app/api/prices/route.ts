import { createServerSupabase } from '@/lib/supabaseServer';
import { NextRequest } from 'next/server';

/**
 * 价格管理 API
 * 价格数据存储在 sku_materials 表中（物料价格）
 * 工艺价格可扩展到独立表，目前复用 sku_materials
 */

/** GET /api/prices — 获取价格列表 */
export async function GET() {
  const supabase = createServerSupabase();

  const { data, error } = await supabase
    .from('sku_materials')
    .select('*, supplier:suppliers(name, supplier_code)')
    .order('material_type', { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

/** PUT /api/prices — 批量更新价格 */
export async function PUT(request: NextRequest) {
  const supabase = createServerSupabase();
  const body = await request.json();

  if (!Array.isArray(body.items)) {
    return Response.json({ error: '需要 items 数组' }, { status: 400 });
  }

  const errors: string[] = [];
  for (const item of body.items) {
    if (!item.id) continue;
    const { error } = await supabase
      .from('sku_materials')
      .update(item)
      .eq('id', item.id);
    if (error) errors.push(error.message);
  }

  if (errors.length > 0) {
    return Response.json({ error: errors.join('; ') }, { status: 500 });
  }
  return Response.json({ success: true });
}

/** POST /api/prices — 创建价格条目 */
export async function POST(request: NextRequest) {
  const supabase = createServerSupabase();
  const body = await request.json();

  const { data, error } = await supabase
    .from('sku_materials')
    .insert(body)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}
