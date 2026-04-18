import { createServerSupabase } from '@/lib/supabaseServer';
import { NextRequest } from 'next/server';

/** GET /api/products — 获取产品列表（patterns + skus） */
export async function GET(request: NextRequest) {
  const supabase = createServerSupabase();
  const { searchParams } = request.nextUrl;
  const includeDeleted = searchParams.get('deleted') === 'true';

  let query = supabase
    .from('patterns')
    .select('*, skus(*)')
    .order('created_at', { ascending: false });

  if (!includeDeleted) {
    query = query.is('deleted_at', null);
  }

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

/** POST /api/products — 创建产品（pattern + 可选 skus） */
export async function POST(request: NextRequest) {
  const supabase = createServerSupabase();
  const body = await request.json();
  const { skus, ...patternData } = body;

  // 1. 创建 pattern
  const { data: pattern, error: patternError } = await supabase
    .from('patterns')
    .insert(patternData)
    .select()
    .single();

  if (patternError) return Response.json({ error: patternError.message }, { status: 500 });

  // 2. 如果有 SKU，批量创建
  if (skus && Array.isArray(skus) && skus.length > 0) {
    const skuRows = skus.map((sku: Record<string, unknown>) => ({
      ...sku,
      pattern_id: pattern.id,
    }));

    const { error: skuError } = await supabase.from('skus').insert(skuRows);
    if (skuError) return Response.json({ error: skuError.message }, { status: 500 });
  }

  // 3. 返回完整数据
  const { data: full } = await supabase
    .from('patterns')
    .select('*, skus(*)')
    .eq('id', pattern.id)
    .single();

  return Response.json(full, { status: 201 });
}
