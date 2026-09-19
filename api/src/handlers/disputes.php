<?php
declare(strict_types=1);
function disputes_create(array $params=[]): never
{
    $u=require_role(['admin','apprehending_officer']);$b=json_input();$ticketId=(int)($b['ticket_id']??0);$reason=clean_string($b['reason']??'',4000);
    if($ticketId<=0||strlen($reason)<10)fail('Ticket and a reason of at least 10 characters are required',400,'VALIDATION_ERROR');
    $r=supabase_rpc('tvtms_dispute_create',['p_ticket_id'=>$ticketId,'p_reason'=>$reason,'p_actor'=>(int)$u['id']]);$err=rpc_domain_error($r);if($err)fail_domain($err);if(!is_array($r))fail('Dispute could not be submitted',500,'DISPUTE_CREATE_FAILED');
    $id=(int)($r['disputeId']??0);log_audit((int)$u['id'],'DISPUTE_CREATED','disputes',$id,['ticketId'=>$ticketId]);ok('Dispute submitted successfully',['disputeId'=>$id,'ticketId'=>$ticketId,'status'=>'submitted'],[],201);
}
function disputes_list(array $params=[]): never
{
    $u=require_role(['admin','apprehending_officer']);$status=trim((string)($_GET['status']??''));$ticketId=isset($_GET['ticketId'])?(int)$_GET['ticketId']:null;
    $r=supabase_rpc('tvtms_dispute_list',['p_status'=>$status!==''?$status:null,'p_ticket_id'=>$ticketId?:null,'p_actor'=>(int)$u['id']]);$items=is_array($r)?$r:[];ok('Disputes fetched successfully',$items,['disputes'=>$items]);
}
function disputes_resolve(array $params): never
{
    $u=require_role(['admin']);$id=(int)($params['id']??0);$b=json_input();$status=trim((string)($b['status']??''));$notes=clean_string($b['resolution_notes']??'',4000);
    if($id<=0||!in_array($status,['under_review','approved','rejected','closed'],true))fail('Invalid dispute status',400,'INVALID_STATUS');
    if(in_array($status,['approved','rejected','closed'],true)&&strlen($notes)<5)fail('Resolution notes of at least 5 characters are required',400,'VALIDATION_ERROR');
    $r=supabase_rpc('tvtms_dispute_resolve',['p_id'=>$id,'p_status'=>$status,'p_notes'=>$notes?:null,'p_actor'=>(int)$u['id']]);$err=rpc_domain_error($r);if($err)fail_domain($err);if(!is_array($r))fail('Dispute could not be updated',500,'DISPUTE_UPDATE_FAILED');$d=$r['dispute']??[];
    log_audit((int)$u['id'],'DISPUTE_STATUS_UPDATED','disputes',$id,['status'=>$status,'ticketId'=>$d['ticket_id']??null]);
    $email=$d['contact_email']??$d['owner_email']??null;if($email&&in_array($status,['approved','rejected','closed'],true))send_basic_email((string)$email,'Dispute Status Update — '.($d['ticket_number']??'TVTMS'),'<p>Your dispute is now <strong>'.htmlspecialchars(str_replace('_',' ',$status),ENT_QUOTES,'UTF-8').'</strong>.</p><p>'.nl2br(htmlspecialchars($notes,ENT_QUOTES,'UTF-8')).'</p>');
    if(!empty($d['submitted_by']))create_notification((int)$d['submitted_by'],'dispute','Dispute Status Updated','Your dispute is now '.str_replace('_',' ',$status).'.','dispute',$id);
    ok('Dispute updated successfully',['id'=>$id,'status'=>$status,'ticketStatus'=>$status==='approved'?'cancelled':($d['ticket_status']??null)]);
}
