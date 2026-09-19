<?php
declare(strict_types=1);

function users_list(array $params=[]): never
{
    require_role(['admin']);$rows=supabase_select('users',['role'=>'in.(admin,apprehending_officer)'],['select'=>'id,name,email,role,contact_number,status,last_login,locked_until,created_at','order'=>'created_at.desc,id.asc','limit'=>1000]);json_response(['success'=>true,'users'=>$rows,'data'=>$rows]);
}
function users_get_one(array $params): never
{
    require_role(['admin']);$id=(int)$params['id'];$rows=supabase_select('users',['id'=>'eq.'.$id],['select'=>'id,name,email,role,contact_number,status,created_at','limit'=>1]);if(!$rows)fail('User not found',404,'USER_NOT_FOUND');json_response(['success'=>true,'user'=>$rows[0],'data'=>$rows[0]]);
}
function users_create(array $params=[]): never
{
    $actor=require_role(['admin']);$in=json_input();$name=clean_string($in['name']??'',100);$email=normalize_email($in['email']??'');$password=(string)($in['password']??'');$role=(string)($in['role']??'');$contact=clean_string($in['contact_number']??'',20);
    if($name===''||$email===''||$password===''||$role==='')fail('Name, email, password, and role are required',400,'VALIDATION_ERROR');if(!filter_var($email,FILTER_VALIDATE_EMAIL)||strlen($email)>100||!in_array($role,['admin','apprehending_officer'],true))fail('Name, email, contact number, or role is invalid.',400,'VALIDATION_ERROR');if(!is_strong_password($password))fail('Password must be at least 12 characters and include uppercase, lowercase, number, and symbol.',400,'WEAK_PASSWORD');
    if(supabase_select('users',['email'=>'eq.'.$email],['select'=>'id','limit'=>1]))fail('Email already exists',409,'DUPLICATE_EMAIL');$hash=password_hash($password,PASSWORD_BCRYPT,['cost'=>10]);
    try{$rows=supabase_insert('users',[['name'=>$name,'email'=>$email,'password'=>$hash,'role'=>$role,'contact_number'=>$contact?:null,'status'=>'active']]);}catch(SupabaseException $e){if($e->pgCode==='23505')fail('Email already exists',409,'DUPLICATE_EMAIL');throw $e;}
    $id=(int)($rows[0]['id']??0);log_audit((int)$actor['id'],'USER_CREATED','users',$id,['name'=>$name,'email'=>$email,'role'=>$role]);json_response(['success'=>true,'message'=>'User created successfully','userId'=>$id,'data'=>['id'=>$id]],201);
}
function users_update(array $params): never
{
    $actor=require_role(['admin']);$id=(int)$params['id'];$rows=supabase_select('users',['id'=>'eq.'.$id],['select'=>'id,name,email,role,contact_number,status','limit'=>1]);if(!$rows)fail('User not found',404,'USER_NOT_FOUND');$cur=$rows[0];$in=json_input();$name=isset($in['name'])?clean_string($in['name'],100):(string)$cur['name'];$email=isset($in['email'])?normalize_email($in['email']):(string)$cur['email'];$role=(string)($in['role']??$cur['role']);$contact=array_key_exists('contact_number',$in)?clean_string($in['contact_number'],20):(string)($cur['contact_number']??'');$status=(string)($in['status']??$cur['status']);
    if($name===''||!filter_var($email,FILTER_VALIDATE_EMAIL)||!in_array($role,['admin','apprehending_officer'],true)||!in_array($status,['active','inactive'],true))fail('Name, email, role, or status is invalid.',400,'VALIDATION_ERROR');$out=supabase_rpc('tvtms_account_update',['p_id'=>$id,'p_name'=>$name,'p_email'=>$email,'p_role'=>$role,'p_contact'=>$contact?:null,'p_status'=>$status]);if(is_array($out)&&isset($out['error']))fail((string)$out['error'],(int)($out['status']??409),'ACCOUNT_UPDATE_REJECTED');log_audit((int)$actor['id'],'USER_UPDATED','users',$id,['role'=>$role,'status'=>$status]);json_response(['success'=>true,'message'=>'User updated successfully']);
}
function users_unlock(array $params): never
{
    $actor=require_role(['admin']);$id=(int)$params['id'];$rows=supabase_update('users',['failed_login_attempts'=>0,'locked_until'=>null],['id'=>'eq.'.$id]);if(!$rows)fail('User not found',404,'USER_NOT_FOUND');log_audit((int)$actor['id'],'USER_UNLOCKED','users',$id);json_response(['success'=>true,'message'=>'Account unlocked successfully']);
}
function users_delete(array $params): never
{
    $actor=require_role(['admin']);$id=(int)$params['id'];if($id===(int)$actor['id'])fail('You cannot delete your own account while logged in.',400,'SELF_DELETE');$out=supabase_rpc('tvtms_account_delete',['p_id'=>$id]);if(is_array($out)&&isset($out['error']))fail((string)$out['error'],(int)($out['status']??409),'ACCOUNT_DELETE_REJECTED');$deleted=is_array($out)?($out['user']??[]):[];log_audit((int)$actor['id'],'USER_DELETED','users',$id,$deleted);json_response(['success'=>true,'message'=>'User account permanently deleted.']);
}
function users_change_password(array $params=[]): never
{
    $u=require_role(['admin','apprehending_officer']);$in=json_input();$current=(string)($in['currentPassword']??$in['current_password']??'');$next=(string)($in['newPassword']??$in['new_password']??'');if($current===''||$next==='')fail('Current password and new password are required',400,'VALIDATION_ERROR');if(!is_strong_password($next))fail('New password must be at least 12 characters and include uppercase, lowercase, number, and symbol.',400,'WEAK_PASSWORD');if(hash_equals($current,$next))fail('New password must be different from the current password.',400,'PASSWORD_REUSE');$rows=supabase_select('users',['id'=>'eq.'.(int)$u['id']],['select'=>'password','limit'=>1]);if(!$rows)fail('User not found',404,'USER_NOT_FOUND');$old=(string)$rows[0]['password'];if(!password_verify($current,$old))fail('Current password is incorrect',401,'INVALID_PASSWORD');$hash=password_hash($next,PASSWORD_BCRYPT,['cost'=>10]);$changed=supabase_update('users',['password'=>$hash],['id'=>'eq.'.(int)$u['id'],'password'=>'eq.'.$old]);if(!$changed)fail('Password changed concurrently. Please retry.',409,'CONCURRENT_UPDATE');log_audit((int)$u['id'],'PASSWORD_CHANGED','users',(int)$u['id']);json_response(['success'=>true,'message'=>'Password changed successfully']);
}
function users_update_me(array $params=[]): never
{
    $u=require_role(['admin','apprehending_officer']);$in=json_input();$name=clean_string($in['name']??'',100);$email=normalize_email($in['email']??'');$contact=clean_string($in['contact_number']??'',20);if($name===''||!filter_var($email,FILTER_VALIDATE_EMAIL))fail('A valid name and email are required',400,'VALIDATION_ERROR');$dupe=supabase_select('users',['email'=>'eq.'.$email,'id'=>'neq.'.(int)$u['id']],['select'=>'id','limit'=>1]);if($dupe)fail('Email already exists',409,'DUPLICATE_EMAIL');$rows=supabase_update('users',['name'=>$name,'email'=>$email,'contact_number'=>$contact?:null],['id'=>'eq.'.(int)$u['id']]);if(!$rows)fail('User not found',404,'USER_NOT_FOUND');$row=$rows[0];unset($row['password']);log_audit((int)$u['id'],'PROFILE_UPDATED','users',(int)$u['id'],['name'=>$name,'email'=>$email]);json_response(['success'=>true,'message'=>'Profile updated successfully','user'=>$row,'data'=>$row]);
}
function users_audit_logs(array $params=[]): never
{
    require_role(['admin']);$limit=min(max((int)($_GET['limit']??200),1),1000);$rows=supabase_select('audit_logs',[],['select'=>'id,user_id,action,entity_type,entity_id,metadata,ip_address,user_agent,created_at,users(name,email)','order'=>'created_at.desc,id.asc','limit'=>$limit]);$mapped=[];foreach($rows as $r){$actor=$r['users']??null;unset($r['users']);$r['actor_name']=$actor['name']??null;$r['actor_email']=$actor['email']??null;$mapped[]=$r;}json_response(['success'=>true,'logs'=>$mapped,'data'=>$mapped]);
}
function users_clear_audit_logs(array $params=[]): never
{
    $u=require_role(['admin']);if(empty(app_config()['development']))fail('Audit log deletion is disabled outside development.',403,'FORBIDDEN');$n=(int)(supabase_rpc('tvtms_account_clear_test_logs',[])??0);log_audit((int)$u['id'],'TEST_AUDIT_LOGS_CLEARED','audit_logs',null,['deleted'=>$n]);json_response(['success'=>true,'message'=>$n.' test audit log(s) removed.','deletedRows'=>$n]);
}
