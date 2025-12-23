create extension if not exists "pgcrypto";

create table if not exists materials (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  name text not null,
  spec text,
  unit text,
  material_unit_cost numeric not null default 0,
  labor_unit_cost numeric not null default 0,
  expense_unit_cost numeric not null default 0,
  note text,
  sort_index integer,
  created_at timestamptz not null default now()
);

create unique index if not exists materials_unique
  on materials (category, name, spec, unit);

create table if not exists process_presets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists process_preset_items (
  id uuid primary key default gen_random_uuid(),
  preset_id uuid not null references process_presets(id) on delete cascade,
  cost_category text not null check (cost_category in ('material', 'labor', 'expense')),
  label text not null,
  unit text,
  quantity numeric not null default 1,
  unit_cost numeric not null default 0,
  material_id uuid references materials(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists estimates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  general_admin_type text not null default 'percent' check (general_admin_type in ('percent', 'fixed')),
  general_admin_value numeric not null default 0,
  sales_profit_type text not null default 'percent' check (sales_profit_type in ('percent', 'fixed')),
  sales_profit_value numeric not null default 0,
  vat_rate numeric not null default 10,
  created_at timestamptz not null default now()
);

create table if not exists estimate_presets (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references estimates(id) on delete cascade,
  preset_id uuid not null references process_presets(id) on delete cascade,
  quantity numeric not null default 1
);

create table if not exists estimate_items (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references estimates(id) on delete cascade,
  cost_category text not null check (cost_category in ('material', 'labor', 'expense')),
  label text not null,
  quantity numeric not null default 1,
  unit_cost numeric not null default 0,
  material_id uuid references materials(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  initials text,
  color text,
  created_at timestamptz not null default now()
);

create unique index if not exists app_users_name_unique on app_users (name);

insert into app_users (name, initials, color)
values
  ('김', '김', 'blue'),
  ('박', '박', 'gray'),
  ('이', '이', 'green')
on conflict do nothing;

create table if not exists todos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  parent_id uuid references todos(id) on delete cascade,
  assignee_id uuid references app_users(id) on delete set null,
  due_date date,
  note text,
  sort_index integer,
  created_at timestamptz not null default now()
);

create index if not exists todos_status_index on todos (status);
create index if not exists todos_due_date_index on todos (due_date);
create index if not exists todos_parent_index on todos (parent_id);

create table if not exists calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  event_date date not null,
  color text default 'gray',
  note text,
  created_at timestamptz not null default now()
);

create index if not exists calendar_events_date_index on calendar_events (event_date);

create table if not exists signup_invite_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  code_ciphertext text,
  active boolean not null default true,
  note text,
  expires_at timestamptz,
  max_uses integer,
  uses_count integer not null default 0,
  used_at timestamptz,
  used_by uuid,
  last_used_at timestamptz,
  last_used_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists signup_invite_codes_active_idx
  on signup_invite_codes (active)
  where active = true;

create index if not exists signup_invite_codes_used_at_idx
  on signup_invite_codes (used_at);

