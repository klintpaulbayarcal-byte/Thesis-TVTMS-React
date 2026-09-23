<?php
declare(strict_types=1);

function payment_valid_ymd(string $value): bool
{
    if(!preg_match('/^\d{4}-\d{2}-\d{2}$/',$value))return false;
    $d=DateTimeImmutable::createFromFormat('!Y-m-d',$value);return $d&&$d->format('Y-m-d')===$value;
}
function payments_record(array $params=[]): never
{
    $u=require_role(['admin']);$b=json_input();$ticketId=(int)($b['ticket_id']??0);$receipt=strtoupper(trim((string)($b['official_receipt_number']??$b['or_number']??'')));
    $amount=(float)($b['amount_paid']??0);$method=strtolower(trim((string)($b['payment_method']??'cash')));$notes=clean_string($b['notes']??'',2000);
    $date=(string)($b['payment_date']??'');if(!payment_valid_ymd($date))$date=manila_today();
    if($ticketId<=0||$receipt===''||strlen($receipt)>50||$amount<=0||$amount>10000000||abs(round($amount,2)-$amount)>0.000001)fail('Valid ticket, official receipt number, and a positive amount with at most two decimal places are required',400,'VALIDATION_ERROR');
    if(!in_array($method,['cash','gcash','maya','bank_transfer','other'],true))fail('Invalid payment method',400,'VALIDATION_ERROR');
    if($date>manila_today())fail('Payment date cannot be in the future',400,'INVALID_PAYMENT_DATE');
    $r=supabase_rpc('tvtms_payment_record',['p_ticket_id'=>$ticketId,'p_receipt'=>$receipt,'p_amount'=>$amount,'p_date'=>$date,'p_method'=>$method,'p_notes'=>$notes?:null,'p_actor'=>(int)$u['id']]);
    $err=rpc_domain_error($r);if($err)fail_domain($err);if(!is_array($r))fail('Payment could not be recorded',500,'PAYMENT_RECORD_FAILED');
    $ticket=$r['ticket']??[];$paymentId=(int)($r['paymentId']??0);$paymentStatus=(string)($r['paymentStatus']??'recorded');$total=(float)($r['total']??0);$penalty=(float)($r['penalty']??0);
    log_audit((int)$u['id'],'PAYMENT_RECORDED','payments',$paymentId,['ticketId'=>$ticketId,'officialReceiptNumber'=>$receipt,'amountPaid'=>$amount,'paymentStatus'=>$paymentStatus,'totalPaid'=>$total,'penaltyAmount'=>$penalty]);
    if(!empty($ticket['owner_email']))send_basic_email((string)$ticket['owner_email'],'Payment Confirmation — '.($ticket['ticket_number']??'TVTMS'),'<p>Payment of ₱'.number_format($amount,2).' was recorded for ticket <strong>'.htmlspecialchars((string)($ticket['ticket_number']??''),ENT_QUOTES,'UTF-8').'</strong>.</p>');
    if(!empty($ticket['user_id']))create_notification((int)$ticket['user_id'],'payment','Ticket Payment Update','Payment ('.$paymentStatus.') recorded for '.($ticket['ticket_number']??'ticket').'.','ticket',$ticketId);
    ok('Payment recorded successfully',['paymentId'=>$paymentId,'ticketId'=>$ticketId,'paymentStatus'=>$paymentStatus,'totalPaidAfter'=>$total,'penaltyAmount'=>$penalty,'remainingBalance'=>max(0,$penalty-$total),'storedTicketStatus'=>$r['nextStatus']??null],[],201);
}
function payments_by_ticket(array $params): never
{
    $u=require_role(['admin','apprehending_officer']);$ticketId=(int)($params['ticketId']??0);if($ticketId<=0)fail('Invalid ticket ID',400,'VALIDATION_ERROR');
    $ticket=supabase_rpc('tvtms_ticket_detail',['p_id'=>$ticketId]);
    if(!is_array($ticket)||!isset($ticket['id']))fail('Ticket not found',404,'TICKET_NOT_FOUND');
    if($u['role']==='apprehending_officer'&&(int)($ticket['user_id']??0)!==(int)$u['id'])fail('Access denied',403,'FORBIDDEN');
    $rows=supabase_select('payments',['ticket_id'=>'eq.'.$ticketId],['select'=>'*','order'=>'payment_date.desc,id.desc']);
    foreach($rows as &$row){$row['or_number']=$row['official_receipt_number']??null;}unset($row);
    ok('Payments fetched successfully',$rows,['payments'=>$rows]);
}
