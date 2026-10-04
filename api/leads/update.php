<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/bootstrap.php';
require_method('PUT');
$u=current_user(); require_csrf(); $d=input(); $id=string_value($d,'id',36);
$s=db()->prepare('SELECT * FROM leads WHERE tenant_id=? AND public_id=? LIMIT 1');$s->execute([$u['tenant_id'],$id]);$existing=$s->fetch();if(!$existing)throw new ApiError(404,'Lead not found.');
if($u['role']==='MEMBER'&&(int)$existing['assigned_user_id']!==(int)$u['id']&&(int)$existing['created_by']!==(int)$u['id'])throw new ApiError(403,'You cannot edit this lead.');
$first=array_key_exists('firstName',$d)?(string_value($d,'firstName',100,false)??''):(string)($existing['first_name']??'');
$last=array_key_exists('lastName',$d)?(string_value($d,'lastName',100,false)??''):(string)($existing['last_name']??'');
$name=trim($first.' '.$last);if($name==='')$name=string_value($d,'fullName',100,false)??string_value($d,'name',100,false)??(string)$existing['name'];
$email=array_key_exists('email',$d)?email_value($d):(string)$existing['email'];
$status=strtoupper(str_replace(' ','_',(string)($d['status']??$existing['status'])));if(!in_array($status,['NEW','CONTACTED','QUALIFIED','SEND_FAILED','BOUNCED','UNSUBSCRIBED'],true))throw new ApiError(422,'Invalid status.');
$company=string_value($d,'companyName',120,false)??string_value($d,'company',120,false)??$existing['company_name']??$existing['company'];
$custom=$d['customFields']??json_decode((string)($existing['custom_fields']??'[]'),true)??[];if(!is_array($custom)||count($custom)>50)throw new ApiError(422,'Invalid custom fields.');$clean=[];foreach($custom as $key=>$value){$key=strtolower(trim((string)preg_replace('/[^a-z0-9_]+/i','_',trim((string)$key)),'_'));if($key!==''&&is_scalar($value))$clean[$key]=mb_substr(trim((string)$value),0,1000);}
$url=function(string $key)use($d,$existing):?string{if(!array_key_exists($key,$d))return $existing[$key]??null;return safe_url_value($d,$key);};
$phone=string_value($d,'phone',40,false)??$existing['phone'];$values=[$name,$first?:null,$last?:null,$email,$email,$phone,normalize_phone($phone),$company,$company,$url('website'),string_value($d,'jobTitle',150,false)??$existing['job_title'],$url('linkedin'),$url('facebook'),$url('instagram'),$url('twitter'),$url('tiktok'),isset($d['otherSocialLinks'])?json_encode((array)$d['otherSocialLinks'],JSON_THROW_ON_ERROR):$existing['other_socials'],string_value($d,'location',255,false)??$existing['location'],string_value($d,'country',100,false)??$existing['country'],string_value($d,'source',100,false)??$existing['source'],$clean?json_encode($clean,JSON_THROW_ON_ERROR):null,$status,string_value($d,'notes',10000,false)??$existing['notes'],$u['tenant_id'],$id];
try{$q=db()->prepare("UPDATE leads SET name=?,first_name=?,last_name=?,email=?,email_normalized=?,phone=?,phone_normalized=?,company=?,company_name=?,website=?,job_title=?,linkedin=?,facebook=?,instagram=?,twitter=?,tiktok=?,other_socials=?,location=?,country=?,source=?,custom_fields=?,status=?,notes=?,bounce_reason=IF(? IN ('BOUNCED','SEND_FAILED'),bounce_reason,NULL),bounced_at=IF(? IN ('BOUNCED','SEND_FAILED'),bounced_at,NULL) WHERE tenant_id=? AND public_id=?");$updateValues=array_slice($values,0,23);array_push($updateValues,$status,$status,$u['tenant_id'],$id);$q->execute($updateValues);}catch(PDOException $e){if($e->getCode()==='23000')throw new ApiError(409,'A lead with this email or personal phone already exists.');throw $e;}
audit('lead.updated','lead',$id);respond(['id'=>$id]);
