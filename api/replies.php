<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/services/ReplyMailboxService.php';
require_method('GET');
$user = current_user();
[$page,$per,$offset] = pagination();
$where = "r.tenant_id=? AND r.reply_type='HUMAN'";
$params = [$user['tenant_id']];
if ($user['role'] === 'MEMBER') { $where .= ' AND c.created_by=?'; $params[] = $user['id']; }
if (!empty($_GET['campaign_id'])) { $where .= ' AND c.public_id=?'; $params[] = trim((string)$_GET['campaign_id']); }
$count = db()->prepare("SELECT COUNT(*) FROM email_replies r JOIN campaigns c ON c.id=r.campaign_id AND c.tenant_id=r.tenant_id WHERE {$where}");
$count->execute($params); $total = (int)$count->fetchColumn();
$statement = db()->prepare("SELECT r.public_id id,r.sender_email senderEmail,r.sender_name senderName,r.subject,r.body_text body,r.received_at receivedAt,c.public_id campaignId,c.name campaignName,l.public_id leadId,COALESCE(NULLIF(CONCAT_WS(' ',l.first_name,l.last_name),''),l.name) leadName,l.company_name company FROM email_replies r JOIN campaigns c ON c.id=r.campaign_id AND c.tenant_id=r.tenant_id JOIN leads l ON l.id=r.lead_id AND l.tenant_id=r.tenant_id WHERE {$where} ORDER BY r.received_at DESC,r.id DESC LIMIT ? OFFSET ?");
$index=1;foreach($params as $value)$statement->bindValue($index++,$value);$statement->bindValue($index++,$per,PDO::PARAM_INT);$statement->bindValue($index,$offset,PDO::PARAM_INT);$statement->execute();
$rows=$statement->fetchAll();foreach($rows as &$row)$row['body']=ReplyMailboxService::cleanReplyText((string)$row['body']);
respond($rows,200,['page'=>$page,'perPage'=>$per,'total'=>$total,'pages'=>(int)ceil($total/$per)]);
