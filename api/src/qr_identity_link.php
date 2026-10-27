<?php
declare(strict_types=1);

/**
 * Signed QR links authorize a read of the printed citation's name fields only.
 * Ticket numbers alone and plate searches never authorize full identity.
 * Anyone with a copy of a signed QR can see the names, so the QR must be treated
 * as a confidential bearer link and shared only with the citation holder.
 */
function ticket_qr_sign(string $ticketNumber): string
{
    $secret=(string)(app_config()['token_secret']??'');
    if(strlen($secret)<32 || str_contains($secret,'CHANGE_THIS')) {
        throw new RuntimeException('Secure QR links are not configured.');
    }
    return hash_hmac('sha256','tvtms-qr-identity-v1|'.strtoupper(trim($ticketNumber)),$secret);
}

function ticket_qr_authorized(string $ticketNumber, mixed $supplied): bool
{
    return is_string($supplied)
      && preg_match('/^[0-9a-f]{64}$/D',$supplied)===1
      && hash_equals(ticket_qr_sign($ticketNumber),$supplied);
}

function ticket_qr_url(string $ticketNumber): string
{
    $base=rtrim((string)(app_config()['app_public_url']??'https://trafficviolation.dcsbisu.com'),'/');
    return $base.'/ticket-lookup?ticket='.rawurlencode($ticketNumber).'&qr='.ticket_qr_sign($ticketNumber);
}
