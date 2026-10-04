UPDATE smtp_accounts SET daily_limit = 500 WHERE daily_limit > 500;

UPDATE leads l
JOIN (
  SELECT DISTINCT tenant_id, lead_id
  FROM campaign_recipients
  WHERE status = 'FAILED'
    AND (
      failure_category = 'SENDER_AUTH'
      OR LOWER(COALESCE(last_error,'')) REGEXP 'daily.{0,30}(limit|quota)|sending.{0,30}(limit|quota)|quota.{0,20}(exceed|limit)|too many (messages|emails)|rate limit|5\\.4\\.5'
    )
) recoverable ON recoverable.tenant_id = l.tenant_id AND recoverable.lead_id = l.id
SET l.status = 'NEW', l.bounce_reason = NULL, l.bounced_at = NULL
WHERE l.status = 'SEND_FAILED';

UPDATE campaign_recipients r
JOIN campaigns c ON c.tenant_id = r.tenant_id AND c.id = r.campaign_id
SET r.status = 'PENDING', r.available_at = UTC_TIMESTAMP(), r.last_error = NULL, r.failure_category = NULL
WHERE r.status = 'FAILED'
  AND c.status IN ('QUEUED','RUNNING','PAUSED')
  AND (
    r.failure_category = 'SENDER_AUTH'
    OR LOWER(COALESCE(r.last_error,'')) REGEXP 'daily.{0,30}(limit|quota)|sending.{0,30}(limit|quota)|quota.{0,20}(exceed|limit)|too many (messages|emails)|rate limit|5\\.4\\.5'
  );

UPDATE campaign_recipients r
JOIN campaigns c ON c.tenant_id = r.tenant_id AND c.id = r.campaign_id
SET r.status = 'CANCELLED', r.failure_category = NULL
WHERE r.status = 'FAILED'
  AND c.status IN ('COMPLETED','FAILED','CANCELLED')
  AND (
    r.failure_category = 'SENDER_AUTH'
    OR LOWER(COALESCE(r.last_error,'')) REGEXP 'daily.{0,30}(limit|quota)|sending.{0,30}(limit|quota)|quota.{0,20}(exceed|limit)|too many (messages|emails)|rate limit|5\\.4\\.5'
  );

UPDATE campaigns c
SET sent_count = (SELECT COUNT(*) FROM campaign_recipients r WHERE r.tenant_id=c.tenant_id AND r.campaign_id=c.id AND r.status='SENT'),
    failed_count = (SELECT COUNT(*) FROM campaign_recipients r WHERE r.tenant_id=c.tenant_id AND r.campaign_id=c.id AND r.status='FAILED'),
    pending_count = (SELECT COUNT(*) FROM campaign_recipients r WHERE r.tenant_id=c.tenant_id AND r.campaign_id=c.id AND r.status IN ('PENDING','PROCESSING','RETRY'));

INSERT INTO schema_migrations (version,description)
VALUES (2026100402,'Cap sender daily quota and restore sender-side failures')
ON DUPLICATE KEY UPDATE description=VALUES(description),applied_at=applied_at;
