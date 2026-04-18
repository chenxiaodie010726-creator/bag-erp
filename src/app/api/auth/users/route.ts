import { createServerSupabase } from '@/lib/supabaseServer';
import { NextRequest } from 'next/server';

/** GET /api/auth/users — 获取所有 ERP 用户 */
export async function GET() {
  const supabase = createServerSupabase();

  const { data, error } = await supabase
    .from('erp_users')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

/** POST /api/auth/users — 创建新用户 */
export async function POST(request: NextRequest) {
  const supabase = createServerSupabase();
  const body = await request.json();
  const { email, password, name, role, department } = body;

  if (!email || !password || !name) {
    return Response.json({ error: '邮箱、密码、姓名为必填' }, { status: 400 });
  }

  // 1. 在 Supabase Auth 中注册
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError) return Response.json({ error: authError.message }, { status: 500 });

  // 2. 在 erp_users 表中创建记录
  const { data: erpUser, error: dbError } = await supabase
    .from('erp_users')
    .insert({
      auth_id: authData.user.id,
      name,
      role: role || 'clerk',
      department: department || null,
      is_active: true,
    })
    .select()
    .single();

  if (dbError) return Response.json({ error: dbError.message }, { status: 500 });
  return Response.json(erpUser, { status: 201 });
}
