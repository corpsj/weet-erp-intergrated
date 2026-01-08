-- Add soft-delete support to memos table
alter table memos add column if not exists deleted_at timestamptz;

-- Create index for performance
create index if not exists memos_deleted_at_idx on memos (deleted_at) where deleted_at is not null;
