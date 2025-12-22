-- Drop tags index
drop index if exists vault_entries_tags_idx;

-- Drop tags column
alter table vault_entries drop column if exists tags;
