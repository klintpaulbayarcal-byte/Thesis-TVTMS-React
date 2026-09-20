<?php
declare(strict_types=1);

function ticket_rpc_result(mixed $result): array
{
    if (!is_array($result)) return [];
    $error = rpc_domain_error($result);
    if ($error) fail_domain($error);
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

function tickets_create(array $params=[]): never
{
    $u=require_role(['apprehending_officer']);$b=json_input();
    $plate=normalize_plate($b['plate_number']??'');$type=strtolower(trim((string)($b['vehicle_type']??'')));
    $owner=clean_string($b['owner_name']??'',100);$email=normalize_email($b['owner_email']??'');
    $address=clean_string($b['owner_address']??'',2000);$license=strtoupper(clean_string($b['driver_license_number']??'',30));
    $location=clean_string($b['location']??'',200);$remarks=clean_string($b['remarks']??'',4000);$vid=(int)($b['violation_id']??0);
    if(!$plate||strlen($plate)>20||!in_array($type,['motorcycle','tricycle','car','truck','bus','van'],true)||$vid<=0) fail('Valid plate number, vehicle type, and violation are required',400,'VALIDATION_ERROR');
    if($email!==''&&!filter_var($email,FILTER_VALIDATE_EMAIL))fail('Owner email address is invalid',400,'VALIDATION_ERROR');
    $r=ticket_rpc_result(supabase_rpc('tvtms_ticket_create',['p_user_id'=>(int)$u['id'],'p_data'=>[
        'plate_number'=>$plate,'vehicle_type'=>$type,'owner_name'=>$owner,'owner_email'=>$email,
        'owner_address'=>$address,'driver_license_number'=>$license,'violation_id'=>$vid,'location'=>$location,'remarks'=>$remarks
    ]]));
    $ticket=$r['ticket']??null;if(!is_array($ticket))fail('Ticket creation returned no record',500,'TICKET_CREATE_FAILED');
    $penalty=$r['penaltyInfo']??[];
    log_audit((int)$u['id'],'TICKET_CREATED','tickets',(int)($ticket['id']??0),['ticketNumber'=>$ticket['ticket_number']??null,'violationId'=>$vid,'plateNumber'=>$plate,'penaltyInfo'=>$penalty]);
    $notification=ticket_notification_attempt((int)$u['id'],$ticket);
    ok('Ticket issued successfully',$ticket,['ticket'=>$ticket,'notification'=>$notification],201);
}

function tickets_retry_notification(array $params): never
{
    $u=require_role(['admin','apprehending_officer']);
    $id=ticket_valid_id($params['id']??0);
    $notification=ticket_notification_attempt((int)$u['id'],['id'=>$id]);
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
    if(!is_array($stats))$stats=[];ok('Dashboard stats fetched successfully',$stats,['stats'=>$stats]);
}
function tickets_search(array $params=[]): never
{
    $u=require_role(['admin','apprehending_officer']);$search=trim((string)($_GET['search']??''));if($search==='')fail('Search query is required',400,'VALIDATION_ERROR');
    $r=ticket_rpc_result(supabase_rpc('tvtms_ticket_list',['p_filters'=>['search'=>$search,'officerId'=>$u['role']==='apprehending_officer'?(int)$u['id']:null,'sortBy'=>'date_issued','sortOrder'=>'DESC','pageSize'=>50,'offset'=>0]]));$tickets=$r['tickets']??[];$tickets=ticket_enrich_payment_totals(is_array($tickets)?$tickets:[]);
    ok('Tickets fetched successfully',$tickets,['tickets'=>$tickets]);
}
