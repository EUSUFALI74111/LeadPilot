<?php
declare(strict_types=1);
require_once dirname(__DIR__).'/bootstrap.php';require_method('DELETE');$u=current_user();require_csrf();$id=string_value(input(),'id',36);authorize_campaign($id);
$pdo=db();$pdo->beginTransaction();
try{
    $s=$pdo->prepare("SELECT id,status,total_recipients,sent_count,failed_count FROM campaigns WHERE tenant_id=? AND public_id=? FOR UPDATE");$s->execute([$u['tenant_id'],$id]);$campaign=$s->fetch();if(!$campaign)throw new ApiError(404,'Sending history not found.');
    if(!in_array($campaign['status'],['COMPLETED','FAILED','CANCELLED'],true))throw new ApiError(409,'Pause or cancel this campaign first. Only completed, failed, or cancelled history can be deleted.');
    $pdo->prepare('DELETE FROM lead_campaign_claims WHERE tenant_id=? AND campaign_id=?')->execute([$u['tenant_id'],$campaign['id']]);
    $delete=$pdo->prepare('DELETE FROM campaigns WHERE tenant_id=? AND id=?');$delete->execute([$u['tenant_id'],$campaign['id']]);$pdo->commit();
}catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
audit('sending_history.deleted','campaign',$id,['status'=>$campaign['status'],'recipients'=>(int)$campaign['total_recipients'],'sent'=>(int)$campaign['sent_count'],'failed'=>(int)$campaign['failed_count']]);respond(['deleted'=>$delete->rowCount()]);
