-- ============================================================
-- 供应商表扩展字段
-- 说明: 补充前端 SupplierItem 需要但原始 schema 中缺失的列
-- 执行方式: 在 Supabase SQL Editor 中执行
-- ============================================================

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS full_name      TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS type           TEXT DEFAULT '物料供应商';
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS payment_term   TEXT DEFAULT '30 天';
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS contact_group  TEXT DEFAULT '';
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS group_members  INTEGER DEFAULT 0;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS has_license    BOOLEAN DEFAULT false;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS status         TEXT DEFAULT '启用';
