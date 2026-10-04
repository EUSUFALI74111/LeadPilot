<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';
$user = current_user();

function lead_custom_fields(mixed $value): ?string
{
    if ($value === null || $value === '' || $value === []) return null;
    if (!is_array($value) || count($value) > 50) throw new ApiError(422, 'Custom fields must be an object with at most 50 values.');
    $clean = [];
    foreach ($value as $key => $item) {
        $name = strtolower(trim((string)preg_replace('/[^a-z0-9_]+/i', '_', (string)$key), '_'));
        if ($name === '' || strlen($name) > 64 || (!is_scalar($item) && $item !== null)) throw new ApiError(422, 'Invalid custom field.');
        $clean[$name] = mb_substr(trim((string)$item), 0, 1000);
    }
    return $clean ? json_encode($clean, JSON_THROW_ON_ERROR) : null;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    [$page,$perPage,$offset] = pagination();
    $where = ['tenant_id=?'];
    $params = [$user['tenant_id']];
    if ($user['role'] === 'MEMBER') { $where[] = '(assigned_user_id=? OR created_by=?)'; array_push($params,$user['id'],$user['id']); }
    $search = trim((string)($_GET['search'] ?? ''));
    if ($search !== '') { $where[] = '(name LIKE ? OR first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR company_name LIKE ? OR company LIKE ? OR phone LIKE ?)'; $like = '%' . $search . '%'; array_push($params,$like,$like,$like,$like,$like,$like,$like); }
    $filters = ['source'=>'source','company'=>'company_name','job_title'=>'job_title','location'=>'location'];
    foreach ($filters as $query => $column) if (trim((string)($_GET[$query] ?? '')) !== '') { $where[] = "$column LIKE ?"; $params[] = '%' . trim((string)$_GET[$query]) . '%'; }
    $status = strtoupper(str_replace(' ','_',trim((string)($_GET['status'] ?? ''))));
    if (in_array($status,['NEW','CONTACTED','QUALIFIED','SEND_FAILED','BOUNCED','UNSUBSCRIBED'],true)) { $where[]='status=?'; $params[]=$status; }
    $sqlWhere = implode(' AND ', $where);
    $count = db()->prepare("SELECT COUNT(*) FROM leads WHERE {$sqlWhere}"); $count->execute($params); $total=(int)$count->fetchColumn();
    $order = ($_GET['sort'] ?? 'newest') === 'oldest' ? 'ASC' : 'DESC';
    $columns = "public_id id,COALESCE(first_name,'') firstName,COALESCE(last_name,'') lastName,name fullName,email,COALESCE(company_name,company,'') companyName,COALESCE(phone,'') phone,COALESCE(job_title,'') jobTitle,COALESCE(website,'') website,COALESCE(linkedin,'') linkedin,COALESCE(facebook,'') facebook,COALESCE(instagram,'') instagram,COALESCE(twitter,'') twitter,COALESCE(tiktok,'') tiktok,COALESCE(location,'') location,COALESCE(country,'') country,COALESCE(source,'') source,other_socials otherSocialLinks,custom_fields customFields,status,COALESCE(bounce_reason,'') bounceReason,bounced_at bouncedAt,tags,COALESCE(notes,'') notes,DATE_FORMAT(created_at,'%Y-%m-%d') addedDate";
    $stmt = db()->prepare("SELECT {$columns} FROM leads WHERE {$sqlWhere} ORDER BY created_at {$order} LIMIT ? OFFSET ?");
    $i=1; foreach($params as $value) $stmt->bindValue($i++,$value); $stmt->bindValue($i++,$perPage,PDO::PARAM_INT); $stmt->bindValue($i,$offset,PDO::PARAM_INT); $stmt->execute();
    $rows=$stmt->fetchAll();
    foreach($rows as &$row){$row['status']=$row['status']==='SEND_FAILED'?'Send failed':ucfirst(strtolower($row['status']));foreach(['tags','otherSocialLinks','customFields'] as $key)$row[$key]=$row[$key]?json_decode($row[$key],true):($key==='tags'?[]:[]);}
    respond($rows,200,['page'=>$page,'perPage'=>$perPage,'total'=>$total,'pages'=>(int)ceil($total/$perPage)]);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_csrf(); $data=input();
    $first=string_value($data,'firstName',100,false) ?? '';
    $last=string_value($data,'lastName',100,false) ?? '';
    $name=trim($first . ' ' . $last);
    if ($name === '') $name=string_value($data,'fullName',100,false) ?? string_value($data,'name',100);
    if ($first === '') $first=trim((string)strtok($name,' '));
    $email=email_value($data); $company=string_value($data,'companyName',120,false) ?? string_value($data,'company',120,false);
    $status=strtoupper(str_replace(' ','_',(string)($data['status']??'NEW'))); if(!in_array($status,['NEW','CONTACTED','QUALIFIED','SEND_FAILED','BOUNCED','UNSUBSCRIBED'],true))throw new ApiError(422,'Invalid lead status.');
    $id=uuid();
    $phone=string_value($data,'phone',40,false);$values=[$user['tenant_id'],$id,$name,$first?:null,$last?:null,$email,$email,$phone,normalize_phone($phone),$company,$company,safe_url_value($data,'website'),string_value($data,'jobTitle',150,false),safe_url_value($data,'linkedin'),safe_url_value($data,'facebook'),safe_url_value($data,'instagram'),safe_url_value($data,'twitter'),safe_url_value($data,'tiktok'),isset($data['otherSocialLinks'])?json_encode((array)$data['otherSocialLinks'],JSON_THROW_ON_ERROR):null,string_value($data,'location',255,false),string_value($data,'country',100,false),string_value($data,'source',100,false),lead_custom_fields($data['customFields']??null),$status,json_encode(array_values(array_filter((array)($data['tags']??[]))),JSON_THROW_ON_ERROR),string_value($data,'notes',10000,false),$user['id'],$user['id']];
    try { db()->prepare('INSERT INTO leads (tenant_id,public_id,name,first_name,last_name,email,email_normalized,phone,phone_normalized,company,company_name,website,job_title,linkedin,facebook,instagram,twitter,tiktok,other_socials,location,country,source,custom_fields,status,tags,notes,created_by,assigned_user_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')->execute($values); }
    catch(PDOException $e){ if($e->getCode()==='23000')throw new ApiError(409,'A lead with this email or personal phone already exists.'); throw $e; }
    audit('lead.created','lead',$id); respond(['id'=>$id],201);
}
throw new ApiError(405,'Method not allowed.');
