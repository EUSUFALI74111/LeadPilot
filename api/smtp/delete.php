<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/bootstrap.php';require_method('DELETE');$u=require_role('OWNER');require_csrf();$id=string_value(input(),'id',36);try{$s=db()->prepare('DELETE FROM smtp_accounts WHERE tenant_id=? AND public_id=?');$s->execute([$u['tenant_id'],$id]);}catch(PDOException $e){if($e->getCode()==='23000')throw new ApiError(409,'This account is used by a campaign and cannot be deleted. Disable it instead.');throw $e;}if(!$s->rowCount())throw new ApiError(404,'SMTP account not found.');audit('smtp.removed','smtp_account',$id);respond(['deleted'=>1]);
