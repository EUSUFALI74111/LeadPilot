<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/bootstrap.php'; require_method('DELETE');$u=current_user();require_csrf();$d=input();$ids=array_values(array_unique(array_filter((array)($d['ids']??[$d['id']??null]),'is_string')));if(!$ids||count($ids)>100)throw new ApiError(422,'Provide between 1 and 100 lead IDs.');
$marks=implode(',',array_fill(0,count($ids),'?'));$p=[$u['tenant_id'],...$ids];$sql="DELETE FROM leads WHERE tenant_id=? AND public_id IN ({$marks})";if($u['role']==='MEMBER'){$sql.=' AND (assigned_user_id=? OR created_by=?)';array_push($p,$u['id'],$u['id']);}$s=db()->prepare($sql);$s->execute($p);audit('lead.deleted','lead',null,['count'=>$s->rowCount()]);respond(['deleted'=>$s->rowCount()]);
