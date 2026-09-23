<?php
declare(strict_types=1);

function base64url_encode(string $value): string
{
    return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
}

function base64url_decode(string $value): string|false
{
    $padding = strlen($value) % 4;
    if ($padding) {
        $value .= str_repeat('=', 4 - $padding);
    }
    return base64_decode(strtr($value, '-_', '+/'), true);
}

function token_sign(array $payload, string $secret, int $ttlSeconds = 28800, ?int $now = null): string
{
    $now ??= time();
    $header = ['alg' => 'HS256', 'typ' => 'JWT'];
    $payload['iat'] = $payload['iat'] ?? $now;
    $payload['exp'] = $payload['exp'] ?? ($now + $ttlSeconds);

    $header64 = base64url_encode((string)json_encode($header, JSON_UNESCAPED_SLASHES));
    $payload64 = base64url_encode((string)json_encode($payload, JSON_UNESCAPED_SLASHES));
    $signature = hash_hmac('sha256', "$header64.$payload64", $secret, true);

    return "$header64.$payload64." . base64url_encode($signature);
}

function token_verify(string $token, string $secret, ?int $now = null): ?array
{
    $now ??= time();
    $parts = explode('.', $token);
    if (count($parts) !== 3) {
        return null;
    }
    [$header64, $payload64, $signature64] = $parts;
    $signature = base64url_decode($signature64);
    if ($signature === false) {
        return null;
    }
    $expected = hash_hmac('sha256', "$header64.$payload64", $secret, true);
    if (!hash_equals($expected, $signature)) {
        return null;
    }
    $headerJson = base64url_decode($header64);
    $payloadJson = base64url_decode($payload64);
    if ($headerJson === false || $payloadJson === false) {
        return null;
    }
    $header = json_decode($headerJson, true);
    $payload = json_decode($payloadJson, true);
    if (!is_array($header) || ($header['alg'] ?? null) !== 'HS256' || !is_array($payload)) {
        return null;
    }
    if (!isset($payload['exp']) || !is_numeric($payload['exp']) || (int)$payload['exp'] <= $now) {
        return null;
    }
    return $payload;
}

function token_password_fingerprint(string $passwordHash): string
{
    return base64url_encode(hash('sha256', $passwordHash, true));
}

function token_matches_password(array $payload, string $passwordHash): bool
{
    $actual = $payload['pwd'] ?? null;
    return is_string($actual) && $actual !== '' && hash_equals(token_password_fingerprint($passwordHash), $actual);
}

function token_revocation_entity(string $token): string
{
    return 's:' . base64url_encode(hash('sha256', $token, true));
}
