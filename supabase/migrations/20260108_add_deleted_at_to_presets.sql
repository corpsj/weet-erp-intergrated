-- Add deleted_at to process_presets for soft delete
alter table process_presets add column if not exists deleted_at timestamptz;
