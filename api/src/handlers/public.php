<?php
declare(strict_types=1);

function public_ticket_lookup(array $params=[]): never
{
    $plate=normalize_plate($_GET['plate_number']??$_GET['plateNumber']??$_GET['plate']??'');$ticket=strtoupper(trim((string)($_GET['ticket_number']??$_GET['ticketNumber']??$_GET['ticket']??'')));
    if($plate===''&&$ticket==='')fail('Plate number or ticket number is required.',400,'VALIDATION_ERROR');
    $rows=supabase_rpc('tvtms_public_lookup',['p_plate'=>$plate?:null,'p_ticket'=>$ticket?:null]);$tickets=is_array($rows)?$rows:[];
    $ids=[];
    foreach($tickets as $row){$id=(int)($row['id']??0);if($id>0)$ids[$id]=$id;}
    $emailsById=[];
    if($ids){
        $details=supabase_select('ticket_details',['id'=>'in.('.implode(',',array_values($ids)).')'],['select'=>'id,owner_email']);
        foreach($details as $detail){$id=(int)($detail['id']??0);if($id>0)$emailsById[$id]=normalize_email($detail['owner_email']??'');}
    }
    foreach($tickets as &$t){
        $id=(int)($t['id']??0);
        $email=$emailsById[$id]??'';
        $hasEmail=$email!==''&&filter_var($email,FILTER_VALIDATE_EMAIL)!==false;
        $deadline=(int)($t['dispute_deadline_days']??15);$age=(int)($t['dispute_age_days']??0);$open=(int)($t['has_open_dispute']??0)===1;$msg='';if(($t['status']??'')!=='unpaid')$msg='Only unpaid tickets can be disputed.';elseif($open)$msg='A dispute is already open for this ticket.';elseif($age>$deadline)$msg='The '.$deadline.'-day dispute period has ended.';
        $t['dispute_eligible']=$msg==='';$t['dispute_message']=$msg;$t['status']=$t['payment_status']??$t['status']??'unpaid';
        $t['has_notification_email']=$hasEmail;
        $t['notification_email_masked']=$hasEmail?mask_email($email):null;
        unset($t['id'],$t['owner_email'],$t['dispute_age_days'],$t['dispute_deadline_days'],$t['has_open_dispute']);
    }
    unset($t);
    json_response(['success'=>true,'count'=>count($tickets),'tickets'=>$tickets]);
}
function public_vehicle_lookup(array $params=[]): never
{
    $plate=normalize_plate($_GET['plate_number']??$_GET['plateNumber']??$_GET['plate']??'');if(!$plate)fail('Plate number is required.',400,'VALIDATION_ERROR');$r=supabase_rpc('tvtms_public_vehicle',['p_plate'=>$plate]);$vehicles=is_array($r['vehicles']??null)?$r['vehicles']:[];
    if(!$vehicles)json_response(['success'=>true,'vehicle'=>null,'violations'=>[]]);json_response(['success'=>true,'vehicle'=>$vehicles[0],'violations'=>is_array($r['violations']??null)?$r['violations']:[]]);
}
function public_plate_summary(array $params=[]): never
{
    $plate=normalize_plate($_GET['plate_number']??$_GET['plateNumber']??$_GET['plate']??'');if(!$plate)fail('Plate number is required.',400,'VALIDATION_ERROR');$r=supabase_rpc('tvtms_public_summary',['p_plate'=>$plate]);$r=is_array($r)?$r:[];$total=(int)($r['total_violations']??0);$outstanding=(float)($r['total_outstanding_balance']??$r['total_unpaid_amount']??0);json_response(['success'=>true,'plate_number'=>$plate,'summary'=>['historical_ticket_count'=>(int)($r['historical_ticket_count']??$total),'total_violations'=>$total,'non_cancelled_ticket_count'=>(int)($r['non_cancelled_ticket_count']??$total),'unpaid_count'=>(int)($r['unpaid_count']??0),'paid_count'=>(int)($r['paid_count']??0),'cancelled_count'=>(int)($r['cancelled_count']??0),'total_outstanding_balance'=>$outstanding,'total_unpaid_amount'=>$outstanding,'total_demerit_points'=>(int)($r['total_demerit_points']??0),'has_multiple_plate_tickets'=>$total>=2]]);
}
function public_stats(array $params=[]): never{$r=supabase_rpc('tvtms_public_stats',[]);$stats=[];foreach((array)$r as $k=>$v)$stats[$k]=is_numeric($v)?(float)$v:$v;json_response(['success'=>true,'stats'=>$stats]);}
function public_dispute(array $params=[]): never
{
    $b=json_input();
    $ticket=dispute_ticket_number($b['ticket_number']??$b['ticketNumber']??'');
    $token=trim((string)($b['challenge_token']??$b['challengeToken']??''));
    $reason=clean_string($b['reason']??'',4000);
    if($ticket===''||strlen($ticket)>30||!dispute_token_is_valid($token)||strlen($reason)<10){
        fail('A valid ticket number, verified challenge, and a reason of 10–4000 characters are required.',400,'VALIDATION_ERROR');
    }
    $r=supabase_rpc('tvtms_public_dispute_verified',['p_ticket'=>$ticket,'p_challenge_hash'=>dispute_token_hash($token),'p_reason'=>$reason]);
    $err=rpc_domain_error($r);if($err)fail_domain($err);
    json_response(['success'=>true,'message'=>'Your dispute has been submitted for administrator review.','dispute_id'=>(int)($r['disputeId']??0)],201);
}
function public_violations(array $params=[]): never
{
    $rows=supabase_select('violations',['status'=>'eq.active'],['select'=>'violation_code,violation_name,description,penalty_amount,demerit_points','order'=>'violation_code.asc']);
    json_response(['success'=>true,'violations'=>$rows]);
}
function public_contact(array $params=[]): never
{
    $b=json_input();
    $name=clean_string($b['full_name']??$b['fullName']??$b['name']??'',120);
    $email=normalize_email($b['email']??'');
    $subject=clean_string(preg_replace('/[\r\n]+/',' ',(string)($b['subject']??'')),150);
    $message=clean_string($b['message']??'',3000);
    if($name===''||!filter_var($email,FILTER_VALIDATE_EMAIL)||$subject===''||strlen($message)<10){
        fail('Full name, valid email, subject, and a message of 10–3000 characters are required.',400,'VALIDATION_ERROR');
    }

    // Save the contact and create in-app administrator notifications atomically first.
    $saved=supabase_rpc('tvtms_public_contact',[
        'p_name'=>$name,'p_email'=>$email,'p_subject'=>$subject,'p_message'=>$message,
    ]);
    $error=rpc_domain_error($saved);
    if($error)fail_domain($error);
    $contactId=(int)($saved['contactId']??0);
    if($contactId<=0)fail('Unable to confirm that your message was saved.',502,'CONTACT_SAVE_UNCONFIRMED');

    // Accept administrator recipients only from active account records, not public input.
    $recipients=[];
    $adminStatus='no_recipient';
    try {
        $admins=supabase_select('users',['role'=>'eq.admin','status'=>'eq.active'],[
            'select'=>'email','limit'=>100,
        ]);
        foreach($admins as $admin){
            $address=normalize_email($admin['email']??'');
            if(filter_var($address,FILTER_VALIDATE_EMAIL))$recipients[$address]=$address;
        }
    }catch(Throwable $e){
        error_log('TVTMS contact: administrator email lookup failed.');
        $adminStatus='failed';
    }

    $safeName=htmlspecialchars($name,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');
    $safeEmail=htmlspecialchars($email,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');
    $safeSubject=htmlspecialchars($subject,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');
    $safeMessage=nl2br(htmlspecialchars($message,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8'));
    $adminHtml='<p>A public contact message was saved in TVTMS (reference #'.$contactId.').</p>'
        .'<p><strong>From:</strong> '.$safeName.' ('.$safeEmail.')</p>'
        .'<p><strong>Subject:</strong> '.$safeSubject.'</p>'
        .'<p><strong>Message:</strong><br>'.$safeMessage.'</p>'
        .'<p>Sign in to TVTMS to review the message.</p>';

    if($recipients){
        $accepted=0;
        foreach($recipients as $recipient){
            try{
                $result=send_email($recipient,'TVTMS Contact Message #'.$contactId,$adminHtml);
                if(($result['status']??'')==='accepted')$accepted++;
            }catch(Throwable $e){error_log('TVTMS contact: administrator email attempt failed.');}
        }
        $adminStatus=$accepted===count($recipients)?'accepted':($accepted>0?'partial':'failed');
    }

    $confirmation='failed';
    $visitorHtml='<p>Thank you for contacting TVTMS. Your message (reference #'.$contactId
        .') was saved for administrator review.</p><p><strong>Subject:</strong> '.$safeSubject.'</p>'
        .'<p>This is a submission acknowledgement, not a ticket or dispute decision.</p>';
    try{
        $result=send_email($email,'TVTMS Contact Confirmation #'.$contactId,$visitorHtml);
        if(($result['status']??'')==='accepted')$confirmation='accepted';
    }catch(Throwable $e){error_log('TVTMS contact: confirmation email attempt failed.');}

    $summary='Your message was saved and administrators were notified inside TVTMS.';
    if($adminStatus==='accepted'&&$confirmation==='accepted'){
        $summary.=' Both emails were accepted by the mail server.';
    }else{
        $summary.=' One or more emails could not be confirmed; please do not resubmit the same message.';
    }
    json_response([
        'success'=>true,'message'=>$summary,'contact_id'=>$contactId,
        'email_status'=>['administrator'=>$adminStatus,'confirmation'=>$confirmation],
    ],201);
}
