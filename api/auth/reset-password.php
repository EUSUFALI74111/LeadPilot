<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/bootstrap.php';
require_method('POST');
$data=input(); $email=email_value($data); $token=(string)($data['resetToken']??''); $password=(string)($data['password']??'');
if (strlen($password)<12 || strlen($password)>128) throw new ApiError(422,'Password must be 12 to 128 characters.');
$stmt=db()->prepare("SELECT o.id,o.user_id,o.code_hash,o.expires_at FROM one_time_codes o JOIN users u ON u.id=o.user_id AND u.tenant_id=o.tenant_id WHERE u.email=? AND o.purpose='RESET_PASSWORD' AND o.consumed_at IS NULL ORDER BY o.id DESC LIMIT 1");
$stmt->execute([$email]); $otp=$stmt->fetch();
if(!$otp || strtotime($otp['expires_at'])<=time() || !password_verify($token,$otp['code_hash'])) throw new ApiError(400,'The reset request is invalid or expired.');
$pdo=db(); $pdo->beginTransaction();
try { $pdo->prepare('UPDATE users SET password_hash=?,failed_login_attempts=0,locked_until=NULL WHERE id=?')->execute([password_hash($password,PASSWORD_DEFAULT),$otp['user_id']]); $pdo->prepare('UPDATE one_time_codes SET consumed_at=UTC_TIMESTAMP() WHERE id=?')->execute([$otp['id']]); $pdo->prepare('UPDATE auth_sessions SET revoked_at=UTC_TIMESTAMP() WHERE user_id=? AND revoked_at IS NULL')->execute([$otp['user_id']]); $pdo->commit(); }
catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
clear_session_cookies(); respond(['message'=>'Password updated. You can now sign in.']);
