-- Atomic, administrator-only ticket deletion. Existing ticket mutation RPC is unchanged.
-- This migration creates a NEW, service-role-only endpoint. It does not edit or delete data.
CREATE OR REPLACE FUNCTION public.tvtms_ticket_admin_delete(
  p_ticket_id bigint,
  p_actor_id bigint,
  p_confirm_ticket_number text,
  p_reason text,
  p_ip text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_ticket public.tickets%ROWTYPE;
  v_audit_id bigint;
  v_reason text := btrim(coalesce(p_reason,''));
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = p_actor_id AND role = 'admin' AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('errorCode','ADMIN_REQUIRED','message','An active Administrator account is required.', 'statusCode',403);
  END IF;

  IF char_length(v_reason) < 5 OR char_length(v_reason) > 500 THEN
    RETURN jsonb_build_object('errorCode','VALIDATION_ERROR','message','A reason between 5 and 500 characters is required.','statusCode',400);
  END IF;

  SELECT * INTO v_ticket FROM public.tickets WHERE id=p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('errorCode','TICKET_NOT_FOUND','message','Ticket not found.','statusCode',404);
  END IF;

  IF p_confirm_ticket_number IS NULL OR btrim(p_confirm_ticket_number) <> v_ticket.ticket_number THEN
    RETURN jsonb_build_object('errorCode','DELETE_CONFIRMATION_REQUIRED','message','The exact citation number must be confirmed.','statusCode',409);
  END IF;

  IF v_ticket.status NOT IN ('unpaid','cancelled') THEN
    RETURN jsonb_build_object('errorCode','TICKET_DELETE_NOT_ALLOWED','message','Only unpaid or cancelled citations can be deleted.','statusCode',409);
  END IF;

  IF EXISTS(SELECT 1 FROM public.payments WHERE ticket_id=p_ticket_id)
    OR EXISTS(SELECT 1 FROM public.disputes WHERE ticket_id=p_ticket_id)
    OR EXISTS(SELECT 1 FROM public.evidence WHERE ticket_id=p_ticket_id)
    OR EXISTS(SELECT 1 FROM public.ticket_email_notifications WHERE ticket_id=p_ticket_id)
  THEN
    RETURN jsonb_build_object('errorCode','LINKED_RECORDS_EXIST','message','Protected payment, dispute, evidence or email history prevents permanent deletion.','statusCode',409);
  END IF;

  DELETE FROM public.tickets WHERE id=p_ticket_id;
  -- The deletion and audit INSERT are in the same PostgreSQL transaction.
  -- If audit insertion fails, PostgreSQL rolls back the deletion automatically.
  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, metadata, ip_address, user_agent)
  VALUES (
    p_actor_id,
    'TICKET_PERMANENTLY_DELETED',
    'tickets',
    p_ticket_id,
    jsonb_build_object('ticketNumber',v_ticket.ticket_number,'previousStatus',v_ticket.status,'reason',v_reason,'auditMode','atomic')::text,
    nullif(left(coalesce(p_ip,''),45),''),
    nullif(left(coalesce(p_user_agent,''),2000),'')
  ) RETURNING id INTO v_audit_id;
  RETURN jsonb_build_object('ticketNumber',v_ticket.ticket_number,'auditId',v_audit_id,'status','deleted');
END;
$function$;
REVOKE ALL ON FUNCTION public.tvtms_ticket_admin_delete(bigint,bigint,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tvtms_ticket_admin_delete(bigint,bigint,text,text,text,text) TO service_role;
NOTIFY pgrst, 'reload schema';
