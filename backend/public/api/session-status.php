<?php

declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/../../private/db.php';

requireMethod('GET');

$sessionId = is_string($_GET['session_id'] ?? null) ? trim($_GET['session_id']) : '';
if ($sessionId === '') {
    errorJson('session_id requerido', 422);
}

$pdo = createDbConnection();
$stmt = $pdo->prepare('SELECT license_key FROM licenses WHERE stripe_checkout_session_id = :session_id');
$stmt->execute([':session_id' => $sessionId]);
$row = $stmt->fetch();

if ($row === false) {
    // Compra todavía no procesada por el webhook (o session_id inexistente) —
    // el frontend sigue haciendo polling con este mismo endpoint.
    respondJson(['status' => 'pending']);
}

respondJson(['status' => 'complete', 'licenseKey' => $row['license_key']]);
