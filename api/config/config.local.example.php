<?php
// Safe template ONLY. Copy to config.local.php privately on the intended server and replace placeholders.
// Keep config.php as the runtime loader. Never commit or share config.local.php.
// Alternatively, supply server-only environment variables.
return [
    'supabase_url' => 'https://YOUR_NON_PRODUCTION_PROJECT.supabase.co',
    'supabase_secret_key' => 'CHANGE_ME_SERVER_SECRET',
    'token_secret' => 'CHANGE_THIS_TO_A_LONG_RANDOM_SECRET_32_CHARS_MINIMUM',
    'token_ttl_seconds' => 28800,
    'app_public_url' => 'http://localhost:5173',
    'timezone' => 'Asia/Manila',
    'development' => true,
    'smtp' => [
        'enabled' => false,
        'host' => '',
        'port' => 587,
        'secure' => 'tls',
        'username' => '',
        'password' => '',
        'from_email' => '',
        'from_name' => 'TVTMS',
    ],
];
