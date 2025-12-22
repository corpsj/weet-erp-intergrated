create table if not exists signup_invite_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  active boolean not null default true,
  note text,
  expires_at timestamptz,
  used_at timestamptz,
  used_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists signup_invite_codes_active_idx
  on signup_invite_codes (active)
  where active = true;

create index if not exists signup_invite_codes_used_at_idx
  on signup_invite_codes (used_at);

alter table signup_invite_codes enable row level security;

