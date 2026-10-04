<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/bootstrap.php';
require_method('POST');
$data = input();
$email = email_value($data);
$code = preg_replace('/\D/', '', (string)($data['code'] ?? ''));
if (strlen($code) !== 6) throw new ApiError(422, 'Enter the 6-digit verification code.');
rate_limit('verify_otp_ip', client_ip(), 20, 3600);
rate_limit('verify_otp_email', $email, 10, 3600);

$pdo = db();
$pdo->beginTransaction();
try {
    $stmt = $pdo->prepare("SELECT u.*, t.public_id tenant_public_id, t.name company_name, t.status tenant_status FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE u.email=? LIMIT 1 FOR UPDATE");
    $stmt->execute([$email]);
    $user = $stmt->fetch();
    if (!$user) throw new ApiError(400, 'The code is invalid or expired.');
    $stmt = $pdo->prepare("SELECT * FROM one_time_codes WHERE user_id=? AND purpose='VERIFY_EMAIL' AND consumed_at IS NULL ORDER BY id DESC LIMIT 1 FOR UPDATE");
    $stmt->execute([$user['id']]);
    $otp = $stmt->fetch();
    if (!$otp || $otp['attempts'] >= 5 || strtotime($otp['expires_at']) <= time()) throw new ApiError(400, 'The code is invalid or expired.');
    if (!password_verify($code, $otp['code_hash'])) {
        $pdo->prepare('UPDATE one_time_codes SET attempts=attempts+1 WHERE id=?')->execute([$otp['id']]);
        $pdo->commit();
        throw new ApiError(400, 'The code is invalid or expired.');
    }
    $pdo->prepare('UPDATE one_time_codes SET consumed_at=UTC_TIMESTAMP() WHERE id=?')->execute([$otp['id']]);
    $pdo->prepare("UPDATE users SET status='ACTIVE', email_verified_at=UTC_TIMESTAMP() WHERE id=? AND tenant_id=?")->execute([$user['id'], $user['tenant_id']]);
    $pdo->prepare("UPDATE tenants SET status='ACTIVE' WHERE id=?")->execute([$user['tenant_id']]);
    $pdo->commit();
    $user['status'] = 'ACTIVE'; $user['tenant_status'] = 'ACTIVE';
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $e;
}
$session = create_session($user, true);
audit('email.verified', 'user', $user['public_id'], [], $user);
respond(['user' => public_user($user), ...$session]);
