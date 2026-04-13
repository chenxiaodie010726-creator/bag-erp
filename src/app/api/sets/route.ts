import { createServerSupabase } from '@/lib/supabaseServer';
import { NextRequest } from 'next/server';

/**
 * 套装目前复用 patterns + skus 表（通过 category = '套装' 区分）
 * 后续如需独立表可扩展
 */

/** GET /api/sets — 获取套装列表 */
export async function GET(request: NextRequest) {
  const supabase = createServerSupabase();
  const { searchParams } = request.nextUrl;
  const includeDeleted = searchParams.get('deleted') === 'true';

  let query = supabase
    .from('patterns')
    .select('*, skus(*)')
    .eq('category', '套装')
    .order('created_at', { ascending: false });

  if (!includeDeleted) {
    query = query.is('deleted_at', null);
  }

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

/** POST /api/sets — 创建套装 */
export async function POST(request: NextRequest) {
  const supabase = createServerSupabase();
  const body = await request.json();
  const { skus, ...patternData } = body;

  const { data: pattern, error } = await supabase
    .from('patterns')
    .insert({ ...patternData, category: '套装' })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  if (skus && Array.isArray(skus) && skus.length > 0) {
    const skuRows = skus.map((sku: Record<string, unknown>) => ({
      ...sku,
      pattern_id: pattern.id,
    }));
    await supabase.from('skus').insert(skuRows);
  }

  const { data: full } = await supabase
    .from('patterns')
    .select('*, skus(*)')
    .eq('id', pattern.id)
    .single();

  return Response.json(full, { status: 201 });
}
