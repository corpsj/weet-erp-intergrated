-- Simplify expense_claims status to 'unpaid' and 'paid'
alter table expense_claims 
  alter column status set default 'unpaid';

-- Clear legacy status names and migrate to new simplified ones
update expense_claims set status = 'unpaid' where status in ('draft', 'submitted', 'rejected');
update expense_claims set status = 'paid' where status in ('approved', 'paid');

-- Update check constraint
alter table expense_claims 
  drop constraint if exists expense_claims_status_check;

alter table expense_claims 
  add constraint expense_claims_status_check 
  check (status in ('unpaid', 'paid'));
