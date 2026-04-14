ALTER TABLE classes ADD COLUMN IF NOT EXISTS invite_code VARCHAR(32);
CREATE UNIQUE INDEX IF NOT EXISTS uq_classes_invite_code ON classes(invite_code);
