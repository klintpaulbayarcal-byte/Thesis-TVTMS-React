<?php
declare(strict_types=1);

function ticket_rpc_result(mixed $result): array
{
    if (!is_array($result)) return [];
    $error = rpc_domain_error($result);
    if ($error) {
        // Keep the already-migrated database contract; translate its older label here.
        if (($error['errorCode'] ?? '') === 'OFFICER_RANK_REQUIRED') {
            $error['message'] = 'Ask the Administrator to record your rank / designation before issuing a citation.';
        }
        fail_domain($error);
    }
    return $result;
}


function ticket_apply_payment_totals(array $tickets, array $payments): array
{
    $totals=[];
    foreach($payments as $payment){
        if(!is_array($payment)) continue;
        $ticketId=(int)($payment['ticket_id']??0);
        if($ticketId<=0) continue;
        if(strtolower((string)($payment['payment_status']??''))==='voided') continue;
        $totals[$ticketId]=($totals[$ticketId]??0.0)+(float)($payment['amount_paid']??0);
    }
    foreach($tickets as &$ticket){
        if(!is_array($ticket)) continue;
        $ticketId=(int)($ticket['id']??0);
        $paid=round((float)($totals[$ticketId]??0),2);
        $penaltySource=$ticket['penalty_amount_at_issue']??$ticket['penalty_amount']??0;
        $penalty=round((float)$penaltySource,2);
        $ticket['total_paid']=$paid;
        $ticket['remaining_balance']=strtolower((string)($ticket['status']??''))==='cancelled'
            ?0.0
            :round(max(0,$penalty-$paid),2);
        $storedStatus=strtolower((string)($ticket['status']??''));
        $ticket['payment_status']=$storedStatus==='cancelled'
            ?'cancelled'
            :($ticket['remaining_balance']<=0
                ?'paid'
                :($paid>0?'partially_paid':'unpaid'));
    }
    unset($ticket);
    return $tickets;
}

function ticket_enrich_payment_totals(array $tickets): array
{
    $ids=[];
    foreach($tickets as $ticket){
        $id=(int)($ticket['id']??0);
        if($id>0)$ids[$id]=true;
    }
    if(!$ids)return ticket_apply_payment_totals($tickets,[]);
    $payments=supabase_select('payments',[
        'ticket_id'=>'in.('.implode(',',array_keys($ids)).')'
    ],[
        'select'=>'ticket_id,amount_paid,payment_status'
    ]);
    return ticket_apply_payment_totals($tickets,$payments);
}

function ticket_valid_id(mixed $value): int
{
    $id=(int)$value;
    if($id<=0) fail('Invalid ticket ID',400,'VALIDATION_ERROR');
    return $id;
}

function tickets_list(array $params=[]): never
{
    $u=require_role(['admin','apprehending_officer']);
    $page=max(1,(int)($_GET['page']??1));
    $pageSize=min(100,max(1,(int)($_GET['pageSize']??20)));
    $sortBy=(string)($_GET['sortBy']??'date_issued');
    if(!in_array($sortBy,['date_issued','time_issued','ticket_number','status','plate_number'],true))$sortBy='date_issued';
    $sortOrder=strtoupper((string)($_GET['sortOrder']??'DESC'))==='ASC'?'ASC':'DESC';
    $status=trim((string)($_GET['status']??''));
    $map=['draft'=>'unpaid','issued'=>'unpaid','pending_payment'=>'unpaid','partially_paid'=>'unpaid','unpaid'=>'unpaid','paid'=>'paid','closed'=>'paid','cancelled'=>'cancelled','voided'=>'cancelled'];
    $filters=[
        'status'=>$status!==''?($map[$status]??$status):null,
        'dateFrom'=>$_GET['dateFrom']??null,'dateTo'=>$_GET['dateTo']??null,
        'enforcerId'=>$_GET['enforcerId']??null,'violation'=>$_GET['violation']??null,
        'location'=>$_GET['location']??null,'search'=>$_GET['search']??null,
        'officerId'=>$u['role']==='apprehending_officer'?(int)$u['id']:null,
        'sortBy'=>$sortBy,'sortOrder'=>$sortOrder,'pageSize'=>$pageSize,'offset'=>($page-1)*$pageSize,
    ];
    $r=ticket_rpc_result(supabase_rpc('tvtms_ticket_list',['p_filters'=>$filters]));
    $tickets=is_array($r['tickets']??null)?$r['tickets']:[];$tickets=ticket_enrich_payment_totals($tickets);$total=(int)($r['total']??0);
    $pagination=['page'=>$page,'pageSize'=>$pageSize,'total'=>$total,'totalPages'=>max(1,(int)ceil($total/$pageSize))];
    ok('Tickets fetched successfully',$tickets,['tickets'=>$tickets,'pagination'=>$pagination]);
}

