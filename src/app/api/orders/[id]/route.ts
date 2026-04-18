import { createServerSupabase } from '@/lib/supabaseServer';
import { NextRequest } from 'next/server';

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/orders/[id] — 获取单个订单（含生产订单和明细） */
export async function GET(_request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = createServerSupabase();

  const { data, error } = await supabase
    .from('customer_orders')
    .select(`
      *,
      customer:customers(name, customer_code),
      work_orders(
        *,
        pattern:patterns(pattern_code, name),
        items:work_order_items(*, sku:skus(sku_code, color))
      )
    `)
    .eq('id', id)
    .single();

  if (error) return Response.json({ error: error.message }, { status: 404 });
  return Response.json(data);
}

/** PUT /api/orders/[id] — 更新订单 */
export async function PUT(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = createServerSupabase();
  const body = await request.json();

  const { data, error } = await supabase
    .from('customer_orders')
    .update(body)
    .eq('id', id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

/** DELETE /api/orders/[id] — 软删除订单 */
export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = createServerSupabase();
  const now = new Date().toISOString();

  const { error } = await supabase
    .from('customer_orders')
    .update({ deleted_at: now })
    .eq('id', id);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // 同时软删除关联的生产订单
  await supabase
    .from('work_orders')
    .update({ deleted_at: now })
    .eq('customer_order_id', id);

  return Response.json({ success: true });
}
