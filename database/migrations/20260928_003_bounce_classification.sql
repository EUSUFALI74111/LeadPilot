ALTER TABLE email_replies
  ADD COLUMN IF NOT EXISTS reply_type ENUM('HUMAN','AUTO_REPLY','BOUNCE') NOT NULL DEFAULT 'HUMAN' AFTER body_text,
  ADD COLUMN IF NOT EXISTS bounce_reason VARCHAR(500) NULL AFTER reply_type,
  ADD INDEX IF NOT EXISTS idx_replies_tenant_type_received (tenant_id, reply_type, received_at);

INSERT INTO schema_migrations (version, description)
VALUES (2026092803, 'Classify human replies, auto-replies, and delivery bounces')
ON DUPLICATE KEY UPDATE description=VALUES(description), applied_at=applied_at;
