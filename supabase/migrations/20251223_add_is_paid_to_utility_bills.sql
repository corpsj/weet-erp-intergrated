-- Migration to add is_paid column to utility_bills table
ALTER TABLE utility_bills ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT FALSE;
