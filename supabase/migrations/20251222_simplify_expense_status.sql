-- Remove 'draft' from status and change default to 'submitted'
alter table expense_claims 
  alter column status set default 'submitted';

-- Update existing 'draft' entries to 'submitted' (if any)
update expense_claims set status = 'submitted' where status = 'draft';

-- Update check constraint
alter table expense_claims 
  drop constraint if exists expense_claims_status_check;

alter table expense_claims 
  add constraint expense_claims_status_check 
  check (status in ('submitted', 'approved', 'rejected', 'paid'));
