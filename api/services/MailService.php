<?php
declare(strict_types=1);

use PHPMailer\PHPMailer\PHPMailer;

final class MailService
{
    public static function platform(string $to, string $name, string $subject, string $html): void
    {
        $mail = configure_mailer([
            'host' => env('PLATFORM_SMTP_HOST'),
            'port' => env('PLATFORM_SMTP_PORT', '587'),
            'encryption' => env('PLATFORM_SMTP_ENCRYPTION', 'tls'),
            'username' => env('PLATFORM_SMTP_USERNAME'),
            'password' => env('PLATFORM_SMTP_PASSWORD'),
        ]);
        $mail->setFrom(env('PLATFORM_FROM_EMAIL'), env('PLATFORM_FROM_NAME', 'LeadPilot'));
        $mail->addAddress($to, $name);
        $mail->Subject = $subject;
        $mail->Body = $html;
        $mail->AltBody = strip_tags($html);
        $mail->isHTML(true);
        $mail->send();
    }

    public static function testCustomerAccount(array $account, string $recipient): void
    {
        $mail = configure_mailer($account);
        $mail->setFrom($account['sender_email'], $account['sender_name']);
        $mail->addAddress($recipient);
        $mail->Subject = 'LeadPilot connection confirmed — ' . $account['sender_email'];
        $sender = htmlspecialchars((string)$account['sender_email'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $host = htmlspecialchars((string)$account['host'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $port = (int)$account['port'];
        $security = strtoupper(htmlspecialchars((string)$account['encryption'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'));
        $testedAt = gmdate('M j, Y · H:i') . ' UTC';
        $mail->Body = <<<HTML
<!doctype html>
<html lang="en">
<body style="margin:0;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#172033">
  <div style="display:none;max-height:0;overflow:hidden">Your LeadPilot sending account passed its SMTP connection and delivery test.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6fb;padding:32px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden;box-shadow:0 10px 30px rgba(31,54,106,.08)">
        <tr><td style="background:#315ee8;padding:28px 32px;color:#ffffff">
          <div style="font-size:13px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;opacity:.85">LeadPilot</div>
          <div style="font-size:26px;font-weight:700;margin-top:10px">SMTP connection confirmed</div>
          <div style="font-size:15px;line-height:1.6;margin-top:8px;opacity:.9">Your sending account authenticated successfully and delivered this real test email.</div>
        </td></tr>
        <tr><td style="padding:30px 32px">
          <div style="display:inline-block;background:#eaf8ef;color:#18733c;border-radius:999px;padding:8px 13px;font-size:13px;font-weight:700">✓ Ready to send</div>
          <p style="font-size:15px;line-height:1.7;margin:22px 0 16px">LeadPilot verified the following authorized account:</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
            <tr><td style="padding:13px 16px;color:#64748b;font-size:13px;border-bottom:1px solid #e2e8f0">From email</td><td style="padding:13px 16px;text-align:right;font-size:13px;font-weight:700;border-bottom:1px solid #e2e8f0">{$sender}</td></tr>
            <tr><td style="padding:13px 16px;color:#64748b;font-size:13px;border-bottom:1px solid #e2e8f0">SMTP server</td><td style="padding:13px 16px;text-align:right;font-size:13px;font-weight:700;border-bottom:1px solid #e2e8f0">{$host}:{$port}</td></tr>
            <tr><td style="padding:13px 16px;color:#64748b;font-size:13px;border-bottom:1px solid #e2e8f0">Security</td><td style="padding:13px 16px;text-align:right;font-size:13px;font-weight:700;border-bottom:1px solid #e2e8f0">{$security}</td></tr>
            <tr><td style="padding:13px 16px;color:#64748b;font-size:13px">Verified</td><td style="padding:13px 16px;text-align:right;font-size:13px;font-weight:700">{$testedAt}</td></tr>
          </table>
          <p style="font-size:14px;line-height:1.7;color:#475569;margin:22px 0 0">You can now select this address in <strong>Email Composer → From</strong> and queue authorized email. This message contains no stored password or secret.</p>
        </td></tr>
        <tr><td style="padding:18px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.6">This automated verification email was sent by LeadPilot because an account owner tested or updated an SMTP sending account.</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
HTML;
        $mail->AltBody = "LeadPilot SMTP connection confirmed\n\nYour sending account authenticated successfully and delivered this real test email.\n\nFrom: {$account['sender_email']}\nSMTP server: {$account['host']}:{$port}\nSecurity: {$security}\nVerified: {$testedAt}\n\nYou can now select this address in Email Composer > From. No password or secret is included in this email.";
        $mail->isHTML(true);
        $mail->send();
    }
}
