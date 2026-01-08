-- Add pinning and folder support to memos table
alter table memos add column if not exists is_pinned boolean not null default false;
alter table memos add column if not exists folder text;

-- Create indexes for performance
create index if not exists memos_pinned_idx on memos (is_pinned) where is_pinned = true;
create index if not exists memos_folder_idx on memos (folder);
