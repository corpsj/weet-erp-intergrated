-- Add position and bio columns to app_users table
ALTER TABLE public.app_users 
ADD COLUMN IF NOT EXISTS position TEXT,
ADD COLUMN IF NOT EXISTS bio TEXT;
