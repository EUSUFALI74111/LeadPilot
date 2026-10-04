-- LeadPilot shared-database multi-tenant schema. MySQL 8.0.16+ required.
-- Tenant identity is always derived from an authenticated server-side session.
SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE schema_migrations (
  version INT UNSIGNED PRIMARY KEY,
  description VARCHAR(255) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE tenants (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id CHAR(36) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  status ENUM('PENDING','ACTIVE','SUSPENDED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  plan VARCHAR(50) NOT NULL DEFAULT 'starter',
  timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
  schema_version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tenants_status (status)
) ENGINE=InnoDB;

CREATE TABLE users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,
  public_id CHAR(36) NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('OWNER','ADMIN','MEMBER') NOT NULL DEFAULT 'MEMBER',
  status ENUM('PENDING','ACTIVE','DISABLED') NOT NULL DEFAULT 'PENDING',
  email_verified_at DATETIME NULL,
  failed_login_attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until DATETIME NULL,
  last_login_at DATETIME NULL,
  notifications_read_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_public (public_id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_tenant_id (tenant_id, id),
  INDEX idx_users_tenant_role (tenant_id, role, status),
  CONSTRAINT fk_users_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE auth_sessions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  access_token_hash CHAR(64) NOT NULL UNIQUE,
  refresh_token_hash CHAR(64) NOT NULL UNIQUE,
  csrf_token_hash CHAR(64) NOT NULL,
  ip_address VARBINARY(16) NULL,
  user_agent VARCHAR(500) NULL,
  access_expires_at DATETIME NOT NULL,
  refresh_expires_at DATETIME NOT NULL,
  last_used_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sessions_access (access_token_hash, access_expires_at, revoked_at),
  INDEX idx_sessions_refresh (refresh_token_hash, refresh_expires_at, revoked_at),
  INDEX idx_sessions_user (tenant_id, user_id, revoked_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (tenant_id, user_id) REFERENCES users(tenant_id, id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE one_time_codes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  purpose ENUM('VERIFY_EMAIL','RESET_PASSWORD') NOT NULL,
  code_hash VARCHAR(255) NOT NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  expires_at DATETIME NOT NULL,
  last_sent_at DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_otp_lookup (user_id, purpose, consumed_at, expires_at),
  CONSTRAINT fk_otp_user FOREIGN KEY (tenant_id, user_id) REFERENCES users(tenant_id, id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE rate_limits (
  rate_key CHAR(64) NOT NULL,
  action VARCHAR(50) NOT NULL,
  window_started_at DATETIME NOT NULL,
  hits INT UNSIGNED NOT NULL DEFAULT 1,
  expires_at DATETIME NOT NULL,
  PRIMARY KEY (rate_key, action),
  INDEX idx_rate_expiry (expires_at)
) ENGINE=InnoDB;

CREATE TABLE leads (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,
  public_id CHAR(36) NOT NULL,
  assigned_user_id BIGINT UNSIGNED NULL,
  name VARCHAR(100) NOT NULL,
  first_name VARCHAR(100) NULL,
  last_name VARCHAR(100) NULL,
  email VARCHAR(255) NOT NULL,
  email_normalized VARCHAR(255) NOT NULL,
  phone VARCHAR(40) NULL,
  phone_normalized VARCHAR(32) NULL,
  company VARCHAR(120) NULL,
  company_name VARCHAR(120) NULL,
  website VARCHAR(500) NULL,
  job_title VARCHAR(150) NULL,
  linkedin VARCHAR(500) NULL,
  facebook VARCHAR(500) NULL,
  instagram VARCHAR(500) NULL,
  twitter VARCHAR(500) NULL,
  tiktok VARCHAR(500) NULL,
  other_socials JSON NULL,
  location VARCHAR(255) NULL,
  country VARCHAR(100) NULL,
  source VARCHAR(100) NULL,
  custom_fields JSON NULL,
  status ENUM('NEW','CONTACTED','QUALIFIED','SEND_FAILED','BOUNCED','UNSUBSCRIBED') NOT NULL DEFAULT 'NEW',
  bounce_reason VARCHAR(500) NULL,
  bounced_at DATETIME NULL,
  tags JSON NULL,
  notes TEXT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_leads_public (public_id),
  UNIQUE KEY uq_leads_tenant_email (tenant_id, email_normalized),
  UNIQUE KEY uq_leads_tenant_phone (tenant_id, phone_normalized),
  UNIQUE KEY uq_leads_tenant_id (tenant_id, id),
  INDEX idx_leads_tenant_status_created (tenant_id, status, created_at),
  INDEX idx_leads_assignee (tenant_id, assigned_user_id),
  INDEX idx_leads_tenant_source (tenant_id, source),
  INDEX idx_leads_tenant_company (tenant_id, company_name),
  INDEX idx_leads_tenant_job_title (tenant_id, job_title),
  INDEX idx_leads_tenant_location (tenant_id, location),
  FULLTEXT KEY ft_leads_search (name, first_name, last_name, email, company, company_name, phone),
  CONSTRAINT fk_leads_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_leads_creator FOREIGN KEY (tenant_id, created_by) REFERENCES users(tenant_id, id),
  CONSTRAINT fk_leads_assignee FOREIGN KEY (tenant_id, assigned_user_id) REFERENCES users(tenant_id, id)
) ENGINE=InnoDB;

CREATE TABLE contacts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,
  public_id CHAR(36) NOT NULL UNIQUE,
  batch_group_id CHAR(36) NULL,
  lead_id BIGINT UNSIGNED NULL,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(40) NULL,
  company VARCHAR(120) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_contacts_tenant_email (tenant_id, email),
  UNIQUE KEY uq_contacts_tenant_id (tenant_id, id),
  INDEX idx_contacts_tenant_created (tenant_id, created_at),
  CONSTRAINT fk_contacts_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_contacts_lead FOREIGN KEY (tenant_id, lead_id) REFERENCES leads(tenant_id, id)
) ENGINE=InnoDB;

CREATE TABLE email_templates (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,
  public_id CHAR(36) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  subject VARCHAR(200) NOT NULL,
  body MEDIUMTEXT NOT NULL,
  body_format ENUM('text','html') NOT NULL DEFAULT 'text',
  category VARCHAR(50) NOT NULL DEFAULT 'Outreach',
  is_approved BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_templates_tenant_id (tenant_id, id),
  INDEX idx_templates_tenant_updated (tenant_id, updated_at),
  CONSTRAINT fk_templates_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_templates_creator FOREIGN KEY (tenant_id, created_by) REFERENCES users(tenant_id, id)
) ENGINE=InnoDB;

CREATE TABLE smtp_accounts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,
  public_id CHAR(36) NOT NULL UNIQUE,
  account_name VARCHAR(100) NOT NULL,
  sender_name VARCHAR(100) NOT NULL,
  sender_email VARCHAR(255) NOT NULL,
  host VARCHAR(255) NOT NULL,
  port SMALLINT UNSIGNED NOT NULL,
  encryption ENUM('tls','ssl','none') NOT NULL DEFAULT 'tls',
  username VARCHAR(255) NOT NULL,
  password_ciphertext TEXT NOT NULL,
  imap_host VARCHAR(255) NULL,
  imap_port SMALLINT UNSIGNED NULL,
  imap_encryption ENUM('ssl','tls','none') NULL,
  imap_username VARCHAR(255) NULL,
  imap_password_ciphertext TEXT NULL,
  reply_tracking_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  imap_last_uid BIGINT UNSIGNED NOT NULL DEFAULT 0,
  imap_last_checked_at DATETIME NULL,
  imap_last_error VARCHAR(500) NULL,
  status ENUM('CONNECTED','DISCONNECTED','ERROR','TESTING') NOT NULL DEFAULT 'DISCONNECTED',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  daily_limit INT UNSIGNED NOT NULL DEFAULT 300,
  hourly_limit INT UNSIGNED NOT NULL DEFAULT 100,
  per_minute_limit INT UNSIGNED NOT NULL DEFAULT 10,
  sending_interval_seconds INT UNSIGNED NOT NULL DEFAULT 10,
  last_tested_at DATETIME NULL,
  last_error VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_smtp_tenant_id (tenant_id, id),
  INDEX idx_smtp_tenant_active (tenant_id, is_active, status),
  CONSTRAINT fk_smtp_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE campaigns (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,
  public_id CHAR(36) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  subject VARCHAR(200) NOT NULL,
  body MEDIUMTEXT NOT NULL,
  smtp_account_id BIGINT UNSIGNED NOT NULL,
  template_id BIGINT UNSIGNED NULL,
  recipient_filter JSON NULL,
  status ENUM('DRAFT','QUEUED','RUNNING','PAUSED','COMPLETED','FAILED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
  scheduled_at DATETIME NULL,
  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  total_recipients INT UNSIGNED NOT NULL DEFAULT 0,
  sent_count INT UNSIGNED NOT NULL DEFAULT 0,
  failed_count INT UNSIGNED NOT NULL DEFAULT 0,
  pending_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_campaigns_tenant_id (tenant_id, id),
  INDEX idx_campaigns_tenant_status_schedule (tenant_id, status, scheduled_at),
  INDEX idx_campaigns_tenant_batch_group (tenant_id, batch_group_id),
  INDEX idx_campaigns_tenant_created (tenant_id, created_at),
  CONSTRAINT fk_campaigns_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_campaigns_smtp FOREIGN KEY (tenant_id, smtp_account_id) REFERENCES smtp_accounts(tenant_id, id),
  CONSTRAINT fk_campaigns_template FOREIGN KEY (tenant_id, template_id) REFERENCES email_templates(tenant_id, id),
  CONSTRAINT fk_campaigns_creator FOREIGN KEY (tenant_id, created_by) REFERENCES users(tenant_id, id)
) ENGINE=InnoDB;

CREATE TABLE lead_campaign_claims (
  tenant_id BIGINT UNSIGNED NOT NULL,
  lead_id BIGINT UNSIGNED NOT NULL,
  campaign_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, lead_id),
  INDEX idx_claims_campaign (tenant_id, campaign_id),
  CONSTRAINT fk_claims_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_claims_lead FOREIGN KEY (tenant_id, lead_id) REFERENCES leads(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_claims_campaign FOREIGN KEY (tenant_id, campaign_id) REFERENCES campaigns(tenant_id, id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE campaign_recipients (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,
  campaign_id BIGINT UNSIGNED NOT NULL,
  lead_id BIGINT UNSIGNED NOT NULL,
  recipient_email VARCHAR(255) NOT NULL,
  recipient_name VARCHAR(100) NULL,
  subject_rendered VARCHAR(255) NULL,
  status ENUM('PENDING','PROCESSING','SENT','FAILED','RETRY','CANCELLED') NOT NULL DEFAULT 'PENDING',
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  available_at DATETIME NOT NULL,
  locked_at DATETIME NULL,
  lock_token CHAR(36) NULL,
  sent_at DATETIME NULL,
  last_error VARCHAR(500) NULL,
  failure_category VARCHAR(32) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_campaign_recipient (campaign_id, lead_id),
  UNIQUE KEY uq_recipients_tenant_id (tenant_id, id),
  INDEX idx_queue_claim (status, available_at, campaign_id, locked_at),
  INDEX idx_recipient_campaign_status (tenant_id, campaign_id, status),
  INDEX idx_recipients_tenant_failure_category (tenant_id, failure_category),
  CONSTRAINT fk_recipients_campaign FOREIGN KEY (tenant_id, campaign_id) REFERENCES campaigns(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_recipients_lead FOREIGN KEY (tenant_id, lead_id) REFERENCES leads(tenant_id, id)
) ENGINE=InnoDB;

CREATE TABLE email_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,
  campaign_id BIGINT UNSIGNED NOT NULL,
  campaign_recipient_id BIGINT UNSIGNED NOT NULL,
  smtp_account_id BIGINT UNSIGNED NOT NULL,
  recipient_email VARCHAR(255) NOT NULL,
  status ENUM('SENT','FAILED','RETRY') NOT NULL,
  provider_category VARCHAR(50) NULL,
  provider_message_id VARCHAR(255) NULL,
  error_message VARCHAR(500) NULL,
  retry_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
  sent_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_logs_tenant_created (tenant_id, created_at),
  INDEX idx_logs_campaign_status (tenant_id, campaign_id, status),
  INDEX idx_logs_smtp_created (smtp_account_id, created_at),
  CONSTRAINT fk_logs_campaign FOREIGN KEY (tenant_id, campaign_id) REFERENCES campaigns(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_logs_recipient FOREIGN KEY (tenant_id, campaign_recipient_id) REFERENCES campaign_recipients(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_logs_smtp FOREIGN KEY (tenant_id, smtp_account_id) REFERENCES smtp_accounts(tenant_id, id)
) ENGINE=InnoDB;

CREATE TABLE email_replies (
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
  reply_type ENUM('HUMAN','AUTO_REPLY','BOUNCE') NOT NULL DEFAULT 'HUMAN',
  bounce_reason VARCHAR(500) NULL,
  received_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_reply_account_uid (smtp_account_id, mailbox_uid),
  UNIQUE KEY uq_replies_tenant_id (tenant_id, id),
  INDEX idx_replies_tenant_received (tenant_id, received_at),
  INDEX idx_replies_tenant_type_received (tenant_id, reply_type, received_at),
  INDEX idx_replies_campaign_received (tenant_id, campaign_id, received_at),
  CONSTRAINT fk_replies_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_replies_smtp FOREIGN KEY (tenant_id, smtp_account_id) REFERENCES smtp_accounts(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_replies_campaign FOREIGN KEY (tenant_id, campaign_id) REFERENCES campaigns(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_replies_recipient FOREIGN KEY (tenant_id, campaign_recipient_id) REFERENCES campaign_recipients(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_replies_lead FOREIGN KEY (tenant_id, lead_id) REFERENCES leads(tenant_id, id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE email_reply_messages (
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

CREATE TABLE smtp_send_counters (
  tenant_id BIGINT UNSIGNED NOT NULL,
  smtp_account_id BIGINT UNSIGNED NOT NULL,
  window_type ENUM('MINUTE','HOUR','DAY') NOT NULL,
  window_start DATETIME NOT NULL,
  sent_count INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (smtp_account_id, window_type, window_start),
  INDEX idx_counters_tenant_window (tenant_id, window_type, window_start),
  CONSTRAINT fk_counters_smtp FOREIGN KEY (tenant_id, smtp_account_id) REFERENCES smtp_accounts(tenant_id, id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE import_jobs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,
  public_id CHAR(36) NOT NULL UNIQUE,
  created_by BIGINT UNSIGNED NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  storage_path VARCHAR(500) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  file_size BIGINT UNSIGNED NOT NULL,
  column_mapping JSON NULL,
  status ENUM('UPLOADED','QUEUED','PROCESSING','COMPLETED','FAILED') NOT NULL DEFAULT 'UPLOADED',
  total_rows INT UNSIGNED NOT NULL DEFAULT 0,
  processed_rows INT UNSIGNED NOT NULL DEFAULT 0,
  imported_rows INT UNSIGNED NOT NULL DEFAULT 0,
  duplicate_rows INT UNSIGNED NOT NULL DEFAULT 0,
  failed_rows INT UNSIGNED NOT NULL DEFAULT 0,
  failed_report_path VARCHAR(500) NULL,
  error_message VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_imports_tenant_created (tenant_id, created_at),
  INDEX idx_imports_status (status, created_at),
  CONSTRAINT fk_imports_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_imports_creator FOREIGN KEY (tenant_id, created_by) REFERENCES users(tenant_id, id)
) ENGINE=InnoDB;

CREATE TABLE tenant_settings (
  tenant_id BIGINT UNSIGNED NOT NULL,
  setting_key VARCHAR(100) NOT NULL,
  setting_value JSON NOT NULL,
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, setting_key),
  CONSTRAINT fk_settings_user FOREIGN KEY (tenant_id, updated_by) REFERENCES users(tenant_id, id)
) ENGINE=InnoDB;

CREATE TABLE audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NULL,
  action VARCHAR(80) NOT NULL,
  resource_type VARCHAR(80) NULL,
  resource_public_id VARCHAR(64) NULL,
  ip_address VARBINARY(16) NULL,
  user_agent VARCHAR(500) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_tenant_created (tenant_id, created_at),
  INDEX idx_audit_action_created (action, created_at),
  CONSTRAINT fk_audit_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL
) ENGINE=InnoDB;

INSERT INTO schema_migrations (version, description) VALUES (1, 'Initial production schema');
