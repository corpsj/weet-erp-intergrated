-- Create memo_folders table
create table if not exists memo_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(name, created_by)
);

-- Enable RLS (Assuming it's expected based on other tables, though I'll use admin for API)
-- For now, consistent with other tables, I'll rely on the API layer for auth.
