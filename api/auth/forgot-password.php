<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/bootstrap.php';
require_method('POST');
$email = email_value(input());
rate_limit('forgot_ip', client_ip(), 10, 3600);
rate_limit('forgot_email', $email, 5, 3600);
$stmt = db()->prepare("SELECT id, tenant_id, full_name FROM users WHERE email=? AND status='ACTIVE' LIMIT 1");
$stmt->execute([$email]);
$user = $stmt->fetch();
if ($user) {
    $code = (string)random_int(100000, 999999);
    db()->prepare("UPDATE one_time_codes SET consumed_at=UTC_TIMESTAMP() WHERE user_id=? AND purpose='RESET_PASSWORD' AND consumed_at IS NULL")->execute([$user['id']]);
    db()->prepare("INSERT INTO one_time_codes (tenant_id,user_id,purpose,code_hash,expires_at,last_sent_at) VALUES (?,?,'RESET_PASSWORD',?,DATE_ADD(UTC_TIMESTAMP(), INTERVAL 5 MINUTE),UTC_TIMESTAMP())")
        ->execute([$user['tenant_id'], $user['id'], password_hash($code, PASSWORD_DEFAULT)]);
    try { send_platform_email($email, $user['full_name'], 'Reset your LeadPilot password', '<p>Your password reset code is <strong>' . $code . '</strong>. It expires in 5 minutes.</p>'); }
    catch (Throwable $e) { error_log('[LeadPilot] Reset mail failed: ' . $e->getMessage()); }
}
respond(['message' => 'If an account exists for that email, a reset code has been sent.']);