function tickets_get_one(array $params): never
{
    $u=require_role(['admin','apprehending_officer']);$id=ticket_valid_id($params['id']??0);
    $ticket=supabase_rpc('tvtms_ticket_detail',['p_id'=>$id]);
    if(!is_array($ticket)||!isset($ticket['id'])) fail('Ticket not found',404,'TICKET_NOT_FOUND');
    if($u['role']==='apprehending_officer'&&(int)($ticket['user_id']??0)!==(int)$u['id']) fail('Access denied',403,'TICKET_ACCESS_DENIED');
    // The live ticket_details view intentionally omits remarks. Merge the safe editable
    // base-ticket field here so the React detail/edit screen reflects persisted data
    // without changing the production database view.
    $base=supabase_select('tickets',['id'=>'eq.'.$id],['select'=>'remarks','limit'=>1]);
    $ticket['remarks']=$base[0]['remarks']??null;
    $enriched=ticket_enrich_payment_totals([$ticket]);
    $ticket=$enriched[0]??$ticket;
    $ticket['notification']=ticket_notification_read($ticket);
    ok('Ticket fetched successfully',$ticket,['ticket'=>$ticket]);
}

function tickets_citation_context(array $params=[]): never
{
    $u=require_role(['apprehending_officer']);
    $context=ticket_rpc_result(supabase_rpc('tvtms_citation_context',['p_actor'=>(int)$u['id']]));
    ok('Citation context fetched',$context,['context'=>$context]);
}

function citation_input(array $b): array
{
    $limits=['ticket_number'=>30,'plate_number'=>20,'vehicle_type'=>20,'vehicle_make'=>100,
        'driver_first_name'=>100,'driver_middle_name'=>100,'driver_last_name'=>100,'driver_address'=>2000,
        'driver_nationality'=>100,'driver_email'=>190,'license_type'=>30,'license_type_other'=>100,
        'driver_license_number'=>30,'owner_name'=>100,'owner_address'=>2000,'location'=>200,'remarks'=>4000,
        'expected_date'=>10];
    $data=[];
    foreach($limits as $key=>$limit){
        $value=$b[$key]??'';
        if(!is_string($value)||text_length(trim($value))>$limit)fail('Invalid citation field: '.$key,400,'VALIDATION_ERROR');
        $data[$key]=trim($value);
    }
    foreach(['ticket_number','plate_number','vehicle_type','vehicle_make','driver_first_name','driver_last_name','driver_address','driver_nationality','driver_email','owner_name','owner_address','location','expected_date'] as $key){
        if($data[$key]==='')fail('Complete the required citation information.',400,'VALIDATION_ERROR');
    }
    $data['ticket_number']=strtoupper($data['ticket_number']);$data['plate_number']=normalize_plate($data['plate_number']);
    $data['driver_email']=normalize_email($data['driver_email']);
    if (!in_array($data['vehicle_type'], ['motorcycle','tricycle','car','truck','bus','van'], true)
        || !in_array($data['license_type'], ['', 'Professional','Non-Professional','Student Permit / SP','Others'], true)
        || ($data['license_type'] === 'Others' && $data['license_type_other'] === '')) {
        fail('Select a vehicle type and a valid license classification if applicable. Specify Others when selected.',400,'VALIDATION_ERROR');
    }
    if ($data['license_type'] !== 'Others') $data['license_type_other'] = '';
    if(!filter_var($data['driver_email'],FILTER_VALIDATE_EMAIL)||!preg_match('/^[A-Z0-9][A-Z0-9\/-]{0,29}$/',$data['ticket_number']))fail('Provide a valid citation number and driver email.',400,'VALIDATION_ERROR');
    $ids=$b['violation_ids']??null;
    if(!is_array($ids)||!array_is_list($ids)||count($ids)<1||count($ids)>100)fail('Select one or more active violations.',400,'VALIDATION_ERROR');
    foreach($ids as $id)if(!is_int($id)||$id<=0)fail('Invalid violation selection.',400,'VALIDATION_ERROR');
    if(count(array_unique($ids))!==count($ids))fail('Duplicate violations are not allowed.',400,'VALIDATION_ERROR');
    if(isset($b['violation_descriptions'])&&!is_array($b['violation_descriptions']))fail('Invalid violation descriptions.',400,'VALIDATION_ERROR');
    $data['violation_ids']=$ids;$data['violation_descriptions']=[];
    foreach(($b['violation_descriptions']??[]) as $key=>$value){
        if(!is_string($value)||text_length(trim($value))>1000)fail('Violation descriptions must be at most 1000 characters.',400,'VALIDATION_ERROR');
        if(in_array((int)$key,$ids,true))$data['violation_descriptions'][(string)$key]=trim($value);
    }
    $data['violation_descriptions']=(object)$data['violation_descriptions'];
    $latitude=$b['violation_latitude']??null;$longitude=$b['violation_longitude']??null;
    if(($latitude===null)!==($longitude===null))fail('GPS coordinates must be supplied together.',400,'VALIDATION_ERROR');
    if($latitude!==null){
        if((!is_int($latitude)&&!is_float($latitude))||(!is_int($longitude)&&!is_float($longitude))
            ||!is_finite((float)$latitude)||!is_finite((float)$longitude)
            ||$latitude < -90||$latitude > 90||$longitude < -180||$longitude > 180){
            fail('GPS coordinates are outside the valid range.',400,'VALIDATION_ERROR');
        }
    }
    $data['violation_latitude']=$latitude;$data['violation_longitude']=$longitude;
    return $data;
}

