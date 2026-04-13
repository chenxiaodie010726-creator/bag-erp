import { createServerSupabase } from '@/lib/supabaseServer';
import { NextRequest } from 'next/server';

/** GET /api/orders — 获取客户订单列表 */
export async function GET(request: NextRequest) {
  const supabase = createServerSupabase();
  const { searchParams } = request.nextUrl;
  const includeDeleted = searchParams.get('deleted') === 'true';

  let query = supabase
    .from('customer_orders')
    .select('*, customer:customers(name, customer_code)')
    .order('created_at', { ascending: false });

  if (!includeDeleted) {
    query = query.is('deleted_at', null);
  }

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

/** POST /api/orders — 创建客户订单 */
export async function POST(request: NextRequest) {
  const supabase = createServerSupabase();
  const body = await request.json();

  const { data, error } = await supabase
    .from('customer_orders')
    .insert(body)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}
