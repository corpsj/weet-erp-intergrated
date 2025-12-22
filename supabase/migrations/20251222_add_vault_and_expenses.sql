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

alter table vault_entries enable row level security;
alter table expense_claims enable row level security;
alter table expense_receipts enable row level security;

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

-- Supabase Storage bucket for receipts
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

alter table storage.objects enable row level security;

drop policy if exists "receipts_select" on storage.objects;
create policy "receipts_select" on storage.objects for select
  using (bucket_id = 'receipts');

drop policy if exists "receipts_insert" on storage.objects;
create policy "receipts_insert" on storage.objects for insert
  with check (bucket_id = 'receipts');

drop policy if exists "receipts_update" on storage.objects;
create policy "receipts_update" on storage.objects for update
  using (bucket_id = 'receipts')
  with check (bucket_id = 'receipts');

drop policy if exists "receipts_delete" on storage.objects;
create policy "receipts_delete" on storage.objects for delete
  using (bucket_id = 'receipts');