function tickets_create(array $params=[]): never
{
    $u=require_role(['apprehending_officer']);$data=citation_input(json_input());
    // The RPC validates current catalog entries and writes all snapshots/history
    // atomically. Client penalties, officer identity, and issuance time are ignored.
    $r=ticket_rpc_result(supabase_rpc('tvtms_ticket_create',['p_user_id'=>(int)$u['id'],'p_data'=>$data]));
    $ticket=$r['ticket']??null;if(!is_array($ticket))fail('Citation creation returned no record',500,'TICKET_CREATE_FAILED');
    // Only after the committed RPC returns: driver snapshot is checked before SMTP.
    try{$notification=ticket_notification_attempt((int)$u['id'],$ticket,$data['driver_email']);}
    catch(Throwable){
        error_log('Citation notification failed after persistence.');
        $notification=ticket_notification_result('unknown',null,false,'Citation issued, but email delivery is uncertain. Do not issue a duplicate citation.');
    }
    ok('Traffic citation issued successfully',$ticket,['ticket'=>$ticket,'notification'=>$notification],201);
}

function tickets_retry_notification(array $params): never
{
    $u=require_role(['admin','apprehending_officer']);
    $id=ticket_valid_id($params['id']??0);$b=json_input();
    $confirmed=(($b['recipient_email_confirmed']??null)===true&&is_string($b['recipient_email']??$b['owner_email']??null))?normalize_email($b['recipient_email']??$b['owner_email']):'';
    if($confirmed===''||filter_var($confirmed,FILTER_VALIDATE_EMAIL)===false){
        fail('Confirm the intended email address before retrying this ticket notification.',409,'NOTIFICATION_RECIPIENT_REQUIRED');
    }
    $notification=ticket_notification_attempt((int)$u['id'],['id'=>$id],$confirmed);
    $statusCode=(int)($notification['statusCode']??0);
    if($statusCode>=400){
        fail((string)($notification['message']??'Notification retry was rejected.'),$statusCode,(string)($notification['errorCode']??'NOTIFICATION_RETRY_REJECTED'));
    }
    ok('Notification retry completed',$notification,['notification'=>$notification]);
}

function tickets_update_status(array $params): never
{
    $u=require_role(['admin','apprehending_officer']);$id=ticket_valid_id($params['id']??0);$b=json_input();
    $status=trim((string)($b['status']??''));$reason=clean_string($b['reason']??'',500);
    $valid=['draft','issued','pending_payment','unpaid','paid','closed','cancelled','voided'];
    if($status==='partially_paid')fail('Partial-payment status is derived from official payment records',409,'PAYMENT_REQUIRED');
    if(!in_array($status,$valid,true))fail('Valid ticket ID and status are required',400,'INVALID_STATUS');
    if($status==='paid')fail('Record an official payment instead of changing the ticket status directly',409,'PAYMENT_REQUIRED');
    if(in_array($status,['cancelled','voided','closed'],true)&&$u['role']!=='admin')fail('Administrator approval is required for cancellation or closure',403,'ADMIN_REQUIRED');
    if(in_array($status,['cancelled','voided'],true)&&strlen($reason)<5)fail('Cancellation or voiding requires a reason with at least 5 characters',400,'VALIDATION_ERROR');
    $r=ticket_rpc_result(supabase_rpc('tvtms_ticket_mutate',['p_action'=>'status','p_id'=>$id,'p_user_id'=>(int)$u['id'],'p_role'=>$u['role'],'p_data'=>['status'=>$status,'reason'=>$reason]]));
    log_audit((int)$u['id'],'TICKET_STATUS_UPDATED','tickets',$id,['requestedStatus'=>$status,'previousLifecycleStatus'=>$r['previousLifecycleStatus']??null,'storedStatus'=>$r['storedStatus']??null,'reason'=>$reason?:null]);
    ok('Ticket updated successfully',['id'=>$id,'requestedStatus'=>$status,'storedStatus'=>$r['storedStatus']??null]);
}

