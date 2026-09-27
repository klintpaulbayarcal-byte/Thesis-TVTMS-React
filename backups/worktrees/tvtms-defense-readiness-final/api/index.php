<?php
declare(strict_types=1);

header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
header("Permissions-Policy: geolocation=(self), camera=(self)");

require_once __DIR__ . '/src/common.php';
require_once __DIR__ . '/src/router.php';
foreach (glob(__DIR__ . '/src/handlers/*.php') ?: [] as $handlerFile) {
    require_once $handlerFile;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    header('Allow: GET, POST, PUT, DELETE, OPTIONS');
    exit;
}

$requestMethod=$_SERVER['REQUEST_METHOD'] ?? 'GET';
$requestPath=normalize_api_path($_SERVER['REQUEST_URI'] ?? '/api');
$limits=[['api',300,300,'Too many requests. Please slow down and try again.','RATE_LIMIT_API']];
if(in_array($requestPath,['/api/auth/login','/api/auth/request-password-reset','/api/auth/reset-password'],true))$limits[]=['auth',10,900,'Too many authentication attempts. Please try again later.','RATE_LIMIT_AUTH'];
if(in_array($requestPath,['/api/public/ticket-lookup','/api/public/vehicle-lookup','/api/public/plate-summary'],true))$limits[]=['lookup',60,600,'Too many public lookup attempts. Please try again later.','RATE_LIMIT_LOOKUP'];
if($requestMethod==='POST'&&$requestPath==='/api/public/dispute/verification/request')$limits[]=['dispute-code-request',10,3600,'Too many verification-code requests. Please try again later.','RATE_LIMIT_DISPUTE_CODE'];
if($requestMethod==='POST'&&$requestPath==='/api/public/dispute/verification/verify')$limits[]=['dispute-code-verify',20,600,'Too many verification attempts. Please try again later.','RATE_LIMIT_DISPUTE_VERIFY'];
if($requestMethod==='POST'&&$requestPath==='/api/public/dispute')$limits[]=['public-dispute-submit',8,1800,'Too many dispute submissions. Please try again later.','RATE_LIMIT_PUBLIC_DISPUTE'];
if($requestMethod==='POST'&&$requestPath==='/api/public/contact')$limits[]=['public-write',8,1800,'Too many submissions. Please try again later.','RATE_LIMIT_PUBLIC_WRITE'];
foreach($limits as [$bucket,$max,$window,$message,$code]){$rl=rate_limit_check($bucket,$max,$window);if(!$rl['allowed']){header('Retry-After: '.(string)$rl['retry_after']);fail($message,429,$code);}}

$route = resolve_route($requestMethod, $requestPath);
if (!$route) {
    fail('API endpoint not found.', 404, 'NOT_FOUND');
}

if ($route['handler'] === 'health') {
    try {
        supabase_request('GET', '/rest/v1/system_settings', ['select'=>'setting_key','limit'=>1]);
        json_response([
            'success' => true,
            'status' => 'healthy',
            'database' => 'connected',
            'databaseClient' => 'supabase-postgresql',
            'smtp' => smtp_configuration_status(app_config()['smtp']??[])==='configured' ? 'configured' : 'not_configured',
            'deployment' => !empty(app_config()['development']) ? 'development' : 'production',
            'runtime' => 'php',
            'capabilities' => ['react-static-frontend','supabase-postgresql','ticket-permanent-delete','ticket-mark-unpaid','payment-state-audit'],
            'timestamp' => date(DATE_ATOM),
        ]);
    } catch (Throwable $e) {
        json_response([
            'success' => false,
            'status' => 'unhealthy',
            'database' => 'disconnected',
            'databaseClient' => 'supabase-postgresql',
            'runtime' => 'php',
            'timestamp' => date(DATE_ATOM),
        ], 503);
    }
}

$handler = $route['handler'];
if (!function_exists($handler)) {
    fail('API handler is unavailable.', 500, 'HANDLER_MISSING');
}

try {
    $handler($route['params']);
} catch (SupabaseException $e) {
    error_log('TVTMS Supabase error: ' . $e->getMessage());
    $details = !empty(app_config()['development']) ? ['detail'=>$e->getMessage(),'status'=>$e->httpStatus,'pgCode'=>$e->pgCode] : [];
    fail('Database operation failed.', 500, 'DATABASE_ERROR', $details);
} catch (Throwable $e) {
    error_log('TVTMS server error: ' . $e->getMessage());
    $details = [];
    try { if (!empty(app_config()['development'])) $details=['detail'=>$e->getMessage()]; } catch (Throwable) {}
    fail('Server error.', 500, 'SERVER_ERROR', $details);
}
