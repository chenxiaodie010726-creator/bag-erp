-- ============================================================
-- 晟砜皮具 ERP — 一键初始化数据库
-- 说明: 删除旧业务表 + 建立新表 + 添加软删除 + 扩展供应商
-- 注意: 不会删除 erp_users 用户账号表
-- 执行: 在 Supabase SQL Editor 中粘贴本文件全部内容，点 RUN
-- ============================================================

-- ===== 第 1 步：删除旧/新业务表（保留 erp_users）=====
-- 旧表
DROP TABLE IF EXISTS inventory_movements CASCADE;
DROP TABLE IF EXISTS inventory CASCADE;
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS product_materials CASCADE;
DROP TABLE IF EXISTS products CASCADE;
-- 新表（如果上次执行了一半留下的残留）
DROP TABLE IF EXISTS packing_list_items CASCADE;
DROP TABLE IF EXISTS packing_lists CASCADE;
DROP TABLE IF EXISTS raw_inventory_movements CASCADE;
DROP TABLE IF EXISTS raw_inventory CASCADE;
DROP TABLE IF EXISTS shipment_items CASCADE;
DROP TABLE IF EXISTS shipments CASCADE;
DROP TABLE IF EXISTS work_order_items CASCADE;
DROP TABLE IF EXISTS work_orders CASCADE;
DROP TABLE IF EXISTS customer_orders CASCADE;
DROP TABLE IF EXISTS process_steps CASCADE;
DROP TABLE IF EXISTS sku_materials CASCADE;
DROP TABLE IF EXISTS skus CASCADE;
DROP TABLE IF EXISTS patterns CASCADE;
DROP TABLE IF EXISTS suppliers CASCADE;
DROP TABLE IF EXISTS customers CASCADE;

-- ===== 第 2 步：建立新表（来自 schema.sql）=====

-- 客户表
CREATE TABLE customers (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT    NOT NULL,
  customer_code  TEXT    UNIQUE NOT NULL,
  contact_person TEXT,
  phone          TEXT,
  email          TEXT,
  address        TEXT,
  wechat_id      TEXT,
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- 供应商表（含扩展字段）
CREATE TABLE suppliers (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT    NOT NULL,
  full_name      TEXT,
  supplier_code  TEXT    UNIQUE,
  type           TEXT    DEFAULT '物料供应商',
  contact_person TEXT,
  phone          TEXT,
  email          TEXT,
  address        TEXT,
  wechat_id      TEXT,
  category       TEXT,
  payment_term   TEXT    DEFAULT '30 天',
  contact_group  TEXT    DEFAULT '',
  group_members  INTEGER DEFAULT 0,
  has_license    BOOLEAN DEFAULT false,
  status         TEXT    DEFAULT '启用',
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- 纸格款号表
CREATE TABLE patterns (
  id            UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_code  TEXT  UNIQUE NOT NULL,
  style_name    TEXT  NOT NULL,
  category      TEXT,
  description   TEXT,
  bulk_price    NUMERIC(10,2),
  dropship_price NUMERIC(10,2),
  status        TEXT  DEFAULT '在售',
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- SKU 表
CREATE TABLE skus (
  id            UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id    UUID  REFERENCES patterns(id) ON DELETE CASCADE,
  sku_code      TEXT  UNIQUE NOT NULL,
  color         TEXT,
  color_hex     TEXT,
  size          TEXT,
  bulk_price    NUMERIC(10,2),
  dropship_price NUMERIC(10,2),
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- SKU 物料 BOM 表
CREATE TABLE sku_materials (
  id            UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_id        UUID  REFERENCES skus(id) ON DELETE CASCADE,
  supplier_id   UUID  REFERENCES suppliers(id) ON DELETE SET NULL,
  material_name TEXT,
  quantity      NUMERIC(10,3),
  unit          TEXT,
  unit_price    NUMERIC(10,2),
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 工艺步骤表
CREATE TABLE process_steps (
  id            UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id    UUID  REFERENCES patterns(id) ON DELETE CASCADE,
  step_order    INTEGER,
  process_name  TEXT,
  supplier_id   UUID  REFERENCES suppliers(id) ON DELETE SET NULL,
  unit_price    NUMERIC(10,2),
  notes         TEXT
);

-- 客户订单表
CREATE TABLE customer_orders (
  id            UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number     TEXT  UNIQUE NOT NULL,
  customer_id   UUID  REFERENCES customers(id) ON DELETE SET NULL,
  order_date    DATE,
  delivery_date DATE,
  total_amount  NUMERIC(12,2),
  currency      TEXT  DEFAULT 'CNY',
  status        TEXT  DEFAULT '待确认',
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 公司生产订单表
CREATE TABLE work_orders (
  id            UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_number     TEXT  UNIQUE NOT NULL,
  customer_order_id UUID REFERENCES customer_orders(id) ON DELETE CASCADE,
  pattern_id    UUID  REFERENCES patterns(id) ON DELETE SET NULL,
  status        TEXT  DEFAULT '待生产',
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 生产订单明细
CREATE TABLE work_order_items (
  id            UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID  REFERENCES work_orders(id) ON DELETE CASCADE,
  sku_id        UUID  REFERENCES skus(id) ON DELETE SET NULL,
  quantity      INTEGER,
  unit_price    NUMERIC(10,2),
  notes         TEXT
);

-- 出库批次
CREATE TABLE shipments (
  id            UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_order_id UUID REFERENCES customer_orders(id) ON DELETE CASCADE,
  shipment_date DATE,
  batch_number  TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 出库明细
CREATE TABLE shipment_items (
  id            UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id   UUID  REFERENCES shipments(id) ON DELETE CASCADE,
  work_order_item_id UUID REFERENCES work_order_items(id) ON DELETE SET NULL,
  quantity      INTEGER
);

-- 原材料库存
CREATE TABLE raw_inventory (
  id            UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  material_name TEXT  NOT NULL,
  supplier_id   UUID  REFERENCES suppliers(id) ON DELETE SET NULL,
  unit          TEXT,
  quantity      NUMERIC(10,3) DEFAULT 0,
  unit_price    NUMERIC(10,2),
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 原材料库存变动
CREATE TABLE raw_inventory_movements (
  id            UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_inventory_id UUID REFERENCES raw_inventory(id) ON DELETE CASCADE,
  movement_type TEXT,
  quantity      NUMERIC(10,3),
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 装箱单
CREATE TABLE packing_lists (
  id            UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  pl_number     TEXT  UNIQUE NOT NULL,
  customer_order_id UUID REFERENCES customer_orders(id) ON DELETE SET NULL,
  pack_date     DATE,
  total_boxes   INTEGER DEFAULT 0,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 装箱单明细
CREATE TABLE packing_list_items (
  id            UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  packing_list_id UUID REFERENCES packing_lists(id) ON DELETE CASCADE,
  sku_id        UUID  REFERENCES skus(id) ON DELETE SET NULL,
  box_number    TEXT,
  quantity      INTEGER
);

-- ===== 第 3 步：添加软删除字段 =====

ALTER TABLE customers       ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE suppliers       ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE patterns        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE skus            ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE work_orders     ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_not_deleted       ON customers       (id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_suppliers_not_deleted       ON suppliers       (id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_patterns_not_deleted        ON patterns        (id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_skus_not_deleted            ON skus            (id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_customer_orders_not_deleted ON customer_orders (id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_work_orders_not_deleted     ON work_orders     (id) WHERE deleted_at IS NULL;

-- ===== 完成 =====
SELECT '✅ 数据库初始化完成！' AS message;
