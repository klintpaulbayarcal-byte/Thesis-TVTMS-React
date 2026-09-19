<?php
declare(strict_types=1);

const EVIDENCE_TICKET_FILE_LIMIT = 10;
const EVIDENCE_TICKET_BYTE_LIMIT = 26214400;

function evidence_access(int $ticketId,array $user): array
{
    $rows=supabase_select('tickets',['id'=>'eq.'.$ticketId],['select'=>'id,user_id','limit'=>1]);
    if(!$rows)return ['ok'=>false,'code'=>404];
    if($user['role']==='apprehending_officer'&&(int)$rows[0]['user_id']!==(int)$user['id'])return ['ok'=>false,'code'=>403];
    return ['ok'=>true,'ticket'=>$rows[0]];
}
function evidence_signature_ok(string $path,string $mime): bool
{
    $h=@fopen($path,'rb');if(!$h)return false;$b=fread($h,16);fclose($h);if($b===false)return false;
    return match($mime){
        'image/jpeg'=>str_starts_with($b,"\xFF\xD8\xFF"),
        'image/png'=>substr($b,0,8)==="\x89PNG\r\n\x1A\n",
        'image/webp'=>substr($b,0,4)==='RIFF'&&substr($b,8,4)==='WEBP',
        'application/pdf'=>substr($b,0,5)==='%PDF-',
        default=>false
    };
}
function evidence_upload(array $params): never
{
    $u=require_role(['admin','apprehending_officer']);$ticketId=(int)($params['ticketId']??0);if($ticketId<=0)fail('Invalid ticket ID',400,'VALIDATION_ERROR');
    $a=evidence_access($ticketId,$u);if(!$a['ok'])fail($a['code']===404?'Ticket not found':'Access denied',$a['code'],'EVIDENCE_ACCESS_DENIED');
    $file=$_FILES['evidence']??null;if(!is_array($file)||($file['error']??UPLOAD_ERR_NO_FILE)!==UPLOAD_ERR_OK)fail('No valid evidence file uploaded',400,'VALIDATION_ERROR');
    $size=(int)($file['size']??0);if($size<=0||$size>5*1024*1024)fail('Evidence file exceeds the 5 MB limit',413,'FILE_TOO_LARGE');
    $existing=supabase_select('evidence',['ticket_id'=>'eq.'.$ticketId],['select'=>'id,file_size','limit'=>EVIDENCE_TICKET_FILE_LIMIT]);
    $existingBytes=array_sum(array_map(static fn(array $row): int=>(int)($row['file_size']??0),$existing));
    if(count($existing)>=EVIDENCE_TICKET_FILE_LIMIT||$existingBytes+$size>EVIDENCE_TICKET_BYTE_LIMIT)fail('Evidence quota exceeded for this ticket',409,'EVIDENCE_QUOTA_EXCEEDED');
    $tmp=(string)($file['tmp_name']??'');$mime=(new finfo(FILEINFO_MIME_TYPE))->file($tmp)?:'';$allowed=['image/jpeg','image/png','image/webp','application/pdf'];if(!in_array($mime,$allowed,true))fail('Invalid file type. Allowed: JPG, PNG, WEBP, PDF',400,'INVALID_EVIDENCE_UPLOAD');
    if(!evidence_signature_ok($tmp,$mime))fail('File content does not match the declared file type',400,'INVALID_FILE_SIGNATURE');
    $lat=($_POST['gps_lat']??'')===''?null:(float)$_POST['gps_lat'];$lng=($_POST['gps_lng']??'')===''?null:(float)$_POST['gps_lng'];
    if(($lat!==null&&($lat < -90||$lat > 90))||($lng!==null&&($lng < -180||$lng > 180)))fail('GPS coordinates are invalid',400,'INVALID_GPS_COORDINATES');
    $data=file_get_contents($tmp);if($data===false)fail('Unable to read evidence upload',500,'EVIDENCE_UPLOAD_FAILED');
    $ext=['image/jpeg'=>'.jpg','image/png'=>'.png','image/webp'=>'.webp','application/pdf'=>'.pdf'][$mime];$stored='database:'.bin2hex(random_bytes(16)).$ext;
    $name=basename((string)($file['name']??'evidence'.$ext));
    $rows=supabase_insert('evidence',[['ticket_id'=>$ticketId,'file_path'=>$stored,'file_name'=>$name,'file_type'=>$mime,'file_size'=>$size,'uploaded_by'=>(int)$u['id'],'gps_lat'=>$lat,'gps_lng'=>$lng,'file_data'=>'\\x'.bin2hex($data)]],true);
    $id=(int)($rows[0]['id']??0);log_audit((int)$u['id'],'EVIDENCE_UPLOADED','evidence',$id,['ticketId'=>$ticketId,'fileName'=>$name]);
    ok('Evidence uploaded successfully',['id'=>$id,'ticketId'=>$ticketId,'fileName'=>$name,'filePath'=>$stored,'fileType'=>$mime,'fileSize'=>$size],[],201);
}
function evidence_by_ticket(array $params): never
{
    $u=require_role(['admin','apprehending_officer']);$ticketId=(int)($params['ticketId']??0);if($ticketId<=0)fail('Invalid ticket ID',400,'VALIDATION_ERROR');$a=evidence_access($ticketId,$u);if(!$a['ok'])fail($a['code']===404?'Ticket not found':'Access denied',$a['code'],'EVIDENCE_ACCESS_DENIED');
    $rows=supabase_select('evidence',['ticket_id'=>'eq.'.$ticketId],['select'=>'id,ticket_id,file_path,file_name,file_type,file_size,uploaded_by,gps_lat,gps_lng,created_at,users!evidence_uploaded_by_fkey(name)','order'=>'created_at.desc,id.desc']);
    foreach($rows as &$r){$r['mime_type']=$r['file_type']??null;$r['uploaded_by_name']=$r['users']['name']??null;unset($r['users']);}unset($r);ok('Ticket evidence fetched successfully',$rows,['evidence'=>$rows]);
}
function evidence_file(array $params): never
{
    $u=require_role(['admin','apprehending_officer']);$id=(int)($params['id']??0);if($id<=0)fail('Invalid evidence ID',400,'VALIDATION_ERROR');
    $rows=supabase_select('evidence',['id'=>'eq.'.$id],['select'=>'id,ticket_id,file_path,file_name,file_type,file_data,tickets!inner(user_id)','limit'=>1]);if(!$rows)fail('Evidence file not found',404,'EVIDENCE_NOT_FOUND');$r=$rows[0];
    if($u['role']==='apprehending_officer'&&(int)($r['tickets']['user_id']??0)!==(int)$u['id'])fail('Access denied',403,'FORBIDDEN');
    $encoded=(string)($r['file_data']??'');$hex=$encoded;
    while(str_starts_with($hex,'\\'))$hex=substr($hex,1);
    if(str_starts_with(strtolower($hex),'x'))$hex=substr($hex,1);
    if($hex!==''&&strlen($hex)%2===0&&ctype_xdigit($hex))$bytes=hex2bin($hex);
    elseif(strlen($encoded)===(int)($r['file_size']??-1))$bytes=$encoded;
    else fail('Evidence file is missing from storage',404,'EVIDENCE_FILE_MISSING');
    if($bytes===false)fail('Invalid stored evidence encoding',500,'EVIDENCE_FILE_INVALID');
    $filename=preg_replace('/["\\\\\r\n]+/','_',basename((string)($r['file_name']??'evidence')));
    header('Content-Type: '.($r['file_type']??'application/octet-stream'));header('Content-Disposition: inline; filename="'.$filename.'"');header('Cache-Control: private, no-store');header('X-Content-Type-Options: nosniff');echo $bytes;exit;
}
