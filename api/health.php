<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

require_method('GET');
db()->query('SELECT 1')->fetchColumn();
respond([
    'status' => 'ok',
    'service' => 'LeadPilot API',
]);
