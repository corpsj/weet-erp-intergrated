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

-- NOTE: Supabase hosted 환경에서는 `storage.objects` 소유자가 아니면 정책/버킷을 SQL로 수정할 수 없습니다.
-- 영수증 업로드는 서버(API)에서 Service Role로 처리하도록 구현되어 있으며,
-- Storage bucket(`receipts`) 생성은 Supabase Dashboard에서 1회 생성하세요.
