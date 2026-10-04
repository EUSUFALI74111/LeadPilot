<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

require_once dirname(__DIR__) . '/bootstrap.php';
require_once dirname(__DIR__) . '/services/ReplyMailboxService.php';

$pdo = db();
$accounts = $pdo->query("SELECT id,tenant_id,sender_email,imap_host,imap_port,imap_encryption,imap_username,imap_password_ciphertext,imap_last_uid FROM smtp_accounts WHERE reply_tracking_enabled=1 AND imap_host IS NOT NULL AND imap_password_ciphertext IS NOT NULL ORDER BY id")->fetchAll();
$stored = 0;
$bounces = 0;

foreach ($accounts as $account) {
    $connection = null;
    try {
        $account['imap_password'] = decrypt_secret((string)$account['imap_password_ciphertext']);
        $connection = ReplyMailboxService::connect($account);
        $uids = imap_search($connection, 'ALL', SE_UID) ?: [];
        sort($uids, SORT_NUMERIC);
        $lastUid = (int)$account['imap_last_uid'];
        $uids = array_values(array_filter($uids, fn($uid) => (int)$uid > $lastUid));
        $uids = array_slice($uids, -max(1, min(500, (int)env('REPLY_SCAN_BATCH_SIZE', '200'))));

        foreach ($uids as $uidValue) {
            $uid = (int)$uidValue;
            $overview = imap_fetch_overview($connection, (string)$uid, FT_UID)[0] ?? null;
            if (!$overview) { $lastUid = max($lastUid, $uid); continue; }
            $addresses = imap_rfc822_parse_adrlist((string)($overview->from ?? ''), '');
            $from = $addresses[0] ?? null;
            $senderEmail = $from && isset($from->mailbox, $from->host) ? strtolower($from->mailbox . '@' . $from->host) : '';
            if (!filter_var($senderEmail, FILTER_VALIDATE_EMAIL)) { $lastUid = max($lastUid, $uid); continue; }
            $senderName = $from ? ReplyMailboxService::decodeHeader((string)($from->personal ?? '')) : '';
            $subject = ReplyMailboxService::decodeHeader((string)($overview->subject ?? ''));
            $body = ReplyMailboxService::textBody($connection, $uid);
            $rawBody = mb_substr((string)imap_body($connection, $uid, FT_UID | FT_PEEK), 0, 250000);
            $rawHeaders = (string)imap_fetchheader($connection, $uid, FT_UID);
            $classification = ReplyMailboxService::classifyMessage($senderEmail, $subject, $body . "\n" . $rawBody, $rawHeaders);

            $threadHeaders = trim((string)($overview->in_reply_to ?? '') . ' ' . (string)($overview->references ?? '') . ' ' . $rawHeaders . ' ' . $body);
            preg_match_all('/<[^>\r\n]{3,500}>/', $threadHeaders, $matches);
            $messageIds = array_values(array_unique($matches[0] ?? []));
            if (!$messageIds && $threadHeaders !== '') $messageIds[] = trim($threadHeaders);

            $sent = null;
            foreach ($messageIds as $messageId) {
                $lookup = $pdo->prepare("SELECT l.campaign_id,l.campaign_recipient_id,r.lead_id FROM email_logs l JOIN campaign_recipients r ON r.id=l.campaign_recipient_id AND r.tenant_id=l.tenant_id WHERE l.tenant_id=? AND l.smtp_account_id=? AND l.status='SENT' AND l.provider_message_id=? ORDER BY l.id DESC LIMIT 1");
                $lookup->execute([$account['tenant_id'], $account['id'], $messageId]);
                $sent = $lookup->fetch();
                if ($sent) break;
            }

            if (!$sent && $classification['type'] === 'BOUNCE') {
                preg_match_all('/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/i', $subject . "\n" . $body . "\n" . $rawBody, $emailMatches);
                foreach (array_unique(array_map('strtolower', $emailMatches[0] ?? [])) as $failedEmail) {
                    if ($failedEmail === strtolower((string)$account['sender_email']) || $failedEmail === $senderEmail) continue;
                    $lookup = $pdo->prepare("SELECT l.campaign_id,l.campaign_recipient_id,r.lead_id FROM email_logs l JOIN campaign_recipients r ON r.id=l.campaign_recipient_id AND r.tenant_id=l.tenant_id WHERE l.tenant_id=? AND l.smtp_account_id=? AND l.status='SENT' AND l.recipient_email=? ORDER BY l.id DESC LIMIT 1");
                    $lookup->execute([$account['tenant_id'], $account['id'], $failedEmail]);
                    $sent = $lookup->fetch();
                    if ($sent) break;
                }
            }

            if ($sent) {
                    $received = isset($overview->udate) ? gmdate('Y-m-d H:i:s', (int)$overview->udate) : gmdate('Y-m-d H:i:s');
                    $insert = $pdo->prepare("INSERT IGNORE INTO email_replies (tenant_id,public_id,smtp_account_id,campaign_id,campaign_recipient_id,lead_id,mailbox_uid,message_id,in_reply_to,sender_email,sender_name,subject,body_text,reply_type,bounce_reason,received_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
                    $insert->execute([$account['tenant_id'],uuid(),$account['id'],$sent['campaign_id'],$sent['campaign_recipient_id'],$sent['lead_id'],$uid,mb_substr((string)($overview->message_id ?? ''),0,500),mb_substr((string)($overview->in_reply_to ?? ''),0,500),$senderEmail,mb_substr($senderName,0,255),mb_substr($subject,0,500),$body,$classification['type'],$classification['reason'],$received]);
                    $stored += $insert->rowCount();
                    if ($insert->rowCount() === 1 && $classification['type'] === 'BOUNCE') {
                        $pdo->beginTransaction();
                        try {
                            $failed = $pdo->prepare("UPDATE campaign_recipients SET status='FAILED',last_error=?,failure_category='HARD_BOUNCE' WHERE tenant_id=? AND id=? AND status='SENT'");
                            $failed->execute([$classification['reason'],$account['tenant_id'],$sent['campaign_recipient_id']]);
                            if ($failed->rowCount() === 1) {
                                $pdo->prepare("UPDATE campaigns SET sent_count=GREATEST(sent_count-1,0),failed_count=failed_count+1 WHERE tenant_id=? AND id=?")->execute([$account['tenant_id'],$sent['campaign_id']]);
                                $pdo->prepare("UPDATE leads SET status='BOUNCED',bounce_reason=?,bounced_at=? WHERE tenant_id=? AND id=?")->execute([$classification['reason'],$received,$account['tenant_id'],$sent['lead_id']]);
                                $pdo->prepare("UPDATE email_logs SET status='FAILED',provider_category='bounce',error_message=? WHERE tenant_id=? AND campaign_recipient_id=? AND status='SENT'")->execute([$classification['reason'],$account['tenant_id'],$sent['campaign_recipient_id']]);
                                $stats=$pdo->prepare('SELECT sent_count,failed_count FROM campaigns WHERE tenant_id=? AND id=? FOR UPDATE');$stats->execute([$account['tenant_id'],$sent['campaign_id']]);$counts=$stats->fetch();$finalized=(int)$counts['sent_count']+(int)$counts['failed_count'];$minimum=max(10,(int)env('BOUNCE_PAUSE_MIN','20'));$percent=max(1,min(100,(int)env('BOUNCE_PAUSE_PERCENT','20')));if((int)$counts['failed_count']>=$minimum&&$finalized>0&&((int)$counts['failed_count']*100/$finalized)>=$percent){$pdo->prepare("UPDATE campaigns SET status='PAUSED' WHERE tenant_id=? AND id=? AND status IN ('QUEUED','RUNNING')")->execute([$account['tenant_id'],$sent['campaign_id']]);}
                                $bounces++;
                            }
                            $pdo->commit();
                        } catch (Throwable $bounceError) {
                            if ($pdo->inTransaction()) $pdo->rollBack();
                            throw $bounceError;
                        }
                    }
            }
            $lastUid = max($lastUid, $uid);
        }
        $update = $pdo->prepare('UPDATE smtp_accounts SET imap_last_uid=?,imap_last_checked_at=UTC_TIMESTAMP(),imap_last_error=NULL WHERE tenant_id=? AND id=?');
        $update->execute([$lastUid,$account['tenant_id'],$account['id']]);
    } catch (Throwable $error) {
        $safe = ReplyMailboxService::safeError($error->getMessage());
        $update = $pdo->prepare('UPDATE smtp_accounts SET imap_last_checked_at=UTC_TIMESTAMP(),imap_last_error=? WHERE tenant_id=? AND id=?');
        $update->execute([$safe,$account['tenant_id'],$account['id']]);
        error_log('[LeadPilot reply worker] account ' . $account['id'] . ': ' . $safe);
    } finally {
        if ($connection instanceof IMAP\Connection) imap_close($connection);
    }
}

fwrite(STDOUT, "Stored {$stored} inbox event(s); reconciled {$bounces} bounce(s).\n");
