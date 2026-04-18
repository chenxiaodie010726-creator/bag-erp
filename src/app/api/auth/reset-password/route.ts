import { createServerSupabase } from '@/lib/supabaseServer';
import { NextRequest } from 'next/server';

/** POST /api/auth/reset-password — 重置用户密码 */
export async function POST(request: NextRequest) {
  const supabase = createServerSupabase();
  const body = await request.json();
  const { authId, newPassword } = body;

  if (!authId || !newPassword) {
    return Response.json({ error: '需要 authId 和 newPassword' }, { status: 400 });
  }

  const { error } = await supabase.auth.admin.updateUserById(authId, {
    password: newPassword,
  });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
