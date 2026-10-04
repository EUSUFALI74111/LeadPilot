<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/bootstrap.php';
require_method('GET');
$user = current_user();
respond(['user' => public_user($user), 'csrfToken' => (string)($_COOKIE['lp_csrf'] ?? '')]);
