import { createServerSupabase } from '@/lib/supabaseServer';
import { NextRequest } from 'next/server';

type Ctx = { params: Promise<{ id: string }> };

/** PUT /api/recycle-bin/[id] — 恢复已删除项 */
export async function PUT(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = createServerSupabase();
  const body = await request.json();
  const { table } = body;

  if (!table) {
    return Response.json({ error: '需要指定 table 参数' }, { status: 400 });
  }

  // 恢复：将 deleted_at 设为 null
  const { error } = await supabase
    .from(table)
    .update({ deleted_at: null })
    .eq('id', id);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // 如果是 pattern，同时恢复其下的 SKU
  if (table === 'patterns') {
    await supabase
      .from('skus')
      .update({ deleted_at: null })
      .eq('pattern_id', id);
  }

  // 如果是 customer_order，同时恢复其下的 work_orders
  if (table === 'customer_orders') {
    await supabase
      .from('work_orders')
      .update({ deleted_at: null })
      .eq('customer_order_id', id);
  }

  return Response.json({ success: true });
}

/** DELETE /api/recycle-bin/[id] — 彻底删除（从数据库中永久移除） */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = createServerSupabase();
  const { searchParams } = request.nextUrl;
  const table = searchParams.get('table');

  if (!table) {
    return Response.json({ error: '需要指定 table 参数' }, { status: 400 });
  }

  const { error } = await supabase
    .from(table)
    .delete()
    .eq('id', id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
