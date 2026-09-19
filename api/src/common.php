<?php
declare(strict_types=1);

require_once __DIR__ . '/auth.php';

function app_config(): array
{
    static $config;
    if ($config === null) {
        $path = __DIR__ . '/../config/config.php';
        if (!is_file($path)) throw new RuntimeException('Missing api/config/config.php');
        $loaded = require $path;
        if (!is_array($loaded)) throw new RuntimeException('Invalid API configuration.');
        $config = $loaded;
        date_default_timezone_set((string)($config['timezone'] ?? 'Asia/Manila'));
    }
    return $config;
}

require_once __DIR__ . '/supabase.php';

function json_input(): array
{
    static $input;
    if ($input !== null) return $input;
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') return $input = [];
    $decoded = json_decode($raw, true);
    return $input = is_array($decoded) ? $decoded : [];
}

function json_response(array $payload, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}
function ok(string $message, mixed $data = null, array $extra = [], int $status = 200): never
{
    json_response(array_merge(['success'=>true,'message'=>$message,'data'=>$data],$extra),$status);
}
function fail(string $message, int $status = 400, string $errorCode = 'ERROR', array $extra = []): never
{
    json_response(array_merge(['success'=>false,'message'=>$message,'errorCode'=>$errorCode],$extra),$status);
}

function bearer_token(): ?string
{
    $header=$_SERVER['HTTP_AUTHORIZATION']??$_SERVER['REDIRECT_HTTP_AUTHORIZATION']??'';
    if($header===''&&function_exists('getallheaders')){$headers=getallheaders();$header=$headers['Authorization']??$headers['authorization']??'';}
    return preg_match('/^Bearer\s+(.+)$/i',trim((string)$header),$m)?trim($m[1]):null;
}

function current_user(bool $required=true): ?array
{
    $token=bearer_token();
    if(!$token){if($required)fail('Access denied. No token provided.',401,'AUTH_REQUIRED');return null;}
    $secret=(string)(app_config()['token_secret']??'');
    if(strlen($secret)<32||str_contains($secret,'CHANGE_THIS')) fail('Server authentication is not configured.',500,'AUTH_CONFIG_ERROR');
    $payload=token_verify($token,$secret);
    if(!$payload||empty($payload['id'])){if($required)fail('Invalid session or token.',401,'INVALID_SESSION');return null;}
    try{$rows=supabase_select('users',['id'=>'eq.'.(int)$payload['id']],['select'=>'id,name,email,role,status,contact_number,plate_number,password','limit'=>1]);}
    catch(Throwable $e){if($required)throw $e;return null;}
    $user=$rows[0]??null;
    if(!$user||($user['status']??'')!=='active'||!in_array($user['role']??'', ['admin','apprehending_officer'],true)){
        if($required)fail('User not found or account is inactive.',401,'INVALID_SESSION');return null;
    }
    if(!token_matches_password($payload,(string)($user['password']??''))){if($required)fail('Invalid session or token.',401,'INVALID_SESSION');return null;}
    try{$revoked=supabase_select('audit_logs',['user_id'=>'eq.'.(int)$user['id'],'action'=>'eq.SESSION_REVOKED','entity_type'=>'eq.'.token_revocation_entity($token)],['select'=>'id','limit'=>1]);}
    catch(Throwable $e){if($required)throw $e;return null;}
    if($revoked){if($required)fail('Invalid session or token.',401,'INVALID_SESSION');return null;}
    unset($user['password']);
    return $user;
}
function require_role(array $roles): array
{
    $user=current_user(true);if(!$user||!in_array($user['role'],$roles,true))fail('Access denied.',403,'FORBIDDEN');return $user;
}

