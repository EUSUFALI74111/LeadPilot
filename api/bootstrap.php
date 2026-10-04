<?php
declare(strict_types=1);

use PHPMailer\PHPMailer\PHPMailer;

require_once dirname(__DIR__) . '/vendor/autoload.php';
require_once __DIR__ . '/services/MailService.php';

final class ApiError extends RuntimeException
{
    public function __construct(public readonly int $status, string $message, public readonly array $details = [])
    {
        parent::__construct($message);
    }
}

function load_env(string $file): void
{
    if (!is_file($file)) return;
    foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) continue;
        [$key, $value] = explode('=', $line, 2);
        $key = trim($key);
        if (getenv($key) === false) putenv($key . '=' . trim($value, " \t\n\r\0\x0B\"'"));
    }
}

$configuredEnv = getenv('LEADPILOT_ENV_FILE');
$envCandidates = array_filter([
    is_string($configuredEnv) ? $configuredEnv : null,
    dirname(__DIR__, 2) . '/.env', // Preferred: one level above public_html on Hostinger.
    dirname(__DIR__) . '/.env',    // Local/fallback layout; web access is denied by .htaccess.
]);
foreach ($envCandidates as $envFile) {
    if (is_file($envFile)) {
        load_env($envFile);
        break;
    }
}

function env(string $key, ?string $default = null): string
{
    $value = getenv($key);
    return $value === false ? ($default ?? '') : $value;
}

function is_https(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
}

function secure_headers(): void
{
    header_remove('X-Powered-By');
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header("Permissions-Policy: camera=(), microphone=(), geolocation=()");
    header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
    if (is_https()) header('Strict-Transport-Security: max-age=31536000; includeSubDomains');

    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $allowed = array_filter(array_map('trim', explode(',', env('APP_ALLOWED_ORIGINS'))));
    if ($origin !== '' && in_array($origin, $allowed, true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Access-Control-Allow-Credentials: true');
        header('Vary: Origin');
        header('Access-Control-Allow-Headers: Content-Type, X-CSRF-Token');
        header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    }
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;
}

secure_headers();

set_exception_handler(function (Throwable $e): void {
    if ($e instanceof ApiError) {
        respond_error($e->getMessage(), $e->status, $e->details);
    }
    error_log(sprintf('[LeadPilot] %s in %s:%d', $e->getMessage(), $e->getFile(), $e->getLine()));
    respond_error('An unexpected server error occurred.', 500);
});

function db(): PDO
{
    static $pdo;
    if ($pdo instanceof PDO) return $pdo;
    $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4', env('DB_HOST', '127.0.0.1'), env('DB_PORT', '3306'), env('DB_NAME'));
    $pdo = new PDO($dsn, env('DB_USER'), env('DB_PASSWORD'), [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::ATTR_STRINGIFY_FETCHES => false,
    ]);
    return $pdo;
}

function respond(mixed $data = null, int $status = 200, array $meta = []): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['data' => $data, 'meta' => (object)$meta], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
    exit;
}

function respond_error(string $message, int $status = 400, array $details = []): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => ['message' => $message, 'details' => (object)$details]], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
    exit;
}

function require_method(string ...$methods): void
{
    if (!in_array($_SERVER['REQUEST_METHOD'] ?? '', $methods, true)) {
        header('Allow: ' . implode(', ', $methods));
        throw new ApiError(405, 'Method not allowed.');
    }
}

