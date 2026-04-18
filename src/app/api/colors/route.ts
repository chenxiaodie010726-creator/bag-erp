import { NextRequest } from 'next/server';

/**
 * 颜色注册表 API
 * 目前颜色注册表存储在 localStorage（colorRegistry）
 * 后续可迁移到数据库；当前 API 保留接口定义，
 * 前端仍暂时使用 localStorage
 */

/** GET /api/colors — 获取颜色注册表 */
export async function GET() {
  // TODO: 迁移到数据库后实现
  return Response.json([]);
}

/** PUT /api/colors — 更新颜色注册表 */
export async function PUT(request: NextRequest) {
  const body = await request.json();
  // TODO: 迁移到数据库后实现
  return Response.json(body);
}