function normalize_plate(mixed $value): string{return strtoupper((string)preg_replace('/[\s-]+/','',trim((string)$value)));}
function normalize_email(mixed $value): string{return strtolower(trim((string)$value));}
function manila_today(): string{return (new DateTimeImmutable('now',new DateTimeZone('Asia/Manila')))->format('Y-m-d');}
function text_length(string $value): int{return function_exists('mb_strlen')?mb_strlen($value):strlen($value);}
function clean_string(mixed $value,int $max=4000): string{$value=trim((string)$value);return function_exists('mb_substr')?mb_substr($value,0,$max):substr($value,0,$max);}
function is_strong_password(string $password): bool{return strlen($password)>=12&&preg_match('/[a-z]/',$password)&&preg_match('/[A-Z]/',$password)&&preg_match('/\d/',$password)&&preg_match('/[^A-Za-z0-9]/',$password);}
function bool_setting(mixed $v): string{return in_array($v,[true,1,'1','true','on'],true)?'1':'0';}

function client_ip_for_audit(): ?string
{
    $ip=trim((string)($_SERVER['REMOTE_ADDR']??''));
    return filter_var($ip,FILTER_VALIDATE_IP)!==false?$ip:null;
}

function revoke_session(string $token,int $userId): void
{
    $secret=(string)(app_config()['token_secret']??'');$payload=token_verify($token,$secret);
    supabase_insert('audit_logs',[['user_id'=>$userId,'action'=>'SESSION_REVOKED','entity_type'=>token_revocation_entity($token),'entity_id'=>$userId,'metadata'=>json_encode(['expiresAt'=>$payload['exp']??null],JSON_UNESCAPED_SLASHES),'ip_address'=>client_ip_for_audit(),'user_agent'=>substr((string)($_SERVER['HTTP_USER_AGENT']??''),0,2000)]],false);
}

function log_audit(?int $userId,string $action,?string $entityType=null,?int $entityId=null,array $metadata=[]): void
{
    try{supabase_insert('audit_logs',[['user_id'=>$userId,'action'=>$action,'entity_type'=>$entityType,'entity_id'=>$entityId,'metadata'=>$metadata?json_encode($metadata,JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE):null,'ip_address'=>client_ip_for_audit(),'user_agent'=>substr((string)($_SERVER['HTTP_USER_AGENT']??''),0,2000)]],false);}catch(Throwable $e){error_log('Audit logging failed: '.$e->getMessage());}
}
function create_notification(int $userId,string $type,string $title,string $message,?string $referenceType=null,?int $referenceId=null): void
{
    try{supabase_insert('notifications',[['user_id'=>$userId,'type'=>$type,'title'=>$title,'message'=>$message,'reference_type'=>$referenceType,'reference_id'=>$referenceId]],false);}catch(Throwable $e){error_log('Notification creation failed: '.$e->getMessage());}
}

function rpc_domain_error(mixed $result): ?array
{
    if(!is_array($result))return null;
    if(isset($result['error'])&&is_array($result['error'])) return $result['error'];
    if(isset($result['errorCode'])) return ['message'=>$result['message']??'Operation rejected.','statusCode'=>(int)($result['statusCode']??400),'errorCode'=>$result['errorCode']];
    return null;
}
function fail_domain(array $error): never
{
    fail((string)($error['message']??'Operation rejected.'),(int)($error['statusCode']??$error['status']??400),(string)($error['errorCode']??'DOMAIN_ERROR'));
}