function tickets_update_details(array $params): never
{
    $u=require_role(['admin','apprehending_officer']);$id=ticket_valid_id($params['id']??0);$b=json_input();$data=[];
    if(array_key_exists('location',$b))$data['location']=clean_string($b['location'],200);
    if(array_key_exists('remarks',$b))$data['remarks']=clean_string($b['remarks'],4000);
    $r=ticket_rpc_result(supabase_rpc('tvtms_ticket_mutate',['p_action'=>'details','p_id'=>$id,'p_user_id'=>(int)$u['id'],'p_role'=>$u['role'],'p_data'=>$data]));
    log_audit((int)$u['id'],'TICKET_DETAILS_UPDATED','tickets',$id,['previous'=>$r['previous']??null,'location'=>$r['location']??null,'remarks'=>$r['remarks']??null]);
    ok('Ticket details updated successfully',['id'=>$id,'location'=>$r['location']??null,'remarks'=>$r['remarks']??null]);
}

function tickets_cancel(array $params): never
{
    $u=require_role(['admin']);$id=ticket_valid_id($params['id']??0);$b=json_input();$reason=clean_string($b['reason']??($_GET['reason']??''),500);
    if(strlen($reason)<5)fail('A cancellation reason between 5 and 500 characters is required',400,'VALIDATION_ERROR');
    $r=ticket_rpc_result(supabase_rpc('tvtms_ticket_mutate',['p_action'=>'cancel','p_id'=>$id,'p_user_id'=>(int)$u['id'],'p_role'=>$u['role'],'p_data'=>['reason'=>$reason]]));$ticket=$r['ticket']??[];
    log_audit((int)$u['id'],'TICKET_CANCELLED','tickets',$id,['ticketNumber'=>$ticket['ticket_number']??null,'reason'=>$reason]);
    ok('Ticket cancelled successfully',['id'=>$id,'ticketNumber'=>$ticket['ticket_number']??null,'status'=>'cancelled']);
}

function tickets_permanent_delete(array $params): never
{
    $u=require_role(['admin']);$id=ticket_valid_id($params['id']??0);$reason=clean_string(json_input()['reason']??'',500);
    if(strlen($reason)<5)fail('A deletion reason between 5 and 500 characters is required',400,'VALIDATION_ERROR');
    $r=ticket_rpc_result(supabase_rpc('tvtms_ticket_mutate',['p_action'=>'delete','p_id'=>$id,'p_user_id'=>(int)$u['id'],'p_role'=>$u['role'],'p_data'=>['reason'=>$reason]]));$ticket=$r['ticket']??[];
    log_audit((int)$u['id'],'TICKET_PERMANENTLY_DELETED','tickets',$id,['ticketNumber'=>$ticket['ticket_number']??null,'reason'=>$reason]);
    ok('Ticket permanently deleted',['id'=>$id,'ticketNumber'=>$ticket['ticket_number']??null]);
}

function tickets_mark_unpaid(array $params): never
{
    $u=require_role(['admin']);$id=ticket_valid_id($params['id']??0);$reason=clean_string(json_input()['reason']??'',500);
    if(strlen($reason)<5)fail('A correction reason between 5 and 500 characters is required',400,'VALIDATION_ERROR');
    $r=ticket_rpc_result(supabase_rpc('tvtms_ticket_mark_unpaid',['p_id'=>$id,'p_user_id'=>(int)$u['id'],'p_role'=>$u['role'],'p_reason'=>$reason]));$ticket=$r['ticket']??[];
    $voidedIds=array_values(array_map('intval',is_array($r['voidedPaymentIds']??null)?$r['voidedPaymentIds']:[]));
    $voidedCount=(int)($r['voidedPayments']??count($voidedIds));$voidedAmount=(float)($r['voidedPaymentAmount']??0);
    log_audit((int)$u['id'],'TICKET_MARKED_UNPAID','tickets',$id,['ticketNumber'=>$ticket['ticket_number']??null,'voidedPayments'=>$voidedCount,'voidedPaymentIds'=>$voidedIds,'voidedPaymentAmount'=>$voidedAmount,'reason'=>$reason]);
    ok('Ticket marked unpaid successfully',['id'=>$id,'ticketNumber'=>$ticket['ticket_number']??null,'status'=>'unpaid','voidedPayments'=>$voidedCount,'voidedPaymentIds'=>$voidedIds,'voidedPaymentAmount'=>$voidedAmount]);
}

