<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/bootstrap.php';
require_method('POST');

$data = input();
$name = string_value($data, 'fullName', 100);
$company = string_value($data, 'companyName', 120);
$email = email_value($data);
$password = (string)($data['password'] ?? '');
$confirmation = (string)($data['confirmPassword'] ?? '');
if (strlen($password) < 12 || strlen($password) > 128) throw new ApiError(422, 'Password must be 12 to 128 characters.');
if (!hash_equals($password, $confirmation)) throw new ApiError(422, 'Passwords do not match.');
rate_limit('register_ip', client_ip(), 5, 3600);
rate_limit('register_email', $email, 3, 3600);

$pdo = db();
$code = (string)random_int(100000, 999999);
$pdo->beginTransaction();
try {
    $stmt = $pdo->prepare('SELECT id, status FROM users WHERE email = ? LIMIT 1 FOR UPDATE');
    $stmt->execute([$email]);
    if ($stmt->fetch()) throw new ApiError(409, 'An account with this email is already registered.');
    $tenantPublicId = uuid();
    $pdo->prepare("INSERT INTO tenants (public_id, name, status) VALUES (?, ?, 'PENDING')")->execute([$tenantPublicId, $company]);
    $tenantId = (int)$pdo->lastInsertId();
    $userPublicId = uuid();
    $pdo->prepare("INSERT INTO users (tenant_id, public_id, full_name, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?, 'OWNER', 'PENDING')")
        ->execute([$tenantId, $userPublicId, $name, $email, password_hash($password, PASSWORD_DEFAULT)]);
    $userId = (int)$pdo->lastInsertId();
    $pdo->prepare("INSERT INTO one_time_codes (tenant_id, user_id, purpose, code_hash, expires_at, last_sent_at) VALUES (?, ?, 'VERIFY_EMAIL', ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 5 MINUTE), UTC_TIMESTAMP())")
        ->execute([$tenantId, $userId, password_hash($code, PASSWORD_DEFAULT)]);
    foreach ([
        'email_defaults' => ['senderName' => $name, 'sendingInterval' => 35],
        'campaign_defaults' => ['stopAfterConsecutiveFailures' => 25],
        'notification_settings' => ['campaignCompleted' => true, 'campaignFailed' => true],
    ] as $key => $value) {
        $pdo->prepare('INSERT INTO tenant_settings (tenant_id, setting_key, setting_value, updated_by) VALUES (?, ?, ?, ?)')
            ->execute([$tenantId, $key, json_encode($value, JSON_THROW_ON_ERROR), $userId]);
    }
    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $e;
}

try {
    send_platform_email($email, $name, 'Your LeadPilot verification code', '<p>Your LeadPilot verification code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">' . htmlspecialchars($code, ENT_QUOTES, 'UTF-8') . '</p><p>This code expires in 5 minutes.</p>');
} catch (Throwable $e) {
    error_log('[LeadPilot] OTP mail failed: ' . $e->getMessage());
    throw new ApiError(503, 'Your account was created, but the verification email could not be sent. Please use resend shortly.');
}

audit('tenant.registered', 'tenant', $tenantPublicId, ['email' => $email], ['tenant_id' => $tenantId, 'id' => $userId]);
respond(['email' => $email, 'verificationRequired' => true], 201);
