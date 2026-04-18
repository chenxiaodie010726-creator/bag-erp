import { createServerSupabase } from '@/lib/supabaseServer';
import { NextRequest } from 'next/server';

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/products/[id] — 获取单个产品（含 SKU） */
export async function GET(_request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = createServerSupabase();

  const { data, error } = await supabase
    .from('patterns')
    .select('*, skus(*)')
    .eq('id', id)
    .single();

  if (error) return Response.json({ error: error.message }, { status: 404 });
  return Response.json(data);
}

/** PUT /api/products/[id] — 更新产品 */
export async function PUT(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = createServerSupabase();
  const body = await request.json();
  const { skus, ...patternData } = body;

  // 更新 pattern
  if (Object.keys(patternData).length > 0) {
    const { error } = await supabase
      .from('patterns')
      .update(patternData)
      .eq('id', id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  // 如果传了 SKU 数组，用 upsert 更新
  if (skus && Array.isArray(skus)) {
    for (const sku of skus) {
      if (sku.id) {
        await supabase.from('skus').update(sku).eq('id', sku.id);
      } else {
        await supabase.from('skus').insert({ ...sku, pattern_id: id });
      }
    }
  }

  const { data } = await supabase
    .from('patterns')
    .select('*, skus(*)')
    .eq('id', id)
    .single();

  return Response.json(data);
}

/** DELETE /api/products/[id] — 软删除产品 */
export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = createServerSupabase();
  const now = new Date().toISOString();

  // 同时软删除 pattern 和其下所有 SKU
  const { error: patternError } = await supabase
    .from('patterns')
    .update({ deleted_at: now })
    .eq('id', id);

  if (patternError) return Response.json({ error: patternError.message }, { status: 500 });

  await supabase
    .from('skus')
    .update({ deleted_at: now })
    .eq('pattern_id', id);

  return Response.json({ success: true });
}
