-- LeadPilot production migration: additive and data preserving.
-- Back up the database before applying. Run once, then record it in schema_migrations.

ALTER TABLE leads
  ADD COLUMN first_name VARCHAR(100) NULL AFTER name,
  ADD COLUMN last_name VARCHAR(100) NULL AFTER first_name,
  ADD COLUMN phone_normalized VARCHAR(32) NULL AFTER phone,
  ADD COLUMN company_name VARCHAR(120) NULL AFTER company,
  ADD COLUMN job_title VARCHAR(150) NULL AFTER website,
  ADD COLUMN twitter VARCHAR(500) NULL AFTER instagram,
  ADD COLUMN tiktok VARCHAR(500) NULL AFTER twitter,
  ADD COLUMN location VARCHAR(255) NULL AFTER other_socials,
  ADD COLUMN country VARCHAR(100) NULL AFTER location,
  ADD COLUMN source VARCHAR(100) NULL AFTER country,
  ADD COLUMN custom_fields JSON NULL AFTER source,
  ADD UNIQUE INDEX uq_leads_tenant_phone (tenant_id, phone_normalized),
  ADD INDEX idx_leads_tenant_source (tenant_id, source),
  ADD INDEX idx_leads_tenant_company (tenant_id, company_name),
  ADD INDEX idx_leads_tenant_job_title (tenant_id, job_title),
  ADD INDEX idx_leads_tenant_location (tenant_id, location);

UPDATE leads
SET
  first_name = CASE
    WHEN first_name IS NULL OR first_name = '' THEN SUBSTRING_INDEX(TRIM(name), ' ', 1)
    ELSE first_name
  END,
  last_name = CASE
    WHEN last_name IS NULL OR last_name = '' THEN NULLIF(TRIM(SUBSTRING(TRIM(name), LENGTH(SUBSTRING_INDEX(TRIM(name), ' ', 1)) + 1)), '')
    ELSE last_name
  END,
  company_name = COALESCE(NULLIF(company_name, ''), company);

ALTER TABLE campaigns
  ADD COLUMN body_format ENUM('text','html') NOT NULL DEFAULT 'text' AFTER body;

INSERT INTO schema_migrations (version, description)
VALUES (2026092801, 'Lead personalization, social fields, custom fields and HTML email format');
