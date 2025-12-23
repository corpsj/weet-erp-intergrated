-- Add tax_invoices and bank_transactions tables

create table if not exists tax_invoices (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('sales', 'purchase')),
  issue_date date not null,
  supplier_name text not null,
  supplier_reg_number text,
  receiver_name text not null,
  receiver_reg_number text,
  amount numeric not null,
  vat numeric not null,
  total_amount numeric not null,
  description text,
  status text not null default 'issued' check (status in ('issued', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tax_invoices_issue_date_idx on tax_invoices (issue_date);
create index if not exists tax_invoices_type_idx on tax_invoices (type);

create table if not exists bank_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_date timestamptz not null default now(),
  type text not null check (type in ('deposit', 'withdrawal')),
  amount numeric not null check (amount >= 0),
  description text,
  bank_name text,
  account_number text,
  balance_after numeric,
  category text,
  relation_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bank_transactions_transaction_date_idx on bank_transactions (transaction_date);
create index if not exists bank_transactions_type_idx on bank_transactions (type);

-- Enable RLS
alter table tax_invoices enable row level security;
alter table bank_transactions enable row level security;

-- Policies
drop policy if exists tax_invoices_all on tax_invoices;
create policy "tax_invoices_all" on tax_invoices for all
  using (true)
  with check (true);

drop policy if exists bank_transactions_all on bank_transactions;
create policy "bank_transactions_all" on bank_transactions for all
  using (true)
  with check (true);
