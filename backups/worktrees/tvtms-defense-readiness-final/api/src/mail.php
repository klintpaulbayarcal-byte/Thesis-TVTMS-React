<?php
declare(strict_types=1);

final class MailTransportException extends RuntimeException
{
    public string $errorCode;
    public string $stage;

    public function __construct(string $errorCode,string $stage)
    {
        parent::__construct($errorCode);
        $this->errorCode=$errorCode;
        $this->stage=$stage;
    }
}

function mail_result(string $status,?string $code,string $message): array
{
    return ['status'=>$status,'errorCode'=>$code,'message'=>$message];
}

function mask_email(string $email): ?string
{
    $email=strtolower(trim($email));
    if(!filter_var($email,FILTER_VALIDATE_EMAIL))return null;
    [$local,$domain]=explode('@',$email,2);
    $visible=substr($local,0,min(2,strlen($local)));
    return $visible.'***@'.$domain;
}

function smtp_configuration_status(array $smtp): string
{
    if(empty($smtp['enabled']))return 'not_configured';
    $host=trim((string)($smtp['host']??''));
    $port=(int)($smtp['port']??0);
    $secure=strtolower(trim((string)($smtp['secure']??'')));
    $username=trim((string)($smtp['username']??''));
    $password=(string)($smtp['password']??'');
    $from=trim((string)($smtp['from_email']??''));
    $fromName=trim((string)($smtp['from_name']??''));
    return $host!==''&&$port>=1&&$port<=65535&&in_array($secure,['tls','ssl'],true)
        &&$username!==''&&$password!==''&&filter_var($from,FILTER_VALIDATE_EMAIL)&&$fromName!==''
        ?'configured':'not_configured';
}

function smtp_read_response($socket,string $stage): string
{
    $response='';
    while(($line=fgets($socket,515))!==false){
        $response.=$line;
        if(strlen($line)<4||$line[3]===' ')break;
    }
    $meta=stream_get_meta_data($socket);
    if($response===''||!empty($meta['timed_out']))throw new MailTransportException('transport_error',$stage);
    return $response;
}

function smtp_expect($socket,array $codes,string $stage): string
{
    $response=smtp_read_response($socket,$stage);
    $code=(int)substr($response,0,3);
    if(!in_array($code,$codes,true))throw new MailTransportException('smtp_rejected',$stage);
    return $response;
}

function smtp_command($socket,string $command,array $codes,string $stage): string
{
    if(fwrite($socket,$command."\r\n")===false)throw new MailTransportException('transport_error',$stage);
    return smtp_expect($socket,$codes,$stage);
}

function smtp_send_message_result(array $smtp,string $to,string $subject,string $html): array
{
    $host=trim((string)($smtp['host']??''));
    $port=(int)($smtp['port']??0);
    $secure=strtolower(trim((string)($smtp['secure']??'tls')));
    $user=trim((string)($smtp['username']??''));
    $pass=(string)($smtp['password']??'');
    $from=trim((string)($smtp['from_email']??$user));
    $fromName=trim((string)($smtp['from_name']??'TVTMS'));
    if($host===''||$port<1||$port>65535||!in_array($secure,['none','tls','ssl'],true)||!filter_var($to,FILTER_VALIDATE_EMAIL)||!filter_var($from,FILTER_VALIDATE_EMAIL)){
        return mail_result('failed','configuration_error','Email configuration is incomplete.');
    }

    $context=stream_context_create(['ssl'=>[
        'verify_peer'=>true,'verify_peer_name'=>true,'allow_self_signed'=>false,
        'peer_name'=>$host,'SNI_enabled'=>true,
    ]]);
    $remote=($secure==='ssl'?'ssl://':'tcp://').$host.':'.$port;
    $errno=0;$errstr='';
    $socket=@stream_socket_client($remote,$errno,$errstr,12,STREAM_CLIENT_CONNECT,$context);
    if(!is_resource($socket))return mail_result('failed','transport_error','The mail server could not be reached.');
    stream_set_timeout($socket,12);

    try{
        smtp_expect($socket,[220],'greeting');
        $ehlo=preg_replace('/[^A-Za-z0-9.-]/','',(string)($_SERVER['SERVER_NAME']??'localhost'))?:'localhost';
        smtp_command($socket,'EHLO '.$ehlo,[250],'ehlo');
        if($secure==='tls'){
            smtp_command($socket,'STARTTLS',[220],'starttls');
            if(!stream_socket_enable_crypto($socket,true,STREAM_CRYPTO_METHOD_TLS_CLIENT))throw new MailTransportException('tls_failed','starttls');
            smtp_command($socket,'EHLO '.$ehlo,[250],'ehlo_tls');
        }
        if($user!==''){
            smtp_command($socket,'AUTH LOGIN',[334],'auth');
            smtp_command($socket,base64_encode($user),[334],'auth_username');
            smtp_command($socket,base64_encode($pass),[235],'auth_password');
        }
        smtp_command($socket,'MAIL FROM:<'.$from.'>',[250],'mail_from');
        smtp_command($socket,'RCPT TO:<'.$to.'>',[250,251],'recipient');
        smtp_command($socket,'DATA',[354],'data');

        $encodedSubject='=?UTF-8?B?'.base64_encode(str_replace(["\r","\n"],' ',$subject)).'?=';
        $safeName=str_replace(["\r","\n",'"'],'',$fromName);
        $body=preg_replace('/^\./m','..',$html)??$html;
        $message="Date: ".date(DATE_RFC2822)."\r\nFrom: \"{$safeName}\" <{$from}>\r\nTo: <{$to}>\r\nSubject: {$encodedSubject}\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n{$body}\r\n.";
        if(fwrite($socket,$message."\r\n")===false)throw new MailTransportException('transport_error','message_data');
        smtp_expect($socket,[250,251],'message_acceptance');

        @fwrite($socket,"QUIT\r\n");
        fclose($socket);
        return mail_result('accepted',null,'The mail server accepted the message.');
    }catch(MailTransportException $e){
        error_log('SMTP send failed ['.$e->errorCode.':'.$e->stage.'].');
        if(is_resource($socket))fclose($socket);
        return mail_result('failed',$e->errorCode,'The mail server did not accept the message.');
    }catch(Throwable){
        error_log('SMTP send failed [transport_error:unexpected].');
        if(is_resource($socket))fclose($socket);
        return mail_result('failed','transport_error','The mail server did not accept the message.');
    }
}

function email_send_with_config(array $smtp,string $to,string $subject,string $html): array
{
    if(empty($smtp['enabled']))return mail_result('disabled','smtp_disabled','Email is not configured.');
    if(!filter_var($to,FILTER_VALIDATE_EMAIL))return mail_result('invalid_recipient','invalid_recipient','No valid recipient email is recorded.');
    if(smtp_configuration_status($smtp)!=='configured')return mail_result('configuration_error','smtp_not_configured','Email configuration is incomplete.');
    return smtp_send_message_result($smtp,$to,$subject,$html);
}

function send_email(string $to,string $subject,string $html): array
{
    return email_send_with_config(app_config()['smtp']??[],$to,$subject,$html);
}

function send_basic_email(string $to,string $subject,string $html): bool
{
    return send_email($to,$subject,$html)['status']==='accepted';
}
