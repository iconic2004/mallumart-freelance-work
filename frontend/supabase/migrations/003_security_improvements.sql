-- ==========================================================
-- MALLU MART - SECURITY & POLICY IMPROVEMENT MIGRATION
-- Run this AFTER the initial 000_full_setup.sql
-- ==========================================================

-- 1. Tighten notification RLS: users should only see their own notifications
-- Drop the overly permissive "for all" policy
DROP POLICY IF EXISTS "Authenticated users can manage notifications" ON public.notifications;
DROP POLICY IF EXISTS "Authenticated users can view notifications" ON public.notifications;

-- Notifications: users can only see/manage their own
CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own notifications"
  ON public.notifications FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notifications"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 2. Add user_id index for notifications (fast lookup)
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);

-- 3. Add index for payment_method on sales (helps payment analytics)
CREATE INDEX IF NOT EXISTS idx_sales_payment_method ON public.sales(payment_method);

-- 4. Add composite index for sales date + payment for report queries
CREATE INDEX IF NOT EXISTS idx_sales_created_at_payment ON public.sales(created_at DESC, payment_method);

-- 5. Add index for product is_active + stock for inventory queries
CREATE INDEX IF NOT EXISTS idx_products_active_stock ON public.products(is_active, stock_quantity);
