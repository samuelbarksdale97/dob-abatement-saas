-- ============================================================================
-- Migration 015: Fix handle_new_user() — add SET search_path + schema-qualify
-- ============================================================================
-- Root cause of "Database error creating new user" on the invite→signup flow:
-- handle_new_user() is SECURITY DEFINER but had NO `SET search_path` (unlike
-- custom_access_token_hook). When it runs inside the supabase_auth_admin session
-- during auth user creation, the unqualified `profiles` table and `user_role`
-- type don't resolve, so the trigger raises and GoTrue reports a generic
-- "Database error creating new user".
--
-- Reproduced: admin.createUser WITHOUT org_id succeeds; WITH org_id (which fires
-- this trigger) fails. The identical INSERT run as service_role succeeds.
--
-- Fix: pin search_path = public and schema-qualify all references. Idempotent
-- CREATE OR REPLACE; the existing on_auth_user_created trigger keeps pointing here.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only create a profile if org_id is provided in the user metadata.
  IF NEW.raw_user_meta_data ->> 'org_id' IS NOT NULL THEN
    INSERT INTO public.profiles (id, org_id, full_name, email, role)
    VALUES (
      NEW.id,
      (NEW.raw_user_meta_data ->> 'org_id')::uuid,
      COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
      NEW.email,
      COALESCE((NEW.raw_user_meta_data ->> 'role')::public.user_role, 'CONTRACTOR')
    );
  END IF;
  RETURN NEW;
END;
$$;
