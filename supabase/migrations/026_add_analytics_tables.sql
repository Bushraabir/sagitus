-- ============================================================================
-- MIGRATION 026: ADVANCED ANALYTICS TRACKING & HISTORY TABLES
-- ============================================================================
-- 
-- This migration adds tables to track the historical performance and evolution
-- of our ML/DSA algorithms. While the previous migration (025) added tables for
-- caching current recommendations, this migration focuses on:
-- 1. Tracking Holt-Winters forecast accuracy (Predicted vs Actual).
-- 2. Logging K-Means Customer Segmentation changes over time.
-- 3. Recording daily Trending Product (EMA) scores to calculate trend velocity.
-- 
-- DESIGN PHILOSOPHY:
-- - These tables are append-only logs. They allow the admin to visualize how 
--   algorithms perform over time and how customer behavior evolves.
-- - RLS is enabled. Admins can read; the Service Role (Next.js API routes) 
--   can insert/update freely.
-- ============================================================================

-- ─── 1. FORECAST ACCURACY LOGS (Holt-Winters Tracking) ──────────────────────
-- Tracks the accuracy of demand forecasts. Once a forecasted date passes,
-- the `actual_value` is populated to calculate Mean Absolute Error (MAE)
-- and improve future alpha/beta/gamma smoothing parameters.

CREATE TABLE IF NOT EXISTS public.forecast_accuracy_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  forecast_date date NOT NULL,
  predicted_value numeric NOT NULL,
  actual_value numeric, -- Populated later via a cron job or manual admin action
  algorithm_version text DEFAULT 'holt_winters_v1',
  festival_boost_applied boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id, forecast_date)
);

CREATE INDEX IF NOT EXISTS idx_forecast_accuracy_product ON public.forecast_accuracy_logs(product_id);
CREATE INDEX IF NOT EXISTS idx_forecast_accuracy_date ON public.forecast_accuracy_logs(forecast_date);

ALTER TABLE public.forecast_accuracy_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read forecast accuracy logs"
  ON public.forecast_accuracy_logs FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Service Role can manage forecast accuracy logs"
  ON public.forecast_accuracy_logs FOR ALL
  USING (auth.role() = 'service_role');


-- ─── 2. SEGMENTATION HISTORY (K-Means Tracking) ─────────────────────────────
-- Stores historical snapshots of customer segments. Since K-Means clustering
-- is re-run periodically, this table allows the admin to see when a customer
-- transitioned from "Loyal" to "High Risk" or "Normal" to "VIP".

CREATE TABLE IF NOT EXISTS public.segmentation_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  segment text NOT NULL CHECK (segment IN ('VIP', 'Loyal', 'Normal', 'High Risk', 'Fake Orders')),
  confidence_score numeric NOT NULL DEFAULT 0,
  total_spent_at_snapshot numeric NOT NULL DEFAULT 0,
  order_count_at_snapshot int NOT NULL DEFAULT 0,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_segmentation_history_user ON public.segmentation_history(user_id);
CREATE INDEX IF NOT EXISTS idx_segmentation_history_segment ON public.segmentation_history(segment);
CREATE INDEX IF NOT EXISTS idx_segmentation_history_date ON public.segmentation_history(snapshot_date);

ALTER TABLE public.segmentation_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read segmentation history"
  ON public.segmentation_history FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Service Role can manage segmentation history"
  ON public.segmentation_history FOR ALL
  USING (auth.role() = 'service_role');


-- ─── 3. TREND VELOCITY LOGS (EMA Tracking) ──────────────────────────────────
-- Stores daily Exponential Moving Average (EMA) trend scores for products.
-- By keeping a history of these scores, we can calculate "Trend Velocity"
-- (how fast a product is becoming popular) and detect viral spikes early.

CREATE TABLE IF NOT EXISTS public.trend_velocity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  trend_score numeric NOT NULL,
  trend_status text NOT NULL CHECK (trend_status IN ('HOT', 'TRENDING', 'STABLE', 'DECLINING')),
  growth_percentage numeric NOT NULL DEFAULT 0,
  ema_3day numeric NOT NULL DEFAULT 0,
  ema_7day numeric NOT NULL DEFAULT 0,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  calculated_date date NOT NULL DEFAULT CURRENT_DATE -- Added for indexing
);

-- Create unique index on product_id and calculated_date (not using ::date cast)
CREATE UNIQUE INDEX IF NOT EXISTS idx_trend_velocity_unique_day
  ON public.trend_velocity_logs(product_id, calculated_date);

CREATE INDEX IF NOT EXISTS idx_trend_velocity_product ON public.trend_velocity_logs(product_id);
CREATE INDEX IF NOT EXISTS idx_trend_velocity_status ON public.trend_velocity_logs(trend_status);
CREATE INDEX IF NOT EXISTS idx_trend_velocity_date ON public.trend_velocity_logs(calculated_at);

ALTER TABLE public.trend_velocity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read trend velocity logs"
  ON public.trend_velocity_logs FOR SELECT
  USING (true);

CREATE POLICY "Service Role can manage trend velocity logs"
  ON public.trend_velocity_logs FOR ALL
  USING (auth.role() = 'service_role');

-- Trigger to automatically set calculated_date from calculated_at
CREATE OR REPLACE FUNCTION public.set_trend_velocity_date()
RETURNS trigger AS $$
BEGIN
  NEW.calculated_date := NEW.calculated_at::date;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_trend_velocity_date ON public.trend_velocity_logs;
CREATE TRIGGER trg_set_trend_velocity_date
  BEFORE INSERT OR UPDATE ON public.trend_velocity_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_trend_velocity_date();


-- ─── 4. ALGORITHM PERFORMANCE METRICS ───────────────────────────────────────
-- A general table to log the execution time and data volume of heavy ML jobs
-- (like Apriori, PageRank, K-Means) to monitor server load and optimize 
-- caching strategies.

CREATE TABLE IF NOT EXISTS public.ml_job_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL CHECK (job_name IN (
    'apriori_fbt', 
    'kmeans_segmentation', 
    'holt_winters_forecast', 
    'pagerank_graph', 
    'ema_trending'
  )),
  execution_time_ms int NOT NULL,
  records_processed int NOT NULL DEFAULT 0,
  status text NOT NULL CHECK (status IN ('success', 'failed', 'partial')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ml_job_metrics_name ON public.ml_job_metrics(job_name);
CREATE INDEX IF NOT EXISTS idx_ml_job_metrics_date ON public.ml_job_metrics(created_at);

ALTER TABLE public.ml_job_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read ML job metrics"
  ON public.ml_job_metrics FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Service Role can manage ML job metrics"
  ON public.ml_job_metrics FOR ALL
  USING (auth.role() = 'service_role');