function input(): array
{
    static $cached;
    if (is_array($cached)) return $cached;
    $type = strtolower((string)($_SERVER['CONTENT_TYPE'] ?? ''));
    if (str_contains($type, 'application/json')) {
        $raw = file_get_contents('php://input');
        if ($raw === false || $raw === '') return [];
        try {
            $value = json_decode($raw, true, 64, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw new ApiError(400, 'Invalid JSON request body.');
        }
        if (!is_array($value)) throw new ApiError(400, 'Request body must be an object.');
        return $cached = $value;
    }
    return $cached = $_POST;
}

function string_value(array $data, string $key, int $max, bool $required = true): ?string
{
    $value = isset($data[$key]) ? trim((string)$data[$key]) : '';
    if ($required && $value === '') throw new ApiError(422, "{$key} is required.", [$key => 'Required']);
    if (mb_strlen($value) > $max) throw new ApiError(422, "{$key} is too long.", [$key => "Maximum {$max} characters"]);
    return $value === '' ? null : $value;
}

function email_value(array $data, string $key = 'email'): string
{
    $email = strtolower(string_value($data, $key, 255) ?? '');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) throw new ApiError(422, 'Enter a valid email address.', [$key => 'Invalid email']);
    return $email;
}

function int_value(array $data, string $key, int $min, int $max, ?int $default = null): int
{
    if (!array_key_exists($key, $data) && $default !== null) return $default;
    $value = filter_var($data[$key] ?? null, FILTER_VALIDATE_INT);
    if ($value === false || $value < $min || $value > $max) throw new ApiError(422, "{$key} must be between {$min} and {$max}.");
    return $value;
}

function uuid(): string
{
    $bytes = random_bytes(16);
    $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
    $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($bytes), 4));
}

