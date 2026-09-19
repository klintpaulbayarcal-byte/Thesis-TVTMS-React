from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def text(path):
    return (ROOT / path).read_text(encoding='utf-8')


def test_public_landing_supports_live_supabase_stat_keys():
    page = text('src/pages/Landing.jsx')
    assert 'total_paid' in page, 'Landing must read tvtms_public_stats.total_paid'
    assert 'total_unpaid' in page, 'Landing must read tvtms_public_stats.total_unpaid'


def test_public_lookup_handles_array_contract_and_both_reference_modes():
    page = text('src/pages/PublicTicketLookup.jsx')
    assert 'r.tickets' in page, 'Public lookup API returns a tickets array'
    assert "mode" in page and "plate" in page and "ticket" in page, 'Reference system supports plate and ticket lookup modes'


def test_public_paths_do_not_ship_fabricated_success_data():
    api = text('src/services/api.js')
    php = text('api/src/handlers/public.php')
    for marker in ['demoPublicRecords', 'demoPublicLookup', 'TVT-2026-000128']:
        assert marker not in api, f'React public API must not fabricate {marker}'
    for marker in ['tvtms_public_demo_ticket', 'TVT-2026-000128', 'total_tickets\'=>173']:
        assert marker not in php, f'PHP public handler must not fabricate {marker}'
    assert "publicTicketLookup: filters => apiRequest" in api
    assert "publicVehicleLookup: plateNumber => apiRequest" in api
    assert "publicPlateSummary: plateNumber => apiRequest" in api


def test_ticket_detail_exposes_supported_server_workflows():
    page = text('src/pages/TicketDetails.jsx')
    for method in ['updateTicketDetails', 'cancelTicket', 'markUnpaid', 'permanentDeleteTicket', 'uploadEvidence']:
        assert f'API.{method}' in page, f'Ticket details must expose {method}'
    assert 'ticket.timeline' in page, 'Ticket lifecycle timeline returned by the RPC must be visible'


def test_ticket_issue_requires_review_before_single_create_request():
    page = text('src/pages/IssueTicket.jsx')
    assert 'reviewOpen' in page
    assert 'Confirm and Issue Ticket' in page
    assert 'API.createTicket' in page
    assert page.count('API.createTicket') == 1, 'Review flow must have one ticket creation call site'


def test_ticket_details_print_and_qr_are_public_safe_and_read_only():
    page = text('src/pages/TicketDetails.jsx')
    assert "window.print()" in page
    assert "QRCode.toCanvas" in page
    assert '/ticket-lookup?ticket=' in page
    assert 'owner_name' not in page[page.index('publicLookupUrl'):page.index('publicLookupUrl') + 300]


def test_ticket_detail_payment_uses_php_payload_contract():
    page = text('src/pages/TicketDetails.jsx')
    assert 'ticket_id' in page
    assert 'amount_paid' in page
    assert 'official_receipt_number' in page
    assert 'payment_method' in page
    assert 'payment_date' in page


def test_notifications_expose_bulk_delete_contract():
    page = text('src/pages/Notifications.jsx')
    assert 'API.deleteNotifications' in page


def test_contact_message_view_is_admin_only_and_preserves_notification_state():
    route = text('api/src/router.php')
    handler = text('api/src/handlers/contact_messages.php')
    page = text('src/pages/Notifications.jsx')
    api = text('src/services/api.js')
    assert '/api/contact-messages/' in route
    assert "require_role(['admin'])" in handler
    assert 'contactMessage: id' in api
    assert 'reference_type===\'contact\'' in page
    assert 'event.stopPropagation();openContactMessage(row)' in page
    assert 'API.readNotification' in page


def test_contact_message_view_uses_safe_text_fields_only():
    handler = text('api/src/handlers/contact_messages.php')
    page = text('src/pages/Notifications.jsx')
    assert "select' => 'id,full_name,email,subject,message,status,created_at'" in handler
    assert 'dangerouslySetInnerHTML' not in page
    for field in ['full_name', 'email', 'subject', 'message', 'status', 'created_at']:
        assert field in page


def test_vehicle_stats_client_uses_plate_contract():
    api = text('src/services/api.js')
    assert "vehicleStats: plateNumber" in api
    assert "qs({ plateNumber })" in api


def test_admin_dashboard_view_all_uses_admin_route():
    page = text('src/pages/AdminDashboard.jsx')
    assert 'to="/admin/tickets"' in page or "to='/admin/tickets'" in page


