<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/bootstrap.php';
require_once dirname(__DIR__) . '/services/ReplyMailboxService.php';

require_method('POST');
$user = require_role('OWNER', 'ADMIN');
require_csrf();
$data = input();
$id = string_value($data, 'id', 36);
$enabled = filter_var($data['enabled'] ?? true, FILTER_VALIDATE_BOOL);

$statement = db()->prepare('SELECT * FROM smtp_accounts WHERE tenant_id = ? AND public_id = ?');
$statement->execute([$user['tenant_id'], $id]);
$saved = $statement->fetch();
if (!$saved) throw new ApiError(404, 'Sending account not found.');

if (!$enabled) {
    db()->prepare('UPDATE smtp_accounts SET reply_tracking_enabled=0, imap_last_error=NULL WHERE tenant_id=? AND id=?')->execute([$user['tenant_id'], $saved['id']]);
    audit('reply_tracking.disabled', 'smtp_account', $id);
    respond(['enabled' => false]);
}

$host = strtolower(string_value($data, 'imapHost', 255));
assert_safe_smtp_host($host);
$security = strtolower((string)($data['imapEncryption'] ?? 'ssl'));
if (!in_array($security, ['ssl', 'tls', 'none'], true)) throw new ApiError(422, 'IMAP security must be SSL, TLS, or none.');
$username = string_value($data, 'imapUsername', 255, false) ?? (string)$saved['username'];
$password = (string)($data['imapPassword'] ?? '');
if ($password === '') $password = decrypt_secret((string)$saved['password_ciphertext']);
if (strlen($password) > 1000) throw new ApiError(422, 'IMAP password is too long.');
$account = [
    'imap_host' => $host,
    'imap_port' => int_value($data, 'imapPort', 1, 65535, 993),
    'imap_encryption' => $security,
    'imap_username' => $username,
    'imap_password' => $password,
];

try {
    ReplyMailboxService::test($account);
} catch (Throwable $error) {
    $diagnostic = ReplyMailboxService::safeError($error->getMessage());
    audit('reply_tracking.test_failed', 'smtp_account', $id, ['host' => $host, 'diagnostic' => $diagnostic]);
    throw new ApiError(422, 'IMAP connection failed. Reply tracking was not enabled.', ['diagnostic' => $diagnostic]);
}

$statement = db()->prepare('UPDATE smtp_accounts SET imap_host=?,imap_port=?,imap_encryption=?,imap_username=?,imap_password_ciphertext=?,reply_tracking_enabled=1,imap_last_error=NULL WHERE tenant_id=? AND id=?');
$statement->execute([$host,$account['imap_port'],$security,$username,encrypt_secret($password),$user['tenant_id'],$saved['id']]);
audit('reply_tracking.enabled', 'smtp_account', $id, ['host' => $host]);
respond(['enabled' => true, 'message' => 'Inbox connection tested and reply tracking enabled.']);
