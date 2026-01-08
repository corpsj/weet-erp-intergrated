-- Add sort_index to process_preset_items
alter table process_preset_items add column if not exists sort_index integer;

-- Initialize sort_index for existing items based on created_at
with numbered_items as (
  select id, row_number() over (partition by preset_id order by created_at) as nr
  from process_preset_items
)
update process_preset_items
set sort_index = numbered_items.nr
from numbered_items
where process_preset_items.id = numbered_items.id;
