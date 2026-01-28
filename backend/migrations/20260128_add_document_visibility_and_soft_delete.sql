-- Add soft-delete columns to documents
ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

-- Create document_class_visibility table
CREATE TABLE IF NOT EXISTS document_class_visibility (
    id SERIAL PRIMARY KEY,
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    visible BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (document_id, class_id)
);

CREATE INDEX IF NOT EXISTS ix_document_class_visibility_document_id
    ON document_class_visibility (document_id);

CREATE INDEX IF NOT EXISTS ix_document_class_visibility_class_id
    ON document_class_visibility (class_id);
