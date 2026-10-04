ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS bounce_reason VARCHAR(500) NULL AFTER status,
  ADD COLUMN IF NOT EXISTS bounced_at DATETIME NULL AFTER bounce_reason;

INSERT INTO schema_migrations (version, description)
VALUES (2026100306, 'Persistent lead bounce reason and timestamp')
ON DUPLICATE KEY UPDATE description=VALUES(description), applied_at=applied_at;
