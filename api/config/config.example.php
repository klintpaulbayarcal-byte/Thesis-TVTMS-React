<?php
// Legacy/compatibility reference only. DO NOT copy this file over config.php.
// Keep api/config/config.php as the runtime loader. Put real server secrets in
// config.local.php (copied from the included config.local.example.php) or server environment variables.
return [
    'supabase_url' => 'https://cwrhxvrmnfmzuxotsjrw.supabase.co',
    'supabase_secret_key' => 'CHANGE_ME_SERVER_SECRET',
    'token_secret' => 'CHANGE_THIS_TO_A_LONG_RANDOM_SECRET_32_CHARS_MINIMUM',
    'token_ttl_seconds' => 28800,
    'app_public_url' => 'https://trafficviolation.dcsbisu.com',
    'timezone' => 'Asia/Manila',
    'development' => false,
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
