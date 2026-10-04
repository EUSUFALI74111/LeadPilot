<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/bootstrap.php'; require_method('POST'); $u=current_user(); require_csrf(); $d=input();
$name=string_value($d,'name',120); $subject=string_value($d,'subject',200); $smtpId=string_value($d,'smtpAccountId',36);
$filter=strtoupper((string)($d['recipientStatus']??'ALL')); if(!in_array($filter,['ALL','NEW','CONTACTED','QUALIFIED'],true))throw new ApiError(422,'Invalid recipient filter.');
$s=db()->prepare("SELECT id FROM smtp_accounts WHERE tenant_id=? AND public_id=? AND is_active=1 AND status='CONNECTED'"); $s->execute([$u['tenant_id'],$smtpId]); $smtpInternal=$s->fetchColumn(); if(!$smtpInternal)throw new ApiError(422,'Select an active, connected sending account.');
$body=string_value($d,'body',250000);$format=strtolower((string)($d['bodyFormat']??'text'));if(!in_array($format,['text','html'],true))throw new ApiError(422,'Invalid body format.');if($format==='html')$body=sanitize_email_html($body);
$schedule=null; if(!empty($d['scheduledAt'])){ try{$schedule=(new DateTimeImmutable((string)$d['scheduledAt']))->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');}catch(Throwable){throw new ApiError(422,'Invalid scheduled time.');} }
$id=uuid(); $pdo=db(); $pdo->beginTransaction();
try{
    $pdo->prepare("INSERT INTO campaigns (tenant_id,public_id,name,subject,body,body_format,smtp_account_id,template_id,recipient_filter,status,scheduled_at,created_by) VALUES (?,?,?,?,?,?,?,NULL,?, 'DRAFT',?,?)")->execute([$u['tenant_id'],$id,$name,$subject,$body,$format,$smtpInternal,json_encode(['status'=>$filter],JSON_THROW_ON_ERROR),$schedule,$u['id']]);
    $campaign=(int)$pdo->lastInsertId(); $where="tenant_id=? AND status NOT IN ('UNSUBSCRIBED','BOUNCED','SEND_FAILED')"; $leadParams=[$u['tenant_id']];
    if($filter!=='ALL'){ $where.=' AND status=?'; $leadParams[]=$filter; }
    if($u['role']==='MEMBER'){ $where.=' AND (assigned_user_id=? OR created_by=?)'; array_push($leadParams,$u['id'],$u['id']); }
    $stmt=$pdo->prepare("INSERT INTO campaign_recipients (tenant_id,campaign_id,lead_id,recipient_email,recipient_name,status,available_at) SELECT tenant_id,?,id,email,name,'PENDING',COALESCE(?,UTC_TIMESTAMP()) FROM leads WHERE {$where}");
    $stmt->execute([$campaign,$schedule,...$leadParams]); $total=$stmt->rowCount();
    $pdo->prepare('UPDATE campaigns SET total_recipients=?,pending_count=? WHERE id=? AND tenant_id=?')->execute([$total,$total,$campaign,$u['tenant_id']]); $pdo->commit();
}catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
audit('campaign.created','campaign',$id,['recipients'=>$total]); respond(['id'=>$id,'recipients'=>$total],201);
