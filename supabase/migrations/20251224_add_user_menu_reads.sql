-- Create a table to track the last read time for each menu by each user
create table if not exists user_menu_reads (
  user_id uuid references auth.users(id) on delete cascade not null,
  menu_id text not null,
  last_read_at timestamp with time zone default now() not null,
  primary key (user_id, menu_id)
);

-- Enable RLS
alter table user_menu_reads enable row level security;

-- Policies
create policy "Users can view their own menu reads"
  on user_menu_reads for select
  using (auth.uid() = user_id);

create policy "Users can insert their own menu reads"
  on user_menu_reads for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own menu reads"
  on user_menu_reads for update
  using (auth.uid() = user_id);

-- Create a function to update last_read_at
create or replace function update_user_menu_read(p_menu_id text)
returns void
language plpgsql
security definer
as $$
begin
  insert into user_menu_reads (user_id, menu_id, last_read_at)
  values (auth.uid(), p_menu_id, now())
  on conflict (user_id, menu_id)
  do update set last_read_at = now();
end;
$$;
