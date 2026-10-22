<?php
declare(strict_types=1);

function required_env(string $name): string
{
    $value=getenv($name);
    $value=$value===false?'':trim((string)$value);
    if($value==='')throw new InvalidArgumentException($name.' is required.');
    return $value;
}

function validated_port(string $value): int
{
    if(!ctype_digit($value))throw new InvalidArgumentException('SMTP_PORT is invalid.');
    $port=(int)$value;
    if($port<1||$port>65535)throw new InvalidArgumentException('SMTP_PORT is invalid.');
    return $port;
}

function validated_secure(string $value): string
{
    $secure=strtolower($value);
    if(!in_array($secure,['tls','ssl'],true))throw new InvalidArgumentException('SMTP_SECURE is invalid.');
    return $secure;
}

function validated_email(string $value): string
{
    if(filter_var($value,FILTER_VALIDATE_EMAIL)===false)throw new InvalidArgumentException('SMTP_FROM_EMAIL is invalid.');
    return $value;
}

$temporary=null;
try{
    if(PHP_SAPI!=='cli'||$argc!==2||trim((string)$argv[1])===''){
        throw new InvalidArgumentException('TARGET_PATH is required.');
    }
    $target=(string)$argv[1];
    $directory=dirname($target);
    if(!is_dir($directory))throw new RuntimeException('TARGET_DIRECTORY is unavailable.');

    $supabaseSecret=required_env('SUPABASE_SECRET_KEY');
    $tokenSecret=required_env('TVTMS_TOKEN_SECRET');
    if(strlen($tokenSecret)<32||str_contains($tokenSecret,'CHANGE_THIS')){
        throw new InvalidArgumentException('TVTMS_TOKEN_SECRET is invalid.');
    }
    $smtp=[
        'enabled'=>true,
        'host'=>required_env('SMTP_HOST'),
        'port'=>validated_port(required_env('SMTP_PORT')),
        'secure'=>validated_secure(required_env('SMTP_SECURE')),
        'username'=>required_env('SMTP_USERNAME'),
        'password'=>required_env('SMTP_PASSWORD'),
        'from_email'=>validated_email(required_env('SMTP_FROM_EMAIL')),
        'from_name'=>required_env('SMTP_FROM_NAME'),
    ];
    $config=[
        'supabase_url'=>'https://cwrhxvrmnfmzuxotsjrw.supabase.co',
        'supabase_secret_key'=>$supabaseSecret,
        'token_secret'=>$tokenSecret,
        'token_ttl_seconds'=>28800,
        'app_public_url'=>'https://trafficviolation.dcsbisu.com',
        'timezone'=>'Asia/Manila',
        'development'=>false,
        'smtp'=>$smtp,
    ];

    $temporary=$target.'.tmp.'.bin2hex(random_bytes(8));
    $contents="<?php\ndeclare(strict_types=1);\nreturn ".var_export($config,true).";\n";
    if(file_put_contents($temporary,$contents,LOCK_EX)===false)throw new RuntimeException('TARGET_WRITE failed.');
    @chmod($temporary,0600);
    if(!@rename($temporary,$target))throw new RuntimeException('TARGET_RENAME failed.');
    $temporary=null;
    @chmod($target,0600);
    fwrite(STDOUT,"Private production API config created.\n");
}catch(Throwable $error){
    if(is_string($temporary)&&$temporary!==''&&is_file($temporary))@unlink($temporary);
    fwrite(STDERR,'Configuration error: '.$error->getMessage()."\n");
    exit(1);
}
