<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/bootstrap.php';
require_method('POST');
$email = email_value(input());
rate_limit('resend_otp_ip', client_ip(), 10, 3600);
rate_limit('resend_otp_email', $email, 5, 3600);
$stmt = db()->prepare("SELECT id, tenant_id, full_name, status FROM users WHERE email=? LIMIT 1");
$stmt->execute([$email]);
$user = $stmt->fetch();
if (!$user || $user['status'] === 'ACTIVE') respond(['message' => 'If verification is pending, a new code will be sent.']);
$stmt = db()->prepare("SELECT last_sent_at FROM one_time_codes WHERE user_id=? AND purpose='VERIFY_EMAIL' ORDER BY id DESC LIMIT 1");
$stmt->execute([$user['id']]);
$last = $stmt->fetchColumn();
if ($last && strtotime((string)$last) > time() - 60) throw new ApiError(429, 'Please wait 60 seconds before requesting another code.');
$code = (string)random_int(100000, 999999);
$pdo = db();
$pdo->beginTransaction();
try {
    $pdo->prepare("UPDATE one_time_codes SET consumed_at=UTC_TIMESTAMP() WHERE user_id=? AND purpose='VERIFY_EMAIL' AND consumed_at IS NULL")->execute([$user['id']]);
    $pdo->prepare("INSERT INTO one_time_codes (tenant_id,user_id,purpose,code_hash,expires_at,last_sent_at) VALUES (?,?,'VERIFY_EMAIL',?,DATE_ADD(UTC_TIMESTAMP(), INTERVAL 5 MINUTE),UTC_TIMESTAMP())")
        ->execute([$user['tenant_id'], $user['id'], password_hash($code, PASSWORD_DEFAULT)]);
    $pdo->commit();
} catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
send_platform_email($email, $user['full_name'], 'Your new LeadPilot verification code', '<p>Your new code is <strong>' . $code . '</strong>. It expires in 5 minutes.</p>');
respond(['message' => 'If verification is pending, a new code will be sent.']);
