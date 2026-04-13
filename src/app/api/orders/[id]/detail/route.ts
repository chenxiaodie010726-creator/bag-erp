import { createServerSupabase } from '@/lib/supabaseServer';
import { NextRequest } from 'next/server';

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/orders/[id]/detail — 获取订单明细（生产订单 + SKU 行项） */
export async function GET(_request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = createServerSupabase();

  const { data, error } = await supabase
    .from('work_orders')
    .select(`
      *,
      pattern:patterns(pattern_code, name),
      items:work_order_items(
        *,
        sku:skus(sku_code, color, unit_price)
      )
    `)
    .eq('customer_order_id', id)
    .order('created_at', { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

/** PUT /api/orders/[id]/detail — 批量更新订单明细（生产订单项） */
export async function PUT(request: NextRequest, { params }: Ctx) {
  const { id: _orderId } = await params;
  const supabase = createServerSupabase();
  const body = await request.json();

  // body 应包含 { items: [{ id, quantity, unit_price, ... }] }
  if (body.items && Array.isArray(body.items)) {
    for (const item of body.items) {
      if (item.id) {
        await supabase
          .from('work_order_items')
          .update(item)
          .eq('id', item.id);
      }
    }
  }

  return Response.json({ success: true });
}
