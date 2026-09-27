<?php
declare(strict_types=1);

function contact_messages_get_one(array $params = []): never
{
    require_role(['admin']);
    $id = (int)($params['id'] ?? 0);
    if ($id <= 0) fail('Contact message not found.', 404, 'CONTACT_MESSAGE_NOT_FOUND');

    $rows = supabase_select('contact_messages', ['id' => 'eq.' . $id], [
        'select' => 'id,full_name,email,subject,message,status,created_at',
        'limit' => 1,
    ]);
    if (!$rows) fail('Contact message not found.', 404, 'CONTACT_MESSAGE_NOT_FOUND');
    // Preserve the shared API contract: message is human-readable; data is the record.
    json_response(['success' => true, 'message' => 'Contact message fetched successfully.', 'data' => $rows[0]]);
}