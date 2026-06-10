-- supabase/migrations/015_inventory_on_confirmation.sql
-- MODIFICATION: Changes inventory logic so stock is ONLY reduced when the admin confirms the order.
-- 1. Adds an 'inventory_reduced' flag to the orders table to ensure stock is deducted exactly once.
-- 2. Overwrites the order creation RPC to ONLY validate stock availability, NOT reduce it.
-- 3. Creates a new atomic RPC 'confirm_order_and_reduce_stock' that handles status updates, 
--    delivery timeline logging, and atomic stock reduction in a single transaction.

-- 1. Add flag to orders table to track if stock was already reduced for this order
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS inventory_reduced boolean DEFAULT false;

-- 2. Overwrite the order creation RPC to validate stock but NOT reduce it.
-- This allows customers to place orders, but the actual inventory deduction 
-- is deferred until the admin explicitly confirms the order.
CREATE OR REPLACE FUNCTION public.create_order_with_stock_check(
    p_user_id      uuid,
    p_items        jsonb,
    p_total        numeric,
    p_bkash_invoice text
)
RETURNS uuid AS $$
DECLARE
    v_order_id   uuid;
    v_item       jsonb;
    v_stock      integer;
    v_product_id uuid;
    v_quantity   int;
    v_unit_price numeric;
BEGIN
    -- First pass: Validate all items have sufficient stock
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::uuid;
        v_quantity   := (v_item->>'quantity')::int;
        
        SELECT stock_quantity INTO v_stock
        FROM public.products
        WHERE id = v_product_id;
        
        IF v_stock IS NULL THEN
            RAISE EXCEPTION 'product_not_found:%', v_product_id;
        END IF;
        
        IF v_stock < v_quantity THEN
            RAISE EXCEPTION 'insufficient_stock:%', v_product_id;
        END IF;
    END LOOP;

    -- Second pass: Create order and items (Stock is NOT reduced here)
    INSERT INTO public.orders (
        user_id, total, status, bkash_invoice, delivery_status, delivery_steps, inventory_reduced
    )
    VALUES (
        p_user_id, p_total, 'pending', p_bkash_invoice, 'order_placed', '[]'::jsonb, false
    )
    RETURNING id INTO v_order_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::uuid;
        v_quantity   := (v_item->>'quantity')::int;
        v_unit_price := (v_item->>'unit_price')::numeric;

        INSERT INTO public.order_items (order_id, product_id, quantity, unit_price)
        VALUES (v_order_id, v_product_id, v_quantity, v_unit_price);
    END LOOP;

    RETURN v_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create a new atomic RPC for the Admin to confirm order and reduce stock exactly once
CREATE OR REPLACE FUNCTION public.confirm_order_and_reduce_stock(
    p_order_id uuid,
    p_new_status text
)
RETURNS jsonb AS $$
DECLARE
    v_order record;
    v_item record;
    v_current_stock int;
    v_steps jsonb;
    v_label text;
    v_stock_reduced_now boolean;
BEGIN
    -- Fetch order and lock it for update to prevent race conditions
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    
    IF v_order IS NULL THEN
        RAISE EXCEPTION 'order_not_found';
    END IF;

    -- If stock hasn't been reduced yet, reduce it now
    IF NOT v_order.inventory_reduced THEN
        FOR v_item IN 
            SELECT product_id, quantity FROM public.order_items WHERE order_id = p_order_id
        LOOP
            SELECT stock_quantity INTO v_current_stock 
            FROM public.products WHERE id = v_item.product_id FOR UPDATE;
            
            IF v_current_stock >= v_item.quantity THEN
                UPDATE public.products 
                SET stock_quantity = stock_quantity - v_item.quantity 
                WHERE id = v_item.product_id;
            ELSE
                -- Safety fallback: if stock is somehow less than ordered, set to 0
                UPDATE public.products 
                SET stock_quantity = 0 
                WHERE id = v_item.product_id;
            END IF;
            
            -- Sync in_stock boolean based on new quantity
            UPDATE public.products 
            SET in_stock = (stock_quantity > 0) 
            WHERE id = v_item.product_id;
        END LOOP;
        
        -- Mark order as inventory reduced so it never happens again
        UPDATE public.orders SET inventory_reduced = true WHERE id = p_order_id;
        v_stock_reduced_now := true;
    ELSE
        v_stock_reduced_now := false;
    END IF;

    -- Map status to human-readable label for the delivery timeline
    v_label := CASE 
        WHEN p_new_status = 'confirmed' THEN 'Order Confirmed'
        WHEN p_new_status = 'processing' THEN 'Processing'
        WHEN p_new_status = 'shipped' THEN 'Shipped'
        WHEN p_new_status = 'out_for_delivery' THEN 'Out for Delivery'
        WHEN p_new_status = 'delivered' THEN 'Delivered'
        WHEN p_new_status = 'cancelled' THEN 'Cancelled'
        ELSE p_new_status
    END;

    -- Append new step to the delivery timeline JSONB array
    v_steps := COALESCE(v_order.delivery_steps, '[]'::jsonb) || jsonb_build_object(
        'status', p_new_status,
        'label', v_label,
        'timestamp', now()::text
    );

    -- Update the order status, delivery status, and timeline
    UPDATE public.orders 
    SET 
        delivery_status = p_new_status,
        status = CASE 
            WHEN p_new_status = 'delivered' THEN 'fulfilled'
            WHEN p_new_status = 'cancelled' THEN 'cancelled'
            ELSE 'pending'
        END,
        delivery_steps = v_steps,
        updated_at = now()
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'success', true, 
        'inventory_reduced_now', v_stock_reduced_now,
        'delivery_status', p_new_status
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users (admins)
GRANT EXECUTE ON FUNCTION confirm_order_and_reduce_stock(uuid, text) TO authenticated;