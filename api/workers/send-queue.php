<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once dirname(__DIR__) . '/bootstrap.php';

$pdo=db();
$lockName='leadpilot_send_queue';
$lock=$pdo->prepare('SELECT GET_LOCK(?,0)');$lock->execute([$lockName]);
if((int)$lock->fetchColumn()!==1){fwrite(STDOUT,"Another queue worker is already active.\n");exit;}
register_shutdown_function(static function() use ($pdo,$lockName): void {try{$release=$pdo->prepare('SELECT RELEASE_LOCK(?)');$release->execute([$lockName]);}catch(Throwable){}});
$pdo->exec("UPDATE campaign_recipients SET status='RETRY',available_at=UTC_TIMESTAMP(),lock_token=NULL,last_error='Recovered after an interrupted worker' WHERE status='PROCESSING' AND locked_at<UTC_TIMESTAMP()-INTERVAL 15 MINUTE");
$pdo->exec("DELETE FROM smtp_send_counters WHERE window_start<UTC_DATE()-INTERVAL 2 DAY");
$limit=max(30,min(100,(int)env('QUEUE_BATCH_SIZE','50'))); $processed=0;
while($processed<$limit){
    $pdo->beginTransaction();
    try{
        $q=$pdo->query("SELECT r.id recipient_id,r.tenant_id,r.campaign_id,r.lead_id,r.recipient_email,r.recipient_name,r.attempts,c.subject,c.body,c.body_format,c.status campaign_status,a.id smtp_id,a.sender_name,a.sender_email,a.host,a.port,a.encryption,a.username,a.password_ciphertext,a.daily_limit,a.hourly_limit,a.per_minute_limit,a.sending_interval_seconds,l.name,l.first_name,l.last_name,l.email,COALESCE(l.company_name,l.company,'') company_name,l.phone,l.job_title,l.website,l.linkedin,l.facebook,l.instagram,l.twitter,l.tiktok,l.location,l.country,l.source,l.custom_fields FROM campaign_recipients r JOIN lead_campaign_claims cl ON cl.tenant_id=r.tenant_id AND cl.lead_id=r.lead_id AND cl.campaign_id=r.campaign_id JOIN campaigns c ON c.id=r.campaign_id AND c.tenant_id=r.tenant_id JOIN smtp_accounts a ON a.id=c.smtp_account_id AND a.tenant_id=c.tenant_id JOIN leads l ON l.id=r.lead_id AND l.tenant_id=r.tenant_id WHERE r.status IN ('PENDING','RETRY') AND r.available_at<=UTC_TIMESTAMP() AND c.status IN ('QUEUED','RUNNING') AND c.scheduled_at<=UTC_TIMESTAMP() AND a.is_active=1 AND a.status='CONNECTED' ORDER BY (SELECT MAX(el.created_at) FROM email_logs el WHERE el.smtp_account_id=a.id),r.available_at,r.id LIMIT 1 FOR UPDATE SKIP LOCKED");
        $job=$q->fetch(); if(!$job){$pdo->commit();break;}
        $pdo->prepare('SELECT id FROM smtp_accounts WHERE id=? FOR UPDATE')->execute([$job['smtp_id']]);
        $windows=['MINUTE'=>['format'=>'Y-m-d H:i:00','limit'=>(int)$job['per_minute_limit']],'HOUR'=>['format'=>'Y-m-d H:00:00','limit'=>(int)$job['hourly_limit']],'DAY'=>['format'=>'Y-m-d 00:00:00','limit'=>(int)$job['daily_limit']]];
        $now=new DateTimeImmutable('now',new DateTimeZone('UTC'));$rateBlockedUntil=null;
        foreach($windows as $type=>$w){
            $start=$now->format($w['format']);$s=$pdo->prepare('SELECT sent_count FROM smtp_send_counters WHERE smtp_account_id=? AND window_type=? AND window_start=?');$s->execute([$job['smtp_id'],$type,$start]);
            if((int)$s->fetchColumn() >= $w['limit']){
                $reset=match($type){'MINUTE'=>$now->setTime((int)$now->format('H'),(int)$now->format('i'),0)->modify('+1 minute'),'HOUR'=>$now->setTime((int)$now->format('H'),0,0)->modify('+1 hour'),'DAY'=>$now->setTime(0,0,0)->modify('+1 day')};
                if($rateBlockedUntil===null||$reset>$rateBlockedUntil)$rateBlockedUntil=$reset;
            }
        }
        if($rateBlockedUntil!==null){
            $resumeAt=$rateBlockedUntil->format('Y-m-d H:i:s');
            $delay=$pdo->prepare("UPDATE campaign_recipients r JOIN campaigns c ON c.id=r.campaign_id AND c.tenant_id=r.tenant_id SET r.available_at=GREATEST(r.available_at,?) WHERE r.tenant_id=? AND c.smtp_account_id=? AND r.status IN ('PENDING','RETRY')");
            $delay->execute([$resumeAt,$job['tenant_id'],$job['smtp_id']]);$pdo->commit();continue;
        }
        $last=$pdo->prepare("SELECT created_at FROM email_logs WHERE smtp_account_id=? ORDER BY id DESC LIMIT 1");$last->execute([$job['smtp_id']]);$lastAt=$last->fetchColumn();
        if($lastAt){
            $intervalReset=(new DateTimeImmutable((string)$lastAt,new DateTimeZone('UTC')))->modify('+'.(int)$job['sending_interval_seconds'].' seconds');
            if($intervalReset>$now){
                $waitMicroseconds=min(30000000,max(100000,(int)(($intervalReset->getTimestamp()-$now->getTimestamp())*1000000)));
                $pdo->commit();usleep($waitMicroseconds);continue;
            }
        }
        foreach($windows as $type=>$w){$start=$now->format($w['format']);$pdo->prepare('INSERT INTO smtp_send_counters (tenant_id,smtp_account_id,window_type,window_start,sent_count) VALUES (?,?,?,?,1) ON DUPLICATE KEY UPDATE sent_count=sent_count+1')->execute([$job['tenant_id'],$job['smtp_id'],$type,$start]);}
        $token=uuid();$pdo->prepare("UPDATE campaign_recipients SET status='PROCESSING',attempts=attempts+1,locked_at=UTC_TIMESTAMP(),lock_token=? WHERE id=? AND tenant_id=?")->execute([$token,$job['recipient_id'],$job['tenant_id']]);
        $pdo->prepare("UPDATE campaigns SET status='RUNNING',started_at=COALESCE(started_at,UTC_TIMESTAMP()) WHERE id=? AND tenant_id=?")->execute([$job['campaign_id'],$job['tenant_id']]);$pdo->commit();
    }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}

    $sent=false;$error=null;$providerId=null;$accountFailure=false;$senderQuota=false;$mail=null;
    try{
        $mail=configure_mailer(['host'=>$job['host'],'port'=>$job['port'],'encryption'=>$job['encryption'],'username'=>$job['username'],'password'=>decrypt_secret($job['password_ciphertext'])]);
        $mail->setFrom($job['sender_email'],$job['sender_name']);$mail->addAddress($job['recipient_email'],$job['recipient_name']??'');$mail->Subject=render_template($job['subject'],$job);$renderedBody=render_template($job['body'],$job);if(($job['body_format']??'text')==='html'){$mail->Body=sanitize_email_html($renderedBody);$mail->AltBody=trim(preg_replace('/\s+/',' ',html_entity_decode(strip_tags($renderedBody),ENT_QUOTES|ENT_HTML5,'UTF-8'))??'');}else{$mail->Body=nl2br(htmlspecialchars($renderedBody,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8'));$mail->AltBody=$renderedBody;}$mail->isHTML(true);$mail->send();$sent=true;$providerId=$mail->getLastMessageID()?:null;
    }catch(Throwable $e){$rawError=$e->getMessage();if($mail instanceof PHPMailer\PHPMailer\PHPMailer){$smtpError=$mail->getSMTPInstance()->getError();if(is_array($smtpError)){$parts=array_filter([(string)($smtpError['error']??''),(string)($smtpError['detail']??''),(string)($smtpError['smtp_code']??''),(string)($smtpError['smtp_code_ex']??'')]);if($parts)$rawError.=' | '.implode(' | ',$parts);}}$accountFailure=(bool)preg_match('/authenticat|invalid credentials|username.*password|\b535\b/i',$rawError);$senderQuota=(bool)preg_match('/daily.{0,30}(limit|quota)|sending.{0,30}(limit|quota)|sender.{0,30}(limit|quota)|quota.{0,30}(exceed|limit)|exceed.{0,30}(send|message|quota)|too many (messages|emails|recipients)|message rate|rate limit|maximum.{0,30}(send|message|recipient)|5\.4\.5/i',$rawError);$error=mb_substr(preg_replace('/(password|credential)\s*[:=]\s*\S+/i','$1=[redacted]',$rawError)??'SMTP delivery failed',0,500);}

    $pdo->beginTransaction();
    try{
        $attempt=(int)$job['attempts']+1;
        if($sent){
            $pdo->prepare("UPDATE campaign_recipients SET status='SENT',sent_at=UTC_TIMESTAMP(),last_error=NULL,failure_category=NULL,lock_token=NULL WHERE id=? AND tenant_id=? AND lock_token=?")->execute([$job['recipient_id'],$job['tenant_id'],$token]);
            $pdo->prepare("INSERT INTO email_logs (tenant_id,campaign_id,campaign_recipient_id,smtp_account_id,recipient_email,status,provider_category,provider_message_id,retry_count,sent_at) VALUES (?,?,?,?,?,'SENT','accepted',?,?,UTC_TIMESTAMP())")->execute([$job['tenant_id'],$job['campaign_id'],$job['recipient_id'],$job['smtp_id'],$job['recipient_email'],$providerId,$attempt-1]);
            $pdo->prepare("UPDATE smtp_accounts SET last_error=NULL WHERE tenant_id=? AND id=? AND status='CONNECTED'")->execute([$job['tenant_id'],$job['smtp_id']]);
            $pdo->prepare("UPDATE leads SET status='QUALIFIED',bounce_reason=NULL,bounced_at=NULL WHERE tenant_id=? AND id=? AND status NOT IN ('BOUNCED','UNSUBSCRIBED')")->execute([$job['tenant_id'],$job['lead_id']]);
            $pdo->prepare('UPDATE campaigns SET sent_count=sent_count+1,pending_count=GREATEST(pending_count-1,0) WHERE id=? AND tenant_id=?')->execute([$job['campaign_id'],$job['tenant_id']]);
        }else{
            $permanent=(bool)preg_match('/\b5\d\d\b|invalid recipient|mailbox (unavailable|not found)|user unknown/i',(string)$error);$recipientInvalid=(bool)preg_match('/\b5\.1\.\d\b|invalid recipient|recipient address rejected|address not found|no such (user|mailbox)|mailbox (unavailable|not found)|user unknown/i',(string)$error);$retry=$senderQuota||$accountFailure||!$permanent;$status=$retry?'RETRY':'FAILED';$delay=$accountFailure?15:min(360,2**min($attempt,8));$failureCategory=$senderQuota?'SENDER_QUOTA':($accountFailure?'SENDER_AUTH':($recipientInvalid?'HARD_BOUNCE':($permanent?'PROVIDER_REJECTED':'TEMPORARY')));$availableAt=$senderQuota?$now->setTime(0,5,0)->modify('+1 day')->format('Y-m-d H:i:s'):$now->modify('+'.$delay.' minutes')->format('Y-m-d H:i:s');
            $pdo->prepare("UPDATE campaign_recipients SET status=?,available_at=?,last_error=?,failure_category=?,lock_token=NULL WHERE id=? AND tenant_id=? AND lock_token=?")->execute([$status,$availableAt,$error,$failureCategory,$job['recipient_id'],$job['tenant_id'],$token]);
            $pdo->prepare("INSERT INTO email_logs (tenant_id,campaign_id,campaign_recipient_id,smtp_account_id,recipient_email,status,provider_category,error_message,retry_count) VALUES (?,?,?,?,?,?,?,?,?)")->execute([$job['tenant_id'],$job['campaign_id'],$job['recipient_id'],$job['smtp_id'],$job['recipient_email'],$status,strtolower($failureCategory),$error,$attempt-1]);
            if($senderQuota){$pdo->prepare("INSERT INTO smtp_send_counters (tenant_id,smtp_account_id,window_type,window_start,sent_count) VALUES (?,?,'DAY',UTC_DATE(),?) ON DUPLICATE KEY UPDATE sent_count=GREATEST(sent_count,VALUES(sent_count))")->execute([$job['tenant_id'],$job['smtp_id'],$job['daily_limit']]);$pdo->prepare("UPDATE smtp_accounts SET last_error='Daily provider limit reached; pending email will resume automatically after reset.' WHERE tenant_id=? AND id=?")->execute([$job['tenant_id'],$job['smtp_id']]);}elseif($accountFailure){$pdo->prepare("UPDATE smtp_accounts SET status='ERROR',is_active=0,last_error=? WHERE tenant_id=? AND id=?")->execute([$error,$job['tenant_id'],$job['smtp_id']]);$pdo->prepare("UPDATE campaigns SET status='PAUSED' WHERE tenant_id=? AND id=? AND status IN ('QUEUED','RUNNING')")->execute([$job['tenant_id'],$job['campaign_id']]);}elseif(!$retry){$pdo->prepare('UPDATE campaigns SET failed_count=failed_count+1,pending_count=GREATEST(pending_count-1,0) WHERE id=? AND tenant_id=?')->execute([$job['campaign_id'],$job['tenant_id']]);$leadStatus=$recipientInvalid?'BOUNCED':'SEND_FAILED';$pdo->prepare("UPDATE leads SET status=?,bounce_reason=?,bounced_at=UTC_TIMESTAMP() WHERE id=? AND tenant_id=? AND status<>'UNSUBSCRIBED'")->execute([$leadStatus,$error,$job['lead_id'],$job['tenant_id']]);}
        }
        $s=$pdo->prepare("SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id=? AND tenant_id=? AND status IN ('PENDING','PROCESSING','RETRY')");$s->execute([$job['campaign_id'],$job['tenant_id']]);if((int)$s->fetchColumn()===0){$pdo->prepare("UPDATE campaigns SET status=IF(failed_count>0 AND sent_count=0,'FAILED','COMPLETED'),completed_at=UTC_TIMESTAMP(),pending_count=0 WHERE id=? AND tenant_id=? AND status='RUNNING'")->execute([$job['campaign_id'],$job['tenant_id']]);$pdo->prepare('DELETE FROM lead_campaign_claims WHERE tenant_id=? AND campaign_id=?')->execute([$job['tenant_id'],$job['campaign_id']]);}
        $pdo->commit();
    }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
    $processed++;
}
fwrite(STDOUT,"Processed {$processed} queue item(s).\n");
