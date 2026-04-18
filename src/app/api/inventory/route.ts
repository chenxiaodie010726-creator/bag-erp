import { createServerSupabase } from '@/lib/supabaseServer';
import { NextRequest } from 'next/server';

/** GET /api/inventory — 获取出货进度（按 PO 分组） */
export async function GET() {
  const supabase = createServerSupabase();

  // 获取所有未删除的客户订单，以及关联的生产订单、明细、出库批次
  const { data, error } = await supabase
    .from('customer_orders')
    .select(`
      *,
      customer:customers(name, customer_code),
      work_orders(
        *,
        items:work_order_items(
          *,
          sku:skus(sku_code, color, image_url),
          shipment_items(quantity, shipment:shipments(shipment_date, shipment_number))
        )
      ),
      shipments(id, shipment_date, shipment_number)
    `)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

/** POST /api/inventory — 记录出库批次 */
export async function POST(request: NextRequest) {
  const supabase = createServerSupabase();
  const body = await request.json();
  const { shipment, items } = body;

  // 1. 创建出库批次
  const { data: shipmentData, error: shipmentError } = await supabase
    .from('shipments')
    .insert(shipment)
    .select()
    .single();

  if (shipmentError) return Response.json({ error: shipmentError.message }, { status: 500 });

  // 2. 创建出库明细
  if (items && Array.isArray(items)) {
    const rows = items.map((item: Record<string, unknown>) => ({
      ...item,
      shipment_id: shipmentData.id,
    }));
    const { error: itemsError } = await supabase.from('shipment_items').insert(rows);
    if (itemsError) return Response.json({ error: itemsError.message }, { status: 500 });
  }

  return Response.json(shipmentData, { status: 201 });
}
