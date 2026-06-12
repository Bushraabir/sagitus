-- ============================================================================
-- MIGRATION 025: RECOMMENDATION & ANALYTICS TABLES
-- ============================================================================
-- 
-- This migration adds the database schema required to support the new 
-- ML/DSA features: Collaborative Filtering, Apriori (Frequently Bought Together),
-- K-Means Customer Segmentation, Product Graph (PageRank), Holt-Winters 
-- Demand Forecasting, and Smart Inventory Restocking.
-- 
-- DESIGN PHILOSOPHY:
-- - Analytics tables use UUID columns instead of strict Foreign Keys to 
--   preserve historical data even if a product is hard-deleted.
-- - Row Level Security (RLS) is enabled. Admins can read/write; the service 
--   role (used by Next.js API routes) can insert/update freely.
-- - Caching tables are included to prevent heavy ML computations on every request.
-- ============================================================================

-- ─── 1. PRODUCT INTERACTIONS (For Collaborative Filtering) ──────────────────
-- Tracks user behavior (views, clicks, purchases) to build the User-Item Matrix
-- required for Cosine Similarity, KNN, and SVD algorithms.

CREATE TABLE IF NOT EXISTS public.product_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product_id uuid NOT NULL,
  interaction_type text NOT NULL CHECK (interaction_type IN ('view', 'click', 'add_to_cart', 'purchase')),
  weight numeric NOT NULL DEFAULT 1.0, -- e.g., purchase=5.0, view=1.0
  session_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_interactions_user_id ON public.product_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_product_interactions_product_id ON public.product_interactions(product_id);
CREATE INDEX IF NOT EXISTS idx_product_interactions_type ON public.product_interactions(interaction_type);
CREATE INDEX IF NOT EXISTS idx_product_interactions_created_at ON public.product_interactions(created_at DESC);

ALTER TABLE public.product_interactions ENABLE ROW LEVEL SECURITY;

-- Users can read their own interactions
CREATE POLICY "Users can read own interactions"
  ON public.product_interactions FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own interactions
CREATE POLICY "Users can insert own interactions"
  ON public.product_interactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Admins and Service Role can read all interactions for analytics
CREATE POLICY "Admins and Service Role can read all interactions"
  ON public.product_interactions FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    OR auth.role() = 'service_role'
  );


-- ─── 2. FREQUENTLY BOUGHT TOGETHER (Apriori Cache) ──────────────────────────
-- Stores the results of the Apriori association rule mining algorithm so we 
-- don't have to recompute support, confidence, and lift on every page load.

CREATE TABLE IF NOT EXISTS public.frequently_bought_together (
  product_a_id uuid NOT NULL,
  product_b_id uuid NOT NULL,
  support numeric NOT NULL,       -- P(A ∩ B)
  confidence numeric NOT NULL,    -- P(B|A)
  lift numeric NOT NULL,          -- P(B|A) / P(B)
  frequency int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_a_id, product_b_id)
);

CREATE INDEX IF NOT EXISTS idx_fbt_product_a ON public.frequently_bought_together(product_a_id);
CREATE INDEX IF NOT EXISTS idx_fbt_product_b ON public.frequently_bought_together(product_b_id);

ALTER TABLE public.frequently_bought_together ENABLE ROW LEVEL SECURITY;

-- Public can read FBT recommendations (used in customer-facing product pages)
CREATE POLICY "Public can read FBT recommendations"
  ON public.frequently_bought_together FOR SELECT
  USING (true);

-- Only Admins/Service Role can update the cache
CREATE POLICY "Admins and Service Role can manage FBT cache"
  ON public.frequently_bought_together FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    OR auth.role() = 'service_role'
  );


-- ─── 3. CUSTOMER SEGMENTS (K-Means Clustering Cache) ────────────────────────
-- Stores the output of the K-Means clustering algorithm. Segments customers 
-- into VIP, Loyal, Normal, High Risk, and Fake Orders based on spending 
-- frequency, monetary value, and order variance.

CREATE TABLE IF NOT EXISTS public.customer_segments (
  user_id uuid PRIMARY KEY,
  segment text NOT NULL CHECK (segment IN ('VIP', 'Loyal', 'Normal', 'High Risk', 'Fake Orders')),
  total_spent numeric NOT NULL DEFAULT 0,
  order_count int NOT NULL DEFAULT 0,
  avg_order_value numeric NOT NULL DEFAULT 0,
  order_variance numeric NOT NULL DEFAULT 0,
  confidence_score numeric NOT NULL DEFAULT 0, -- 0.0 to 1.0
  recommended_discount int NOT NULL DEFAULT 0, -- Suggested discount %
  top_category text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_segments_segment ON public.customer_segments(segment);

ALTER TABLE public.customer_segments ENABLE ROW LEVEL SECURITY;

-- Users can read their own segment (optional, for gamification)
CREATE POLICY "Users can read own segment"
  ON public.customer_segments FOR SELECT
  USING (auth.uid() = user_id);

-- Admins and Service Role can manage segments
CREATE POLICY "Admins and Service Role can manage segments"
  ON public.customer_segments FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    OR auth.role() = 'service_role'
  );


