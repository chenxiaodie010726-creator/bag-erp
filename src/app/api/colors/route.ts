import { createServerSupabase } from '@/lib/supabaseServer';
import { NextRequest } from 'next/server';

/** GET /api/colors — 获取颜色注册表（按 sort_order 排序） */
export async function GET(request: NextRequest) {
  const supabase = createServerSupabase();
  const { searchParams } = request.nextUrl;
  const includeDeleted = searchParams.get('deleted') === 'true';

  let query = supabase
    .from('colors')
    .select('*')
    .order('sort_order', { ascending: true });

  if (!includeDeleted) {
    query = query.is('deleted_at', null);
  }

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

/**
 * PUT /api/colors — 整体替换颜色注册表
 * body: Array<{ id?: string; keywords: string[]; hex: string }>
 * 语义: 按数组顺序重写 sort_order；
 *   - 有 id 且库里存在 → UPDATE
 *   - 无 id 或 id 不存在 → INSERT（数据库生成 UUID）
 *   - 库里有但 body 里没有 → 软删除
 */
export async function PUT(request: NextRequest) {
  const supabase = createServerSupabase();
  const body = await request.json();

  if (!Array.isArray(body)) {
    return Response.json({ error: 'body 必须是数组' }, { status: 400 });
  }

  // 1. 读取当前全部（含已删除）做差异比对
  const { data: existing, error: readErr } = await supabase
    .from('colors')
    .select('id');
  if (readErr) return Response.json({ error: readErr.message }, { status: 500 });

  const existingIds = new Set((existing ?? []).map((r) => r.id as string));
  const incomingIds = new Set<string>();

  // 2. 分类：需要 UPDATE 的 vs 需要 INSERT 的
  type UpdateRow = { id: string; keywords: string[]; hex: string; sort_order: number; deleted_at: null };
  type InsertRow = { keywords: string[]; hex: string; sort_order: number };
  const updates: UpdateRow[] = [];
  const inserts: InsertRow[] = [];

  body.forEach((item, index) => {
    const keywords = Array.isArray(item.keywords) ? item.keywords : [];
    const hex = String(item.hex ?? '');
    if (item.id && existingIds.has(item.id)) {
      updates.push({
        id: item.id,
        keywords,
        hex,
        sort_order: index,
        deleted_at: null, // 如果之前被软删除，此处恢复
      });
      incomingIds.add(item.id);
    } else {
      inserts.push({ keywords, hex, sort_order: index });
    }
  });

  // 3. 执行 UPDATE（逐行 update；supabase 不支持批量 update 不同值）
  for (const row of updates) {
    const { error: updErr } = await supabase
      .from('colors')
      .update({
        keywords: row.keywords,
        hex: row.hex,
        sort_order: row.sort_order,
        deleted_at: row.deleted_at,
      })
      .eq('id', row.id);
    if (updErr) return Response.json({ error: updErr.message }, { status: 500 });
  }

  // 4. 执行 INSERT（批量）
  if (inserts.length > 0) {
    const { error: insErr } = await supabase.from('colors').insert(inserts);
    if (insErr) return Response.json({ error: insErr.message }, { status: 500 });
  }

  // 5. 不在 body 里的旧记录 → 软删除
  const toDelete = [...existingIds].filter((id) => !incomingIds.has(id));
  if (toDelete.length > 0) {
    const { error: delErr } = await supabase
      .from('colors')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', toDelete)
      .is('deleted_at', null);
    if (delErr) return Response.json({ error: delErr.message }, { status: 500 });
  }

  // 6. 返回最新列表
  const { data: fresh, error: freshErr } = await supabase
    .from('colors')
    .select('*')
    .is('deleted_at', null)
    .order('sort_order', { ascending: true });
  if (freshErr) return Response.json({ error: freshErr.message }, { status: 500 });
  return Response.json(fresh);
}
