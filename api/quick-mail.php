<?php
declare(strict_types=1);
require_once __DIR__.'/bootstrap.php';
require_once __DIR__.'/services/LeadSelection.php';
require_method('POST');
$u=current_user();require_csrf();rate_limit('quick_mail',$u['tenant_id'].':'.$u['id'],30,3600);$d=input();

$subject=string_value($d,'subject',200);$body=string_value($d,'body',250000);$format=strtolower((string)($d['bodyFormat']??'text'));
if(!in_array($format,['text','html'],true))throw new ApiError(422,'Invalid email body format.');
if($format==='html')$body=sanitize_email_html($body);

$requested=array_values(array_unique(array_filter(array_map('strval',(array)($d['smtpAccountIds']??[])))));
if(!$requested&&!empty($d['smtpAccountId']))$requested=[(string)$d['smtpAccountId']];
if(!$requested||count($requested)>100)throw new ApiError(422,'Select between 1 and 100 sending accounts.');
$marks=implode(',',array_fill(0,count($requested),'?'));
$accounts=db()->prepare("SELECT id,public_id,sender_email FROM smtp_accounts WHERE tenant_id=? AND public_id IN ({$marks}) AND is_active=1 AND status='CONNECTED' ORDER BY id");
$accounts->execute([$u['tenant_id'],...$requested]);$senders=$accounts->fetchAll();
if(count($senders)!==count($requested))throw new ApiError(422,'Every selected sending account must be active and tested.');

$scheduledAt=new DateTimeImmutable('now',new DateTimeZone('UTC'));
if(!empty($d['scheduledAt'])){try{$scheduledAt=(new DateTimeImmutable((string)$d['scheduledAt']))->setTimezone(new DateTimeZone('UTC'));}catch(Throwable){throw new ApiError(422,'Choose a valid schedule date and time.');}$now=new DateTimeImmutable('now',new DateTimeZone('UTC'));if($scheduledAt<$now->modify('+1 minute'))throw new ApiError(422,'Scheduled time must be at least one minute in the future.');if($scheduledAt>$now->modify('+1 year'))throw new ApiError(422,'Scheduled time must be within one year.');}
$scheduledSql=$scheduledAt->format('Y-m-d H:i:s');

[$where,$params,$mode]=lead_selection($d,$u);[$offset,$limit,$rangeStart,$rangeEnd]=lead_range($d);
$count=db()->prepare("SELECT COUNT(*) FROM leads l WHERE {$where}");$count->execute($params);$total=(int)$count->fetchColumn();$selected=max(0,min($limit,$total-$offset));
if($selected<1)throw new ApiError(422,'No eligible recipients exist in this position range.');
$variables=template_variables($subject,$body);$standard=['first_name','last_name','full_name','name','email','company_name','company','phone','job_title','website','linkedin','facebook','instagram','twitter','tiktok','location','country','source'];$unknown=array_values(array_diff($variables,$standard));
foreach($unknown as $index=>$key){$check=db()->prepare("SELECT 1 FROM leads l WHERE {$where} AND JSON_CONTAINS_PATH(l.custom_fields,'one',?) LIMIT 1");$check->execute([...$params,'$."'.$key.'"']);if($check->fetchColumn())unset($unknown[$index]);}
if($unknown)throw new ApiError(422,'Unknown personalization variables must be fixed before sending.',['unknownVariables'=>array_values($unknown)]);

