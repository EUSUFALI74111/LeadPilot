<?php
declare(strict_types=1);

final class ReplyMailboxService
{
    public static function mailbox(array $account, bool $certificatePrevalidated = false): string
    {
        $security = strtolower((string)($account['imap_encryption'] ?? 'ssl'));
        $flags = match ($security) {
            'ssl' => '/imap/ssl' . ($certificatePrevalidated ? '/novalidate-cert' : ''),
            'tls' => '/imap/tls',
            'none' => '/imap/notls',
            default => throw new ApiError(422, 'Invalid IMAP security setting.'),
        };
        return sprintf('{%s:%d%s}INBOX', $account['imap_host'], (int)$account['imap_port'], $flags);
    }

    public static function connect(array $account): IMAP\Connection
    {
        if (!extension_loaded('imap')) throw new RuntimeException('The PHP IMAP extension is not enabled.');
        // Some shared-host c-client builds omit TLS SNI. Verify the real endpoint with
        // PHP/OpenSSL (including SNI + hostname) before using c-client's encrypted session.
        $prevalidated = false;
        if (strtolower((string)($account['imap_encryption'] ?? 'ssl')) === 'ssl') {
            self::verifyTlsEndpoint((string)$account['imap_host'], (int)$account['imap_port']);
            $prevalidated = true;
        }
        imap_errors();
        $connection = @imap_open(
            self::mailbox($account, $prevalidated),
            (string)$account['imap_username'],
            (string)$account['imap_password'],
            OP_READONLY,
            1,
            ['DISABLE_AUTHENTICATOR' => 'GSSAPI']
        );
        if ($connection === false) {
            $errors = imap_errors() ?: [];
            $message = $errors ? (string)end($errors) : 'IMAP connection failed.';
            throw new RuntimeException(self::safeError($message));
        }
        return $connection;
    }

    private static function verifyTlsEndpoint(string $host, int $port): void
    {
        $context = stream_context_create([
            'ssl' => [
                'verify_peer' => true,
                'verify_peer_name' => true,
                'peer_name' => $host,
                'SNI_enabled' => true,
                'disable_compression' => true,
            ],
        ]);
        $errorNumber = 0;
        $errorMessage = '';
        $socket = @stream_socket_client(
            'tls://' . $host . ':' . $port,
            $errorNumber,
            $errorMessage,
            15,
            STREAM_CLIENT_CONNECT,
            $context
        );
        if ($socket === false) {
            throw new RuntimeException(self::safeError($errorMessage ?: 'TLS certificate verification failed.'));
        }
        fclose($socket);
    }

    public static function test(array $account): void
    {
        $connection = self::connect($account);
        imap_close($connection);
    }

    public static function decodeHeader(?string $value): string
    {
        if (!$value) return '';
        $result = '';
        foreach (imap_mime_header_decode($value) ?: [] as $part) {
            $charset = strtoupper((string)($part->charset ?? 'UTF-8'));
            $text = (string)($part->text ?? '');
            if ($charset !== 'DEFAULT' && $charset !== 'UTF-8') {
                $converted = @mb_convert_encoding($text, 'UTF-8', $charset);
                if ($converted !== false) $text = $converted;
            }
            $result .= $text;
        }
        return trim($result);
    }

