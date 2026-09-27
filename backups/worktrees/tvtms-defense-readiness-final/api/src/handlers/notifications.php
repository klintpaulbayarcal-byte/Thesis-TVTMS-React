<?php
declare(strict_types=1);
function notification_id(mixed $value): int{$id=(int)$value;if($id<=0)fail('A valid notification ID is required',400,'INVALID_NOTIFICATION_ID');return $id;}
function notifications_list(array $params=[]): never
{
    $u=require_role(['admin','apprehending_officer']);$limit=min(200,max(1,(int)($_GET['limit']??50)));$filters=['user_id'=>'eq.'.(int)$u['id']];if(strtolower((string)($_GET['unreadOnly']??''))==='true')$filters['is_read']='eq.0';
    $items=supabase_select('notifications',$filters,['select'=>'*','order'=>'created_at.desc,id.desc','limit'=>$limit]);$total=supabase_count('notifications',['user_id'=>'eq.'.(int)$u['id']]);$unread=supabase_count('notifications',['user_id'=>'eq.'.(int)$u['id'],'is_read'=>'eq.0']);
    ok('Notifications fetched successfully',$items,['notifications'=>$items,'totalCount'=>$total,'unreadCount'=>$unread]);
}
function notifications_read(array $params): never
{
    $u=require_role(['admin','apprehending_officer']);$id=notification_id($params['id']??0);$rows=supabase_update('notifications',['is_read'=>1,'read_at'=>date(DATE_ATOM)],['id'=>'eq.'.$id,'user_id'=>'eq.'.(int)$u['id']],true);if(!$rows)fail('Notification not found',404,'NOTIFICATION_NOT_FOUND');ok('Notification marked as read',['id'=>$id]);
}
function notifications_delete(array $params): never
{
    $u=require_role(['admin','apprehending_officer']);$id=notification_id($params['id']??0);$rows=supabase_delete('notifications',['id'=>'eq.'.$id,'user_id'=>'eq.'.(int)$u['id']],true);if(!$rows)fail('Notification not found',404,'NOTIFICATION_NOT_FOUND');ok('Notification deleted successfully',['deletedCount'=>count($rows),'ids'=>[$id]]);
}
function notifications_bulk_delete(array $params=[]): never
{
    $u=require_role(['admin','apprehending_officer']);$ids=json_input()['ids']??null;if(!is_array($ids)||count($ids)<1||count($ids)>200)fail('Select between 1 and 200 notifications to delete',400,'INVALID_NOTIFICATION_IDS');$clean=array_values(array_unique(array_map('intval',$ids)));if(in_array(0,$clean,true))fail('All notification IDs must be positive integers',400,'INVALID_NOTIFICATION_IDS');
    $rows=supabase_delete('notifications',['user_id'=>'eq.'.(int)$u['id'],'id'=>'in.('.implode(',',$clean).')'],true);ok('Selected notifications deleted successfully',['deletedCount'=>count($rows),'ids'=>$clean]);
}
function notifications_delete_all(array $params=[]): never
{
    $u=require_role(['admin','apprehending_officer']);$rows=supabase_delete('notifications',['user_id'=>'eq.'.(int)$u['id']],true);ok('All notifications deleted successfully',['deletedCount'=>count($rows)]);
}
