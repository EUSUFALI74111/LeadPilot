<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/bootstrap.php';require_method('GET');$u=current_user();
$where='tenant_id=?';$params=[$u['tenant_id']];if($u['role']==='MEMBER'){$where.=' AND (assigned_user_id=? OR created_by=?)';array_push($params,$u['id'],$u['id']);}
$stmt=db()->prepare("SELECT first_name,last_name,name,email,COALESCE(company_name,company) company_name,phone,job_title,website,linkedin,facebook,instagram,twitter,tiktok,other_socials,location,country,source,status,notes,custom_fields FROM leads WHERE {$where} ORDER BY id");$stmt->execute($params);
header('Content-Type: text/csv; charset=utf-8');header('Content-Disposition: attachment; filename="leadpilot-leads-'.gmdate('Y-m-d').'.csv"');header('X-Content-Type-Options: nosniff');
$out=fopen('php://output','wb');fwrite($out,"\xEF\xBB\xBF");fputcsv($out,['First Name','Last Name','Full Name','Email','Company Name','Phone','Job Title','Website','LinkedIn','Facebook','Instagram','Twitter/X','TikTok','Other Social Links','Location','Country','Source','Status','Notes','Custom Fields']);
while($row=$stmt->fetch()){fputcsv($out,[$row['first_name'],$row['last_name'],$row['name'],$row['email'],$row['company_name'],$row['phone'],$row['job_title'],$row['website'],$row['linkedin'],$row['facebook'],$row['instagram'],$row['twitter'],$row['tiktok'],$row['other_socials'],$row['location'],$row['country'],$row['source'],$row['status'],$row['notes'],$row['custom_fields']]);if(ob_get_level()>0)ob_flush();flush();}fclose($out);exit;
