UPDATE leads l
JOIN (
  SELECT DISTINCT tenant_id,lead_id
  FROM campaign_recipients
  WHERE status='FAILED' AND COALESCE(failure_category,'')<>'HARD_BOUNCE'
) r ON r.tenant_id=l.tenant_id AND r.lead_id=l.id
SET l.status='NEW',l.bounce_reason=NULL,l.bounced_at=NULL
WHERE l.status NOT IN ('BOUNCED','UNSUBSCRIBED','QUALIFIED');

UPDATE campaign_recipients r
JOIN campaigns c ON c.tenant_id=r.tenant_id AND c.id=r.campaign_id
SET r.status='PENDING',r.available_at=UTC_TIMESTAMP(),r.last_error=NULL,r.failure_category=NULL
WHERE r.status='FAILED' AND COALESCE(r.failure_category,'')<>'HARD_BOUNCE'
  AND c.status IN ('QUEUED','RUNNING','PAUSED');

UPDATE campaign_recipients r
JOIN campaigns c ON c.tenant_id=r.tenant_id AND c.id=r.campaign_id
SET r.status='CANCELLED',r.failure_category=NULL
WHERE r.status='FAILED' AND COALESCE(r.failure_category,'')<>'HARD_BOUNCE'
  AND c.status IN ('COMPLETED','FAILED','CANCELLED');

UPDATE campaigns c
SET sent_count=(SELECT COUNT(*) FROM campaign_recipients r WHERE r.tenant_id=c.tenant_id AND r.campaign_id=c.id AND r.status='SENT'),
    failed_count=(SELECT COUNT(*) FROM campaign_recipients r WHERE r.tenant_id=c.tenant_id AND r.campaign_id=c.id AND r.status='FAILED'),
    pending_count=(SELECT COUNT(*) FROM campaign_recipients r WHERE r.tenant_id=c.tenant_id AND r.campaign_id=c.id AND r.status IN ('PENDING','PROCESSING','RETRY'));

INSERT INTO schema_migrations (version,description)
VALUES (2026100404,'Clear historical non-bounce failures and return affected leads to New')
ON DUPLICATE KEY UPDATE description=VALUES(description),applied_at=applied_at;
