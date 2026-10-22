-- Repeat citation integrity: one vehicle per normalized plate, and a persistent
-- owner association reused for the same verified vehicle/owner details.
-- No existing citation, vehicle, or owner rows are rewritten by this migration.
-- Different people with the same name are not merged automatically.
create or replace function public.tvtms_ticket_create(p_data jsonb,p_user_id bigint)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 actor public.users%rowtype; vehicle public.vehicles%rowtype; ticket public.tickets%rowtype;
 item record; ids bigint[]; num text:=upper(trim(p_data->>'ticket_number'));
 plate text:=replace(replace(upper(trim(p_data->>'plate_number')),'-',''),' ','');
 now_manila timestamp:=current_timestamp at time zone 'Asia/Manila';
 unit numeric:=public.tvtms_citation_penalty(); count_plate integer; offense integer;
 first_offense integer; incidents jsonb:='[]'::jsonb; additional text;
begin
 select * into actor from public.users where id=p_user_id and role='apprehending_officer' and status='active' for share;
 if not found then return public.tvtms_ticket_error('FORBIDDEN','Only an active Apprehending Officer may issue citations.',403); end if;
 if coalesce(length(trim(actor.officer_rank)),0)=0 then
 return public.tvtms_ticket_error('OFFICER_RANK_REQUIRED','Ask the Administrator to record your rank / designation before issuing a citation.',409); end if;
 if num is null or num !~ '^[A-Z0-9][A-Z0-9/-]{0,29}$' or plate is null or plate !~ '^[A-Z0-9]{1,20}$'
 or coalesce(p_data->>'vehicle_type','') not in ('motorcycle','tricycle','car','truck','bus','van')
 or coalesce(length(trim(p_data->>'driver_first_name')),0) not between 1 and 100
 or coalesce(length(trim(p_data->>'driver_last_name')),0) not between 1 and 100
 or coalesce(length(trim(p_data->>'driver_address')),0) not between 1 and 2000
 or coalesce(length(trim(p_data->>'driver_nationality')),0) not between 1 and 100
 or coalesce(length(trim(p_data->>'driver_email')),0) not between 3 and 190
 or coalesce(p_data->>'driver_email','') !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 or coalesce(p_data->>'license_type','') not in ('','Professional','Non-Professional','Student Permit / SP','Others')
 or (p_data->>'license_type'='Others' and coalesce(length(trim(p_data->>'license_type_other')),0) not between 1 and 100)
 or coalesce(length(trim(p_data->>'vehicle_make')),0) not between 1 and 100
 or coalesce(length(trim(p_data->>'owner_name')),0) not between 1 and 100
 or coalesce(length(trim(p_data->>'owner_address')),0) not between 1 and 2000
 or coalesce(length(trim(p_data->>'location')),0) not between 1 and 200 then
 return public.tvtms_ticket_error('VALIDATION_ERROR','Complete the required citation, driver, license, vehicle and incident fields.',400); end if;
 if (p_data->>'expected_date')::date is distinct from now_manila::date then
 return public.tvtms_ticket_error('STALE_REVIEW','The issuance date changed. Refresh and review the citation again.',409); end if;
 if ((p_data->>'violation_latitude') is null)<>( (p_data->>'violation_longitude') is null ) then
 return public.tvtms_ticket_error('VALIDATION_ERROR','GPS coordinates must be supplied together.',400); end if;
 if (p_data->>'violation_latitude') is not null and
    ((p_data->>'violation_latitude')::numeric not between -90 and 90
     or (p_data->>'violation_longitude')::numeric not between -180 and 180) then
 return public.tvtms_ticket_error('VALIDATION_ERROR','GPS coordinates are outside the valid range.',400); end if;
 if jsonb_typeof(p_data->'violation_ids') is distinct from 'array' then
 return public.tvtms_ticket_error('VALIDATION_ERROR','Select at least one active violation.',400); end if;
 select array_agg(value::bigint order by value::bigint) into ids from jsonb_array_elements_text(p_data->'violation_ids');
 if coalesce(cardinality(ids),0) not between 1 and 100 or cardinality(ids)<>(select count(distinct x) from unnest(ids) x) then
 return public.tvtms_ticket_error('VALIDATION_ERROR','Select one or more distinct active violations.',400); end if;
 -- Global lock order: citation number, plate, catalog rows (sorted), vehicle.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tvtms:citation:'||num,0));
 if exists(select 1 from public.tickets where upper(trim(ticket_number))=num) then
 return public.tvtms_ticket_error('DUPLICATE_CITATION','This citation number has already been issued.',409); end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tvtms:plate:'||plate,0));
 perform id from public.violations where id=any(ids) order by id for share;
 if (select count(*) from public.violations where id=any(ids) and status='active' and is_citation_selectable)<>cardinality(ids) then
 return public.tvtms_ticket_error('VIOLATION_UNAVAILABLE','A selected violation is unavailable.',400); end if;
 for item in select * from public.violations where id=any(ids) order by id loop
   additional:=nullif(trim(p_data->'violation_descriptions'->>item.id::text),'');
   if item.requires_description and (additional is null or length(additional)>1000) then
   return public.tvtms_ticket_error('VALIDATION_ERROR','A selected violation requires a description (1–1000 characters).',400); end if;
   offense:=((public.tvtms_catalog_prior_offenses(item.id,plate)->>'prior_count')::integer)+1;
   first_offense:=coalesce(first_offense,offense);
   incidents:=incidents||jsonb_build_array(jsonb_build_object('id',item.id,'code',item.violation_code,
    'name',item.violation_name,'offense',offense,'description',additional));
 end loop;
 select * into vehicle from public.vehicles where replace(replace(upper(plate_number),'-',''),' ','')=plate order by id limit 1 for update;
 if not found then
   insert into public.vehicles(plate_number,vehicle_type,vehicle_make,owner_name,owner_address)
   values(plate,p_data->>'vehicle_type',p_data->>'vehicle_make',p_data->>'owner_name',p_data->>'owner_address') returning * into vehicle;
 else
   update public.vehicles set vehicle_type=p_data->>'vehicle_type',vehicle_make=p_data->>'vehicle_make',
   owner_name=p_data->>'owner_name',owner_address=p_data->>'owner_address' where id=vehicle.id;
 end if;

 -- Reuse the registered owner's stable link for this vehicle. Plate alone
 -- identifies a vehicle, not a person. Do not auto-merge owners across vehicles
 -- from names/addresses because those are not verified personal identifiers.
 -- Retain historical issued owner/driver snapshots on each ticket.
 if vehicle.owner_id is not null then
   perform 1 from public.owners
    where id=vehicle.owner_id
      and lower(btrim(coalesce(name,'')))=lower(btrim(p_data->>'owner_name'))
      and lower(btrim(coalesce(address,'')))=lower(btrim(p_data->>'owner_address'))
    for update;
 end if;
 if vehicle.owner_id is null or not found then
   insert into public.owners(name,address)
   values(btrim(p_data->>'owner_name'),btrim(p_data->>'owner_address'))
   returning id into vehicle.owner_id;
   update public.vehicles set owner_id=vehicle.owner_id where id=vehicle.id;
 end if;
 insert into public.plate_ticket_sequences(normalized_plate,last_number) values(plate,1)
 on conflict(normalized_plate) do update set last_number=public.plate_ticket_sequences.last_number+1,updated_at=current_timestamp returning last_number into count_plate;
 insert into public.tickets(ticket_number,user_id,vehicle_id,violation_id,penalty_amount_at_issue,date_issued,time_issued,
 location,remarks,plate_ticket_count_at_issue,same_violation_offense_count_at_issue,citation_version,
 driver_first_name,driver_middle_name,driver_last_name,driver_address,driver_nationality,driver_email_at_issue,
 license_type,license_type_other,driver_license_at_issue,plate_at_issue,vehicle_type_at_issue,vehicle_make_at_issue,
 owner_name_at_issue,owner_address_at_issue,officer_name_at_issue,officer_rank_at_issue,incident_date,incident_time,appearance_due_date,
 violation_latitude,violation_longitude)
 values(num,p_user_id,vehicle.id,ids[1],unit*cardinality(ids),now_manila::date,now_manila::time,p_data->>'location',nullif(p_data->>'remarks',''),count_plate,first_offense,2,
 trim(p_data->>'driver_first_name'),nullif(trim(p_data->>'driver_middle_name'),''),trim(p_data->>'driver_last_name'),trim(p_data->>'driver_address'),trim(p_data->>'driver_nationality'),lower(trim(p_data->>'driver_email')),
 nullif(p_data->>'license_type',''),case when p_data->>'license_type'='Others' then trim(p_data->>'license_type_other') else null end,nullif(p_data->>'driver_license_number',''),plate,p_data->>'vehicle_type',p_data->>'vehicle_make',
 p_data->>'owner_name',p_data->>'owner_address',actor.name,actor.officer_rank,now_manila::date,now_manila::time,now_manila::date+7,
 (p_data->>'violation_latitude')::numeric,(p_data->>'violation_longitude')::numeric) returning * into ticket;
 insert into public.ticket_violations(ticket_id,violation_id,violation_code_at_issue,violation_name_at_issue,penalty_amount_at_issue,same_violation_offense_count_at_issue,description_at_issue,snapshot_origin)
 select ticket.id,(x->>'id')::bigint,x->>'code',x->>'name',unit,(x->>'offense')::integer,x->>'description','issued' from jsonb_array_elements(incidents) x;
 insert into public.ticket_status_history(ticket_id,previous_status,new_status,changed_by,reason)
 values(ticket.id,null,'issued',p_user_id,'Traffic citation issued for administrator oversight');
 insert into public.audit_logs(user_id,action,entity_type,entity_id,metadata)
 values(p_user_id,'CITATION_CREATED','tickets',ticket.id,jsonb_build_object('citationNumber',num,'violationIds',ids,'totalPenalty',ticket.penalty_amount_at_issue,'appearanceDueDate',ticket.appearance_due_date)::text);
 return jsonb_build_object('ticket',(select to_jsonb(td) from public.ticket_details td where td.id=ticket.id));
exception
 when invalid_text_representation or datetime_field_overflow or invalid_datetime_format or string_data_right_truncation or numeric_value_out_of_range then
 return public.tvtms_ticket_error('VALIDATION_ERROR','One or more citation fields are invalid.',400);
 when unique_violation then return public.tvtms_ticket_error('DUPLICATE_CITATION','This citation number has already been issued.',409);
end; $$;
