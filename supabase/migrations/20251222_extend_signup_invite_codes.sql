alter table signup_invite_codes
  add column if not exists code_ciphertext text,
  add column if not exists max_uses integer,
  add column if not exists uses_count integer not null default 0,
  add column if not exists last_used_at timestamptz,
  add column if not exists last_used_by uuid;

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

