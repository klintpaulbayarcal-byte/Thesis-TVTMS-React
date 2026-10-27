<?php
declare(strict_types=1);
// These endpoints are deliberately separate from dispute OTP verification.
function qr_identity_secret(): string {
 $secret=(string)(app_config()['token_secret']??'');
 if(strlen($secret)<32)fail('Verification is unavailable.',503,'IDENTITY_CONFIGURATION');
 return $secret;
}
function qr_identity_ticket(mixed $value): string {
 $ticket=strtoupper(trim(is_string($value)?$value:''));
 if(preg_match('/^[A-Z0-9][A-Z0-9\/-]{0,29}$/D',$ticket)!==1)fail('Enter a valid citation number.',400,'VALIDATION_ERROR');
 return $ticket;
}
function qr_identity_request(array $params=[]): never {
 header('Cache-Control: no-store');
 $body=json_input();$ticket=qr_identity_ticket($body['ticket_number']??'');
 $token=rtrim(strtr(base64_encode(random_bytes(32)),'+/','-_'),'=');
 $code=str_pad((string)random_int(0,999999),6,'0',STR_PAD_LEFT);
 $tokenHash=hash('sha256',$token);
 $codeHash=hash_hmac('sha256','qr-identity|'.$ticket.'|'.$tokenHash.'|'.$code,qr_identity_secret());
 $request=supabase_rpc('tvtms_qr_identity_request',[
  'p_ticket'=>$ticket,'p_token_hash'=>$tokenHash,'p_code_hash'=>$codeHash,
  'p_requester_hash'=>hash_hmac('sha256','qr-identity-ip|'.(client_ip_for_audit()??'unknown'),qr_identity_secret())
 ]);
 if($error=rpc_domain_error($request))fail_domain($error);
 if(($request['status']??'')!=='created')fail('Verification unavailable.',503,'IDENTITY_UNAVAILABLE');
 $recipient=(string)($request['recipient']??'');
 if(!filter_var($recipient,FILTER_VALIDATE_EMAIL))fail('Verification unavailable.',503,'IDENTITY_UNAVAILABLE');
 $e=static fn($v)=>htmlspecialchars((string)$v,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');
 $mail=send_email($recipient,'TVTMS citation identity verification — '.$ticket,
 '<p>To view the cited driver and registered owner names for citation <strong>'.$e($ticket).'</strong>, enter this one-time code:</p>'.
 '<p style="font-size:24px;font-weight:bold;letter-spacing:4px">'.$e($code).'</p>'.
 '<p>The code expires in 10 minutes and can be used only once. Do not share it. If you did not request this, ignore this email.</p>');
 $accepted=($mail['status']??'')==='accepted';
 try {
  $delivery=supabase_rpc('tvtms_qr_identity_delivery',['p_token_hash'=>$tokenHash,'p_delivery_status'=>$accepted?'accepted':'failed']);
  if($error=rpc_domain_error($delivery))throw new RuntimeException('delivery_finalize_failed');
  if(($delivery['status']??'')!==($accepted?'accepted':'failed'))throw new RuntimeException('delivery_state_mismatch');
 }catch(Throwable){
  error_log('QR identity code delivery finalization failed.');
  fail('Email result could not be confirmed. Request a new code later.',503,'IDENTITY_DELIVERY_UNKNOWN');
 }
 if(!$accepted)fail('The mail server did not accept the verification email. Try again later.',503,'IDENTITY_EMAIL_FAILED');
 json_response(['success'=>true,'challengeToken'=>$token,'recipientMasked'=>mask_email($recipient),'expiresIn'=>600,'resendAfter'=>90]);
}
function qr_identity_verify(array $params=[]): never {
 header('Cache-Control: no-store');
 $body=json_input();$ticket=qr_identity_ticket($body['ticket_number']??'');
 $token=trim((string)($body['challenge_token']??''));
 $code=trim((string)($body['code']??''));
 if(preg_match('/^[A-Za-z0-9_-]{43}$/D',$token)!==1||preg_match('/^[0-9]{6}$/D',$code)!==1)
  fail('Enter the six-digit code from the verification email.',400,'VALIDATION_ERROR');
 $decoded=base64_decode(strtr($token.'=','-_','+/'),true);
 if(!is_string($decoded)||strlen($decoded)!==32)fail('Invalid verification challenge.',400,'VALIDATION_ERROR');
 $tokenHash=hash('sha256',$token);
 $result=supabase_rpc('tvtms_qr_identity_verify',['p_ticket'=>$ticket,'p_token_hash'=>$tokenHash,
  'p_code_hash'=>hash_hmac('sha256','qr-identity|'.$ticket.'|'.$tokenHash.'|'.$code,qr_identity_secret())]);
 if($error=rpc_domain_error($result))fail_domain($error);
 if(($result['verified']??false)!==true)fail('Verification failed.',400,'IDENTITY_VERIFICATION_FAILED');
 json_response(['success'=>true,'verified'=>true,'ticketNumber'=>$result['ticketNumber']??$ticket,
  'citedDriverName'=>$result['citedDriverName']??'Not recorded',
  'registeredOwnerName'=>$result['registeredOwnerName']??'Not recorded']);
}
