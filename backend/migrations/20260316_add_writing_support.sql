-- Migration: add writing support columns
-- Date: 2026-03-16

ALTER TABLE papers ADD COLUMN IF NOT EXISTS paper_type VARCHAR DEFAULT 'reading';
ALTER TABLE papers ADD COLUMN IF NOT EXISTS writing_config JSONB;

ALTER TABLE questions ADD COLUMN IF NOT EXISTS writing_task_type VARCHAR;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS prompt_asset_url VARCHAR;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS prompt_pool JSONB;

ALTER TABLE answers ADD COLUMN IF NOT EXISTS word_count INTEGER;
ALTER TABLE answers ADD COLUMN IF NOT EXISTS rubric_scores JSONB;
ALTER TABLE answers ADD COLUMN IF NOT EXISTS writing_metrics JSONB;
ALTER TABLE answers ADD COLUMN IF NOT EXISTS sentence_feedback JSONB;
ALTER TABLE answers ADD COLUMN IF NOT EXISTS selected_prompt VARCHAR;

UPDATE papers SET paper_type = 'reading' WHERE paper_type IS NULL;
