-- LeadPilot reply tracking. Additive/idempotent migration version 2026092802.
ALTER TABLE smtp_accounts
  ADD COLUMN IF NOT EXISTS imap_host VARCHAR(255) NULL AFTER password_ciphertext,
  ADD COLUMN IF NOT EXISTS imap_port SMALLINT UNSIGNED NULL AFTER imap_host,
  ADD COLUMN IF NOT EXISTS imap_encryption ENUM('ssl','tls','none') NULL AFTER imap_port,
  ADD COLUMN IF NOT EXISTS imap_username VARCHAR(255) NULL AFTER imap_encryption,
  ADD COLUMN IF NOT EXISTS imap_password_ciphertext TEXT NULL AFTER imap_username,
  ADD COLUMN IF NOT EXISTS reply_tracking_enabled BOOLEAN NOT NULL DEFAULT FALSE AFTER imap_password_ciphertext,
  ADD COLUMN IF NOT EXISTS imap_last_uid BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER reply_tracking_enabled,
  ADD COLUMN IF NOT EXISTS imap_last_checked_at DATETIME NULL AFTER imap_last_uid,
  ADD COLUMN IF NOT EXISTS imap_last_error VARCHAR(500) NULL AFTER imap_last_checked_at;

CREATE TABLE IF NOT EXISTS email_replies (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,
  public_id CHAR(36) NOT NULL UNIQUE,
  smtp_account_id BIGINT UNSIGNED NOT NULL,
  campaign_id BIGINT UNSIGNED NOT NULL,
  campaign_recipient_id BIGINT UNSIGNED NOT NULL,
  lead_id BIGINT UNSIGNED NOT NULL,
  mailbox_uid BIGINT UNSIGNED NOT NULL,
  message_id VARCHAR(500) NULL,
  in_reply_to VARCHAR(500) NULL,
  sender_email VARCHAR(255) NOT NULL,
  sender_name VARCHAR(255) NULL,
  subject VARCHAR(500) NULL,
  body_text MEDIUMTEXT NOT NULL,
  received_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_reply_account_uid (smtp_account_id, mailbox_uid),
  UNIQUE KEY uq_replies_tenant_id (tenant_id, id),
  INDEX idx_replies_tenant_received (tenant_id, received_at),
  INDEX idx_replies_campaign_received (tenant_id, campaign_id, received_at),
  CONSTRAINT fk_replies_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_replies_smtp FOREIGN KEY (tenant_id, smtp_account_id) REFERENCES smtp_accounts(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_replies_campaign FOREIGN KEY (tenant_id, campaign_id) REFERENCES campaigns(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_replies_recipient FOREIGN KEY (tenant_id, campaign_recipient_id) REFERENCES campaign_recipients(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_replies_lead FOREIGN KEY (tenant_id, lead_id) REFERENCES leads(tenant_id, id) ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT INTO schema_migrations (version, description)
VALUES (2026092802, 'Secure IMAP reply tracking')
ON DUPLICATE KEY UPDATE description=VALUES(description), applied_at=applied_at;
