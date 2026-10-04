UPDATE leads
SET status='NEW', bounce_reason=NULL, bounced_at=NULL
WHERE status='SEND_FAILED';

INSERT INTO schema_migrations (version,description)
VALUES (2026100403,'Return existing send-failed leads to New without changing bounced leads')
ON DUPLICATE KEY UPDATE description=VALUES(description),applied_at=applied_at;
