<?php
declare(strict_types=1);

function public_dispute_deadline_date(array $ticket): ?string
{
    $zone=new DateTimeZone('Asia/Manila');
    $issued=DateTimeImmutable::createFromFormat('!Y-m-d',(string)($ticket['date_issued']??''),$zone);
    $dateErrors=DateTimeImmutable::getLastErrors();
    if(!$issued||($dateErrors&&($dateErrors['warning_count']||$dateErrors['error_count'])))return null;
    $days=(int)($ticket['dispute_deadline_days']??15);
    if($days<1||$days>365)return null;
    return $issued->modify('+'.$days.' days')->format('Y-m-d');
}

function public_dispute_eligibility_message(array $ticket,?DateTimeImmutable $today=null): string
{
    if(!empty($ticket['has_recorded_payment'])||(float)($ticket['total_paid']??0)>0)return 'Tickets with any recorded payment cannot be disputed.';
    if(($ticket['status']??'')!=='unpaid')return 'Only unpaid tickets can be disputed.';
    if((int)($ticket['has_open_dispute']??0)===1)return 'A dispute is already open for this ticket.';
    $zone=new DateTimeZone('Asia/Manila');
    $today=($today??new DateTimeImmutable('now',$zone))->setTimezone($zone)->setTime(0,0);
    $issued=DateTimeImmutable::createFromFormat('!Y-m-d',(string)($ticket['date_issued']??''),$zone);
    $dateErrors=DateTimeImmutable::getLastErrors();
    if(!$issued||($dateErrors&&($dateErrors['warning_count']||$dateErrors['error_count'])))return 'Dispute eligibility could not be confirmed. Please contact the issuing office.';
    $deadline=(int)($ticket['dispute_deadline_days']??15);
    $age=(int)$issued->diff($today)->format('%r%a');
    return $age>$deadline?'The '.$deadline.'-day dispute period has ended.':'';
}

function public_ticket_lookup(array $params=[]): never
{
    $plate=normalize_plate($_GET['plate_number']??$_GET['plateNumber']??$_GET['plate']??'');$ticket=strtoupper(trim((string)($_GET['ticket_number']??$_GET['ticketNumber']??$_GET['ticket']??'')));
    if($plate===''&&$ticket==='')fail('Plate number or ticket number is required.',400,'VALIDATION_ERROR');
    $rows=supabase_rpc('tvtms_public_lookup',['p_plate'=>$plate?:null,'p_ticket'=>$ticket?:null]);$tickets=is_array($rows)?$rows:[];
    foreach($tickets as &$t){
        $msg=public_dispute_eligibility_message($t);
        $t=['ticket_number'=>$t['ticket_number']??null,'plate_number'=>$t['plate_number']??null,'vehicle_type'=>$t['vehicle_type']??null,
            'violation_code'=>$t['violation_code']??null,'violation_name'=>$t['violation_name']??null,'date_issued'=>$t['date_issued']??null,
            'appearance_due_date'=>$t['appearance_due_date']??null,'violations'=>array_map(static fn($v)=>['violation_code'=>$v['violation_code']??null,'violation_name'=>$v['violation_name']??null,'penalty_amount'=>$v['penalty_amount']??0],is_array($t['violations']??null)?$t['violations']:[]),
            'status'=>$t['payment_status']??$t['status']??'unpaid','payment_date'=>$t['payment_date']??null,
            'penalty_amount'=>$t['penalty_amount']??0,'total_paid'=>$t['total_paid']??0,'remaining_balance'=>$t['remaining_balance']??0,
            'has_recorded_payment'=>!empty($t['has_recorded_payment'])||(float)($t['total_paid']??0)>0,
            'has_notification_email'=>(bool)($t['has_notification_email']??false),
            'dispute_eligible'=>$msg==='','dispute_message'=>$msg,
            'dispute_deadline_date'=>public_dispute_deadline_date($t)];
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
    $ticketValue=$b['ticket_number']??$b['ticketNumber']??'';
    $ticket=is_string($ticketValue)?strtoupper(trim($ticketValue)):'';
    $plateValue=$b['plate_number']??$b['plateNumber']??'';
    $plate=is_string($plateValue)?normalize_plate($plateValue):'';
    $reason=is_string($b['reason']??null)?trim($b['reason']):'';
    $reasonLength=preg_match_all('/./us',$reason);
    if($ticket===''||strlen($ticket)>30||$plate===''||strlen($plate)>30||$reasonLength===false||$reasonLength<10||$reasonLength>4000){
        fail('A valid ticket number, plate number, and a reason of 10–4000 characters are required.',400,'VALIDATION_ERROR');
    }
    try{
        $r=supabase_rpc('tvtms_public_dispute_submit',['p_ticket'=>$ticket,'p_plate'=>$plate,'p_reason'=>$reason]);
    }catch(SupabaseException $e){
        if(in_array($e->pgCode,['PGRST202','42883'],true)){
            error_log('TVTMS public dispute RPC is missing or its signature is unavailable. Review the pending public-dispute migration and schema cache.');
            fail('Online dispute submission is not available yet. Please contact the issuing office.',503,'PUBLIC_DISPUTE_NOT_CONFIGURED');
        }
        error_log('TVTMS public dispute database service is unavailable.');
        fail('Online dispute submission is temporarily unavailable. Please try again later or contact the issuing office.',503,'PUBLIC_DISPUTE_UNAVAILABLE');
    }catch(Throwable $e){
        error_log('TVTMS public dispute service request failed.');
        fail('Online dispute submission is temporarily unavailable. Please try again later or contact the issuing office.',503,'PUBLIC_DISPUTE_UNAVAILABLE');
    }
    $err=rpc_domain_error($r);if($err)fail_domain($err);
    if(!is_array($r)||(int)($r['disputeId']??0)<=0)fail('Online dispute submission is temporarily unavailable. Please contact the issuing office.',503,'PUBLIC_DISPUTE_UNAVAILABLE');
    json_response(['success'=>true,'message'=>'Your dispute has been submitted for administrator review.','dispute_id'=>(int)($r['disputeId']??0)],201);
}
function public_violations(array $params=[]): never
{
    $rows=supabase_select('violations',['status'=>'eq.active','is_citation_selectable'=>'eq.true'],['select'=>'violation_code,violation_name,description,penalty_amount','order'=>'violation_name.asc,id.asc']);
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
