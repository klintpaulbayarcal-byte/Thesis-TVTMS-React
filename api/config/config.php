<?php
declare(strict_types=1);

$localPath = __DIR__ . '/config.local.php';
$isolated = PHP_SAPI === 'cli-server' && getenv('TVTMS_ISOLATED_DEV') === '1';
$local = !$isolated && is_file($localPath) ? require $localPath : [];
if (!is_array($local)) $local = [];

$env = static function (string $name, string $fallback = ''): string {
    $value = getenv($name);
    return $value === false ? $fallback : trim((string)$value);
};

$base = [
    // Every hosted database must be configured explicitly.
    'supabase_url' => $env('SUPABASE_URL'),
    'supabase_secret_key' => trim((string)(getenv('SUPABASE_SECRET_KEY') ?: '')),

    // TVTMS staff JWT signing secret. Keep server-side only.
    'token_secret' => trim((string)(getenv('TVTMS_TOKEN_SECRET') ?: '')),
    'token_ttl_seconds' => 28800,

    'app_public_url' => $env('TVTMS_PUBLIC_URL'),
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

if ($isolated) {
    // Fixed loopback fixture; never load private config or inherited credentials.
    return array_replace_recursive($base, [
        'supabase_url' => 'http://127.0.0.1:54321',
        'supabase_secret_key' => 'local-fixture-only',
        'token_secret' => 'local-fixture-signing-secret-for-disposable-qa-only',
        'app_public_url' => 'http://localhost:5173',
        'development' => true,
        'isolated_development' => true,
        'configured_development' => false,
        'smtp' => ['enabled'=>false,'host'=>'','username'=>'','password'=>'','from_email'=>''],
    ]);
}
return array_replace_recursive($base, $local, [
    // Only the explicit normal npm dev launcher enables configured database access.
    // Never edit or replace private credentials, accounts or the stored dev flag.
    'configured_development' => PHP_SAPI === 'cli-server' && getenv('TVTMS_CONFIGURED_DEV') === '1',
    'isolated_development' => false,
]);
