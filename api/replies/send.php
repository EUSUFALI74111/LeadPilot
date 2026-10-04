<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/bootstrap.php';
require_method('POST');

$user=current_user();
require_csrf();
rate_limit('direct_reply',$user['tenant_id'].':'.$user['id'],30,3600);
$data=input();
$replyId=string_value($data,'replyId',36);
$body=string_value($data,'body',10000);
$pdo=db();

$sql="SELECT r.id,r.smtp_account_id,r.campaign_id,r.lead_id,r.sender_email,r.sender_name,r.subject,r.message_id,r.in_reply_to,a.public_id account_public_id,a.sender_name account_sender_name,a.sender_email account_sender_email,a.host,a.port,a.encryption,a.username,a.password_ciphertext,a.daily_limit,a.hourly_limit,a.per_minute_limit,a.status account_status,a.is_active,c.created_by FROM email_replies r JOIN smtp_accounts a ON a.tenant_id=r.tenant_id AND a.id=r.smtp_account_id JOIN campaigns c ON c.tenant_id=r.tenant_id AND c.id=r.campaign_id WHERE r.tenant_id=? AND r.public_id=? AND r.reply_type='HUMAN'";
$params=[$user['tenant_id'],$replyId];
if($user['role']==='MEMBER'){$sql.=' AND c.created_by=?';$params[]=$user['id'];}
$sql.=' LIMIT 1';
$find=$pdo->prepare($sql);$find->execute($params);$reply=$find->fetch();
if(!$reply)throw new ApiError(404,'Reply not found.');
if(!(bool)$reply['is_active']||$reply['account_status']!=='CONNECTED')throw new ApiError(409,'The sending account for this conversation is not connected.');

$subject=preg_replace('/[\r\n]+/',' ',trim((string)$reply['subject']))?:'Your email';
if(!preg_match('/^re\s*:/i',$subject))$subject='Re: '.$subject;
$subject=mb_substr($subject,0,500);
$publicId=uuid();
$pdo->beginTransaction();
try{
    $lock=$pdo->prepare('SELECT id FROM smtp_accounts WHERE tenant_id=? AND id=? FOR UPDATE');
    $lock->execute([$user['tenant_id'],$reply['smtp_account_id']]);
    $now=new DateTimeImmutable('now',new DateTimeZone('UTC'));
    $windows=[
        'MINUTE'=>['format'=>'Y-m-d H:i:00','limit'=>(int)$reply['per_minute_limit']],
        'HOUR'=>['format'=>'Y-m-d H:00:00','limit'=>(int)$reply['hourly_limit']],
        'DAY'=>['format'=>'Y-m-d 00:00:00','limit'=>(int)$reply['daily_limit']],
    ];
    foreach($windows as $type=>$window){
        $start=$now->format($window['format']);
        $counter=$pdo->prepare('SELECT sent_count FROM smtp_send_counters WHERE smtp_account_id=? AND window_type=? AND window_start=?');
        $counter->execute([$reply['smtp_account_id'],$type,$start]);
        if((int)$counter->fetchColumn()>=$window['limit'])throw new ApiError(429,'This sending account has reached its '.strtolower($type).' limit. Try again after the limit resets.');
    }
    foreach($windows as $type=>$window){
        $start=$now->format($window['format']);
        $pdo->prepare('INSERT INTO smtp_send_counters (tenant_id,smtp_account_id,window_type,window_start,sent_count) VALUES (?,?,?,?,1) ON DUPLICATE KEY UPDATE sent_count=sent_count+1')->execute([$user['tenant_id'],$reply['smtp_account_id'],$type,$start]);
    }
    $pdo->prepare("INSERT INTO email_reply_messages (tenant_id,public_id,email_reply_id,smtp_account_id,campaign_id,lead_id,sent_by,recipient_email,subject,body_text,status) VALUES (?,?,?,?,?,?,?,?,?,?,'PROCESSING')")->execute([$user['tenant_id'],$publicId,$reply['id'],$reply['smtp_account_id'],$reply['campaign_id'],$reply['lead_id'],$user['id'],$reply['sender_email'],$subject,$body]);
    $pdo->commit();
}catch(Throwable $error){
    if($pdo->inTransaction())$pdo->rollBack();
    throw $error;
}

try{
    assert_safe_smtp_host((string)$reply['host']);
    $mail=configure_mailer([
        'host'=>$reply['host'],'port'=>$reply['port'],'encryption'=>$reply['encryption'],
        'username'=>$reply['username'],'password'=>decrypt_secret($reply['password_ciphertext']),
    ]);
    $mail->setFrom($reply['account_sender_email'],$reply['account_sender_name']);
    $mail->addAddress($reply['sender_email'],$reply['sender_name']??'');
    $mail->Subject=$subject;
    $mail->Body=nl2br(htmlspecialchars($body,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8'));
    $mail->AltBody=$body;
    $mail->isHTML(true);
    $messageId=preg_replace('/[\r\n]+/','',trim((string)$reply['message_id']));
    if($messageId!=='')$mail->addCustomHeader('In-Reply-To',$messageId);
    $references=preg_replace('/[\r\n]+/',' ',trim((string)$reply['in_reply_to'].' '.$messageId));
    if($references!=='')$mail->addCustomHeader('References',mb_substr($references,0,900));
    $mail->send();
    $providerId=$mail->getLastMessageID()?:null;
    $pdo->prepare("UPDATE email_reply_messages SET status='SENT',provider_message_id=?,sent_at=UTC_TIMESTAMP(),error_message=NULL WHERE tenant_id=? AND public_id=?")->execute([$providerId,$user['tenant_id'],$publicId]);
    audit('reply.sent','email_reply',$replyId,['recipient'=>$reply['sender_email'],'smtpAccount'=>$reply['account_public_id']]);
    respond(['id'=>$publicId,'status'=>'SENT','sentAt'=>gmdate('Y-m-d H:i:s')],201);
}catch(Throwable $error){
    $safe=mb_substr(preg_replace('/(password|credential)\s*[:=]\s*\S+/i','$1=[redacted]',$error->getMessage())??'Reply delivery failed.',0,500);
    $pdo->prepare("UPDATE email_reply_messages SET status='FAILED',error_message=? WHERE tenant_id=? AND public_id=?")->execute([$safe,$user['tenant_id'],$publicId]);
    audit('reply.send_failed','email_reply',$replyId,['error'=>$safe]);
    throw new ApiError(422,'Reply could not be sent. Check the sending account and try again.',['diagnostic'=>$safe]);
}
