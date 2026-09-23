<?php
declare(strict_types=1);

final class SupabaseException extends RuntimeException
{
    public int $httpStatus;
    public ?string $pgCode;
    public array $payload;

    public function __construct(string $message, int $httpStatus = 500, ?string $pgCode = null, array $payload = [])
    {
        parent::__construct($message);
        $this->httpStatus = $httpStatus;
        $this->pgCode = $pgCode;
        $this->payload = $payload;
    }
}

function supabase_server_key_kind(string $key): ?string
{
    $key = trim($key);
    if ($key === '') return null;
    if (str_starts_with($key, 'sb_secret_')) return 'secret';
    if (str_starts_with($key, 'sb_publishable_')) return null;

    $parts = explode('.', $key);
    if (count($parts) !== 3) return null;
    $payload64 = strtr($parts[1], '-_', '+/');
    $padding = strlen($payload64) % 4;
    if ($padding) $payload64 .= str_repeat('=', 4 - $padding);
    $decoded = base64_decode($payload64, true);
    if ($decoded === false) return null;
    $payload = json_decode($decoded, true);
    if (!is_array($payload) || ($payload['role'] ?? null) !== 'service_role') return null;
    return 'legacy_service_role';
}

function supabase_config(): array
{
    $c = app_config();
    $url = rtrim(trim((string)($c['supabase_url'] ?? '')), '/');
    $key = trim((string)($c['supabase_secret_key'] ?? ''));
    if ($url === '' || !str_starts_with($url, 'https://')) {
        throw new RuntimeException('SUPABASE URL is missing or invalid.');
    }
    if ($key === '' || str_contains($key, 'CHANGE_ME') || supabase_server_key_kind($key) === null) {
        throw new RuntimeException('SUPABASE server secret key is not configured or is not a server-level credential.');
    }
    return [$url, $key];
}


function supabase_auth_headers(string $key): array
{
    $headers = ['apikey: ' . $key];
    // New sb_secret_/sb_publishable_ keys are opaque API keys, not JWTs.
    // Legacy anon/service_role keys are JWTs and can be sent as Bearer tokens.
    if (!str_starts_with($key, 'sb_')) {
        $headers[] = 'Authorization: Bearer ' . $key;
    }
    return $headers;
}

function supabase_query_string(array $query): string
{
    $parts = [];
    foreach ($query as $key => $value) {
        if ($value === null || $value === '') continue;
        if (is_bool($value)) $value = $value ? 'true' : 'false';
        $parts[] = rawurlencode((string)$key) . '=' . rawurlencode((string)$value);
    }
    return implode('&', $parts);
}

function supabase_request(string $method, string $path, array $query = [], mixed $body = null, array $extraHeaders = []): array
{
    if (!extension_loaded('curl')) {
        throw new RuntimeException('The PHP cURL extension is required for Supabase connectivity.');
    }
    [$base, $key] = supabase_config();
    $url = $base . '/' . ltrim($path, '/');
    $qs = supabase_query_string($query);
    if ($qs !== '') $url .= '?' . $qs;

    $headers = array_merge(supabase_auth_headers($key), ['Accept: application/json']);
    foreach ($extraHeaders as $h) $headers[] = $h;

    $headerLines = [];
    $ch = curl_init($url);
    if ($ch === false) throw new RuntimeException('Unable to initialize cURL.');
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => strtoupper($method),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_CONNECTTIMEOUT => 12,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_HEADERFUNCTION => static function ($ch, string $line) use (&$headerLines): int {
            $len = strlen($line);
            $line = trim($line);
            if ($line !== '' && str_contains($line, ':')) {
                [$k,$v] = array_map('trim', explode(':', $line, 2));
                $headerLines[strtolower($k)] = $v;
            }
            return $len;
        },
    ]);
    if ($body !== null) {
        $json = json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($json === false) throw new RuntimeException('Unable to encode Supabase request body.');
        $headers[] = 'Content-Type: application/json';
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $json);
    }
    $raw = curl_exec($ch);
    $curlError = curl_error($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($raw === false) throw new RuntimeException('Supabase request failed: ' . $curlError);

    $decoded = $raw === '' ? null : json_decode($raw, true);
    if ($status < 200 || $status >= 300) {
        $payload = is_array($decoded) ? $decoded : [];
        $message = (string)($payload['message'] ?? $payload['error_description'] ?? $payload['hint'] ?? 'Supabase request failed.');
        throw new SupabaseException($message, $status ?: 500, isset($payload['code']) ? (string)$payload['code'] : null, $payload);
    }
    return ['status'=>$status, 'headers'=>$headerLines, 'data'=>$decoded];
}

function supabase_select(string $table, array $filters = [], array $options = []): array
{
    $query = ['select' => $options['select'] ?? '*'];
    foreach ($filters as $column => $expression) $query[$column] = $expression;
    if (!empty($options['order'])) $query['order'] = $options['order'];
    if (isset($options['limit'])) $query['limit'] = (int)$options['limit'];
    if (isset($options['offset'])) $query['offset'] = (int)$options['offset'];
    $result = supabase_request('GET', '/rest/v1/' . rawurlencode($table), $query);
    $data = $result['data'];
    return is_array($data) ? $data : [];
}

function supabase_insert(string $table, array $rowOrRows, bool $returnRepresentation = true): array
{
    $prefer = $returnRepresentation ? 'Prefer: return=representation' : 'Prefer: return=minimal';
    $result = supabase_request('POST', '/rest/v1/' . rawurlencode($table), [], $rowOrRows, [$prefer]);
    return is_array($result['data']) ? $result['data'] : [];
}

function supabase_upsert(string $table, array $rows, string $onConflict): array
{
    $result = supabase_request('POST', '/rest/v1/' . rawurlencode($table), ['on_conflict'=>$onConflict], $rows, [
        'Prefer: resolution=merge-duplicates,return=representation'
    ]);
    return is_array($result['data']) ? $result['data'] : [];
}

function supabase_update(string $table, array $values, array $filters, bool $returnRepresentation = true): array
{
    $query=[]; foreach($filters as $column=>$expression)$query[$column]=$expression;
    $prefer=$returnRepresentation?'Prefer: return=representation':'Prefer: return=minimal';
    $result=supabase_request('PATCH','/rest/v1/'.rawurlencode($table),$query,$values,[$prefer]);
    return is_array($result['data'])?$result['data']:[];
}

function supabase_delete(string $table, array $filters, bool $returnRepresentation = true): array
{
    $query=[]; foreach($filters as $column=>$expression)$query[$column]=$expression;
    $prefer=$returnRepresentation?'Prefer: return=representation':'Prefer: return=minimal';
    $result=supabase_request('DELETE','/rest/v1/'.rawurlencode($table),$query,null,[$prefer]);
    return is_array($result['data'])?$result['data']:[];
}

function supabase_rpc(string $name, array $args = []): mixed
{
    $result = supabase_request('POST', '/rest/v1/rpc/' . rawurlencode($name), [], $args, ['Prefer: return=representation']);
    return $result['data'];
}

function supabase_count(string $table, array $filters = []): int
{
    $query=['select'=>'id','limit'=>1]; foreach($filters as $column=>$expression)$query[$column]=$expression;
    $result=supabase_request('GET','/rest/v1/'.rawurlencode($table),$query,null,['Prefer: count=exact']);
    $range=$result['headers']['content-range']??'';
    if(preg_match('~/([0-9]+)$~',$range,$m)) return (int)$m[1];
    return is_array($result['data'])?count($result['data']):0;
}
