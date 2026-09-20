<?php
declare(strict_types=1);

function api_routes(): array
{
    return [
        ['GET', '#^/api/health/?$#', 'health'],

        ['POST', '#^/api/auth/login/?$#', 'auth_login'],
        ['POST', '#^/api/auth/request-password-reset/?$#', 'auth_request_password_reset'],
        ['POST', '#^/api/auth/reset-password/?$#', 'auth_reset_password'],
        ['POST', '#^/api/auth/logout/?$#', 'auth_logout'],
        ['GET', '#^/api/auth/profile/?$#', 'auth_profile'],

        ['PUT', '#^/api/users/me/?$#', 'users_update_me'],
        ['POST', '#^/api/users/change-password/?$#', 'users_change_password'],
        ['GET', '#^/api/users/audit-logs/?$#', 'users_audit_logs'],
        ['DELETE', '#^/api/users/audit-logs/clear/?$#', 'users_clear_audit_logs'],
        ['POST', '#^/api/users/(?P<id>\d+)/unlock/?$#', 'users_unlock'],
        ['GET', '#^/api/users/(?P<id>\d+)/?$#', 'users_get_one'],
        ['PUT', '#^/api/users/(?P<id>\d+)/?$#', 'users_update'],
        ['DELETE', '#^/api/users/(?P<id>\d+)/?$#', 'users_delete'],
        ['GET', '#^/api/users/?$#', 'users_list'],
        ['POST', '#^/api/users/?$#', 'users_create'],

        ['GET', '#^/api/violations/active/?$#', 'violations_active'],
        ['GET', '#^/api/violations/(?P<id>\d+)/penalty-preview/?$#', 'violations_penalty_preview'],
        ['GET', '#^/api/violations/(?P<id>\d+)/?$#', 'violations_get_one'],
        ['PUT', '#^/api/violations/(?P<id>\d+)/?$#', 'violations_update'],
        ['DELETE', '#^/api/violations/(?P<id>\d+)/?$#', 'violations_delete'],
        ['GET', '#^/api/violations/?$#', 'violations_list'],
        ['POST', '#^/api/violations/?$#', 'violations_create'],

        ['GET', '#^/api/tickets/stats/?$#', 'tickets_stats'],
        ['GET', '#^/api/tickets/search/?$#', 'tickets_search'],
        ['POST', '#^/api/tickets/(?P<id>\d+)/notification/retry/?$#', 'tickets_retry_notification'],
        ['PUT', '#^/api/tickets/(?P<id>\d+)/details/?$#', 'tickets_update_details'],
        ['PUT', '#^/api/tickets/(?P<id>\d+)/mark-unpaid/?$#', 'tickets_mark_unpaid'],
        ['DELETE', '#^/api/tickets/(?P<id>\d+)/permanent/?$#', 'tickets_permanent_delete'],
        ['GET', '#^/api/tickets/(?P<id>\d+)/?$#', 'tickets_get_one'],
        ['PUT', '#^/api/tickets/(?P<id>\d+)/?$#', 'tickets_update_status'],
        ['DELETE', '#^/api/tickets/(?P<id>\d+)/?$#', 'tickets_cancel'],
        ['GET', '#^/api/tickets/?$#', 'tickets_list'],
        ['POST', '#^/api/tickets/?$#', 'tickets_create'],

        ['GET', '#^/api/payments/ticket/(?P<ticketId>\d+)/?$#', 'payments_by_ticket'],
        ['POST', '#^/api/payments/?$#', 'payments_record'],

        ['PUT', '#^/api/disputes/(?P<id>\d+)/resolve/?$#', 'disputes_resolve'],
        ['GET', '#^/api/disputes/?$#', 'disputes_list'],
        ['POST', '#^/api/disputes/?$#', 'disputes_create'],

        ['GET', '#^/api/evidence/ticket/(?P<ticketId>\d+)/?$#', 'evidence_by_ticket'],
        ['POST', '#^/api/evidence/ticket/(?P<ticketId>\d+)/?$#', 'evidence_upload'],
        ['GET', '#^/api/evidence/(?P<id>\d+)/file/?$#', 'evidence_file'],

        ['PUT', '#^/api/notifications/(?P<id>\d+)/read/?$#', 'notifications_read'],
        ['DELETE', '#^/api/notifications/bulk/?$#', 'notifications_bulk_delete'],
        ['DELETE', '#^/api/notifications/(?P<id>\d+)/?$#', 'notifications_delete'],
        ['GET', '#^/api/notifications/?$#', 'notifications_list'],
        ['DELETE', '#^/api/notifications/?$#', 'notifications_delete_all'],

        ['GET', '#^/api/contact-messages/(?P<id>\d+)/?$#', 'contact_messages_get_one'],

        ['GET', '#^/api/reports/export/pdf/?$#', 'reports_export'],
        ['GET', '#^/api/reports/analytics/collections/?$#', 'reports_analytics_collections'],
        ['GET', '#^/api/reports/analytics/payment-status/?$#', 'reports_analytics_payment_status'],
        ['GET', '#^/api/reports/analytics/tickets-summary/?$#', 'reports_analytics_tickets_summary'],
        ['GET', '#^/api/reports/analytics/dispute-rate/?$#', 'reports_analytics_dispute_rate'],
        ['GET', '#^/api/reports/analytics/monthly-revenue/?$#', 'reports_analytics_monthly_revenue'],
        ['GET', '#^/api/reports/daily/?$#', 'reports_daily'],
        ['GET', '#^/api/reports/monthly/?$#', 'reports_monthly'],
        ['GET', '#^/api/reports/yearly/?$#', 'reports_yearly'],
        ['GET', '#^/api/reports/custom/?$#', 'reports_custom'],
        ['GET', '#^/api/reports/violations/?$#', 'reports_violations'],
        ['GET', '#^/api/reports/officers/?$#', 'reports_officers'],
        ['GET', '#^/api/reports/collections/?$#', 'reports_collections'],
        ['GET', '#^/api/reports/hotspots/?$#', 'reports_hotspots'],
        ['GET', '#^/api/reports/productivity/?$#', 'reports_productivity'],
        ['GET', '#^/api/reports/officer-performance/?$#', 'reports_officer_performance'],
        ['GET', '#^/api/reports/aging/?$#', 'reports_aging'],
        ['GET', '#^/api/reports/barangay/?$#', 'reports_barangay'],

        ['PUT', '#^/api/system/settings/bulk/update/?$#', 'settings_bulk_update'],
        ['GET', '#^/api/system/settings/(?P<key>[A-Za-z0-9_.-]+)/?$#', 'settings_get_one'],
        ['GET', '#^/api/system/settings/?$#', 'settings_list'],
        ['PUT', '#^/api/system/settings/?$#', 'settings_update'],

        ['GET', '#^/api/vehicles/lookup/?$#', 'vehicles_lookup'],
        ['GET', '#^/api/vehicles/stats/?$#', 'vehicles_stats'],
        ['GET', '#^/api/vehicles/search/?$#', 'vehicles_search'],
        ['GET', '#^/api/vehicles/(?P<id>\d+)/?$#', 'vehicles_get_one'],
        ['GET', '#^/api/vehicles/?$#', 'vehicles_list'],

        ['GET', '#^/api/public/stats/?$#', 'public_stats'],
        ['GET', '#^/api/public/violations/?$#', 'public_violations'],
        ['GET', '#^/api/public/ticket-lookup/?$#', 'public_ticket_lookup'],
        ['GET', '#^/api/public/vehicle-lookup/?$#', 'public_vehicle_lookup'],
        ['GET', '#^/api/public/plate-summary/?$#', 'public_plate_summary'],
        ['POST', '#^/api/public/dispute/?$#', 'public_dispute'],
        ['POST', '#^/api/public/contact/?$#', 'public_contact'],
    ];
}

function normalize_api_path(string $path): string
{
    $path = parse_url($path, PHP_URL_PATH) ?: '/';
    $apiPos = strpos($path, '/api');
    if ($apiPos !== false) {
        $path = substr($path, $apiPos);
    }
    $normalized = '/' . ltrim($path, '/');
    if ($normalized !== '/') {
        $normalized = rtrim($normalized, '/');
    }
    return $normalized === '' ? '/' : $normalized;
}

function resolve_route(string $method, string $path): ?array
{
    $method = strtoupper($method);
    $path = normalize_api_path($path);
    foreach (api_routes() as [$routeMethod, $pattern, $handler]) {
        if ($routeMethod !== $method) {
            continue;
        }
        if (preg_match($pattern, $path, $matches) === 1) {
            $params = [];
            foreach ($matches as $key => $value) {
                if (is_string($key)) {
                    $params[$key] = $value;
                }
            }
            return ['handler' => $handler, 'params' => $params, 'path' => $path];
        }
    }
    return null;
}
