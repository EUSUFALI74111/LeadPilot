<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/bootstrap.php';
require_method('PUT');
$user = require_role('OWNER', 'ADMIN');
require_csrf();
$data = input();

$publicId = string_value($data, 'id', 36);
$statement = db()->prepare('SELECT * FROM smtp_accounts WHERE tenant_id=? AND public_id=? LIMIT 1');
$statement->execute([$user['tenant_id'], $publicId]);
$existing = $statement->fetch();
if (!$existing) throw new ApiError(404, 'Sending account not found.');

$host = strtolower(string_value($data, 'host', 255));
assert_safe_smtp_host($host);
$senderEmail = email_value($data, 'senderEmail');
$encryption = strtolower((string)($data['encryption'] ?? 'tls'));
if (!in_array($encryption, ['tls', 'ssl'], true)) throw new ApiError(422, 'Security must be SSL or TLS.');
$port = int_value($data, 'port', 1, 65535);
$username = string_value($data, 'username', 255);

$password = trim((string)($data['password'] ?? ''));
if (strlen($password) > 1000) throw new ApiError(422, 'SMTP password is too long.');
$passwordCiphertext = $password === '' ? $existing['password_ciphertext'] : encrypt_secret($password);
$changedConnection = $host !== $existing['host'] || $port !== (int)$existing['port']
    || $encryption !== $existing['encryption'] || $username !== $existing['username']
    || $senderEmail !== $existing['sender_email'] || $password !== '';

$sql = "UPDATE smtp_accounts SET account_name=?,sender_name=?,sender_email=?,host=?,port=?,encryption=?,username=?,password_ciphertext=?,daily_limit=?,hourly_limit=?,per_minute_limit=?,sending_interval_seconds=?,status=IF(?,'UNTESTED',status),is_active=IF(?,0,is_active),last_tested_at=IF(?,NULL,last_tested_at),last_error=NULL WHERE tenant_id=? AND id=?";
db()->prepare($sql)->execute([
    string_value($data, 'accountName', 100, false) ?? $senderEmail,
    string_value($data, 'senderName', 100, false) ?? $user['full_name'],
    $senderEmail, $host, $port, $encryption, $username, $passwordCiphertext,
    min(500, int_value($data, 'dailyLimit', 1, 500, 500)),
    int_value($data, 'hourlyLimit', 1, 10000, 100),
    int_value($data, 'perMinuteLimit', 1, 1000, 10),
    1,
    $changedConnection ? 1 : 0, $changedConnection ? 1 : 0, $changedConnection ? 1 : 0, $user['tenant_id'], $existing['id'],
]);

audit('smtp.updated', 'smtp_account', $publicId, ['connectionChanged' => $changedConnection]);
respond(['id' => $publicId, 'status' => $existing['status'], 'message' => $changedConnection
    ? 'Account changes saved. Use Test to verify the new connection settings.'
    : 'Account changes saved.']);
