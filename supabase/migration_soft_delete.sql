-- ============================================================
-- 软删除（回收站）迁移
-- 说明: 为主要业务表添加 deleted_at 字段，实现软删除
--       deleted_at IS NULL = 正常数据
--       deleted_at IS NOT NULL = 已删除（在回收站中）
--       彻底删除 = DELETE FROM（从回收站中永久删除）
--
-- 执行方式: 在 Supabase SQL Editor 中执行
-- ============================================================

-- 1. 客户表
ALTER TABLE customers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 2. 供应商表
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 3. 纸格款号表（产品）
ALTER TABLE patterns ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 4. SKU 表
ALTER TABLE skus ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 5. 客户订单表
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 6. 公司生产订单表
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 7. 装箱单表（如果存在）
-- ALTER TABLE packing_lists ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;


-- ============================================================
-- 创建索引以加速 WHERE deleted_at IS NULL 查询
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_customers_not_deleted ON customers (id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_suppliers_not_deleted ON suppliers (id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_patterns_not_deleted ON patterns (id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_skus_not_deleted ON skus (id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_customer_orders_not_deleted ON customer_orders (id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_work_orders_not_deleted ON work_orders (id) WHERE deleted_at IS NULL;


-- ============================================================
-- 说明：子表（sku_materials, process_steps, work_order_items, shipment_items）
-- 不需要 deleted_at 字段，它们通过外键 ON DELETE CASCADE 跟随父表
-- ============================================================