function tickets_stats(array $params=[]): never
{
    $u=require_role(['admin','apprehending_officer']);$stats=supabase_rpc('tvtms_ticket_stats',['p_user_id'=>$u['role']==='apprehending_officer'?(int)$u['id']:null]);
    if(!is_array($stats))$stats=[];
    // Count the complete Manila day, independently of the recent-ticket page.
    // This also works with the existing production stats RPC (no migration).
    $query=['select'=>'id','date_issued'=>'eq.'.manila_today(),'limit'=>0];
    if($u['role']==='apprehending_officer')$query['user_id']='eq.'.(int)$u['id'];
    $count=supabase_request('GET','/rest/v1/tickets',$query,null,['Prefer: count=exact']);
    if(!preg_match('/\/(\d+)$/D',(string)($count['headers']['content-range']??''),$matches)){
        throw new RuntimeException('The exact daily ticket count is unavailable.');
    }
    $stats['today']=(int)$matches[1];
    ok('Dashboard stats fetched successfully',$stats,['stats'=>$stats]);
}
function tickets_search(array $params=[]): never
{
    $u=require_role(['admin','apprehending_officer']);
    $search=trim((string)($_GET['search']??''));
    $mode=strtolower(trim((string)($_GET['mode']??'general')));
    if($search===''||text_length($search)>100)fail('A search query of 1–100 characters is required',400,'VALIDATION_ERROR');
    if(!in_array($mode,['general','citation','license','name'],true))fail('Invalid ticket search mode',400,'VALIDATION_ERROR');

    // Preserve the existing broad ticket search for callers that do not specify a mode.
    if($mode==='general'){
        $r=ticket_rpc_result(supabase_rpc('tvtms_ticket_list',['p_filters'=>[
            'search'=>$search,
            'officerId'=>$u['role']==='apprehending_officer'?(int)$u['id']:null,
            'sortBy'=>'date_issued','sortOrder'=>'DESC','pageSize'=>50,'offset'=>0
        ]]));
        $tickets=$r['tickets']??[];
        $tickets=ticket_enrich_payment_totals(is_array($tickets)?$tickets:[]);
        ok('Tickets fetched successfully',$tickets,['tickets'=>$tickets,'mode'=>$mode]);
    }

    $filters=[];
    if($u['role']==='apprehending_officer')$filters['user_id']='eq.'.(int)$u['id'];

    if($mode==='citation'){
        $citation=strtoupper($search);
        if(!preg_match('/^[A-Z0-9][A-Z0-9\\/-]{0,29}$/',$citation))fail('Enter a valid citation number',400,'VALIDATION_ERROR');
        $filters['ticket_number']='ilike.'.$citation;
    }elseif($mode==='license'){
        $license=strtoupper($search);
        if(text_length($license)<5||text_length($license)>30||!preg_match('/^[A-Z0-9 .\\/-]+$/',$license))fail('Enter a valid driver license number',400,'VALIDATION_ERROR');
        // Revised citations snapshot the license at issuance. Exact case-insensitive
        // matching links the same licensed driver across vehicles without guessing.
        $filters['driver_license_number']='ilike.'.$license;
    }else{
        if(text_length($search)<2||!preg_match("/^[\\pL\\pN .'-]+$/u",$search))fail('Enter at least part of the registered owner or driver name',400,'VALIDATION_ERROR');
        $filters['or']='(owner_name.ilike.*'.$search.'*,driver_first_name.ilike.*'.$search.'*,driver_middle_name.ilike.*'.$search.'*,driver_last_name.ilike.*'.$search.'*)';
    }

    $tickets=supabase_select('ticket_details',$filters,[
        'select'=>'*','order'=>'date_issued.desc,time_issued.desc','limit'=>50
    ]);
    $tickets=ticket_enrich_payment_totals($tickets);
    ok('Tickets fetched successfully',$tickets,['tickets'=>$tickets,'mode'=>$mode]);
}
