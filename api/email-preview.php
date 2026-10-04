<?php
declare(strict_types=1);
require_once __DIR__.'/bootstrap.php';require_once __DIR__.'/services/LeadSelection.php';require_method('POST');$u=current_user();require_csrf();$d=input();
[$where,$params]=lead_selection($d,$u);[$offset,$limit,$rangeStart,$rangeEnd]=lead_range($d);$count=db()->prepare("SELECT COUNT(*) FROM leads l WHERE {$where}");$count->execute($params);$total=(int)$count->fetchColumn();$selected=max(0,min($limit,$total-$offset));
$stmt=db()->prepare('SELECT '.lead_select_columns().' FROM leads l WHERE '.$where.' ORDER BY l.id ASC LIMIT 5 OFFSET '.$offset);$stmt->execute($params);$leads=$stmt->fetchAll();
$subject=mb_substr((string)($d['subject']??''),0,200);$body=mb_substr((string)($d['body']??''),0,250000);$format=strtolower((string)($d['bodyFormat']??'text'));if(!in_array($format,['text','html'],true))$format='text';if($format==='html')$body=sanitize_email_html($body);
$variables=template_variables($subject,$body);$standard=['first_name','last_name','full_name','name','email','company_name','company','phone','job_title','website','linkedin','facebook','instagram','twitter','tiktok','location','country','source'];$unknown=array_values(array_diff($variables,$standard));
if($unknown&&$total>0){foreach($unknown as $index=>$key){$check=db()->prepare("SELECT 1 FROM leads l WHERE {$where} AND JSON_CONTAINS_PATH(l.custom_fields,'one',?) LIMIT 1");$check->execute([...$params,'$."'.$key.'"']);if($check->fetchColumn())unset($unknown[$index]);}}
$samples=[];foreach($leads as $lead)$samples[]=['id'=>$lead['public_id'],'name'=>$lead['name'],'email'=>$lead['email'],'subject'=>render_template($subject,$lead),'body'=>render_template($body,$lead)];
respond(['count'=>$selected,'totalMatches'=>$total,'rangeStart'=>$rangeStart,'rangeEnd'=>$rangeEnd,'samples'=>$samples,'unknownVariables'=>array_values($unknown),'bodyFormat'=>$format]);
