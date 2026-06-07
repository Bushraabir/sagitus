-- supabase/migrations/006_delivery_and_categories.sql

-- Categories table
CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  description text,
  color text DEFAULT '#f97316',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Categories are publicly readable"
  ON public.categories FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage categories"
  ON public.categories FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Seed default categories
INSERT INTO public.categories (name, slug, sort_order) VALUES
  ('General', 'general', 0),
  ('Clothing', 'clothing', 1),
  ('Electronics', 'electronics', 2),
  ('Food', 'food', 3),
  ('Home', 'home', 4),
  ('Beauty', 'beauty', 5),
  ('Sports', 'sports', 6),
  ('Other', 'other', 99)
ON CONFLICT (name) DO NOTHING;

-- Add category_id FK to products (keep text category column for backward compat)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'General',
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL;

-- Delivery tracking columns on orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'order_placed'
    CHECK (delivery_status IN (
      'order_placed', 'confirmed', 'processing',
      'shipped', 'out_for_delivery', 'delivered', 'cancelled'
    )),
  ADD COLUMN IF NOT EXISTS delivery_steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS bkash_payment_id text,
  ADD COLUMN IF NOT EXISTS bkash_trx_id text,
  ADD COLUMN IF NOT EXISTS bkash_invoice text,
  ADD COLUMN IF NOT EXISTS delivery_address text,
  ADD COLUMN IF NOT EXISTS customer_note text;

-- Allow admins to update orders (delivery status)
DROP POLICY IF EXISTS "Admins can update orders" ON public.orders;
CREATE POLICY "Admins can update orders"
  ON public.orders FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Allow service role to update orders (for bKash callbacks)
DROP POLICY IF EXISTS "Service role can update orders" ON public.orders;
CREATE POLICY "Service role can update orders"
  ON public.orders FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Function: update delivery status and append step to delivery_steps log
CREATE OR REPLACE FUNCTION public.update_order_delivery(
  p_order_id uuid,
  p_status text,
  p_label text
)
RETURNS void AS $$
BEGIN
  UPDATE public.orders
  SET
    delivery_status = p_status,
    delivery_steps = delivery_steps || jsonb_build_object(
      'status', p_status,
      'label', p_label,
      'timestamp', now()::text
    ),
    updated_at = now()
  WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.update_order_delivery(uuid, text, text) TO authenticated;

-- Backfill delivery_status from existing order status
UPDATE public.orders
SET delivery_status = CASE
  WHEN status = 'fulfilled' THEN 'delivered'
  WHEN status = 'cancelled' THEN 'cancelled'
  WHEN status = 'pending'   THEN 'order_placed'
  ELSE 'order_placed'
END
WHERE delivery_status = 'order_placed' OR delivery_status IS NULL;

-- Index on delivery_status for admin filtering
CREATE INDEX IF NOT EXISTS idx_orders_delivery_status ON public.orders(delivery_status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at      ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_category      ON public.products(category);