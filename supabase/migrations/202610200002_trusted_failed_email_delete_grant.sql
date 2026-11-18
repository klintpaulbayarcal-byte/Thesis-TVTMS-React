-- The admin safe-delete RPC runs as service_role (SECURITY INVOKER).
-- Existing RLS/table ACLs lacked DELETE on the email delivery ledger,
-- causing PostgREST 403 / DELETE_RPC_UNAVAILABLE on cancelled failed notices.
-- Only grant to the trusted PHP service role, not browsers or public roles.
GRANT DELETE ON TABLE public.ticket_email_notifications TO service_role;
