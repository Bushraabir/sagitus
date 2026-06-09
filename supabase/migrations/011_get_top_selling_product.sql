-- supabase/migrations/011_get_top_selling_product.sql
CREATE OR REPLACE FUNCTION get_top_selling_product()
RETURNS TABLE (
  id uuid,
  name text,
  image_url text,
  images text[],
  total_sold bigint
)
LANGUAGE sql
STABLE
AS $$
  SELECT 
    p.id,
    p.name,
    p.image_url,
    p.images,
    SUM(oi.quantity) as total_sold
  FROM order_items oi
  JOIN products p ON oi.product_id = p.id
  JOIN orders o ON oi.order_id = o.id
  WHERE o.status = 'fulfilled'
  GROUP BY p.id, p.name, p.image_url, p.images
  ORDER BY total_sold DESC
  LIMIT 1;
$$;