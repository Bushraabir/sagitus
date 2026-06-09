-- supabase/migrations/010_fix_notifications_rls.sql
-- Restrict notifications insert to service role or admins only.
-- Previously, "WITH CHECK (true)" allowed any authenticated user to insert 
-- notifications for anyone, spoofing admin alerts or other users' notifications.

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Service role can insert notifications" ON public.notifications;

-- 1. Allow the Supabase service role (used by server-side API routes) to insert freely
CREATE POLICY "Service role can insert notifications"
ON public.notifications 
FOR INSERT 
TO service_role
WITH CHECK (true);

-- 2. Allow authenticated admins to insert notifications (e.g. manual admin actions)
CREATE POLICY "Admins can insert notifications"
ON public.notifications 
FOR INSERT 
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);