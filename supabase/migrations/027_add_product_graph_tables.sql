-- ============================================================================
-- MIGRATION 027: PRODUCT GRAPH & RECOMMENDATION CACHE TABLES
-- ============================================================================
-- 
-- This migration adds tables to support the Product Graph Recommendation Engine
-- (PageRank & Random Walk with Restart). 
-- 
-- DESIGN PHILOSOPHY:
-- - `product_graph_edges`: Stores the weighted relationships between products.
-- - `product_graph_scores`: Caches the computed PageRank importance scores.
-- - RLS is enabled. Public/API can read; Service Role/Admins can write.
-- - Uses DROP IF EXISTS to ensure the migration is idempotent and safe to re-run.
-- ============================================================================

-- ─── 1. PRODUCT GRAPH EDGES (Relationship Cache) ───────────────────────────
-- Stores the directed edges of the product graph. 
-- Edges are created based on co-purchases, category similarity, or manual admin overrides.

CREATE TABLE IF NOT EXISTS public.product_graph_edges (
  product_a_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_b_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  weight numeric NOT NULL DEFAULT 1.0 CHECK (weight >= 0),
  relationship_type text NOT NULL CHECK (relationship_type IN ('co_purchase', 'same_category', 'similar_attributes', 'manual_override')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_a_id, product_b_id, relationship_type)
);

-- Indexes for fast graph traversal (finding neighbors of a node)
CREATE INDEX IF NOT EXISTS idx_graph_edges_from ON public.product_graph_edges(product_a_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_to ON public.product_graph_edges(product_b_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_type ON public.product_graph_edges(relationship_type);

ALTER TABLE public.product_graph_edges ENABLE ROW LEVEL SECURITY;

-- FIX: Drop existing policies before creating them to prevent "already exists" errors
DROP POLICY IF EXISTS "Public can read product graph edges" ON public.product_graph_edges;
CREATE POLICY "Public can read product graph edges"
  ON public.product_graph_edges FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Service Role and Admins can manage graph edges" ON public.product_graph_edges;
CREATE POLICY "Service Role and Admins can manage graph edges"
  ON public.product_graph_edges FOR ALL
  USING (
    auth.role() = 'service_role' 
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );


-- ─── 2. PRODUCT GRAPH SCORES (PageRank Cache) ───────────────────────────────
-- Caches the computed PageRank scores for each product.
-- This prevents the API from having to run the iterative PageRank algorithm 
-- on every single request. It can be updated via a cron job or webhook.

CREATE TABLE IF NOT EXISTS public.product_graph_scores (
  product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  pagerank_score numeric NOT NULL DEFAULT 0.0 CHECK (pagerank_score >= 0),
  community_id int, -- Optional: assigned cluster/community from community detection
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_graph_scores_pagerank ON public.product_graph_scores(pagerank_score DESC);
CREATE INDEX IF NOT EXISTS idx_graph_scores_community ON public.product_graph_scores(community_id);

ALTER TABLE public.product_graph_scores ENABLE ROW LEVEL SECURITY;

-- FIX: Drop existing policies before creating them
DROP POLICY IF EXISTS "Public can read product graph scores" ON public.product_graph_scores;
CREATE POLICY "Public can read product graph scores"
  ON public.product_graph_scores FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Service Role and Admins can manage graph scores" ON public.product_graph_scores;
CREATE POLICY "Service Role and Admins can manage graph scores"
  ON public.product_graph_scores FOR ALL
  USING (
    auth.role() = 'service_role' 
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );


-- ─── 3. HELPER: UPDATED_AT TRIGGERS ──────────────────────────────────────────
-- Automatically updates the `updated_at` column on the edges and scores tables.

DROP TRIGGER IF EXISTS trg_graph_edges_updated_at ON public.product_graph_edges;
CREATE TRIGGER trg_graph_edges_updated_at
  BEFORE UPDATE ON public.product_graph_edges
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_graph_scores_updated_at ON public.product_graph_scores;
CREATE TRIGGER trg_graph_scores_updated_at
  BEFORE UPDATE ON public.product_graph_scores
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();