function smtp_read_response($socket): string{$response='';while(($line=fgets($socket,515))!==false){$response.=$line;if(strlen($line)<4||$line[3]===' ')break;}return $response;}
function smtp_expect($socket,array $codes): string{$response=smtp_read_response($socket);$code=(int)substr($response,0,3);if(!in_array($code,$codes,true))throw new RuntimeException('SMTP server rejected the request ('.$code.').');return $response;}
function smtp_command($socket,string $command,array $codes): string{fwrite($socket,$command."\r\n");return smtp_expect($socket,$codes);}
function smtp_send_message(array $smtp,string $to,string $subject,string $html): bool
{
    $host=trim((string)($smtp['host']??''));$port=(int)($smtp['port']??587);$secure=strtolower(trim((string)($smtp['secure']??'tls')));$user=(string)($smtp['username']??'');$pass=(string)($smtp['password']??'');$from=trim((string)($smtp['from_email']??$user));$fromName=trim((string)($smtp['from_name']??'TVTMS'));
    if(!$host||!filter_var($to,FILTER_VALIDATE_EMAIL)||!filter_var($from,FILTER_VALIDATE_EMAIL))return false;
    $remote=($secure==='ssl'?'ssl://':'').$host;$errno=0;$errstr='';$socket=@fsockopen($remote,$port,$errno,$errstr,12);if(!$socket)return false;stream_set_timeout($socket,12);
    try{smtp_expect($socket,[220]);$ehlo=$_SERVER['SERVER_NAME']??'localhost';smtp_command($socket,'EHLO '.$ehlo,[250]);if($secure==='tls'){smtp_command($socket,'STARTTLS',[220]);if(!stream_socket_enable_crypto($socket,true,STREAM_CRYPTO_METHOD_TLS_CLIENT))throw new RuntimeException('Unable to establish SMTP TLS.');smtp_command($socket,'EHLO '.$ehlo,[250]);}if($user!==''){smtp_command($socket,'AUTH LOGIN',[334]);smtp_command($socket,base64_encode($user),[334]);smtp_command($socket,base64_encode($pass),[235]);}smtp_command($socket,'MAIL FROM:<'.$from.'>',[250]);smtp_command($socket,'RCPT TO:<'.$to.'>',[250,251]);smtp_command($socket,'DATA',[354]);$encodedSubject='=?UTF-8?B?'.base64_encode($subject).'?=';$safeName=str_replace(["\r","\n",'"'],'',$fromName);$body=preg_replace('/^\./m','..',$html)??$html;$message="Date: ".date(DATE_RFC2822)."\r\nFrom: \"{$safeName}\" <{$from}>\r\nTo: <{$to}>\r\nSubject: {$encodedSubject}\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n{$body}\r\n.";fwrite($socket,$message."\r\n");smtp_expect($socket,[250]);smtp_command($socket,'QUIT',[221]);fclose($socket);return true;}catch(Throwable $e){error_log('SMTP send failed: '.$e->getMessage());if(is_resource($socket))fclose($socket);return false;}
}
function send_basic_email(string $to,string $subject,string $html): bool{$smtp=app_config()['smtp']??[];if(empty($smtp['enabled'])||!filter_var($to,FILTER_VALIDATE_EMAIL))return false;if(trim((string)($smtp['host']??''))!=='')return smtp_send_message($smtp,$to,$subject,$html);$from=trim((string)($smtp['from_email']??''));if(!filter_var($from,FILTER_VALIDATE_EMAIL))return false;$headers=['MIME-Version: 1.0','Content-Type: text/html; charset=UTF-8','From: '.($smtp['from_name']??'TVTMS').' <'.$from.'>'];return @mail($to,$subject,$html,implode("\r\n",$headers));}

function rate_limit_check(string $bucket,int $max,int $windowSeconds,?string $ip=null,?int $now=null,?string $directory=null): array
{
    $now??=time();$ip??=(string)($_SERVER['REMOTE_ADDR']??'unknown');$directory??=sys_get_temp_dir().'/tvtms-rate-limit';if(!is_dir($directory)&&!@mkdir($directory,0700,true)&&!is_dir($directory))return ['allowed'=>true,'remaining'=>$max,'retry_after'=>0];$file=$directory.'/'.hash('sha256',$bucket.'|'.$ip).'.json';$fh=@fopen($file,'c+');if(!$fh)return ['allowed'=>true,'remaining'=>$max,'retry_after'=>0];try{if(!flock($fh,LOCK_EX))return ['allowed'=>true,'remaining'=>$max,'retry_after'=>0];$raw=stream_get_contents($fh);$state=$raw?json_decode($raw,true):null;$start=(int)($state['start']??$now);$count=(int)($state['count']??0);if($now-$start>=$windowSeconds){$start=$now;$count=0;}$allowed=$count<$max;if($allowed)$count++;ftruncate($fh,0);rewind($fh);fwrite($fh,json_encode(['start'=>$start,'count'=>$count]));fflush($fh);flock($fh,LOCK_UN);return ['allowed'=>$allowed,'remaining'=>max(0,$max-$count),'retry_after'=>$allowed?0:max(1,$windowSeconds-($now-$start))];}finally{fclose($fh);}
}
