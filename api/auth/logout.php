<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/bootstrap.php';
require_method('POST');
$user = current_user(false);
if ($user) {
    require_csrf();
    db()->prepare('UPDATE auth_sessions SET revoked_at=UTC_TIMESTAMP() WHERE id=?')->execute([$user['session_id']]);
    audit('auth.logout', 'user', $user['public_id'], [], $user);
}
clear_session_cookies();
respond(['message' => 'Signed out.']);
