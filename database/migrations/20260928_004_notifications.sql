ALTER TABLE users
  ADD COLUMN IF NOT EXISTS notifications_read_at DATETIME NULL AFTER last_login_at;

INSERT INTO schema_migrations (version, description)
VALUES (2026092804, 'User notification read state')
ON DUPLICATE KEY UPDATE description=VALUES(description), applied_at=applied_at;
