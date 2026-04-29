CREATE TABLE IF NOT EXISTS schools (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    external_ref VARCHAR(128) UNIQUE,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS school_memberships (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES schools(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    role VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_school_membership_user_role UNIQUE (school_id, user_id, role)
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES schools(id),
    platform VARCHAR(64) NOT NULL DEFAULT 'ai4school',
    plan VARCHAR(64) NOT NULL DEFAULT 'trial',
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    features_json TEXT NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS llm_secrets (
    id SERIAL PRIMARY KEY,
    owner_type VARCHAR(32) NOT NULL,
    owner_id INTEGER,
    provider VARCHAR(32) NOT NULL,
    base_url VARCHAR(512),
    secret_value TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    quota_total DOUBLE PRECISION,
    quota_used DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS llm_usage (
    id SERIAL PRIMARY KEY,
    teacher_id INTEGER REFERENCES users(id),
    school_id INTEGER REFERENCES schools(id),
    platform VARCHAR(64) NOT NULL DEFAULT 'ai4school',
    feature VARCHAR(128) NOT NULL,
    provider VARCHAR(32) NOT NULL,
    model VARCHAR(128) NOT NULL,
    key_source VARCHAR(32) NOT NULL,
    estimated_usage DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS global_user_maps (
    id SERIAL PRIMARY KEY,
    global_user_id VARCHAR(128) NOT NULL,
    platform VARCHAR(64) NOT NULL,
    local_user_id VARCHAR(128) NOT NULL,
    school_id INTEGER REFERENCES schools(id),
    class_id INTEGER,
    role VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_global_user_map_platform_local UNIQUE (platform, local_user_id)
);

CREATE TABLE IF NOT EXISTS learning_events (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(64) NOT NULL,
    global_user_id VARCHAR(128),
    platform VARCHAR(64) NOT NULL DEFAULT 'ai4school',
    local_user_id VARCHAR(128),
    school_id INTEGER REFERENCES schools(id),
    class_id INTEGER,
    subject VARCHAR(64),
    payload_json TEXT NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    actor_user_id INTEGER REFERENCES users(id),
    school_id INTEGER REFERENCES schools(id),
    action VARCHAR(128) NOT NULL,
    target_type VARCHAR(64),
    target_id VARCHAR(128),
    metadata_json TEXT NOT NULL DEFAULT '{}',
    success BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_school_memberships_user_id ON school_memberships(user_id);
CREATE INDEX IF NOT EXISTS ix_school_memberships_school_id ON school_memberships(school_id);
CREATE INDEX IF NOT EXISTS ix_subscriptions_school_id ON subscriptions(school_id);
CREATE INDEX IF NOT EXISTS ix_llm_secrets_owner ON llm_secrets(owner_type, owner_id, provider);
CREATE INDEX IF NOT EXISTS ix_llm_usage_school_id ON llm_usage(school_id);
CREATE INDEX IF NOT EXISTS ix_llm_usage_teacher_id ON llm_usage(teacher_id);
CREATE INDEX IF NOT EXISTS ix_global_user_maps_global_user_id ON global_user_maps(global_user_id);
CREATE INDEX IF NOT EXISTS ix_learning_events_global_user_id ON learning_events(global_user_id);
CREATE INDEX IF NOT EXISTS ix_learning_events_school_id ON learning_events(school_id);