def test_project_contract_command_discovers_verify_tests():
    ini = ROOT / 'pytest.ini'
    assert ini.is_file(), 'pytest.ini is required so npm run test:contracts discovers verify_*.py files'
    body = ini.read_text(encoding='utf-8')
    assert 'verify_*.py' in body

def test_ticket_detail_php_restores_base_ticket_remarks_missing_from_live_view():
    php = text('api/src/handlers/tickets.php')
    assert "['remarks']" in php or "['remarks'=>" in php or "remarks']" in php
    assert "supabase_select('tickets'" in php, 'live ticket_details view does not expose remarks; PHP must merge the base tickets.remarks field'

def test_issue_ticket_preserves_reference_gps_location_fallback():
    page = text('src/pages/IssueTicket.jsx')
    assert 'navigator.geolocation' in page
    assert 'getCurrentPosition' in page
    assert 'isSecureContext' in page
    assert 'GPS' in page


def test_ticket_payment_totals_are_enriched_server_side_and_ignore_voided_payments():
    """PHP must enrich RPC ticket rows because live tvtms_ticket_list/detail omit balances."""
    import json, subprocess
    php = ROOT / 'api/src/handlers/tickets.php'
    script = f'''require {json.dumps(str(php))};
$tickets = [["id"=>7,"penalty_amount_at_issue"=>1500,"penalty_amount"=>1200], ["id"=>8,"penalty_amount"=>500]];
$payments = [
 ["ticket_id"=>7,"amount_paid"=>500,"payment_status"=>"partial"],
 ["ticket_id"=>7,"amount_paid"=>1000,"payment_status"=>"voided"],
 ["ticket_id"=>7,"amount_paid"=>250,"payment_status"=>"full"],
 ["ticket_id"=>8,"amount_paid"=>700,"payment_status"=>"full"]
];
echo json_encode(ticket_apply_payment_totals($tickets,$payments));'''
    result = subprocess.run(['php','-r',script], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    rows = json.loads(result.stdout)
    assert rows[0]['total_paid'] == 750
    assert rows[0]['remaining_balance'] == 750
    assert rows[1]['total_paid'] == 700
    assert rows[1]['remaining_balance'] == 0


def test_ticket_list_and_detail_call_payment_enrichment():
    php = text('api/src/handlers/tickets.php')
    assert 'ticket_enrich_payment_totals($tickets)' in php
    assert 'ticket_enrich_payment_totals([$ticket])' in php


def test_payments_page_refreshes_selected_ticket_after_recording_payment():
    page = text('src/pages/Payments.jsx')
    assert 'API.ticket(selected.id)' in page or 'API.ticket(ticketId)' in page


def test_evidence_file_decodes_postgres_hex_and_raw_bytes():
    php = text('api/src/handlers/evidence.php')
    assert "hex2bin" in php
    assert "ctype_xdigit" in php
    assert "file_size" in php
    assert "Content-Type" in php


def test_preserved_landing_keys_have_stable_fallbacks():
    page = text('src/pages/Landing.jsx')
    assert "key={`${x}-${i}`}" in page
    assert "v.id??v.violation_code??v.violation_name??'violation'" in page


def test_vite_proxy_targets_current_v3_php_project():
    config = text('vite.config.js')
    assert 'TVTMS-REACT-UI-RESTORED-SOURCE-v3' in config
    assert 'TVTMS-REACT-PHP-SUPABASE-HOSTINGER-FINAL-CANDIDATE-v2' not in config

def test_vehicle_lookup_preserves_reference_detail_fields_and_registered_date():
    page = text('src/pages/LicensePlateLookup.jsx')
    php = text('api/src/handlers/vehicles.php')
    for marker in ['owner_email', 'owner_address', 'registered_date', 'location', 'penalty_amount']:
        assert marker in page, f'lookup page should preserve reference field: {marker}'
    assert 'created_at' in php and 'registered_date' in php, 'PHP must map vehicles.created_at to registered_date'


def test_owner_or_license_search_results_can_open_full_vehicle_record():
    page = text('src/pages/LicensePlateLookup.jsx')
    assert 'onRowClick' in page
    assert 'loadVehicle' in page
    assert 'API.vehicleLookup' in page and 'API.vehicleStats' in page

def test_reports_page_preserves_reference_lgu_and_operational_report_modes():
    page = text('src/pages/Reports.jsx')
    for marker in ['collections', 'hotspots', 'productivity', 'officer-performance', 'aging', 'barangay']:
        assert marker in page, f'React Reports should expose original report mode: {marker}'
    assert 'API.report' in page
