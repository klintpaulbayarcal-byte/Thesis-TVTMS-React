<?php
declare(strict_types=1);
// Separate self-service driver workflow. Staff accounts cannot self-register.
// Driver identity is verified against the issue-time driver email, never a plate.
function driver_register(array $params=[]): never {
 $b=json_input();
 $name=clean_string($b['name']??'',100);
 $email=normalize_email($b['email']??'');
 $password=(string)($b['password']??'');
 $generic='If registration can proceed, we will send an activation link to the email provided.';
 if($name===''||strlen($name)<2||!filter_var($email,FILTER_VALIDATE_EMAIL)||strlen($email)>100||!is_strong_password($password))
   fail('Enter a name, valid email, and password of 12+ characters with upper/lowercase, number and symbol.',400,'VALIDATION_ERROR');
 $existing=supabase_select('users',['email'=>'eq.'.$email],['select'=>'id,role,status,driver_signup_last_sent_at','limit'=>1]);
 if($existing)json_response(['success'=>true,'message'=>$generic],201);
 $token=bin2hex(random_bytes(32));$tokenHash=hash('sha256',$token);
 $expiry=(new DateTimeImmutable('+30 minutes'))->format(DATE_ATOM);
 try {
  supabase_insert('users',[['name'=>$name,'email'=>$email,'password'=>password_hash($password,PASSWORD_BCRYPT,['cost'=>12]),
    'role'=>'driver','status'=>'inactive','driver_signup_token_hash'=>$tokenHash,
    'driver_signup_expires_at'=>$expiry,'driver_signup_last_sent_at'=>date(DATE_ATOM)]]);
 } catch(SupabaseException $e) {
  if($e->pgCode==='23505')json_response(['success'=>true,'message'=>$generic],201);
  throw $e;
 }
 $base=rtrim((string)(app_config()['app_public_url']??'https://trafficviolation.dcsbisu.com'),'/');
 $url=$base.'/driver/activate?token='.rawurlencode($token);
 $html='<p>Activate your TVTMS Driver account by opening the link below. This link expires in 30 minutes.</p>'.
  '<p><a href="'.htmlspecialchars($url,ENT_QUOTES,'UTF-8').'">Activate my account</a></p>'.
  '<p>If you did not register, ignore this message. Your account cannot log in until activated.</p>';
 $sent=send_email($email,'TVTMS Driver Account Activation',$html);
 if(($sent['status']??'')!=='accepted')error_log('Driver registration activation email was not accepted.');
 json_response(['success'=>true,'message'=>$generic],201);
}
function driver_resend_activation(array $params=[]): never {
 $b=json_input();$email=normalize_email($b['email']??'');$password=(string)($b['password']??'');
 $generic='If an unverified driver account matches these credentials, a new activation link will be sent.';
 if(!filter_var($email,FILTER_VALIDATE_EMAIL)||strlen($email)>100||$password==='')fail('Enter your registration email and password.',400,'VALIDATION_ERROR');
 $rows=supabase_select('users',['email'=>'eq.'.$email],['select'=>'id,password,role,status,driver_signup_last_sent_at,driver_verified_at','limit'=>1]);
 $u=$rows[0]??null;
 if(!$u||$u['role']!=='driver'||$u['status']!=='inactive'||!empty($u['driver_verified_at'])||!password_verify($password,(string)$u['password']))
   json_response(['success'=>true,'message'=>$generic]);
 $last=(string)($u['driver_signup_last_sent_at']??'');
 if($last!==''&&strtotime($last)>time()-90)fail('Please wait 90 seconds before requesting another activation email.',429,'ACTIVATION_COOLDOWN');
 $token=bin2hex(random_bytes(32));$hash=hash('sha256',$token);
 $updated=supabase_update('users',['driver_signup_token_hash'=>$hash,
  'driver_signup_expires_at'=>(new DateTimeImmutable('+30 minutes'))->format(DATE_ATOM),
  'driver_signup_last_sent_at'=>date(DATE_ATOM)],['id'=>'eq.'.(int)$u['id'],'status'=>'eq.inactive']);
 if(!$updated)fail('Activation request could not be processed.',409,'ACTIVATION_UNAVAILABLE');
 $url=rtrim((string)(app_config()['app_public_url']??'https://trafficviolation.dcsbisu.com'),'/').'/driver/activate?token='.$token;
 $mail=send_email($email,'TVTMS Driver Account Activation',
  '<p>Click the link to activate your driver account. It expires after 30 minutes.</p><p><a href="'.htmlspecialchars($url,ENT_QUOTES,'UTF-8').'">Activate account</a></p><p>Ignore this if you did not request it.</p>');
 if(($mail['status']??'')!=='accepted')error_log('Driver resend activation email was not accepted.');
 json_response(['success'=>true,'message'=>$generic]);
}

function driver_activate(array $params=[]): never {
 $token=(string)(json_input()['token']??'');
 if(!preg_match('/^[a-f0-9]{64}$/D',$token))fail('Invalid activation link.',400,'INVALID_TOKEN');
 $hash=hash('sha256',$token);
 $rows=supabase_select('users',['driver_signup_token_hash'=>'eq.'.$hash,'driver_signup_expires_at'=>'gt.'.date(DATE_ATOM),
    'role'=>'eq.driver','status'=>'eq.inactive'],['select'=>'id','limit'=>1]);
 if(!$rows)fail('Activation link is invalid or expired.',400,'INVALID_TOKEN');
 $id=(int)$rows[0]['id'];
 $updated=supabase_update('users',['status'=>'active','driver_verified_at'=>date(DATE_ATOM),
  'driver_signup_token_hash'=>null,'driver_signup_expires_at'=>null],
  ['id'=>'eq.'.$id,'role'=>'eq.driver','status'=>'eq.inactive','driver_signup_token_hash'=>'eq.'.$hash,'driver_signup_expires_at'=>'gt.'.date(DATE_ATOM)]);
 if(!$updated)fail('Activation link has already been used.',409,'ACTIVATION_USED');
 json_response(['success'=>true,'message'=>'Driver account activated. You may now sign in.']);
}
function driver_portal(array $params=[]): never {
 $u=require_role(['driver']);
 $verified=supabase_select('users',['id'=>'eq.'.(int)$u['id']],['select'=>'driver_verified_at','limit'=>1]);
 if(empty($verified[0]['driver_verified_at']))fail('Driver account is not verified.',403,'DRIVER_NOT_VERIFIED');
 $rows=supabase_rpc('tvtms_driver_portal',['p_email'=>$u['email']]);
 $citations=is_array($rows)?$rows:[];
 // All data are citation issue-time snapshots and are read only.
 json_response(['success'=>true,'citations'=>$citations,'count'=>count($citations)]);
}
