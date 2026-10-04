<?php
declare(strict_types=1);

function lead_selection(array $data, array $user, string $alias = 'l'): array
{
    $where = ["{$alias}.tenant_id=?", "{$alias}.status NOT IN ('SEND_FAILED','BOUNCED','UNSUBSCRIBED')"];
    $params = [$user['tenant_id']];
    if ($user['role'] === 'MEMBER') { $where[] = "({$alias}.assigned_user_id=? OR {$alias}.created_by=?)"; array_push($params,$user['id'],$user['id']); }
    $mode = strtoupper((string)($data['recipientMode'] ?? 'ALL'));
    if ($mode === 'STATUS') {
        $status = strtoupper((string)($data['recipientStatus'] ?? ''));
        if (!in_array($status,['NEW','CONTACTED','QUALIFIED'],true)) throw new ApiError(422,'Choose a valid lead status.');
        $where[] = "{$alias}.status=?"; $params[] = $status;
    } elseif ($mode === 'FILTER') {
        $filters = [
            'filterCompany' => 'company_name',
            'filterSource' => 'source',
            'filterLocation' => 'location',
            'filterCountry' => 'country',
            'filterJobTitle' => 'job_title',
        ];
        $applied = 0;
        $status = strtoupper(trim((string)($data['recipientStatus'] ?? '')));
        if ($status !== '' && $status !== 'ANY') {
            if (!in_array($status, ['NEW','CONTACTED','QUALIFIED'], true)) throw new ApiError(422, 'Choose a valid lead status.');
            $where[] = "{$alias}.status=?"; $params[] = $status; $applied++;
        }
        foreach ($filters as $inputKey => $column) {
            $value = trim((string)($data[$inputKey] ?? ''));
            if ($value === '') continue;
            if (mb_strlen($value) > 255) throw new ApiError(422, 'A recipient filter is too long.');
            $where[] = "{$alias}.{$column} LIKE ? ESCAPE '\\\\'";
            $params[] = '%' . addcslashes($value, '%_\\') . '%';
            $applied++;
        }
        $customKey = strtolower(trim((string)($data['customFilterKey'] ?? '')));
        $customValue = trim((string)($data['customFilterValue'] ?? ''));
        if ($customKey !== '' || $customValue !== '') {
            if (!preg_match('/^[a-z][a-z0-9_]{0,63}$/', $customKey) || $customValue === '' || mb_strlen($customValue) > 255) {
                throw new ApiError(422, 'Enter a valid custom field key and value.');
            }
            $where[] = "JSON_UNQUOTE(JSON_EXTRACT({$alias}.custom_fields, ?)) LIKE ? ESCAPE '\\\\'";
            $params[] = '$."' . $customKey . '"';
            $params[] = '%' . addcslashes($customValue, '%_\\') . '%';
            $applied++;
        }
        if ($applied === 0) throw new ApiError(422, 'Choose at least one advanced recipient filter.');
    } elseif ($mode === 'SEARCH') {
        $search = trim((string)($data['search'] ?? ''));
        if ($search === '') throw new ApiError(422,'Enter a recipient search term.');
        $like = '%' . $search . '%';
        $where[] = "({$alias}.name LIKE ? OR {$alias}.email LIKE ? OR {$alias}.company_name LIKE ? OR {$alias}.phone LIKE ?)";
        array_push($params,$like,$like,$like,$like);
    } elseif ($mode === 'SELECTED') {
        $ids = array_values(array_unique(array_filter(array_map('strval',(array)($data['leadIds']??[])))));
        if (!$ids || count($ids)>10000) throw new ApiError(422,'Choose between 1 and 10,000 leads.');
        $where[] = "{$alias}.public_id IN (" . implode(',',array_fill(0,count($ids),'?')) . ')';
        array_push($params,...$ids);
    } elseif ($mode !== 'ALL') throw new ApiError(422,'Invalid recipient selection.');
    return [implode(' AND ',$where),$params,$mode];
}

function lead_select_columns(string $alias='l'): string
{
    return "{$alias}.id,{$alias}.public_id,{$alias}.name,{$alias}.first_name,{$alias}.last_name,{$alias}.email,COALESCE({$alias}.company_name,{$alias}.company,'') company_name,{$alias}.phone,{$alias}.job_title,{$alias}.website,{$alias}.linkedin,{$alias}.facebook,{$alias}.instagram,{$alias}.twitter,{$alias}.tiktok,{$alias}.location,{$alias}.country,{$alias}.source,{$alias}.custom_fields";
}

function lead_range(array $data): array
{
    $max = max(1, min(100000, (int)env('MAX_GROUP_RECIPIENTS', '100000')));
    $start = filter_var($data['rangeStart'] ?? 1, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
    $end = filter_var($data['rangeEnd'] ?? $max, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
    if ($start === false || $end === false || $end < $start) {
        throw new ApiError(422, 'Enter a valid recipient position range.');
    }
    $limit = $end - $start + 1;
    if ($limit > $max) throw new ApiError(422, "A campaign can contain at most {$max} recipients.");
    return [$start - 1, $limit, $start, $end];
}
