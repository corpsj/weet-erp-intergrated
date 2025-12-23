create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table app_settings enable row level security;

drop policy if exists app_settings_all on app_settings;
create policy "app_settings_all" on app_settings for all
  using (true)
  with check (true);

-- Initial AI Model setting
insert into app_settings (key, value)
values ('ai_model', '"google/gemini-2.5-flash"')
on conflict (key) do nothing;
