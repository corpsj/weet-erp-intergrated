-- Migration: Add performance indexes to core ERP tables
-- Created: 2025-12-23

-- Indexes for expense_claims
CREATE INDEX IF NOT EXISTS idx_expense_claims_created_by ON public.expense_claims(created_by);
CREATE INDEX IF NOT EXISTS idx_expense_claims_spent_at ON public.expense_claims(spent_at DESC);
CREATE INDEX IF NOT EXISTS idx_expense_claims_status ON public.expense_claims(status);

-- Indexes for todos
CREATE INDEX IF NOT EXISTS idx_todos_created_by ON public.todos(created_by);
CREATE INDEX IF NOT EXISTS idx_todos_assignee_id ON public.todos(assignee_id);
CREATE INDEX IF NOT EXISTS idx_todos_parent_id ON public.todos(parent_id);
CREATE INDEX IF NOT EXISTS idx_todos_status ON public.todos(status);
CREATE INDEX IF NOT EXISTS idx_todos_due_date ON public.todos(due_date DESC);
CREATE INDEX IF NOT EXISTS idx_todos_sort_order ON public.todos(sort_order ASC);
