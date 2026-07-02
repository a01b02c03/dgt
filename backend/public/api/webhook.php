<?php

declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/../../private/db.php';
require_once __DIR__ . '/../../private/lib/signature.php';
require_once __DIR__ . '/../../private/lib/license.php';
require_once __DIR__ . '/../../private/lib/mail.php';

requireMethod('POST');

// Cuerpo crudo tal cual llegó — nunca re-serializar tras json_decode, eso
// cambia los bytes y rompe la verificación de firma.
$payload = file_get_contents('php://input') ?: '';
$sigHeader = is_string($_SERVER['HTTP_STRIPE_SIGNATURE'] ?? null) ? $_SERVER['HTTP_STRIPE_SIGNATURE'] : '';

if (!verifyStripeSignature($payload, $sigHeader, STRIPE_WEBHOOK_SECRET)) {
    errorJson('firma inválida', 400);
}

$event = json_decode($payload, true);
if (!is_array($event)) {
    errorJson('payload inválido', 400);
}

if (($event['type'] ?? null) !== 'checkout.session.completed') {
    // Otros tipos de evento: confirmamos recepción sin actuar, para que Stripe no reintente.
    respondJson(['received' => true]);
}

$session = is_array($event['data'] ?? null) ? ($event['data']['object'] ?? null) : null;
$sessionId = is_array($session) ? ($session['id'] ?? null) : null;
$email = is_array($session)
    ? ($session['customer_email'] ?? $session['customer_details']['email'] ?? null)
    : null;

if (!is_string($sessionId) || !is_string($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    errorJson('evento sin los datos esperados', 400);
}

$pdo = createDbConnection();
$licenseKey = generateLicenseKey();

try {
    $stmt = $pdo->prepare(
        'INSERT INTO licenses (license_key, email, stripe_checkout_session_id)
         VALUES (:license_key, :email, :session_id)',
    );
    $stmt->execute([':license_key' => $licenseKey, ':email' => $email, ':session_id' => $sessionId]);
} catch (PDOException $e) {
    if ($e->getCode() === '23000') {
        // Entrega duplicada del mismo evento (Stripe reintenta) — ya se procesó, respondemos
        // 200 sin recrear nada para que Stripe deje de reintentar.
        respondJson(['received' => true]);
    }
    throw $e;
}

try {
    sendLicenseEmail($email, $licenseKey);
} catch (Throwable) {
    // Best-effort: la fila en `licenses` ya es la fuente de verdad, un fallo de mail()
    // no debe impedir que la licencia quede creada. session-status.php es el respaldo.
}

respondJson(['received' => true]);
