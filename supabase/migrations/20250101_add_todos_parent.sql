alter table todos
  add column if not exists parent_id uuid references todos(id) on delete cascade;

create index if not exists todos_parent_index on todos (parent_id);
