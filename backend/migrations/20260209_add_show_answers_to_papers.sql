-- Migration: Add show_answers column to papers table
-- Date: 2026-02-09
-- Description: Add option to control whether students can see correct answers after submission

ALTER TABLE papers ADD COLUMN IF NOT EXISTS show_answers BOOLEAN DEFAULT TRUE;

-- Update existing papers to show answers by default
UPDATE papers SET show_answers = TRUE WHERE show_answers IS NULL;
