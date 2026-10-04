<?php
declare(strict_types=1);
require_once dirname(__DIR__).'/bootstrap.php';require_method('DELETE');$u=current_user();require_csrf();rate_limit('purge_failed_leads',$u['tenant_id'].':'.$u['id'],5,3600);$id=string_value(input(),'id',36);$campaign=authorize_campaign($id);$pdo=db();$pdo->beginTransaction();
try{
    $find=$pdo->prepare("SELECT DISTINCT lead_id FROM campaign_recipients WHERE tenant_id=? AND campaign_id=? AND status='FAILED' LIMIT 5000 FOR UPDATE");$find->execute([$u['tenant_id'],$campaign['id']]);$leadIds=array_map('intval',$find->fetchAll(PDO::FETCH_COLUMN));if(!$leadIds){$pdo->commit();respond(['deleted'=>0]);}
    $marks=implode(',',array_fill(0,count($leadIds),'?'));$affected=$pdo->prepare("SELECT DISTINCT campaign_id FROM campaign_recipients WHERE tenant_id=? AND lead_id IN ({$marks})");$affected->execute([$u['tenant_id'],...$leadIds]);$campaignIds=array_map('intval',$affected->fetchAll(PDO::FETCH_COLUMN));
    $pdo->prepare("DELETE FROM campaign_recipients WHERE tenant_id=? AND lead_id IN ({$marks})")->execute([$u['tenant_id'],...$leadIds]);$delete=$pdo->prepare("DELETE FROM leads WHERE tenant_id=? AND id IN ({$marks})");$delete->execute([$u['tenant_id'],...$leadIds]);
    foreach($campaignIds as $campaignId){$stats=$pdo->prepare("SELECT COUNT(*) total,COALESCE(SUM(status='SENT'),0) sent,COALESCE(SUM(status='FAILED'),0) failed,COALESCE(SUM(status IN ('PENDING','PROCESSING','RETRY')),0) pending FROM campaign_recipients WHERE tenant_id=? AND campaign_id=?");$stats->execute([$u['tenant_id'],$campaignId]);$counts=$stats->fetch();$pdo->prepare("UPDATE campaigns SET total_recipients=?,sent_count=?,failed_count=?,pending_count=? WHERE tenant_id=? AND id=?")->execute([(int)$counts['total'],(int)$counts['sent'],(int)$counts['failed'],(int)$counts['pending'],$u['tenant_id'],$campaignId]);}
    $pdo->commit();
}catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
audit('campaign.failed_leads_purged','campaign',$id,['deleted'=>$delete->rowCount()]);respond(['deleted'=>$delete->rowCount()]);
