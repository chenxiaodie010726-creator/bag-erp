import { createServerSupabase } from '@/lib/supabaseServer';
import { NextRequest } from 'next/server';

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/packing-list/[id] */
export async function GET(_request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = createServerSupabase();

  const { data, error } = await supabase
    .from('packing_lists')
    .select('*, items:packing_list_items(*)')
    .eq('id', id)
    .single();

  if (error) return Response.json({ error: error.message }, { status: 404 });
  return Response.json(data);
}

/** PUT /api/packing-list/[id] */
export async function PUT(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = createServerSupabase();
  const body = await request.json();
  const { items, ...listData } = body;

  if (Object.keys(listData).length > 0) {
    const { error } = await supabase.from('packing_lists').update(listData).eq('id', id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  if (items && Array.isArray(items)) {
    // 删除旧明细，插入新明细
    await supabase.from('packing_list_items').delete().eq('packing_list_id', id);
    const rows = items.map((item: Record<string, unknown>) => ({
      ...item,
      packing_list_id: id,
    }));
    await supabase.from('packing_list_items').insert(rows);
  }

  const { data } = await supabase
    .from('packing_lists')
    .select('*, items:packing_list_items(*)')
    .eq('id', id)
    .single();

  return Response.json(data);
}

/** DELETE /api/packing-list/[id] */
export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = createServerSupabase();

  // 装箱单直接硬删除（不进回收站）
  const { error } = await supabase.from('packing_lists').delete().eq('id', id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
