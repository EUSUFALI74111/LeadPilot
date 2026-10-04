<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/bootstrap.php';
require_method('DELETE');
$user=current_user();require_csrf();$data=input();
$status=strtoupper(str_replace(' ','_',(string)($data['status']??'')));
if(!in_array($status,['BOUNCED','SEND_FAILED'],true))throw new ApiError(422,'Choose Bounced or Send failed leads.');
$scope=strtoupper((string)($data['scope']??'SELECTED'));$ids=array_values(array_unique(array_filter(array_map('strval',(array)($data['ids']??[])))));
if($scope!=='ALL'&&($scope!=='SELECTED'||!$ids||count($ids)>5000))throw new ApiError(422,'Select between 1 and 5,000 leads.');
$where='tenant_id=? AND status=?';$params=[$user['tenant_id'],$status];
if($scope==='SELECTED'){$where.=' AND public_id IN ('.implode(',',array_fill(0,count($ids),'?')).')';array_push($params,...$ids);}
if($user['role']==='MEMBER'){$where.=' AND (assigned_user_id=? OR created_by=?)';array_push($params,$user['id'],$user['id']);}
$pdo=db();$pdo->beginTransaction();
try{
    $find=$pdo->prepare("SELECT id FROM leads WHERE {$where} LIMIT 5000 FOR UPDATE");$find->execute($params);$leadIds=array_map('intval',$find->fetchAll(PDO::FETCH_COLUMN));
    if(!$leadIds){$pdo->commit();respond(['deleted'=>0]);}
    $marks=implode(',',array_fill(0,count($leadIds),'?'));$campaigns=$pdo->prepare("SELECT DISTINCT campaign_id FROM campaign_recipients WHERE tenant_id=? AND lead_id IN ({$marks})");$campaigns->execute([$user['tenant_id'],...$leadIds]);$campaignIds=array_map('intval',$campaigns->fetchAll(PDO::FETCH_COLUMN));
    $pdo->prepare("DELETE FROM campaign_recipients WHERE tenant_id=? AND lead_id IN ({$marks})")->execute([$user['tenant_id'],...$leadIds]);
    $delete=$pdo->prepare("DELETE FROM leads WHERE tenant_id=? AND id IN ({$marks}) AND status=?");$delete->execute([$user['tenant_id'],...$leadIds,$status]);
    foreach($campaignIds as $campaignId){$stats=$pdo->prepare("SELECT COUNT(*) total,COALESCE(SUM(status='SENT'),0) sent,COALESCE(SUM(status='FAILED'),0) failed,COALESCE(SUM(status IN ('PENDING','PROCESSING','RETRY')),0) pending FROM campaign_recipients WHERE tenant_id=? AND campaign_id=?");$stats->execute([$user['tenant_id'],$campaignId]);$counts=$stats->fetch();$pdo->prepare("UPDATE campaigns SET total_recipients=?,sent_count=?,failed_count=?,pending_count=? WHERE tenant_id=? AND id=?")->execute([(int)$counts['total'],(int)$counts['sent'],(int)$counts['failed'],(int)$counts['pending'],$user['tenant_id'],$campaignId]);}
    $pdo->commit();audit('lead.status_purged','lead',null,['count'=>$delete->rowCount(),'status'=>$status,'scope'=>$scope]);respond(['deleted'=>$delete->rowCount()]);
}catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