create table if not exists company_info_cards (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  pinned boolean not null default false,
  sort_index integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists company_info_cards_pinned_idx on company_info_cards (pinned);
create index if not exists company_info_cards_sort_idx on company_info_cards (sort_index);

create table if not exists memos (
  id uuid primary key default gen_random_uuid(),
  title text,
  body text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists memos_created_at_idx on memos (created_at);

create table if not exists memo_attachments (
  id uuid primary key default gen_random_uuid(),
  memo_id uuid not null references memos(id) on delete cascade,
  object_path text not null,
  filename text,
  content_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create index if not exists memo_attachments_memo_idx on memo_attachments (memo_id);

create table if not exists vault_entries (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  url text,
  username text,
  password_ciphertext text not null,
  note text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vault_entries_title_idx on vault_entries (title);
create index if not exists vault_entries_tags_idx on vault_entries using gin (tags);

create table if not exists expense_claims (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  amount numeric not null check (amount >= 0),
  spent_at date not null,
  category text,
  note text,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'rejected', 'paid')),
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  rejected_by uuid,
  rejected_at timestamptz,
  paid_by uuid,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists expense_claims_status_idx on expense_claims (status);
create index if not exists expense_claims_spent_at_idx on expense_claims (spent_at);

create table if not exists expense_receipts (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references expense_claims(id) on delete cascade,
  object_path text not null,
  filename text,
  content_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create index if not exists expense_receipts_claim_idx on expense_receipts (claim_id);



create table if not exists utility_bills (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  category text not null,
  billing_month text not null,
  amount numeric not null default 0,
  image_url text,
  note text,
  status text not null default 'processed' check (status in ('processed', 'manual', 'processing')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists utility_bills_company_id_idx on utility_bills (company_id);
create index if not exists utility_bills_category_idx on utility_bills (category);
create index if not exists utility_bills_billing_month_idx on utility_bills (billing_month);

alter table utility_bills enable row level security;
alter table materials enable row level security;
alter table process_presets enable row level security;
alter table process_preset_items enable row level security;
alter table estimates enable row level security;
alter table estimate_presets enable row level security;
alter table estimate_items enable row level security;
alter table app_users enable row level security;
alter table todos enable row level security;
alter table calendar_events enable row level security;
alter table signup_invite_codes enable row level security;
alter table vault_entries enable row level security;
alter table expense_claims enable row level security;
alter table expense_receipts enable row level security;
alter table expense_receipts enable row level security;
alter table company_info_cards enable row level security;
alter table memos enable row level security;
alter table memo_attachments enable row level security;

create or replace function consume_signup_invite_code(code_hash_input text, used_by_input uuid)
returns boolean
language plpgsql
as $$
declare
  updated_id uuid;
begin
  update signup_invite_codes
  set
    uses_count = uses_count + 1,
    last_used_at = now(),
    last_used_by = used_by_input
  where
    code_hash = code_hash_input
    and active = true
    and (expires_at is null or expires_at > now())
    and (max_uses is null or uses_count < max_uses)
  returning id into updated_id;

  return updated_id is not null;
end;
$$;

drop policy if exists materials_all on materials;
create policy "materials_all" on materials for all
  using (true)
  with check (true);

drop policy if exists presets_all on process_presets;
create policy "presets_all" on process_presets for all
  using (true)
  with check (true);

drop policy if exists preset_items_all on process_preset_items;
create policy "preset_items_all" on process_preset_items for all
  using (true)
  with check (true);

drop policy if exists estimates_all on estimates;
create policy "estimates_all" on estimates for all
  using (true)
  with check (true);

drop policy if exists estimate_presets_all on estimate_presets;
create policy "estimate_presets_all" on estimate_presets for all
  using (true)
  with check (true);

drop policy if exists estimate_items_all on estimate_items;
create policy "estimate_items_all" on estimate_items for all
  using (true)
  with check (true);

drop policy if exists app_users_all on app_users;
create policy "app_users_all" on app_users for all
  using (true)
  with check (true);

drop policy if exists todos_all on todos;
create policy "todos_all" on todos for all
  using (true)
  with check (true);

drop policy if exists calendar_events_all on calendar_events;
create policy "calendar_events_all" on calendar_events for all
  using (true)
  with check (true);

drop policy if exists vault_entries_all on vault_entries;
create policy "vault_entries_all" on vault_entries for all
  using (true)
  with check (true);

drop policy if exists expense_claims_all on expense_claims;
create policy "expense_claims_all" on expense_claims for all
  using (true)
  with check (true);

drop policy if exists expense_receipts_all on expense_receipts;
create policy "expense_receipts_all" on expense_receipts for all
  using (true)
  with check (true);

drop policy if exists ai_settings_all on ai_settings;
create policy "ai_settings_all" on ai_settings for all
  using (true)
  with check (true);

drop policy if exists utility_bills_by_company on utility_bills;
create policy "utility_bills_by_company" on utility_bills for all
  using (company_id = auth.uid())
  with check (company_id = auth.uid());

-- NOTE: Storage bucket/policy는 Supabase Dashboard에서 관리하세요.

drop policy if exists company_info_cards_all on company_info_cards;
create policy "company_info_cards_all" on company_info_cards for all
  using (true)
  with check (true);

drop policy if exists memos_all on memos;
create policy "memos_all" on memos for all
  using (true)
  with check (true);

drop policy if exists memo_attachments_all on memo_attachments;
create policy "memo_attachments_all" on memo_attachments for all
  using (true)
  with check (true);
