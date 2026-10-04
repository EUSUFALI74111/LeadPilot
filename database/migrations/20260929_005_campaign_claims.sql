ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS batch_group_id CHAR(36) NULL AFTER public_id,
  ADD INDEX IF NOT EXISTS idx_campaigns_tenant_batch_group (tenant_id, batch_group_id);

ALTER TABLE email_logs
  ADD INDEX IF NOT EXISTS idx_logs_smtp_created (smtp_account_id, created_at);

CREATE TABLE IF NOT EXISTS lead_campaign_claims (
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

INSERT IGNORE INTO lead_campaign_claims (tenant_id, lead_id, campaign_id)
SELECT r.tenant_id, r.lead_id, r.campaign_id
FROM campaign_recipients r
JOIN campaigns c ON c.tenant_id=r.tenant_id AND c.id=r.campaign_id
WHERE c.status IN ('QUEUED','RUNNING','PAUSED')
  AND r.status IN ('PENDING','PROCESSING','RETRY')
ORDER BY r.campaign_id, r.id;

UPDATE campaign_recipients r
JOIN campaigns c ON c.tenant_id=r.tenant_id AND c.id=r.campaign_id
LEFT JOIN lead_campaign_claims cl
  ON cl.tenant_id=r.tenant_id AND cl.lead_id=r.lead_id AND cl.campaign_id=r.campaign_id
SET r.status='CANCELLED', r.last_error='Excluded because another active campaign reserved this lead'
WHERE c.status IN ('QUEUED','RUNNING','PAUSED')
  AND r.status IN ('PENDING','PROCESSING','RETRY')
  AND cl.lead_id IS NULL;

UPDATE campaigns c
SET c.total_recipients=(SELECT COUNT(*) FROM campaign_recipients r WHERE r.tenant_id=c.tenant_id AND r.campaign_id=c.id AND r.status<>'CANCELLED'),
    c.pending_count=(SELECT COUNT(*) FROM campaign_recipients r WHERE r.tenant_id=c.tenant_id AND r.campaign_id=c.id AND r.status IN ('PENDING','PROCESSING','RETRY'))
WHERE c.status IN ('QUEUED','RUNNING','PAUSED');

INSERT INTO schema_migrations (version, description)
VALUES (2026092905, 'Active campaign lead claims and non-overlapping recipient ranges')
ON DUPLICATE KEY UPDATE description=VALUES(description), applied_at=applied_at;
