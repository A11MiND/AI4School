CREATE TABLE IF NOT EXISTS class_invite_codes (
    id SERIAL PRIMARY KEY,
    class_id INTEGER NOT NULL REFERENCES classes(id),
    code VARCHAR(32) NOT NULL UNIQUE,
    created_by INTEGER NULL REFERENCES users(id),
    expires_at TIMESTAMPTZ NULL,
    max_uses INTEGER NULL,
    used_count INTEGER NOT NULL DEFAULT 0,
    revoked BOOLEAN NOT NULL DEFAULT FALSE,
    revoked_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_class_invite_codes_class_id ON class_invite_codes(class_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_class_invite_codes_code ON class_invite_codes(code);

INSERT INTO class_invite_codes (class_id, code, created_by, expires_at, max_uses, used_count, revoked, revoked_at)
SELECT c.id, c.invite_code, c.teacher_id, NULL, NULL, 0, FALSE, NULL
FROM classes c
WHERE c.invite_code IS NOT NULL
  AND c.invite_code <> ''
  AND NOT EXISTS (
      SELECT 1 FROM class_invite_codes ic WHERE ic.code = c.invite_code
  );
