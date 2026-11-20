-- Métricas diárias por anúncio, vindas da Meta (e futuramente do Google)
CREATE TABLE IF NOT EXISTS ad_insights (
  platform        TEXT    NOT NULL DEFAULT 'meta',
  date            TEXT    NOT NULL,            -- AAAA-MM-DD no fuso da conta
  account_id      TEXT    NOT NULL,
  campaign_id     TEXT    NOT NULL,
  campaign_name   TEXT,
  adset_id        TEXT,
  adset_name      TEXT,
  ad_id           TEXT    NOT NULL,
  ad_name         TEXT,
  spend           REAL    NOT NULL DEFAULT 0,
  impressions     INTEGER NOT NULL DEFAULT 0,
  reach           INTEGER NOT NULL DEFAULT 0,
  clicks          INTEGER NOT NULL DEFAULT 0,
  link_clicks     INTEGER NOT NULL DEFAULT 0,
  platform_purchases      REAL NOT NULL DEFAULT 0,  -- compras que a Meta diz ter gerado
  platform_purchase_value REAL NOT NULL DEFAULT 0,
  updated_at      TEXT    NOT NULL,
  PRIMARY KEY (platform, ad_id, date)
);
CREATE INDEX IF NOT EXISTS idx_insights_date ON ad_insights(date);
CREATE INDEX IF NOT EXISTS idx_insights_campaign ON ad_insights(campaign_id);

-- Vendas reais, vindas do webhook da Kiwify
CREATE TABLE IF NOT EXISTS sales (
  order_id      TEXT PRIMARY KEY,
  source        TEXT NOT NULL DEFAULT 'kiwify',
  status        TEXT NOT NULL,             -- paid, refunded, chargedback, waiting_payment, refused...
  last_event    TEXT,
  product_name  TEXT,
  gross         REAL NOT NULL DEFAULT 0,   -- valor pago pelo cliente (R$)
  net           REAL NOT NULL DEFAULT 0,   -- valor que fica para você após taxas (R$)
  utm_source    TEXT,
  utm_medium    TEXT,
  utm_campaign  TEXT,
  utm_content   TEXT,
  utm_term      TEXT,
  sale_date     TEXT NOT NULL,             -- AAAA-MM-DD no fuso de Brasília
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  raw           TEXT
);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);

-- Histórico das sincronizações
CREATE TABLE IF NOT EXISTS sync_runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  platform    TEXT NOT NULL,
  started_at  TEXT NOT NULL,
  finished_at TEXT,
  ok          INTEGER NOT NULL DEFAULT 0,
  rows        INTEGER NOT NULL DEFAULT 0,
  error       TEXT
);
