<?php
declare(strict_types=1);
function setting_allowed(string $key): bool{return in_array($key,['lgu_name','lgu_address','lgu_contact','dispute_deadline_days','system_title','payment_deadline_days','send_violation_notice','send_payment_confirmation'],true);}
function setting_normalize(string $key,mixed $value): string
{
    if(in_array($key,['send_violation_notice','send_payment_confirmation'],true))return bool_setting($value);
    if(in_array($key,['dispute_deadline_days','payment_deadline_days'],true)){$n=(int)$value;if($n<1||$n>365)fail($key.' must be an integer from 1 to 365',400,'VALIDATION_ERROR');return (string)$n;}
    $text=trim((string)$value);if($text===''||strlen($text)>250)fail($key.' must contain 1–250 characters',400,'VALIDATION_ERROR');return $text;
}
function settings_list(array $params=[]): never
{
    require_role(['admin']);$rows=supabase_select('system_settings',[],['select'=>'id,setting_key,setting_value,description,updated_at','order'=>'setting_key.asc']);$map=[];foreach($rows as $r)$map[(string)$r['setting_key']]=$r['setting_value']??'';json_response(['success'=>true,'settings'=>$rows,'values'=>$map,'items'=>$rows]);
}
function settings_get_one(array $params): never
{
    require_role(['admin']);$key=(string)($params['key']??'');$rows=supabase_select('system_settings',['setting_key'=>'eq.'.$key],['select'=>'setting_key,setting_value,description,updated_at','limit'=>1]);if(!$rows)fail('Setting not found',404,'SETTING_NOT_FOUND');json_response(['success'=>true,'setting'=>$rows[0],'value'=>$rows[0]['setting_value']]);
}
function settings_write(array $entries,array $user,string $action): never
{
    $rows=[];$keys=[];foreach($entries as $key=>$raw){$key=(string)$key;if(!setting_allowed($key))fail('Unsupported setting: '.$key,400,'UNSUPPORTED_SETTING');$rows[]=['setting_key'=>$key,'setting_value'=>setting_normalize($key,$raw),'updated_at'=>date(DATE_ATOM)];$keys[]=$key;}
    if(!$rows)fail('No valid settings supplied',400,'VALIDATION_ERROR');supabase_upsert('system_settings',$rows,'setting_key');log_audit((int)$user['id'],$action,'system_settings',null,['keys'=>$keys]);json_response(['success'=>true,'message'=>'System settings updated successfully']);
}
function settings_update(array $params=[]): never{$u=require_role(['admin']);$settings=json_input()['settings']??null;if(!is_array($settings)||array_is_list($settings))fail('Invalid settings format',400,'VALIDATION_ERROR');settings_write($settings,$u,'SYSTEM_SETTINGS_UPDATE');}
function settings_bulk_update(array $params=[]): never{$u=require_role(['admin']);$updates=json_input()['updates']??null;if(!is_array($updates))fail('Updates must be an array',400,'VALIDATION_ERROR');$settings=[];foreach($updates as $it){if(!is_array($it))continue;$key=(string)($it['setting_key']??$it['key']??'');if($key!=='')$settings[$key]=$it['setting_value']??$it['value']??'';}settings_write($settings,$u,'SYSTEM_SETTINGS_BULK_UPDATE');}
