<?php

declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/../../private/db.php';
require_once __DIR__ . '/../../private/lib/rate-limit.php';

requireMethod('POST');

$input = jsonInput();
$licenseKey = is_string($input['licenseKey'] ?? null) ? trim($input['licenseKey']) : '';
$deviceId = is_string($input['deviceId'] ?? null) ? trim($input['deviceId']) : '';

if ($licenseKey === '' || $deviceId === '') {
    errorJson('licenseKey y deviceId son obligatorios', 422);
}

$pdo = createDbConnection();

if (!checkRateLimit($pdo, 'validate:' . clientIp(), 30, 300)) {
    errorJson('demasiados intentos, inténtalo de nuevo en unos minutos', 429);
}

$stmt = $pdo->prepare(
    'SELECT expires_at FROM licenses WHERE license_key = :license_key AND device_id = :device_id',
);
$stmt->execute([':license_key' => $licenseKey, ':device_id' => $deviceId]);
$row = $stmt->fetch();

if ($row === false) {
    respondJson(['valid' => false, 'expiresAt' => null]);
}

$expiresAt = $row['expires_at'];
$isValid = $expiresAt !== null && strtotime((string) $expiresAt) > time();

respondJson(['valid' => $isValid, 'expiresAt' => $expiresAt]);
