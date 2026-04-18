import { createServerSupabase } from '@/lib/supabaseServer';
import { NextRequest } from 'next/server';

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/suppliers/[id] — 获取单个供应商 */
export async function GET(_request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = createServerSupabase();

  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return Response.json({ error: error.message }, { status: 404 });
  return Response.json(data);
}

/** PUT /api/suppliers/[id] — 更新供应商 */
export async function PUT(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = createServerSupabase();
  const body = await request.json();

  const { data, error } = await supabase
    .from('suppliers')
    .update(body)
    .eq('id', id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

/** DELETE /api/suppliers/[id] — 软删除供应商（移入回收站） */
export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = createServerSupabase();

  const { error } = await supabase
    .from('suppliers')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
