<?php
declare(strict_types=1);

function public_ticket_lookup(array $params=[]): never
{
    $plate=normalize_plate($_GET['plate_number']??$_GET['plateNumber']??$_GET['plate']??'');$ticket=strtoupper(trim((string)($_GET['ticket_number']??$_GET['ticketNumber']??$_GET['ticket']??'')));
    if($plate===''&&$ticket==='')fail('Plate number or ticket number is required.',400,'VALIDATION_ERROR');
    $rows=supabase_rpc('tvtms_public_lookup',['p_plate'=>$plate?:null,'p_ticket'=>$ticket?:null]);$tickets=is_array($rows)?$rows:[];
    foreach($tickets as &$t){$deadline=(int)($t['dispute_deadline_days']??15);$age=(int)($t['dispute_age_days']??0);$open=(int)($t['has_open_dispute']??0)===1;$msg='';if(($t['status']??'')!=='unpaid')$msg='Only unpaid tickets can be disputed.';elseif($open)$msg='A dispute is already open for this ticket.';elseif($age>$deadline)$msg='The '.$deadline.'-day dispute period has ended.';$t['dispute_eligible']=$msg==='';$t['dispute_message']=$msg;$t['status']=$t['payment_status']??$t['status']??'unpaid';unset($t['id'],$t['dispute_age_days'],$t['dispute_deadline_days'],$t['has_open_dispute']);}unset($t);
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
    $b=json_input();$ticket=strtoupper(trim((string)($b['ticket_number']??$b['ticketNumber']??'')));$email=normalize_email($b['email']??'');$reason=clean_string($b['reason']??'',4000);if($ticket===''||strlen($ticket)>30||!filter_var($email,FILTER_VALIDATE_EMAIL)||strlen($email)>100||strlen($reason)<10)fail('A valid ticket number, owner email, and a reason of 10–4000 characters are required.',400,'VALIDATION_ERROR');
    $verified=supabase_select('ticket_details',['ticket_number'=>'eq.'.$ticket,'owner_email'=>'eq.'.$email],['select'=>'id','limit'=>1]);if(!$verified)fail('The ticket number and owner email could not be verified.',404,'TICKET_VERIFICATION_FAILED');
    $r=supabase_rpc('tvtms_public_dispute',['p_ticket'=>$ticket,'p_reason'=>$reason]);$err=rpc_domain_error($r);if($err)fail_domain($err);json_response(['success'=>true,'message'=>'Your dispute has been submitted for administrator review.','dispute_id'=>(int)($r['disputeId']??0)],201);
}
function public_violations(array $params=[]): never
{
    $rows=supabase_select('violations',['status'=>'eq.active'],['select'=>'violation_code,violation_name,description,penalty_amount,demerit_points','order'=>'violation_code.asc']);
    json_response(['success'=>true,'violations'=>$rows]);
}
function public_contact(array $params=[]): never
{
    $b=json_input();$name=clean_string($b['full_name']??$b['fullName']??$b['name']??'',120);$email=normalize_email($b['email']??'');$subject=clean_string(preg_replace('/[\r\n]+/',' ',(string)($b['subject']??'')),150);$message=clean_string($b['message']??'',3000);
    if($name===''||!filter_var($email,FILTER_VALIDATE_EMAIL)||$subject===''||strlen($message)<10)fail('Full name, valid email, subject, and a message of 10–3000 characters are required.',400,'VALIDATION_ERROR');
    $r=supabase_rpc('tvtms_public_contact',['p_name'=>$name,'p_email'=>$email,'p_subject'=>$subject,'p_message'=>$message]);$err=rpc_domain_error($r);if($err)fail_domain($err);send_basic_email($email,'TVTMS Contact Confirmation','<p>Your message was submitted to the system Administrator.</p>');json_response(['success'=>true,'message'=>'Your message was submitted to the system Administrator.'],201);
}
