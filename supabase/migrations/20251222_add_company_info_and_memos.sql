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

alter table company_info_cards enable row level security;
alter table memos enable row level security;
alter table memo_attachments enable row level security;

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

-- NOTE: Storage bucket(`attachments`) 생성은 Supabase Dashboard에서 1회 생성하세요.
-- 업로드/다운로드는 서버(API)에서 Service Role로 처리합니다.

