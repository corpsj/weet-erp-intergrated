-- Add foreign key relationship between memos and app_users
-- This allows Supabase/PostgREST to allow resource embedding (e.g., select=*,author:app_users(name))

ALTER TABLE public.memos
ADD CONSTRAINT memos_created_by_fkey
FOREIGN KEY (created_by)
REFERENCES public.app_users(id)
ON DELETE SET NULL;