$candidateQuery=db()->prepare("SELECT l.id FROM leads l WHERE {$where} ORDER BY l.id ASC LIMIT {$limit} OFFSET {$offset}");$candidateQuery->execute($params);$leadIds=array_map('intval',$candidateQuery->fetchAll(PDO::FETCH_COLUMN));
$senderCount=min(count($senders),count($leadIds));$senders=array_slice($senders,0,$senderCount);$base=intdiv(count($leadIds),$senderCount);$remainder=count($leadIds)%$senderCount;$cursor=0;
$groupId=uuid();$groupName='Batch Group #LP-'.gmdate('Ymd').'-'.strtoupper(substr(str_replace('-','',$groupId),0,6));
$filter=['mode'=>$mode,'status'=>$d['recipientStatus']??null,'search'=>$d['search']??null,'company'=>$d['filterCompany']??null,'source'=>$d['filterSource']??null,'location'=>$d['filterLocation']??null,'country'=>$d['filterCountry']??null,'jobTitle'=>$d['filterJobTitle']??null,'customField'=>$d['customFilterKey']??null,'customValue'=>$d['customFilterValue']??null,'leadIds'=>$mode==='SELECTED'?array_values((array)($d['leadIds']??[])):[],'rangeStart'=>$rangeStart,'rangeEnd'=>$rangeEnd];
$pdo=db();$pdo->beginTransaction();$campaigns=[];$queuedTotal=0;
try{
    foreach($senders as $index=>$sender){
        $size=$base+($index<$remainder?1:0);$chunk=array_slice($leadIds,$cursor,$size);$cursor+=$size;if(!$chunk)continue;
        $publicId=uuid();$name=$senderCount===1?str_replace('Group ','',$groupName):$groupName.' '.($index+1).'/'.$senderCount;
        $pdo->prepare("INSERT INTO campaigns (tenant_id,public_id,batch_group_id,name,subject,body,body_format,smtp_account_id,recipient_filter,status,scheduled_at,created_by) VALUES (?,?,?,?,?,?,?,?,?,'QUEUED',?,?)")->execute([$u['tenant_id'],$publicId,$groupId,$name,$subject,$body,$format,$sender['id'],json_encode($filter,JSON_THROW_ON_ERROR),$scheduledSql,$u['id']]);
        $campaign=(int)$pdo->lastInsertId();$leadMarks=implode(',',array_fill(0,count($chunk),'?'));
        $claim=$pdo->prepare("INSERT IGNORE INTO lead_campaign_claims (tenant_id,lead_id,campaign_id) SELECT tenant_id,id,? FROM leads WHERE tenant_id=? AND id IN ({$leadMarks})");$claim->execute([$campaign,$u['tenant_id'],...$chunk]);
        $insert=$pdo->prepare("INSERT INTO campaign_recipients (tenant_id,campaign_id,lead_id,recipient_email,recipient_name,status,available_at) SELECT l.tenant_id,?,l.id,l.email,l.name,'PENDING',? FROM lead_campaign_claims cl JOIN leads l ON l.tenant_id=cl.tenant_id AND l.id=cl.lead_id WHERE cl.tenant_id=? AND cl.campaign_id=? ORDER BY l.id ASC");$insert->execute([$campaign,$scheduledSql,$u['tenant_id'],$campaign]);$queued=$insert->rowCount();
        if($queued<1){$pdo->prepare('DELETE FROM campaigns WHERE tenant_id=? AND id=?')->execute([$u['tenant_id'],$campaign]);continue;}
        $pdo->prepare('UPDATE campaigns SET total_recipients=?,pending_count=? WHERE tenant_id=? AND id=?')->execute([$queued,$queued,$u['tenant_id'],$campaign]);$queuedTotal+=$queued;
        $campaigns[]=['id'=>$publicId,'name'=>$name,'sender'=>$sender['sender_email'],'recipients'=>$queued];
    }
    if($queuedTotal<1)throw new ApiError(409,'Every lead in this range is already reserved by another active campaign. Choose another range.');
    $pdo->commit();
}catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
$reserved=max(0,$selected-$queuedTotal);audit('quick_mail.group_queued','campaign_group',$groupId,['campaigns'=>count($campaigns),'recipients'=>$queuedTotal,'scheduledAt'=>$scheduledSql,'rangeStart'=>$rangeStart,'rangeEnd'=>$rangeEnd,'alreadyReserved'=>$reserved]);
respond(['id'=>$campaigns[0]['id'],'groupId'=>$groupId,'name'=>$groupName,'campaigns'=>$campaigns,'campaignCount'=>count($campaigns),'recipients'=>$queuedTotal,'alreadyReserved'=>$reserved,'status'=>'QUEUED','scheduledAt'=>$scheduledSql],201);