function client_ip(): string
{
    return (string)($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
}

function packed_ip(): ?string
{
    $packed = @inet_pton(client_ip());
    return $packed === false ? null : $packed;
}

function rate_limit(string $action, string $identity, int $limit, int $seconds): void
{
    $pdo = db();
    $key = hash('sha256', strtolower($identity) . '|' . env('APP_KEY'));
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare('SELECT hits, expires_at FROM rate_limits WHERE rate_key = ? AND action = ? FOR UPDATE');
        $stmt->execute([$key, $action]);
        $row = $stmt->fetch();
        $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
        if (!$row || new DateTimeImmutable($row['expires_at'], new DateTimeZone('UTC')) <= $now) {
            $expires = $now->modify("+{$seconds} seconds")->format('Y-m-d H:i:s');
            $stmt = $pdo->prepare('INSERT INTO rate_limits (rate_key, action, window_started_at, hits, expires_at) VALUES (?, ?, UTC_TIMESTAMP(), 1, ?) ON DUPLICATE KEY UPDATE window_started_at=UTC_TIMESTAMP(), hits=1, expires_at=VALUES(expires_at)');
            $stmt->execute([$key, $action, $expires]);
        } else {
            if ((int)$row['hits'] >= $limit) throw new ApiError(429, 'Too many requests. Please try again later.');
            $pdo->prepare('UPDATE rate_limits SET hits = hits + 1 WHERE rate_key = ? AND action = ?')->execute([$key, $action]);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}

function cookie_options(int $expires): array
{
    return ['expires' => $expires, 'path' => '/api', 'secure' => env('COOKIE_SECURE', 'true') === 'true', 'httponly' => true, 'samesite' => 'Strict'];
}

function create_session(array $user, bool $remember = false): array
{
    $access = bin2hex(random_bytes(32));
    $refresh = bin2hex(random_bytes(32));
    $csrf = bin2hex(random_bytes(24));
    $refreshDays = $remember ? 30 : 7;
    $stmt = db()->prepare('INSERT INTO auth_sessions (tenant_id, user_id, access_token_hash, refresh_token_hash, csrf_token_hash, ip_address, user_agent, access_expires_at, refresh_expires_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 15 MINUTE), DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? DAY), UTC_TIMESTAMP())');
    $stmt->execute([(int)$user['tenant_id'], (int)$user['id'], hash('sha256', $access), hash('sha256', $refresh), hash('sha256', $csrf), packed_ip(), mb_substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 500), $refreshDays]);
    setcookie('lp_access', $access, cookie_options(time() + 900));
    setcookie('lp_refresh', $refresh, cookie_options(time() + ($refreshDays * 86400)));
    setcookie('lp_csrf', $csrf, array_merge(cookie_options(time() + ($refreshDays * 86400)), ['httponly' => false]));
    return ['csrfToken' => $csrf];
}

function clear_session_cookies(): void
{
    foreach (['lp_access', 'lp_refresh', 'lp_csrf'] as $name) {
        $options = cookie_options(time() - 3600);
        if ($name === 'lp_csrf') $options['httponly'] = false;
        setcookie($name, '', $options);
    }
}

function current_user(bool $required = true): ?array
{
    static $cached = false;
    if (is_array($cached)) return $cached;
    $token = (string)($_COOKIE['lp_access'] ?? '');
    if ($token !== '') {
        $stmt = db()->prepare("SELECT u.id, u.tenant_id, u.public_id, u.full_name, u.email, u.role, u.status, t.public_id tenant_public_id, t.name company_name, t.status tenant_status, s.id session_id, s.csrf_token_hash FROM auth_sessions s JOIN users u ON u.id=s.user_id AND u.tenant_id=s.tenant_id JOIN tenants t ON t.id=s.tenant_id WHERE s.access_token_hash=? AND s.revoked_at IS NULL AND s.access_expires_at > UTC_TIMESTAMP() LIMIT 1");
        $stmt->execute([hash('sha256', $token)]);
        $row = $stmt->fetch();
        if ($row && $row['status'] === 'ACTIVE' && $row['tenant_status'] === 'ACTIVE') {
            $cached = $row;
            return $row;
        }
    }
    if ($required) throw new ApiError(401, 'Authentication required.');
    return null;
}

function require_csrf(): void
{
    if (in_array($_SERVER['REQUEST_METHOD'] ?? '', ['GET', 'HEAD', 'OPTIONS'], true)) return;
    $user = current_user();
    $header = (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    $cookie = (string)($_COOKIE['lp_csrf'] ?? '');
    if ($header === '' || $cookie === '' || !hash_equals($cookie, $header) || !hash_equals($user['csrf_token_hash'], hash('sha256', $header))) {
        throw new ApiError(403, 'Invalid CSRF token.');
    }
}

function require_role(string ...$roles): array
{
    $user = current_user();
    if (!in_array($user['role'], $roles, true)) throw new ApiError(403, 'You do not have permission to perform this action.');
    return $user;
}

function authorize_campaign(string $publicId): array
{
    $user=current_user();
    $sql='SELECT id,created_by,status FROM campaigns WHERE tenant_id=? AND public_id=?';
    $params=[$user['tenant_id'],$publicId];
    if($user['role']==='MEMBER'){$sql.=' AND created_by=?';$params[]=$user['id'];}
    $stmt=db()->prepare($sql.' LIMIT 1');$stmt->execute($params);$campaign=$stmt->fetch();
    if(!$campaign)throw new ApiError(404,'Campaign not found.');
    return $campaign;
}

function public_user(array $user): array
{
    return [
        'id' => $user['public_id'], 'name' => $user['full_name'], 'email' => $user['email'],
        'role' => $user['role'], 'tenant' => ['id' => $user['tenant_public_id'], 'name' => $user['company_name']],
    ];
}

function audit(string $action, ?string $resourceType = null, ?string $resourceId = null, array $metadata = [], ?array $user = null): void
{
    $user ??= current_user(false);
    $stmt = db()->prepare('INSERT INTO audit_logs (tenant_id, user_id, action, resource_type, resource_public_id, ip_address, user_agent, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    $stmt->execute([$user['tenant_id'] ?? null, $user['id'] ?? null, $action, $resourceType, $resourceId, packed_ip(), mb_substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 500), $metadata ? json_encode($metadata, JSON_THROW_ON_ERROR) : null]);
}

function app_key(): string
{
    $value = env('APP_KEY');
    if (str_starts_with($value, 'base64:')) $value = (string)base64_decode(substr($value, 7), true);
    if (strlen($value) < 32) throw new RuntimeException('APP_KEY must contain at least 32 random bytes.');
    return substr(hash('sha256', $value, true), 0, 32);
}

function encrypt_secret(string $plaintext): string
{
    $iv = random_bytes(12);
    $tag = '';
    $cipher = openssl_encrypt($plaintext, 'aes-256-gcm', app_key(), OPENSSL_RAW_DATA, $iv, $tag);
    if ($cipher === false) throw new RuntimeException('Credential encryption failed.');
    return base64_encode($iv . $tag . $cipher);
}

function decrypt_secret(string $encoded): string
{
    $raw = base64_decode($encoded, true);
    if ($raw === false || strlen($raw) < 29) throw new RuntimeException('Invalid encrypted credential.');
    $plain = openssl_decrypt(substr($raw, 28), 'aes-256-gcm', app_key(), OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16));
    if ($plain === false) throw new RuntimeException('Credential decryption failed.');
    return $plain;
}

function configure_mailer(array $account): PHPMailer
{
    $mail = new PHPMailer(true);
    $mail->isSMTP();
    $mail->Host = $account['host'];
    $mail->Port = (int)$account['port'];
    $mail->SMTPAuth = true;
    $mail->Username = $account['username'];
    $mail->Password = $account['password'];
    if ($account['encryption'] === 'tls') $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
    elseif ($account['encryption'] === 'ssl') $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
    else $mail->SMTPSecure = '';
    $mail->Timeout = 20;
    $mail->CharSet = PHPMailer::CHARSET_UTF8;
    $mail->SMTPDebug = 0;
    return $mail;
}

function assert_safe_smtp_host(string $host): void
{
    if (filter_var($host, FILTER_VALIDATE_IP)) $ips = [$host];
    else {
        if (!preg_match('/^(?=.{1,253}$)(?!-)[a-z0-9.-]+(?<!-)$/i', $host)) throw new ApiError(422, 'Invalid SMTP hostname.');
        $records = dns_get_record($host, DNS_A | DNS_AAAA);
        $ips = array_values(array_filter(array_map(static fn(array $r) => $r['ip'] ?? $r['ipv6'] ?? null, $records ?: [])));
    }
    if (!$ips) throw new ApiError(422, 'SMTP hostname could not be resolved.');
    foreach ($ips as $ip) {
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
            throw new ApiError(422, 'Private or reserved SMTP hosts are not permitted.');
        }
    }
}

function send_platform_email(string $to, string $name, string $subject, string $body): void
{
    MailService::platform($to, $name, $subject, $body);
}

function render_template(string $text, array $lead): string
{
    $values = lead_personalization_values($lead);
    return preg_replace_callback('/{{\s*([a-z][a-z0-9_]*)\s*}}/i', static function (array $match) use ($values): string {
        return (string)($values[strtolower($match[1])] ?? '');
    }, $text) ?? '';
}

function lead_personalization_values(array $lead): array
{
    $custom = $lead['custom_fields'] ?? $lead['customFields'] ?? [];
    if (is_string($custom)) $custom = json_decode($custom, true) ?: [];
    if (!is_array($custom)) $custom = [];
    $first = (string)($lead['first_name'] ?? $lead['firstName'] ?? '');
    $last = (string)($lead['last_name'] ?? $lead['lastName'] ?? '');
    $full = trim((string)($lead['full_name'] ?? $lead['fullName'] ?? $lead['name'] ?? trim($first . ' ' . $last)));
    $company = (string)($lead['company_name'] ?? $lead['companyName'] ?? $lead['company'] ?? '');
    $values = [
        'first_name' => $first,
        'last_name' => $last,
        'full_name' => $full,
        'name' => $full,
        'email' => (string)($lead['email'] ?? ''),
        'company_name' => $company,
        'company' => $company,
        'phone' => (string)($lead['phone'] ?? ''),
        'job_title' => (string)($lead['job_title'] ?? $lead['jobTitle'] ?? ''),
        'website' => (string)($lead['website'] ?? ''),
        'linkedin' => (string)($lead['linkedin'] ?? ''),
        'facebook' => (string)($lead['facebook'] ?? ''),
        'instagram' => (string)($lead['instagram'] ?? ''),
        'twitter' => (string)($lead['twitter'] ?? ''),
        'tiktok' => (string)($lead['tiktok'] ?? ''),
        'location' => (string)($lead['location'] ?? ''),
        'country' => (string)($lead['country'] ?? ''),
        'source' => (string)($lead['source'] ?? ''),
    ];
    foreach ($custom as $key => $value) {
        $normalized = strtolower((string)preg_replace('/[^a-z0-9_]+/i', '_', trim((string)$key)));
        if ($normalized !== '' && !array_key_exists($normalized, $values) && is_scalar($value)) {
            $values[$normalized] = (string)$value;
        }
    }
    return $values;
}

function template_variables(string ...$texts): array
{
    $variables = [];
    foreach ($texts as $text) {
        preg_match_all('/{{\s*([a-z][a-z0-9_]*)\s*}}/i', $text, $matches);
        foreach ($matches[1] ?? [] as $name) $variables[strtolower($name)] = true;
    }
    return array_keys($variables);
}

function unknown_template_variables(array $variables, array $leads): array
{
    $available = [];
    foreach ($leads as $lead) foreach (array_keys(lead_personalization_values($lead)) as $key) $available[$key] = true;
    return array_values(array_filter($variables, static fn(string $name): bool => !isset($available[$name])));
}

function sanitize_email_html(string $html): string
{
    $html = preg_replace('/<\?(?:php|=)?.*?\?>/is', '', $html) ?? '';
    $document = new DOMDocument('1.0', 'UTF-8');
    $previous = libxml_use_internal_errors(true);
    $document->loadHTML('<?xml encoding="utf-8" ?>' . $html, LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);
    foreach (['script','iframe','object','embed','form','input','button','meta','base'] as $tag) {
        while (($nodes = $document->getElementsByTagName($tag))->length > 0) {
            $node = $nodes->item(0);
            $node?->parentNode?->removeChild($node);
        }
    }
    foreach ($document->getElementsByTagName('*') as $element) {
        $remove = [];
        foreach ($element->attributes ?? [] as $attribute) {
            $name = strtolower($attribute->name);
            $value = trim($attribute->value);
            if (str_starts_with($name, 'on') || $name === 'srcdoc') $remove[] = $attribute->name;
            if (in_array($name, ['href','src','background'], true) && preg_match('/^(?:javascript|data\s*:\s*text\/html)/i', $value)) $remove[] = $attribute->name;
        }
        foreach (array_unique($remove) as $name) $element->removeAttribute($name);
    }
    $clean = $document->saveHTML() ?: '';
    libxml_clear_errors();
    libxml_use_internal_errors($previous);
    return preg_replace('/^<\?xml[^>]+>\s*/', '', $clean) ?? '';
}

function safe_url_value(array $data, string $key, int $max = 500): ?string
{
    $value = string_value($data, $key, $max, false);
    if ($value === null || $value === '') return null;
    if (!filter_var($value, FILTER_VALIDATE_URL) || !in_array(strtolower((string)parse_url($value, PHP_URL_SCHEME)), ['http','https'], true)) {
        throw new ApiError(422, ucfirst($key) . ' must be a valid HTTP or HTTPS URL.');
    }
    return $value;
}

function normalize_phone(?string $phone): ?string
{
    $value = trim((string)$phone);
    if ($value === '') return null;
    $digits = preg_replace('/\D+/', '', $value) ?? '';
    if (strlen($digits) < 7 || strlen($digits) > 15) throw new ApiError(422, 'Phone must contain 7 to 15 digits.');
    return $digits;
}

function normalize_import_url(?string $value): ?string
{
    $value = trim((string)$value);
    if ($value === '') return null;
    if (!preg_match('#^https?://#i', $value)) $value = 'https://' . ltrim($value, '/');
    if (!filter_var($value, FILTER_VALIDATE_URL)) return null;
    return mb_substr($value, 0, 500);
}

function pagination(): array
{
    $page = max(1, min(1000000, (int)($_GET['page'] ?? 1)));
    $perPage = max(1, min(100, (int)($_GET['per_page'] ?? 20)));
    return [$page, $perPage, ($page - 1) * $perPage];
}
