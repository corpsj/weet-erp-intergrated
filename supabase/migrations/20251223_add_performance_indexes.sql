-- Migration: Add performance indexes to core ERP tables (Corrected)
-- Created: 2025-12-23

-- Indexes for expense_claims
-- (Note: spent_at and status indexes might already exist, but using IF NOT EXISTS is safe)
CREATE INDEX IF NOT EXISTS idx_expense_claims_created_by ON public.expense_claims(created_by);
CREATE INDEX IF NOT EXISTS idx_expense_claims_spent_at ON public.expense_claims(spent_at DESC);
CREATE INDEX IF NOT EXISTS idx_expense_claims_status ON public.expense_claims(status);

-- Indexes for todos
-- (Note: assignee_id and parent_id are important for filtering/tree building)
CREATE INDEX IF NOT EXISTS idx_todos_assignee_id ON public.todos(assignee_id);
CREATE INDEX IF NOT EXISTS idx_todos_parent_id ON public.todos(parent_id);
CREATE INDEX IF NOT EXISTS idx_todos_due_date ON public.todos(due_date DESC);
CREATE INDEX IF NOT EXISTS idx_todos_sort_index ON public.todos(sort_index ASC);
-- status index already exists as 'todos_status_index' in schema.sql
