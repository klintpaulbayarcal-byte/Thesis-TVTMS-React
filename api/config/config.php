<?php
declare(strict_types=1);

$localPath = __DIR__ . '/config.local.php';
$local = is_file($localPath) ? require $localPath : [];
if (!is_array($local)) $local = [];

$env = static function (string $name, string $fallback = ''): string {
    $value = getenv($name);
    return $value === false ? $fallback : trim((string)$value);
};

$base = [
    // Public project URL is safe to store; the server-side secret is not.
    'supabase_url' => $env('SUPABASE_URL', 'https://cwrhxvrmnfmzuxotsjrw.supabase.co'),
    'supabase_secret_key' => trim((string)(getenv('SUPABASE_SECRET_KEY') ?: '')),

    // TVTMS staff JWT signing secret. Keep server-side only.
    'token_secret' => trim((string)(getenv('TVTMS_TOKEN_SECRET') ?: '')),
    'token_ttl_seconds' => 28800,

    'app_public_url' => $env('TVTMS_PUBLIC_URL', 'https://trafficviolation.dcsbisu.com'),
    'timezone' => 'Asia/Manila',
    'development' => filter_var($env('TVTMS_DEVELOPMENT', 'false'), FILTER_VALIDATE_BOOLEAN),

    'smtp' => [
        'enabled' => filter_var($env('SMTP_ENABLED', 'false'), FILTER_VALIDATE_BOOLEAN),
        'host' => $env('SMTP_HOST'),
        'port' => (int)$env('SMTP_PORT', '587'),
        'secure' => $env('SMTP_SECURE', 'tls'),
        'username' => $env('SMTP_USERNAME'),
        'password' => $env('SMTP_PASSWORD'),
        'from_email' => $env('SMTP_FROM_EMAIL'),
        'from_name' => $env('SMTP_FROM_NAME', 'TVTMS'),
    ],
];

return array_replace_recursive($base, $local);
