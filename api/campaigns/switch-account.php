<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/bootstrap.php';
require_method('POST');
$user = current_user();
require_csrf();
$data = input();
$campaignId = string_value($data, 'id', 36);
$accountId = string_value($data, 'smtpAccountId', 36);
authorize_campaign($campaignId);

$pdo = db();
$pdo->beginTransaction();
try {
    $campaignStatement = $pdo->prepare('SELECT id,status,smtp_account_id,pending_count FROM campaigns WHERE tenant_id=? AND public_id=? FOR UPDATE');
    $campaignStatement->execute([$user['tenant_id'], $campaignId]);
    $campaign = $campaignStatement->fetch();
    if (!$campaign) throw new ApiError(404, 'Campaign not found.');
    if (!in_array($campaign['status'], ['QUEUED', 'RUNNING', 'PAUSED'], true)) {
        throw new ApiError(409, 'Only a queued, running, or paused campaign can change its sending account.');
    }
    if ((int)$campaign['pending_count'] < 1) throw new ApiError(409, 'This campaign has no pending recipients to continue.');

    $accountStatement = $pdo->prepare("SELECT a.id,a.sender_email,a.daily_limit,(SELECT COALESCE(SUM(sc.sent_count),0) FROM smtp_send_counters sc WHERE sc.tenant_id=a.tenant_id AND sc.smtp_account_id=a.id AND sc.window_type='DAY' AND sc.window_start=UTC_DATE()) sent_today FROM smtp_accounts a WHERE a.tenant_id=? AND a.public_id=? AND a.is_active=1 AND a.status='CONNECTED' FOR UPDATE");
    $accountStatement->execute([$user['tenant_id'], $accountId]);
    $account = $accountStatement->fetch();
    if (!$account) throw new ApiError(422, 'Choose an enabled, connected sending account.');
    if ((int)$account['sent_today'] >= (int)$account['daily_limit']) throw new ApiError(422, 'The selected account has already reached its daily limit.');
    if ((int)$account['id'] === (int)$campaign['smtp_account_id']) throw new ApiError(409, 'This campaign is already using that sending account.');

    $nextStatus = $campaign['status'] === 'PAUSED' ? 'QUEUED' : $campaign['status'];
    $pdo->prepare('UPDATE campaigns SET smtp_account_id=?,status=? WHERE tenant_id=? AND id=?')->execute([$account['id'],$nextStatus,$user['tenant_id'],$campaign['id']]);
    $pdo->prepare("UPDATE campaign_recipients SET available_at=UTC_TIMESTAMP() WHERE tenant_id=? AND campaign_id=? AND status='PENDING'")->execute([$user['tenant_id'],$campaign['id']]);
    audit('campaign.smtp_account_switched', 'campaign', $campaignId, ['smtpAccountId' => $accountId, 'continued' => true]);
    $pdo->commit();
    respond(['status' => $nextStatus, 'sender' => $account['sender_email'], 'message' => 'Sending account changed. Pending recipients will continue with the new account.']);
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $error;
}
