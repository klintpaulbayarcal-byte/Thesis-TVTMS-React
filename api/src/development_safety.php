<?php
declare(strict_types=1);

function development_configuration_error(array $config, string $sapi = PHP_SAPI): ?string
{
    if ($sapi !== 'cli-server') return null;
    $url = strtolower(trim((string)($config['supabase_url'] ?? '')));
    $publicUrl = strtolower(trim((string)($config['app_public_url'] ?? '')));
    $key = (string)($config['supabase_secret_key'] ?? '');
    $parts = explode('.', $key);
    $claims = count($parts) === 3 ? json_decode((string)base64_decode(strtr($parts[1], '-_', '+/')), true) : [];
    $configured = ($config['configured_development'] ?? false) === true
        && ($config['isolated_development'] ?? false) === false;
    if (!$configured && (($config['development'] ?? false) !== true
        || in_array(strtolower((string)($config['environment'] ?? '')), ['production','prod'], true)
        || str_contains($url, 'cwrhxvrmnfmzuxotsjrw')
        || str_contains($publicUrl, 'trafficviolation.dcsbisu.com')
        || ($claims['ref'] ?? null) === 'cwrhxvrmnfmzuxotsjrw')) {
        return 'Local development is blocked from production. Run npm run dev:isolated, or explicitly configure a non-production database with development enabled.';
    }
    if ($url === '') return 'Local database configuration is missing. Configure the existing database for npm run dev, or use optional npm run dev:isolated.';
    return null;
}
