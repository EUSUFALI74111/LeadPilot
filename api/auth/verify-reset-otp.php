<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/bootstrap.php';
require_method('POST');
$data = input(); $email = email_value($data); $code = preg_replace('/\D/', '', (string)($data['code'] ?? ''));
rate_limit('verify_reset', $email . client_ip(), 10, 3600);
$stmt = db()->prepare("SELECT o.id,o.code_hash,o.attempts,o.expires_at FROM one_time_codes o JOIN users u ON u.id=o.user_id AND u.tenant_id=o.tenant_id WHERE u.email=? AND o.purpose='RESET_PASSWORD' AND o.consumed_at IS NULL ORDER BY o.id DESC LIMIT 1");
$stmt->execute([$email]); $otp = $stmt->fetch();
if (!$otp || $otp['attempts'] >= 5 || strtotime($otp['expires_at']) <= time() || !password_verify($code, $otp['code_hash'])) {
    if ($otp) db()->prepare('UPDATE one_time_codes SET attempts=attempts+1 WHERE id=?')->execute([$otp['id']]);
    throw new ApiError(400, 'The code is invalid or expired.');
}
$resetToken = bin2hex(random_bytes(32));
db()->prepare('UPDATE one_time_codes SET code_hash=?, expires_at=DATE_ADD(UTC_TIMESTAMP(), INTERVAL 10 MINUTE) WHERE id=?')->execute([password_hash($resetToken, PASSWORD_DEFAULT), $otp['id']]);
respond(['resetToken' => $resetToken]);
