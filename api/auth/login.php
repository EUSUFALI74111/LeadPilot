<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/bootstrap.php';
require_method('POST');
$data = input();
$email = email_value($data);
$password = (string)($data['password'] ?? '');
rate_limit('login_ip', client_ip(), 30, 900);
rate_limit('login_email', $email, 10, 900);
$stmt = db()->prepare("SELECT u.*, t.public_id tenant_public_id, t.name company_name, t.status tenant_status FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE u.email=? LIMIT 1");
$stmt->execute([$email]);
$user = $stmt->fetch();
$valid = $user && password_verify($password, $user['password_hash']);
if (!$valid) {
    if ($user) db()->prepare('UPDATE users SET failed_login_attempts=failed_login_attempts+1, locked_until=IF(failed_login_attempts>=4, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 15 MINUTE), locked_until) WHERE id=?')->execute([$user['id']]);
    audit('auth.login_failed', 'user', $user['public_id'] ?? null, ['emailHash' => hash('sha256', $email)], $user ?: null);
    throw new ApiError(401, 'Invalid email or password.');
}
if ($user['locked_until'] && strtotime($user['locked_until']) > time()) throw new ApiError(429, 'This account is temporarily locked. Try again later.');
if ($user['status'] === 'PENDING') throw new ApiError(403, 'Email verification is required.', ['verificationRequired' => true, 'email' => $email]);
if ($user['status'] !== 'ACTIVE' || $user['tenant_status'] !== 'ACTIVE') throw new ApiError(403, 'This account is not active.');
db()->prepare('UPDATE users SET failed_login_attempts=0, locked_until=NULL, last_login_at=UTC_TIMESTAMP() WHERE id=?')->execute([$user['id']]);
$session = create_session($user, !empty($data['remember']));
audit('auth.login', 'user', $user['public_id'], [], $user);
respond(['user' => public_user($user), ...$session]);
