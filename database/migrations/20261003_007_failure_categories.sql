ALTER TABLE leads
  MODIFY COLUMN status ENUM('NEW','CONTACTED','QUALIFIED','SEND_FAILED','BOUNCED','UNSUBSCRIBED') NOT NULL DEFAULT 'NEW';

ALTER TABLE campaign_recipients
  ADD COLUMN IF NOT EXISTS failure_category VARCHAR(32) NULL AFTER last_error,
  ADD INDEX IF NOT EXISTS idx_recipients_tenant_failure_category (tenant_id, failure_category);

INSERT INTO schema_migrations (version, description)
VALUES (2026100307, 'Lead send-failed status and categorized campaign delivery failures')
ON DUPLICATE KEY UPDATE description=VALUES(description), applied_at=applied_at;
