-- ============================================================
-- 晟砜皮具 ERP 数据库设计 (CF Leather ERP)
-- 技术: Supabase (PostgreSQL)
-- 说明: 请在 Supabase SQL Editor 中按顺序执行以下语句
--
-- 核心层级结构：
--   客户订单(PO) → 公司生产订单(WO) → 纸格款号(Pattern) → SKU
-- ============================================================


-- ============ 1. 客户表 (customers) ============
-- 存储所有下单客户的基本信息
CREATE TABLE customers (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT    NOT NULL,            -- 客户名称（公司名）
  customer_code  TEXT    UNIQUE NOT NULL,      -- 客户编码，用于生成公司订单号前缀（如 TC）
  contact_person TEXT,                         -- 联系人姓名
  phone          TEXT,                         -- 联系电话
  email          TEXT,                         -- 邮箱
  address        TEXT,                         -- 地址
  wechat_id      TEXT,                         -- 企业微信ID（预留）
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON COLUMN customers.customer_code IS '客户编码，用于自动生成公司订单号前缀，如 TC、WL 等';


-- ============ 2. 供应商表 (suppliers) ============
-- 存储皮料、五金、辅料等供应商信息
CREATE TABLE suppliers (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT    NOT NULL,
  supplier_code  TEXT    UNIQUE,
  contact_person TEXT,
  phone          TEXT,
  email          TEXT,
  address        TEXT,
  wechat_id      TEXT,
  category       TEXT,   -- 供应类别：皮料/里布/五金/拉链/胶水/线/包装
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);


-- ============ 3. 纸格款号表 (patterns) ============
-- 公司内部款式编号（纸格款号），一个款式对应多个 SKU 颜色变体
-- 示例：ABC01 款式可能有 10 种颜色 SKU
CREATE TABLE patterns (
  id            UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_code  TEXT  UNIQUE NOT NULL,   -- 纸格款号，如 ABC01、WL0305
  name          TEXT  NOT NULL,           -- 款式名称
  category      TEXT,                     -- 分类：手袋/钱包/皮带/卡包/其他
  image_url     TEXT,                     -- 款式主图
  description   TEXT,                     -- 款式描述
  status        TEXT  DEFAULT 'active'
    CHECK (status IN ('active', 'discontinued')),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE patterns IS '纸格款号（公司内部款式代码），一个纸格款号下有多个 SKU 颜色变体';


-- ============ 4. SKU 表 (skus) ============
-- 客户款号，标识具体产品的某一颜色/规格变体
-- 一个 Pattern 下有多个 SKU（不同颜色）
-- 示例：ABC01 → AP1-BC-BLK（黑色）、AP1-BC-RED（红色）
CREATE TABLE skus (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_code       TEXT    UNIQUE NOT NULL,  -- 客户款号，如 AP1-BC-BLK（由客户提供）
  pattern_id     UUID    NOT NULL REFERENCES patterns(id) ON DELETE CASCADE,
  color          TEXT,                      -- 颜色，如 BLK、RED、BLU
  specifications JSONB   DEFAULT '{}',      -- 其他规格（尺寸等）
  unit_price     DECIMAL(10,2) DEFAULT 0,  -- 客户单价
  image_url      TEXT,                      -- SKU 主图（可覆盖款式图）
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE skus IS 'SKU = 客户款号，标识某款式的某一颜色/规格。由客户定义，系统无需理解其编码规律';
COMMENT ON COLUMN skus.sku_code IS '客户提供的 SKU 编码，格式由客户自定义，系统仅存储，不解析规律';


-- ============ 5. SKU 用料 BOM (sku_materials) ============
-- 每个 SKU 的物料清单（BOM）
-- 注：同一款式不同颜色 SKU 的用料可能不同（如皮料颜色不同），因此 BOM 挂在 SKU 级别
CREATE TABLE sku_materials (
  id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_id              UUID    NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
  material_name       TEXT    NOT NULL,   -- 物料名称，如"头层牛皮"
  material_type       TEXT,               -- 物料类型：皮料/里布/五金/拉链/胶水/线/包装
  specification       TEXT,               -- 规格，如"1.2mm厚 黑色"
  unit                TEXT,               -- 计量单位：米/个/卷/公斤
  quantity_per_unit   DECIMAL(10,3) DEFAULT 0,  -- 每个 SKU 用量
  supplier_id         UUID    REFERENCES suppliers(id),
  unit_cost           DECIMAL(10,2) DEFAULT 0,
  notes               TEXT
);

COMMENT ON TABLE sku_materials IS 'BOM 用料清单，挂在 SKU 级别，因为同款不同颜色的部分物料不同';


-- ============ 6. 工艺流程表 (process_steps) ============
-- 款式的生产工序，挂在纸格款号级别（同款式工序相同）
-- 对应：裁剪 → 铲皮 → 折边/上胶 → 车缝 → 装配五金 → 质检 → 包装
CREATE TABLE process_steps (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id        UUID    NOT NULL REFERENCES patterns(id) ON DELETE CASCADE,
  step_order        INTEGER NOT NULL,    -- 工序顺序（1, 2, 3...）
  step_name         TEXT    NOT NULL,    -- 工序名称
  description       TEXT,
  estimated_minutes INTEGER DEFAULT 0   -- 预估耗时（分钟）
);


-- ============ 7. 客户订单表 (customer_orders) ============
-- 客户下单记录，以客户 PO 号为唯一标识
-- 一个 PO 下可以有多个公司生产订单（每个款式一张生产订单）
CREATE TABLE customer_orders (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number      TEXT    UNIQUE NOT NULL,  -- 客户 PO 号（由客户提供，格式无规律）
  customer_id    UUID    REFERENCES customers(id),
  order_date     DATE    DEFAULT CURRENT_DATE,
  delivery_date  DATE,                      -- 交货日期
  status         TEXT    DEFAULT 'pending'
    CHECK (status IN (
      'pending',        -- 待确认
      'confirmed',      -- 已确认
      'in_production',  -- 生产中
      'quality_check',  -- 质检中
      'shipped',        -- 已发货
      'completed',      -- 已完成
      'cancelled'       -- 已取消
    )),
  total_amount   DECIMAL(12,2) DEFAULT 0,
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE customer_orders IS '客户订单（PO），由客户提供 PO 号，系统不解析其编码规律';
COMMENT ON COLUMN customer_orders.po_number IS '客户 PO 号，格式由客户自定义，如 PO260305';


-- ============ 8. 公司生产订单表 (work_orders) ============
-- 公司内部生产订单，由系统自动生成订单号
-- 格式：客户编码 + 年(2位) + 月(2位) + 序号(2位)，如 TC250401
-- 一个 PO 下对应多张生产订单（每个款式一张）；每张生产订单对应一个纸格款号
CREATE TABLE work_orders (
  id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_number   TEXT    UNIQUE NOT NULL,  -- 公司订单号（系统生成），如 TC250401
  customer_order_id   UUID    NOT NULL REFERENCES customer_orders(id) ON DELETE CASCADE,
  pattern_id          UUID    NOT NULL REFERENCES patterns(id),
  status              TEXT    DEFAULT 'pending'
    CHECK (status IN (
      'pending',        -- 待生产
      'confirmed',      -- 已确认
      'in_production',  -- 生产中
      'quality_check',  -- 质检中
      'completed',      -- 已完成
      'cancelled'       -- 已取消
    )),
  planned_start_date  DATE,   -- 计划开工日期
  planned_end_date    DATE,   -- 计划完工日期
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE work_orders IS '公司生产订单，每张对应一个款式(Pattern)，编号格式：客户编码+年+月+序号';
COMMENT ON COLUMN work_orders.work_order_number IS '格式：{客户编码}{YY}{MM}{序号}，如 TC250401（TC客户2025年4月第1单）';


-- ============ 9. 生产订单明细表 (work_order_items) ============
-- 每张生产订单包含的 SKU 列表及各 SKU 生产数量
-- 一张生产订单内可有多个 SKU（同款式的不同颜色）
CREATE TABLE work_order_items (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id   UUID    NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  sku_id          UUID    NOT NULL REFERENCES skus(id),
  quantity        INTEGER NOT NULL CHECK (quantity > 0),  -- 订单数量
  unit_price      DECIMAL(10,2) DEFAULT 0,
  subtotal        DECIMAL(12,2) DEFAULT 0,                -- = quantity × unit_price
  notes           TEXT,
  UNIQUE (work_order_id, sku_id)  -- 同一生产订单内同一 SKU 不重复
);


-- ============ 10. 出库批次表 (shipments) ============
-- 记录每次出库（分批出货）的批次信息
-- 一个 PO 可以分多次出库，每次有日期和客户出库单号
CREATE TABLE shipments (
  id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_order_id   UUID    NOT NULL REFERENCES customer_orders(id) ON DELETE CASCADE,
  shipment_date       DATE    NOT NULL,
  shipment_number     TEXT    NOT NULL,  -- 客户出库单号，如 SQ250510-001
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (customer_order_id, shipment_number)
);

COMMENT ON TABLE shipments IS '出库批次，一个 PO 可分多次出库，每次记录日期和客户出库单号';


-- ============ 11. 出库明细表 (shipment_items) ============
-- 每次出库批次中各 SKU 的实际出库数量
CREATE TABLE shipment_items (
  id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id         UUID    NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  work_order_item_id  UUID    NOT NULL REFERENCES work_order_items(id),
  quantity            INTEGER NOT NULL CHECK (quantity >= 0),
  notes               TEXT,
  UNIQUE (shipment_id, work_order_item_id)
);

COMMENT ON TABLE shipment_items IS '出库明细，记录每次出库批次中各 SKU 的出库数量';


-- ============ 12. 原材料库存表 (raw_inventory) ============
-- 原材料（皮料、五金、辅料等）的库存快照
CREATE TABLE raw_inventory (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  material_name   TEXT    NOT NULL,       -- 物料名称
  material_type   TEXT,                   -- 物料类型：皮料/里布/五金/拉链/胶水/线/包装
  specification   TEXT,                   -- 规格描述
  supplier_id     UUID    REFERENCES suppliers(id),
  warehouse       TEXT    DEFAULT '主仓库',
  quantity        DECIMAL(12,3) DEFAULT 0,
  unit            TEXT    DEFAULT '米',
  min_stock       DECIMAL(12,3) DEFAULT 0,  -- 最低库存预警线
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);


-- ============ 13. 原材料库存变动记录 (raw_inventory_movements) ============
CREATE TABLE raw_inventory_movements (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id    UUID    NOT NULL REFERENCES raw_inventory(id),
  movement_type   TEXT    NOT NULL
    CHECK (movement_type IN ('in', 'out', 'adjust')),  -- in=入库 out=出库 adjust=盘点调整
  quantity        DECIMAL(12,3) NOT NULL,
  reason          TEXT,
  operator        TEXT,
  related_work_order_id UUID REFERENCES work_orders(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);


-- ============ 14. 自动更新 updated_at 的触发器 ============
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON patterns
  FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON skus
  FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON customer_orders
  FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON work_orders
  FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON shipments
  FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON raw_inventory
  FOR EACH ROW EXECUTE FUNCTION update_modified_column();


-- ============ 15. 公司订单号自动生成函数 ============
-- 格式：{客户编码}{YY}{MM}{序号(2位)}
-- 示例：TC250401（TC客户 2025年4月 第1单）
CREATE OR REPLACE FUNCTION generate_work_order_number(
  p_customer_code TEXT,
  p_date          DATE DEFAULT CURRENT_DATE
)
RETURNS TEXT AS $$
DECLARE
  v_prefix TEXT;
  v_count  INT;
  v_seq    TEXT;
BEGIN
  v_prefix := p_customer_code
    || TO_CHAR(p_date, 'YY')
    || TO_CHAR(p_date, 'MM');

  SELECT COUNT(*) + 1 INTO v_count
  FROM work_orders
  WHERE work_order_number LIKE v_prefix || '%';

  v_seq := LPAD(v_count::TEXT, 2, '0');
  RETURN v_prefix || v_seq;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION generate_work_order_number IS
  '生成公司订单号。用法：SELECT generate_work_order_number(''TC'', CURRENT_DATE)';


-- ============ 表关系说明 ============
--
-- 层级结构（核心）：
--   customers     1 ← N  customer_orders  （一个客户有多个 PO）
--   customer_orders 1 ← N  work_orders    （一个 PO 有多个生产订单）
--   patterns      1 ← N  work_orders      （一个款式可跨多个生产订单）
--   patterns      1 ← N  skus             （一个款式有多个 SKU 颜色）
--   work_orders   1 ← N  work_order_items （一个生产订单含多个 SKU 明细）
--   skus          1 ← N  work_order_items
--
-- 出库跟踪：
--   customer_orders 1 ← N  shipments      （一个 PO 分多批次出库）
--   shipments     1 ← N  shipment_items
--   work_order_items 1 ← N  shipment_items
--
-- 物料 BOM：
--   skus          1 ← N  sku_materials    （每个 SKU 有独立 BOM）
--   suppliers     1 ← N  sku_materials
--
-- 工艺流程：
--   patterns      1 ← N  process_steps    （同款式共用工序）
--
-- 原材料库存：
--   raw_inventory 1 ← N  raw_inventory_movements
