-- ============================================================
-- 颜色管理 — 从 localStorage 迁移到数据库
-- 执行位置: Supabase Dashboard → SQL Editor → 新建查询 → 粘贴 → Run
-- ============================================================

-- 1. 建表
create table if not exists public.colors (
  id uuid primary key default gen_random_uuid(),
  -- 关键词数组: 同一色值的多种叫法（BLACK / 黑色 / 黑）
  keywords text[] not null default '{}',
  -- 十六进制色值: #RRGGBB（小写）
  hex text not null,
  -- 显示顺序: 颜色管理列表从上到下的顺序（影响"常用颜色"前 N 条取值）
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 软删除: 删除后进回收站
  deleted_at timestamptz
);

-- 2. 索引
create index if not exists colors_sort_order_idx on public.colors (sort_order);
create index if not exists colors_deleted_at_idx on public.colors (deleted_at);

-- 3. 自动更新 updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists colors_set_updated_at on public.colors;
create trigger colors_set_updated_at
  before update on public.colors
  for each row
  execute function public.set_updated_at();

-- 4. 验证
select 'colors 表已就绪' as status,
       count(*) as rows
from public.colors
where deleted_at is null;
