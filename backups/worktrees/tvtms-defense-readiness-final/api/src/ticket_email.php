<?php
declare(strict_types=1);

function ticket_notification_result(string $status,?string $masked,bool $retryAllowed,string $message,array $extra=[]): array
{
    return array_merge([
        'status'=>$status,
        'recipientMasked'=>$masked,
        'retryAllowed'=>$retryAllowed,
        'message'=>$message,
    ],$extra);
}

function ticket_notification_message(array $claim): array
{
    $ticket=(string)($claim['ticketNumber']??'');
    $violation=(string)($claim['violationName']??'');
    $plate=(string)($claim['plateNumber']??'');
    $penalty=number_format((float)($claim['penaltyAmount']??0),2);
    $base=rtrim((string)(app_config()['app_public_url']??'https://trafficviolation.dcsbisu.com'),'/');
    $link=$base.'/ticket-lookup?ticket='.rawurlencode($ticket);
    $e=static fn(string $value): string=>htmlspecialchars($value,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');
    return [
        'subject'=>'Traffic Violation Notice — '.$ticket,
        'html'=>'<p>A traffic violation ticket has been issued.</p>'.
            '<p><strong>Ticket number:</strong> '.$e($ticket).'<br>'.
            '<strong>Plate number:</strong> '.$e($plate).'<br>'.
            '<strong>Violation:</strong> '.$e($violation).'<br>'.
            '<strong>Penalty:</strong> ₱'.$e($penalty).'</p>'.
            '<p><a href="'.$e($link).'">View this ticket in the public lookup</a></p>'.
            '<p>SMTP acceptance confirms only that the mail server accepted this notification.</p>',
    ];
}

/**
 * A fresh explicit confirmation is required on creation AND each retry.
 * The immutable snapshot is read from tickets, never the mutable vehicles fallback.
 * SQL claim recipient and ticket identity are checked again before SMTP.
 */
function ticket_notification_attempt(int $actorId,array $ticket=[],?string $confirmedRecipient=null): array
{
    $ticketId=(int)($ticket['id']??0);
    if($ticketId<=0){
        return ticket_notification_result('failed',null,false,'Ticket saved, but its notification could not be identified.',[
            'errorCode'=>'NOTIFICATION_TICKET_MISSING','statusCode'=>500,
        ]);
    }
    $confirmed=strtolower(trim((string)($confirmedRecipient??'')));
    if($confirmed===''||filter_var($confirmed,FILTER_VALIDATE_EMAIL)===false){
        return ticket_notification_result('no_confirmed_recipient',null,false,'Ticket saved. Email was not sent because the recipient was not confirmed.');
    }
    try{
        $rows=supabase_select('tickets',['id'=>'eq.'.$ticketId],[
            'select'=>'id,user_id,owner_email_at_issue','limit'=>1,
        ]);
    }catch(Throwable){
        error_log('Ticket notification recipient verification unavailable.');
        return ticket_notification_result('failed',null,false,'Ticket saved, but recipient verification is unavailable.',[
            'errorCode'=>'NOTIFICATION_RECIPIENT_CHECK_UNAVAILABLE','statusCode'=>503,
        ]);
    }
    $record=$rows[0]??null;
    if(!is_array($record)||(int)($record['id']??0)!==$ticketId){
        return ticket_notification_result('failed',null,false,'Ticket notification record could not be verified.',[
            'errorCode'=>'NOTIFICATION_TICKET_NOT_FOUND','statusCode'=>404,
        ]);
    }
    $snapshot=strtolower(trim((string)($record['owner_email_at_issue']??'')));
    if($snapshot===''||filter_var($snapshot,FILTER_VALIDATE_EMAIL)===false||!hash_equals($snapshot,$confirmed)){
        return ticket_notification_result('no_confirmed_recipient',null,false,'Ticket saved. The confirmed recipient does not match the email recorded when this ticket was issued; email was not sent.',[
            'errorCode'=>'NOTIFICATION_RECIPIENT_MISMATCH','statusCode'=>409,
        ]);
    }

    try{
        $claim=supabase_rpc('tvtms_ticket_email_claim',['p_ticket_id'=>$ticketId,'p_actor_id'=>$actorId]);
    }catch(Throwable){
        error_log('Ticket notification ledger unavailable.');
        return ticket_notification_result('failed',null,false,'Ticket saved, but notification tracking is unavailable.',[
            'errorCode'=>'NOTIFICATION_LEDGER_UNAVAILABLE','statusCode'=>503,
        ]);
    }
    $claim=is_array($claim)?$claim:[];
    if($error=rpc_domain_error($claim)){
        return ticket_notification_result('failed',null,false,(string)($error['message']??'Notification could not be started.'),[
            'errorCode'=>(string)($error['errorCode']??'NOTIFICATION_REJECTED'),
            'statusCode'=>(int)($error['statusCode']??400),
        ]);
    }

    $status=(string)($claim['status']??'unknown');
    $attempt=(int)($claim['attemptCount']??0);
    $ticketNumber=(string)($claim['ticketNumber']??($ticket['ticket_number']??''));
    if($status==='already_accepted'){
        return ticket_notification_result('already_accepted',null,false,'Ticket saved. Its email notification was already accepted by the mail server.',['attemptCount'=>$attempt]);
    }
    if($status==='not_applicable'){
        return ticket_notification_result('not_applicable',null,false,'Ticket saved. No valid notification email was recorded.',['attemptCount'=>$attempt]);
    }
    if($status==='sending'){
        return ticket_notification_result('sending',null,false,'Ticket saved. An email notification attempt is already in progress.',['attemptCount'=>$attempt]);
    }
    if($status!=='claimed'){
        return ticket_notification_result('unknown',null,false,'Ticket saved. The email delivery result is uncertain; automatic retry is disabled to prevent duplicates.',['attemptCount'=>$attempt]);
    }

    $recipient=strtolower(trim((string)($claim['recipient']??'')));
    $masked=mask_email($recipient);
    // The SQL function has a legacy fallback to the mutable vehicle address.
    // Never trust that fallback or even a mismatched claim ticket ID for delivery.
    if((int)($claim['ticketId']??0)!==$ticketId
        ||filter_var($recipient,FILTER_VALIDATE_EMAIL)===false
        ||!hash_equals($snapshot,$recipient)){
        try{
            $final=supabase_rpc('tvtms_ticket_email_finalize',[
                'p_ticket_id'=>$ticketId,'p_status'=>'failed',
                'p_error_code'=>'recipient_mismatch',
                'p_error_message'=>'Claim did not match the verified ticket and its original recipient.',
            ]);
            if($error=rpc_domain_error($final))throw new RuntimeException('finalization rejected');
        }catch(Throwable){
            error_log('Mismatched notification claim could not be finalized.');
            return ticket_notification_result('unknown',null,false,'Ticket saved. Recipient verification failed; no email was sent and retry is disabled until tracking is resolved.',[
                'errorCode'=>'NOTIFICATION_CLAIM_MISMATCH','statusCode'=>409,'attemptCount'=>$attempt,
            ]);
        }
        return ticket_notification_result('failed',null,false,'Ticket saved. Recipient verification failed; no email was sent.',[
            'errorCode'=>'NOTIFICATION_CLAIM_MISMATCH','statusCode'=>409,'attemptCount'=>$attempt,
        ]);
    }
    $content=ticket_notification_message($claim);
    $mail=send_email($recipient,$content['subject'],$content['html']);
    $accepted=($mail['status']??'')==='accepted';
    $finalStatus=$accepted?'accepted':'failed';
    try{
        $final=supabase_rpc('tvtms_ticket_email_finalize',[
            'p_ticket_id'=>$ticketId,
            'p_status'=>$finalStatus,
            'p_error_code'=>$accepted?null:(string)($mail['errorCode']??'mail_failed'),
            'p_error_message'=>$accepted?null:(string)($mail['message']??'The mail server did not accept the notification.'),
        ]);
        if($error=rpc_domain_error($final))throw new RuntimeException((string)($error['errorCode']??'finalize_failed'));
    }catch(Throwable){
        error_log('Ticket notification finalization failed.');
        if($accepted){
            return ticket_notification_result('unknown',$masked,false,'Ticket saved. The mail server accepted the message, but tracking could not be finalized; automatic retry is disabled.',['attemptCount'=>$attempt,'ticketNumber'=>$ticketNumber]);
        }
        return ticket_notification_result('failed',$masked,false,'Ticket saved, but notification delivery and tracking did not complete.',['attemptCount'=>$attempt,'ticketNumber'=>$ticketNumber]);
    }
    if($accepted){
        return ticket_notification_result('accepted',$masked,false,'Ticket saved. The mail server accepted the email notification.',['attemptCount'=>$attempt,'ticketNumber'=>$ticketNumber]);
    }
    return ticket_notification_result('failed',$masked,true,'Ticket saved, but the email notification was not accepted. It can be retried after confirming the recipient again.',['attemptCount'=>$attempt,'ticketNumber'=>$ticketNumber]);
}

function ticket_notification_read(array $ticket): array
{
    $ticketId=(int)($ticket['id']??0);
    $masked=null;
    if($ticketId<=0)return ticket_notification_result('not_recorded',$masked,false,'No notification record is available.');
    try{
        $rows=supabase_select('ticket_email_notifications',['ticket_id'=>'eq.'.$ticketId,'notification_type'=>'eq.ticket_issued'],[
            'select'=>'status,attempt_count,last_error_code,accepted_at,last_attempt_at','limit'=>1,
        ]);
    }catch(Throwable){
        return ticket_notification_result('not_recorded',$masked,false,'No notification record is available.');
    }
    $row=$rows[0]??null;
    if(!is_array($row))return ticket_notification_result('not_recorded',$masked,false,'No notification record is available.');
    $status=(string)($row['status']??'not_recorded');
    $messages=[
        'accepted'=>'The mail server accepted the ticket notification.',
        'failed'=>'The ticket notification failed and can be retried after confirming the recipient.',
        'not_applicable'=>'No valid notification email was recorded.',
        'sending'=>'A ticket notification attempt is in progress.',
        'unknown'=>'The delivery result is uncertain; retry is disabled to prevent duplicates.',
    ];
    return ticket_notification_result($status,$masked,$status==='failed',$messages[$status]??'No notification result is available.',[
        'attemptCount'=>(int)($row['attempt_count']??0),
        'acceptedAt'=>$row['accepted_at']??null,
        'lastAttemptAt'=>$row['last_attempt_at']??null,
    ]);
}
