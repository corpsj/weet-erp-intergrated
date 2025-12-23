-- [공과금 테이블 초기화 및 재설정]
-- 기존 테이블이 구버전일 경우 컬럼 누락 에러가 발생할 수 있습니다.
-- 이 스크립트는 기존 테이블을 삭제하고 최신 스키마로 다시 생성합니다.
-- 주의: 기존에 업로드된 공과금 데이터가 있다면 삭제됩니다.

-- 1. 기존 테이블 및 관련 설정 삭제 (초기화)
drop table if exists utility_bills cascade;

-- 2. 최신 스키마로 테이블 생성
create table utility_bills (
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

-- 3. 인덱스 생성
create index utility_bills_company_id_idx on utility_bills (company_id);
create index utility_bills_category_idx on utility_bills (category);
create index utility_bills_billing_month_idx on utility_bills (billing_month);

-- 4. RLS(Row Level Security) 설정
alter table utility_bills enable row level security;

-- 5. 보안 정책(Policy) 설정 - 업체별 데이터 분리
create policy "utility_bills_by_company" on utility_bills for all
  using (company_id = auth.uid())
  with check (company_id = auth.uid());