    public static function textBody(IMAP\Connection $connection, int $uid): string
    {
        $structure = imap_fetchstructure($connection, $uid, FT_UID);
        if (!$structure) return '';
        $plain = self::findTextPart($connection, $uid, $structure, '', 'PLAIN');
        $body = $plain ?? self::findTextPart($connection, $uid, $structure, '', 'HTML') ?? '';
        if ($plain === null) $body = html_entity_decode(strip_tags($body), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        return self::cleanReplyText($body);
    }

    public static function cleanReplyText(string $body): string
    {
        $body = str_replace(["\r\n", "\r"], "\n", html_entity_decode($body, ENT_QUOTES | ENT_HTML5, 'UTF-8'));
        $markers = [
            '/^On .+wrote:\s*$/mi',
            '/^-----Original Message-----\s*$/mi',
            '/^_{5,}\s*$/m',
            '/^From:\s.+$/mi',
            '/^Sent:\s.+$/mi',
            '/^Get Outlook for (?:iOS|Android).*/mi',
        ];
        foreach ($markers as $marker) $body = preg_split($marker, $body, 2)[0] ?? $body;
        $body = preg_replace('/^>.*$/m', '', $body) ?? $body;
        $body = preg_replace('/\n--\s*\n.*$/s', '', $body) ?? $body;
        $body = trim(preg_replace("/[ \t]+\n|\n{3,}/", "\n", $body) ?? $body);
        return mb_substr($body, 0, 10000);
    }

    /** @return array{type:string,reason:?string} */
    public static function classifyMessage(string $senderEmail, string $subject, string $body, string $rawHeaders = ''): array
    {
        $sender = strtolower($senderEmail);
        $haystack = strtolower($subject . "\n" . mb_substr($body, 0, 10000) . "\n" . $rawHeaders);
        $isDaemon = (bool)preg_match('/(^|[._+-])(mailer-daemon|postmaster|mail-daemon)([._+-]|@)/i', $sender);
        $bouncePatterns = '/delivery status notification|delivery failure|delivery has failed|undeliverable|undelivered mail|address not found|message blocked|mail delivery (subsystem|system)|couldn.t be found|invalid recipient|recipient address rejected|user unknown|unknown address|mailbox (unavailable|not found)|access denied|\b5(?:\.\d+){1,2}\b|\b550\b/i';
        if ($isDaemon || preg_match($bouncePatterns, $haystack)) {
            $reason = trim($subject) !== '' ? trim($subject) : 'The recipient server reported a delivery failure.';
            if (preg_match('/(?:^|\n)([^\n]*(?:550|5\.\d\.\d|invalid recipient|recipient address rejected|user unknown|address not found)[^\n]*)/i', $body, $match)) {
                $reason = trim($match[1]);
            }
            return ['type' => 'BOUNCE', 'reason' => mb_substr($reason, 0, 500)];
        }

        $autoPatterns = '/automatic reply|auto(?:matic)?[- ]?reply|out of (?:the )?office|away from (?:the )?office|vacation responder|auto-submitted:\s*(?:auto-replied|auto-generated)|x-auto(?:reply|response|respond)/i';
        if (preg_match($autoPatterns, $haystack)) return ['type' => 'AUTO_REPLY', 'reason' => null];
        return ['type' => 'HUMAN', 'reason' => null];
    }

    private static function findTextPart(IMAP\Connection $connection, int $uid, object $part, string $number, string $wanted): ?string
    {
        if ((int)($part->type ?? -1) === 0 && strtoupper((string)($part->subtype ?? '')) === $wanted) {
            $raw = $number === '' ? imap_body($connection, $uid, FT_UID | FT_PEEK) : imap_fetchbody($connection, $uid, $number, FT_UID | FT_PEEK);
            return self::decodeBody((string)$raw, (int)($part->encoding ?? 0), $part);
        }
        foreach (($part->parts ?? []) as $index => $child) {
            $childNumber = $number === '' ? (string)($index + 1) : $number . '.' . ($index + 1);
            $found = self::findTextPart($connection, $uid, $child, $childNumber, $wanted);
            if ($found !== null) return $found;
        }
        return null;
    }

    private static function decodeBody(string $body, int $encoding, object $part): string
    {
        if ($encoding === 3) $body = (string)base64_decode($body, true);
        elseif ($encoding === 4) $body = quoted_printable_decode($body);
        $charset = 'UTF-8';
        foreach (array_merge($part->parameters ?? [], $part->dparameters ?? []) as $parameter) {
            if (strtolower((string)($parameter->attribute ?? '')) === 'charset') $charset = (string)$parameter->value;
        }
        if (strtoupper($charset) !== 'UTF-8') {
            $converted = @mb_convert_encoding($body, 'UTF-8', $charset);
            if ($converted !== false) $body = $converted;
        }
        return $body;
    }

    public static function safeError(string $message): string
    {
        $message = preg_replace('/(password|credential|authenticate)[^\r\n]*/i', '[redacted]', $message) ?? 'IMAP connection failed.';
        return mb_substr($message, 0, 500);
    }
}
