CREATE TABLE IF NOT EXISTS email_reply_messages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,
  public_id CHAR(36) NOT NULL UNIQUE,
  email_reply_id BIGINT UNSIGNED NOT NULL,
  smtp_account_id BIGINT UNSIGNED NOT NULL,
  campaign_id BIGINT UNSIGNED NOT NULL,
  lead_id BIGINT UNSIGNED NOT NULL,
  sent_by BIGINT UNSIGNED NOT NULL,
  recipient_email VARCHAR(255) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  body_text MEDIUMTEXT NOT NULL,
  provider_message_id VARCHAR(255) NULL,
  status ENUM('PROCESSING','SENT','FAILED') NOT NULL DEFAULT 'PROCESSING',
  error_message VARCHAR(500) NULL,
  sent_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_reply_messages_tenant_id (tenant_id,id),
  INDEX idx_reply_messages_thread (tenant_id,email_reply_id,created_at),
  INDEX idx_reply_messages_sender (tenant_id,sent_by,created_at),
  CONSTRAINT fk_reply_messages_reply FOREIGN KEY (tenant_id,email_reply_id) REFERENCES email_replies(tenant_id,id) ON DELETE CASCADE,
  CONSTRAINT fk_reply_messages_smtp FOREIGN KEY (tenant_id,smtp_account_id) REFERENCES smtp_accounts(tenant_id,id),
  CONSTRAINT fk_reply_messages_campaign FOREIGN KEY (tenant_id,campaign_id) REFERENCES campaigns(tenant_id,id) ON DELETE CASCADE,
  CONSTRAINT fk_reply_messages_lead FOREIGN KEY (tenant_id,lead_id) REFERENCES leads(tenant_id,id) ON DELETE CASCADE,
  CONSTRAINT fk_reply_messages_user FOREIGN KEY (tenant_id,sent_by) REFERENCES users(tenant_id,id)
) ENGINE=InnoDB;

INSERT INTO schema_migrations (version,description)
VALUES (2026100401,'Direct recipient replies with SMTP threading and audit history')
ON DUPLICATE KEY UPDATE description=VALUES(description),applied_at=applied_at;