-- ─── 4. PRODUCT GRAPH EDGES (PageRank & Random Walk) ────────────────────────
-- Represents the directed graph of product relationships. Edges are weighted 
-- based on co-purchases, category similarity, and attribute matching.
-- Used by PageRank to find "hub" products and RWR to find similar items.

CREATE TABLE IF NOT EXISTS public.product_graph_edges (
  product_a_id uuid NOT NULL,
  product_b_id uuid NOT NULL,
  weight numeric NOT NULL DEFAULT 1.0,
  relationship_type text NOT NULL CHECK (relationship_type IN ('co_purchase', 'same_category', 'similar_attributes')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_a_id, product_b_id, relationship_type)
);

CREATE INDEX IF NOT EXISTS idx_graph_edges_a ON public.product_graph_edges(product_a_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_b ON public.product_graph_edges(product_b_id);

ALTER TABLE public.product_graph_edges ENABLE ROW LEVEL SECURITY;

-- Public can read graph edges (used for "Similar Products" API)
CREATE POLICY "Public can read product graph edges"
  ON public.product_graph_edges FOR SELECT
  USING (true);

-- Only Admins/Service Role can update the graph
CREATE POLICY "Admins and Service Role can manage graph edges"
  ON public.product_graph_edges FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    OR auth.role() = 'service_role'
  );


-- ─── 5. DEMAND FORECAST CACHE (Holt-Winters Predictions) ────────────────────
-- Stores the output of the Holt-Winters Triple Exponential Smoothing algorithm.
-- Includes festival boost multipliers and confidence intervals for stock-out 
-- risk analysis.

CREATE TABLE IF NOT EXISTS public.demand_forecast_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  forecast_date date NOT NULL,
  predicted_value numeric NOT NULL,
  lower_bound numeric NOT NULL,
  upper_bound numeric NOT NULL,
  is_festival_period boolean NOT NULL DEFAULT false,
  festival_name text,
  boost_factor numeric DEFAULT 1.0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id, forecast_date)
);

CREATE INDEX IF NOT EXISTS idx_forecast_product_id ON public.demand_forecast_cache(product_id);
CREATE INDEX IF NOT EXISTS idx_forecast_date ON public.demand_forecast_cache(forecast_date);

ALTER TABLE public.demand_forecast_cache ENABLE ROW LEVEL SECURITY;

-- Admins can read forecasts for the dashboard
CREATE POLICY "Admins can read demand forecasts"
  ON public.demand_forecast_cache FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    OR auth.role() = 'service_role'
  );

-- Only Service Role can insert/update forecasts (via API routes)
CREATE POLICY "Service Role can manage demand forecasts"
  ON public.demand_forecast_cache FOR ALL
  USING (auth.role() = 'service_role');


-- ─── 6. SMART RESTOCK ALERTS (Inventory Management) ─────────────────────────
-- Stores the calculated Reorder Points, Safety Stock, and EOQ for each product.
-- Used by the admin dashboard to highlight critical stock-outs before they happen.

CREATE TABLE IF NOT EXISTS public.restock_alerts (
  product_id uuid PRIMARY KEY,
  reorder_point int NOT NULL DEFAULT 0,
  safety_stock int NOT NULL DEFAULT 0,
  lead_time_demand int NOT NULL DEFAULT 0,
  recommended_order_quantity int NOT NULL DEFAULT 0,
  eoq int NOT NULL DEFAULT 0, -- Economic Order Quantity
  days_until_stockout int NOT NULL DEFAULT 999,
  urgency text NOT NULL CHECK (urgency IN ('critical', 'high', 'medium', 'low', 'none')),
  estimated_cost numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_restock_urgency ON public.restock_alerts(urgency);
CREATE INDEX IF NOT EXISTS idx_restock_days_until_stockout ON public.restock_alerts(days_until_stockout);

ALTER TABLE public.restock_alerts ENABLE ROW LEVEL SECURITY;

-- Admins can read restock alerts
CREATE POLICY "Admins can read restock alerts"
  ON public.restock_alerts FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    OR auth.role() = 'service_role'
  );

-- Only Service Role can update alerts
CREATE POLICY "Service Role can manage restock alerts"
  ON public.restock_alerts FOR ALL
  USING (auth.role() = 'service_role');


-- ─── 7. HELPER: UPDATED_AT TRIGGER FUNCTION ─────────────────────────────────
-- Automatically updates the `updated_at` column on any table that has it.

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to all new tables that have an updated_at column
DROP TRIGGER IF EXISTS trg_fbt_updated_at ON public.frequently_bought_together;
CREATE TRIGGER trg_fbt_updated_at
  BEFORE UPDATE ON public.frequently_bought_together
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_segments_updated_at ON public.customer_segments;
CREATE TRIGGER trg_segments_updated_at
  BEFORE UPDATE ON public.customer_segments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_graph_edges_updated_at ON public.product_graph_edges;
CREATE TRIGGER trg_graph_edges_updated_at
  BEFORE UPDATE ON public.product_graph_edges
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_restock_updated_at ON public.restock_alerts;
CREATE TRIGGER trg_restock_updated_at
  BEFORE UPDATE ON public.restock_alerts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();