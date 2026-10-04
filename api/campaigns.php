<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';
require_method('GET');
$u=current_user(); [$page,$per,$offset]=pagination(); $where='c.tenant_id=?'; $p=[$u['tenant_id']];
if($u['role']==='MEMBER'){ $where.=' AND c.created_by=?'; $p[]=$u['id']; }
$count=db()->prepare("SELECT COUNT(*) FROM campaigns c WHERE {$where}"); $count->execute($p); $total=(int)$count->fetchColumn();
$s=db()->prepare("SELECT c.public_id id,c.name,c.subject,c.status,c.total_recipients recipients,c.sent_count sent,c.failed_count failed,c.pending_count pending,c.created_at createdAt,c.scheduled_at schedule,c.started_at startedAt,c.completed_at completedAt,a.sender_email sender,(SELECT MIN(rq.available_at) FROM campaign_recipients rq WHERE rq.tenant_id=c.tenant_id AND rq.campaign_id=c.id AND rq.status IN ('PENDING','RETRY')) nextDeliveryAt,CASE WHEN c.status IN ('COMPLETED','FAILED','CANCELLED') THEN 1 ELSE 0 END canDelete FROM campaigns c JOIN smtp_accounts a ON a.id=c.smtp_account_id AND a.tenant_id=c.tenant_id WHERE {$where} ORDER BY c.created_at DESC LIMIT ? OFFSET ?");
$i=1; foreach($p as $v)$s->bindValue($i++,$v); $s->bindValue($i++,$per,PDO::PARAM_INT); $s->bindValue($i,$offset,PDO::PARAM_INT); $s->execute();
$rows=$s->fetchAll();foreach($rows as &$row)$row['canDelete']=(bool)$row['canDelete'];unset($row);respond($rows,200,['page'=>$page,'perPage'=>$per,'total'=>$total,'pages'=>(int)ceil($total/$per)]);
