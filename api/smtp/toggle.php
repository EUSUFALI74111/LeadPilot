<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/bootstrap.php';require_method('POST');$u=require_role('OWNER','ADMIN');require_csrf();$d=input();$id=string_value($d,'id',36);$enabled=!empty($d['enabled']);
$find=db()->prepare('SELECT id,status,is_active FROM smtp_accounts WHERE tenant_id=? AND public_id=? LIMIT 1');$find->execute([$u['tenant_id'],$id]);$account=$find->fetch();if(!$account)throw new ApiError(404,'SMTP account not found.');
if($enabled&&$account['status']!=='CONNECTED')throw new ApiError(422,'This account cannot send until a successful SMTP test. Open Test, choose a recipient, and verify it first.');
if((bool)$account['is_active']===$enabled)respond(['id'=>$id,'isActive'=>$enabled]);
db()->prepare('UPDATE smtp_accounts SET is_active=? WHERE tenant_id=? AND id=?')->execute([$enabled?1:0,$u['tenant_id'],$account['id']]);audit('smtp.toggled','smtp_account',$id,['enabled'=>$enabled]);respond(['id'=>$id,'isActive'=>$enabled]);
