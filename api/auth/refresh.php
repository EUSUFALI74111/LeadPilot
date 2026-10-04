<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/bootstrap.php';
require_method('POST');
$token = (string)($_COOKIE['lp_refresh'] ?? '');
if ($token === '') throw new ApiError(401, 'Session expired.');
$stmt = db()->prepare("SELECT u.*, t.public_id tenant_public_id, t.name company_name, t.status tenant_status, s.id session_id FROM auth_sessions s JOIN users u ON u.id=s.user_id AND u.tenant_id=s.tenant_id JOIN tenants t ON t.id=s.tenant_id WHERE s.refresh_token_hash=? AND s.revoked_at IS NULL AND s.refresh_expires_at>UTC_TIMESTAMP() LIMIT 1");
$stmt->execute([hash('sha256', $token)]);
$user = $stmt->fetch();
if (!$user || $user['status'] !== 'ACTIVE' || $user['tenant_status'] !== 'ACTIVE') { clear_session_cookies(); throw new ApiError(401, 'Session expired.'); }
db()->prepare('UPDATE auth_sessions SET revoked_at=UTC_TIMESTAMP() WHERE id=?')->execute([$user['session_id']]);
$session = create_session($user, true);
respond(['user' => public_user($user), ...$session]);
