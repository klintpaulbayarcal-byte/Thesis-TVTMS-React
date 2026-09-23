<?php
declare(strict_types=1);

function vehicle_registered_date(int $id): ?string
{
    $rows = supabase_select('vehicles', ['id' => 'eq.' . $id], ['select' => 'created_at', 'limit' => 1]);
    return isset($rows[0]['created_at']) ? (string)$rows[0]['created_at'] : null;
}

function vehicles_lookup(array $params = []): never
{
    $u = require_role(['admin', 'apprehending_officer']);
    $plate = normalize_plate($_GET['plate_number'] ?? $_GET['plateNumber'] ?? '');
    if ($plate === '') fail('plate_number is required', 400, 'VALIDATION_ERROR');

    $vehicles = supabase_rpc('tvtms_catalog_vehicle_by_plate', ['p_plate' => $plate]);
    if (!is_array($vehicles) || !$vehicles) fail('Vehicle not found', 404, 'VEHICLE_NOT_FOUND');

    $v = $vehicles[0];
    $history = supabase_rpc('tvtms_catalog_vehicle_violations', ['p_id' => (int)$v['id']]);
    $summary = supabase_rpc('tvtms_catalog_vehicle_stats', ['p_id' => (int)$v['id']]);
    $vehicle = [
        'id' => (int)$v['id'],
        'plate_number' => $v['plate_number'],
        'vehicle_type' => $v['vehicle_type'],
        'owner_name' => $v['owner_name'] ?? null,
        'owner_email' => $v['owner_email'] ?? null,
        'owner_address' => $v['owner_address'] ?? null,
        'driver_license_number' => $v['driver_license_number'] ?? null,
        'status' => 'active',
        'registered_date' => vehicle_registered_date((int)$v['id']),
    ];
    $history = is_array($history) ? $history : [];
    $summary = is_array($summary) ? $summary : [];
    json_response([
        'success' => true,
        'vehicle' => $vehicle,
        'violations' => $history,
        'summary' => $summary,
        'data' => ['vehicle' => $vehicle, 'violations' => $history, 'summary' => $summary],
    ]);
}

function vehicles_get_one(array $params): never
{
    $u = require_role(['admin', 'apprehending_officer']);
    $id = (int)$params['id'];
    $rows = supabase_select('vehicles', ['id' => 'eq.' . $id], [
        'select' => 'id,plate_number,vehicle_type,owner_name,owner_email,owner_address,driver_license_number,created_at',
        'limit' => 1,
    ]);
    if (!$rows) fail('Vehicle not found', 404, 'VEHICLE_NOT_FOUND');
    $v = $rows[0];
    $v['status'] = 'active';
    $v['registered_date'] = $v['created_at'] ?? null;
    unset($v['created_at']);
    json_response(['success' => true, 'vehicle' => $v, 'data' => $v]);
}

function vehicles_list(array $params = []): never
{
    $u = require_role(['admin']);
    $limit = min(max((int)($_GET['limit'] ?? 50), 1), 200);
    $offset = max((int)($_GET['offset'] ?? 0), 0);
    $rows = supabase_select('vehicles', [], [
        'select' => 'id,plate_number,vehicle_type,owner_name,owner_email,driver_license_number,created_at',
        'order' => 'plate_number.asc',
        'limit' => $limit,
        'offset' => $offset,
    ]);
    foreach ($rows as &$r) {
        $r['status'] = 'active';
        $r['registered_date'] = $r['created_at'] ?? null;
        unset($r['created_at']);
    }
    unset($r);
    json_response(['success' => true, 'vehicles' => $rows, 'limit' => $limit, 'offset' => $offset, 'data' => $rows]);
}

function vehicles_search(array $params = []): never
{
    $u = require_role(['admin', 'apprehending_officer']);
    $query = trim((string)($_GET['query'] ?? ''));
    $owner = trim((string)($_GET['owner_name'] ?? ''));
    $license = strtoupper(trim((string)($_GET['license_number'] ?? '')));
    $type = (string)($_GET['type'] ?? 'all');
    if ($query === '' && $owner === '' && $license === '') fail('Provide query, owner_name, or license_number parameter', 400, 'VALIDATION_ERROR');
    if ($license === '' && strlen($owner !== '' ? $owner : $query) < 2) fail($owner !== '' ? 'Name must be at least 2 characters' : 'Search query must be at least 2 characters', 400, 'VALIDATION_ERROR');

    $rows = supabase_rpc('tvtms_catalog_search_vehicles', [
        'p_license' => $license ?: null,
        'p_owner' => $owner ?: null,
        'p_query' => $query ?: null,
        'p_type' => $type,
    ]);
    $items = [];
    foreach ((is_array($rows) ? $rows : []) as $v) {
        $v['status'] = 'active';
        $v['violation_count'] = (int)($v['violation_count'] ?? 0);
        $v['has_multiple_plate_tickets'] = $v['violation_count'] >= 2;
        $items[] = $v;
    }
    json_response(['success' => true, 'vehicles' => $items, 'count' => count($items), 'data' => $items]);
}

function vehicles_stats(array $params = []): never
{
    $u = require_role(['admin', 'apprehending_officer']);
    $plate = normalize_plate($_GET['plate_number'] ?? $_GET['plateNumber'] ?? '');
    if ($plate === '') fail('plate_number is required', 400, 'VALIDATION_ERROR');
    $vehicles = supabase_rpc('tvtms_catalog_vehicle_by_plate', ['p_plate' => $plate]);
    if (!is_array($vehicles) || !$vehicles) fail('Vehicle not found', 404, 'VEHICLE_NOT_FOUND');
    $s = supabase_rpc('tvtms_catalog_vehicle_stats', ['p_id' => (int)$vehicles[0]['id']]);
    $stats = [
        'total_violations' => (int)($s['total_violations'] ?? 0),
        'historical_ticket_count' => (int)($s['historical_ticket_count'] ?? $s['total_violations'] ?? 0),
        'non_cancelled_ticket_count' => (int)($s['non_cancelled_ticket_count'] ?? $s['total_violations'] ?? 0),
        'paid_count' => (int)($s['paid_count'] ?? 0),
        'unpaid_count' => (int)($s['unpaid_count'] ?? 0),
        'cancelled_count' => (int)($s['cancelled_count'] ?? 0),
        'disputed_count' => (int)($s['disputed_count'] ?? 0),
        'outstanding_balance' => (float)($s['outstanding_balance'] ?? 0),
        'next_plate_ticket_count' => (int)($s['next_plate_ticket_count'] ?? 1),
    ];
    json_response(['success' => true, 'stats' => $stats, 'data' => $stats]);
}
