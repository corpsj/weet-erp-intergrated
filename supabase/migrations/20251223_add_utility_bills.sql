create table if not exists utility_bills (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  site_id uuid,
  vendor_name text,
  bill_type text check (bill_type in ('ELECTRICITY', 'WATER', 'GAS', 'TELECOM', 'TAX', 'ETC')),
  amount_due bigint,
  due_date date,
  billing_period_start date,
  billing_period_end date,
  customer_no text,
  payment_account text,
  status text not null default 'PROCESSING' check (status in ('PROCESSING', 'NEEDS_REVIEW', 'CONFIRMED', 'REJECTED')),
  confidence numeric not null default 0,
  ocr_mode text check (ocr_mode in ('TEMPLATE', 'GENERAL')),
  template_id text,
  raw_ocr_text text,
  extracted_json jsonb not null default '{}'::jsonb,
  file_url text not null,
  processed_file_url text,
  processing_stage text not null default 'PREPROCESS' check (processing_stage in ('PREPROCESS', 'TEMPLATE_OCR', 'GENERAL_OCR', 'GEMINI', 'VALIDATE', 'DONE')),
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists utility_bills_company_id_idx on utility_bills (company_id);
create index if not exists utility_bills_status_idx on utility_bills (status);
create index if not exists utility_bills_due_date_idx on utility_bills (due_date);
create index if not exists utility_bills_created_at_idx on utility_bills (created_at);

alter table utility_bills enable row level security;

drop policy if exists utility_bills_by_company on utility_bills;
create policy "utility_bills_by_company" on utility_bills for all
  using (company_id = auth.uid())
  with check (company_id = auth.uid());

-- NOTE: Storage bucket(`utility-bills`) 생성은 Supabase Dashboard에서 진행하세요.
