CREATE TABLE IF NOT EXISTS speaking_sessions (
    id SERIAL PRIMARY KEY,
    paper_id INTEGER NOT NULL REFERENCES papers(id),
    student_id INTEGER NOT NULL REFERENCES users(id),
    assignment_id INTEGER NULL REFERENCES assignments(id),
    status VARCHAR(32) DEFAULT 'active',
    summary_text TEXT NULL,
    token_estimate INTEGER DEFAULT 0,
    max_context_tokens INTEGER DEFAULT 1200,
    compaction_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS speaking_turns (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES speaking_sessions(id) ON DELETE CASCADE,
    turn_index INTEGER NOT NULL,
    speaker_role VARCHAR(32) NOT NULL,
    text TEXT NOT NULL,
    audio_url VARCHAR(512) NULL,
    token_estimate INTEGER DEFAULT 0,
    is_compacted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_speaking_sessions_student ON speaking_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_speaking_sessions_paper ON speaking_sessions(paper_id);
CREATE INDEX IF NOT EXISTS idx_speaking_turns_session ON speaking_turns(session_id);
