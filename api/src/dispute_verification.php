<?php
declare(strict_types=1);

function dispute_new_token(): string
{
    return rtrim(strtr(base64_encode(random_bytes(32)),'+/','-_'),'=');
}

function dispute_new_code(): string
{
    return str_pad((string)random_int(0,999999),6,'0',STR_PAD_LEFT);
}

function dispute_token_hash(string $token): string
{
    return hash('sha256',$token);
}

function dispute_code_hash(string $ticket,string $tokenHash,string $code,string $secret): string
{
    return hash_hmac('sha256',$ticket.'|'.$tokenHash.'|'.$code,$secret);
}

function dispute_requester_hash(?string $ip,string $secret): string
{
    return hash_hmac('sha256','dispute-requester|'.($ip?:'unknown'),$secret);
}

function dispute_secret(): string
{
    $secret=(string)(app_config()['token_secret']??'');
    if(strlen($secret)<32||str_contains($secret,'CHANGE_THIS')){
        fail('Dispute verification is not configured.',500,'VERIFICATION_CONFIG_ERROR');
    }
    return $secret;
}

function dispute_ticket_number(mixed $value): string
{
    return strtoupper(trim((string)$value));
}

function dispute_token_is_valid(string $token): bool
{
    if(preg_match('/^[A-Za-z0-9_-]{43}$/',$token)!==1)return false;
    $decoded=base64_decode(strtr($token.'=','-_','+/'),true);
    return is_string($decoded)&&strlen($decoded)===32;
}

function public_dispute_verification_request(array $params=[]): never
{
    $body=json_input();
    $ticket=dispute_ticket_number($body['ticket_number']??$body['ticketNumber']??'');
    if($ticket===''||strlen($ticket)>30){
        fail('A valid ticket number is required.',400,'VALIDATION_ERROR');
    }

    $secret=dispute_secret();
    $token=dispute_new_token();
    $code=dispute_new_code();
    $tokenHash=dispute_token_hash($token);
    $request=supabase_rpc('tvtms_dispute_verification_request',[
        'p_ticket'=>$ticket,
        'p_challenge_hash'=>$tokenHash,
        'p_code_hash'=>dispute_code_hash($ticket,$tokenHash,$code,$secret),
        'p_requester_hash'=>dispute_requester_hash(client_ip_for_audit(),$secret),
    ]);
    if($error=rpc_domain_error($request))fail_domain($error);
    $request=is_array($request)?$request:[];
    if(($request['status']??'')!=='created'){
        fail('The verification request could not be created.',503,'VERIFICATION_REQUEST_FAILED');
    }

    $recipient=trim((string)($request['recipient']??''));
    $canonicalTicket=(string)($request['ticketNumber']??$ticket);
    if(!filter_var($recipient,FILTER_VALIDATE_EMAIL)){
        fail('No valid notification email is recorded for this ticket.',409,'VERIFICATION_EMAIL_UNAVAILABLE');
    }
    $e=static fn(string $value): string=>htmlspecialchars($value,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');
    $mail=send_email(
        $recipient,
        'TVTMS dispute verification — '.$canonicalTicket,
        '<p>Your verification code for ticket <strong>'.$e($canonicalTicket).'</strong> is:</p>'.
        '<p style="font-size:24px;font-weight:700;letter-spacing:4px">'.$e($code).'</p>'.
        '<p>This code expires in 10 minutes. If you did not request it, ignore this email.</p>'
    );
    $accepted=($mail['status']??'')==='accepted';
    try{
        $delivery=supabase_rpc('tvtms_dispute_verification_delivery',[
            'p_challenge_hash'=>$tokenHash,
            'p_delivery_status'=>$accepted?'accepted':'failed',
            'p_error_code'=>$accepted?null:(string)($mail['errorCode']??'mail_failed'),
        ]);
        if($error=rpc_domain_error($delivery))throw new RuntimeException((string)($error['errorCode']??'delivery_finalize_failed'));
        if(!is_array($delivery)||($delivery['status']??'')!==($accepted?'accepted':'failed'))throw new RuntimeException('delivery_state_mismatch');
    }catch(Throwable){
        error_log('Dispute verification delivery finalization failed.');
        fail('The verification email result could not be activated. Request a new code later.',503,'VERIFICATION_ACTIVATION_UNKNOWN',['mailStatus'=>'unknown']);
    }
    if(!$accepted){
        fail('The verification email was not accepted by the mail server. Please try again later.',503,'VERIFICATION_EMAIL_FAILED',['mailStatus'=>'failed']);
    }

    json_response([
        'success'=>true,
        'challengeToken'=>$token,
        'notificationEmailMasked'=>mask_email($recipient),
        'expiresIn'=>(int)($request['expiresIn']??600),
        'resendAfter'=>(int)($request['resendAfter']??60),
        'mailStatus'=>'accepted',
    ]);
}

function public_dispute_verification_verify(array $params=[]): never
{
    $body=json_input();
    $ticket=dispute_ticket_number($body['ticket_number']??$body['ticketNumber']??'');
    $token=trim((string)($body['challenge_token']??$body['challengeToken']??''));
    $code=trim((string)($body['code']??''));
    if($ticket===''||strlen($ticket)>30||!dispute_token_is_valid($token)||preg_match('/^[0-9]{6}$/',$code)!==1){
        fail('A valid ticket, challenge, and six-digit code are required.',400,'VALIDATION_ERROR');
    }
    $secret=dispute_secret();
    $tokenHash=dispute_token_hash($token);
    $result=supabase_rpc('tvtms_dispute_verification_verify',[
        'p_ticket'=>$ticket,
        'p_challenge_hash'=>$tokenHash,
        'p_code_hash'=>dispute_code_hash($ticket,$tokenHash,$code,$secret),
    ]);
    if($error=rpc_domain_error($result))fail_domain($error);
    $result=is_array($result)?$result:[];
    json_response([
        'success'=>true,
        'verified'=>($result['verified']??false)===true,
        'attemptsRemaining'=>(int)($result['attemptsRemaining']??0),
    ]);
}
