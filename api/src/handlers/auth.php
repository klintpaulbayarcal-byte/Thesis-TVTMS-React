<?php
declare(strict_types=1);

function auth_normalize_legacy_email(mixed $value): string
{
    $email=normalize_email($value);
    if(!str_contains($email,'@')&&preg_match('/^([a-z0-9._%+-]+)\.gov\.ph$/',$email,$m)) return $m[1].'@gov.ph';
    return $email;
}

function auth_login(array $params=[]): never
{
    $in=json_input();$email=auth_normalize_legacy_email($in['email']??'');$password=(string)($in['password']??'');
    if($email===''||$password==='') fail('Email and password are required',400,'VALIDATION_ERROR');
    $rows=supabase_select('users',['email'=>'eq.'.$email,'status'=>'eq.active'],['select'=>'*','limit'=>1]);
    if(!$rows){log_audit(null,'LOGIN_FAILED','auth',null,['email'=>$email,'reason'=>'user_not_found_or_inactive']);fail('Invalid email or password',401,'INVALID_CREDENTIALS');}
    $user=$rows[0];
    if(!in_array($user['role']??'', ['admin','apprehending_officer'],true)){log_audit((int)$user['id'],'LOGIN_BLOCKED_DISABLED_ROLE','users',(int)$user['id'],['role'=>$user['role']??null]);fail('This account role is no longer supported.',403,'DISABLED_ROLE');}
    if(!empty($user['locked_until'])&&strtotime((string)$user['locked_until'])>time()){log_audit((int)$user['id'],'LOGIN_BLOCKED_LOCKED','users',(int)$user['id'],['lockedUntil'=>$user['locked_until']]);fail('Account is temporarily locked due to too many failed login attempts. Please try again later.',423,'ACCOUNT_LOCKED');}
    if(!password_verify($password,(string)$user['password'])){
        $failed=(int)($user['failed_login_attempts']??0)+1;try{supabase_rpc('tvtms_account_failed_login',['p_id'=>(int)$user['id'],'p_max_attempts'=>5,'p_lock_minutes'=>15]);}catch(Throwable $e){error_log('Lockout update skipped: '.$e->getMessage());}
        log_audit((int)$user['id'],$failed>=5?'ACCOUNT_LOCKED':'LOGIN_FAILED','users',(int)$user['id'],['failedAttempts'=>$failed]);fail('Invalid email or password',401,'INVALID_CREDENTIALS');
    }
    try{supabase_update('users',['failed_login_attempts'=>0,'locked_until'=>null,'last_login'=>date(DATE_ATOM)],['id'=>'eq.'.(int)$user['id']],false);}catch(Throwable $e){error_log('Login state update skipped: '.$e->getMessage());}
    $secret=(string)(app_config()['token_secret']??'');if(strlen($secret)<32||str_contains($secret,'CHANGE_THIS'))fail('Server authentication is not configured.',500,'AUTH_CONFIG_ERROR');
    $token=token_sign(['id'=>(int)$user['id'],'email'=>$user['email'],'role'=>$user['role'],'name'=>$user['name'],'pwd'=>token_password_fingerprint((string)$user['password'])],$secret,(int)(app_config()['token_ttl_seconds']??28800));
    log_audit((int)$user['id'],'LOGIN_SUCCESS','users',(int)$user['id'],['role'=>$user['role']]);
    json_response(['success'=>true,'message'=>'Login successful','token'=>$token,'user'=>['id'=>(int)$user['id'],'name'=>$user['name'],'email'=>$user['email'],'role'=>$user['role']]]);
}

function auth_logout(array $params=[]): never
{
    $token=bearer_token();$u=current_user(false);if($u&&$token){revoke_session($token,(int)$u['id']);log_audit((int)$u['id'],'LOGOUT','users',(int)$u['id'],['role'=>$u['role']]);}json_response(['success'=>true,'message'=>'Logout successful']);
}

function auth_request_password_reset(array $params=[]): never
{
    $email=normalize_email(json_input()['email']??'');$generic='If this email belongs to an active account, password reset instructions will be sent.';if($email==='')fail('Email is required',400,'VALIDATION_ERROR');
    $rows=supabase_select('users',['email'=>'eq.'.$email],['select'=>'id,email,status','limit'=>1]);if(!$rows||($rows[0]['status']??'')!=='active')json_response(['success'=>true,'message'=>$generic]);
    $smtp=app_config()['smtp']??[];$appUrl=rtrim((string)(app_config()['app_public_url']??''),'/');if(empty($smtp['enabled'])||$appUrl==='')json_response(['success'=>true,'message'=>$generic]);
    $user=$rows[0];$token=bin2hex(random_bytes(32));$hash=hash('sha256',$token);$expires=(new DateTimeImmutable('+1 hour'))->format(DATE_ATOM);supabase_update('users',['reset_token_hash'=>$hash,'reset_token_expires'=>$expires],['id'=>'eq.'.(int)$user['id']],false);
    $link=$appUrl.'/reset-password?token='.rawurlencode($token);$sent=send_basic_email((string)$user['email'],'TVTMS Password Reset','<p>A password reset was requested for your TVTMS account.</p><p><a href="'.htmlspecialchars($link,ENT_QUOTES).'">Reset your password</a></p><p>This link expires in one hour.</p>');
    if(!$sent){supabase_update('users',['reset_token_hash'=>null,'reset_token_expires'=>null],['id'=>'eq.'.(int)$user['id'],'reset_token_hash'=>'eq.'.$hash],false);json_response(['success'=>true,'message'=>$generic]);}
    log_audit((int)$user['id'],'PASSWORD_RESET_REQUESTED','users',(int)$user['id'],['expiresAt'=>$expires]);json_response(['success'=>true,'message'=>$generic]);
}

function auth_reset_password(array $params=[]): never
{
    $in=json_input();$token=(string)($in['token']??'');$password=(string)($in['newPassword']??$in['new_password']??'');if($token===''||$password==='')fail('Token and new password are required',400,'VALIDATION_ERROR');if(!is_strong_password($password))fail('Password must be at least 12 characters and include uppercase, lowercase, number, and symbol.',400,'WEAK_PASSWORD');
    $hash=hash('sha256',$token);$rows=supabase_select('users',['reset_token_hash'=>'eq.'.$hash,'reset_token_expires'=>'gt.'.date(DATE_ATOM)],['select'=>'id,email','limit'=>1]);if(!$rows)fail('Invalid or expired reset token',400,'INVALID_RESET_TOKEN');
    $user=$rows[0];$pw=password_hash($password,PASSWORD_BCRYPT,['cost'=>12]);$ok=supabase_rpc('tvtms_account_reset_password',['p_id'=>(int)$user['id'],'p_token_hash'=>$hash,'p_password'=>$pw]);if(!$ok)fail('Invalid or expired reset token',400,'INVALID_RESET_TOKEN');log_audit((int)$user['id'],'PASSWORD_RESET_COMPLETED','users',(int)$user['id']);json_response(['success'=>true,'message'=>'Password has been reset successfully']);
}

function auth_profile(array $params=[]): never
{
    $u=require_role(['admin','apprehending_officer']);$rows=supabase_select('users',['id'=>'eq.'.(int)$u['id']],['select'=>'id,name,email,role,contact_number,plate_number,created_at','limit'=>1]);if(!$rows)fail('User not found',404,'USER_NOT_FOUND');json_response(['success'=>true,'user'=>$rows[0],'data'=>$rows[0]]);
}
