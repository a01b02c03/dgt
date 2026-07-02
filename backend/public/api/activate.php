<?php

declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/../../private/db.php';
require_once __DIR__ . '/../../private/lib/rate-limit.php';

/** @return array<string, mixed>|null */
function fetchLicenseByKey(PDO $pdo, string $licenseKey): ?array
{
    $stmt = $pdo->prepare('SELECT device_id, expires_at FROM licenses WHERE license_key = :license_key');
    $stmt->execute([':license_key' => $licenseKey]);
    $row = $stmt->fetch();

    return $row === false ? null : $row;
}

requireMethod('POST');

$input = jsonInput();
$licenseKey = is_string($input['licenseKey'] ?? null) ? trim($input['licenseKey']) : '';
$deviceId = is_string($input['deviceId'] ?? null) ? trim($input['deviceId']) : '';

if ($licenseKey === '' || $deviceId === '') {
    errorJson('licenseKey y deviceId son obligatorios', 422);
}

$pdo = createDbConnection();

// La entropía de 80 bits de la clave no protege nada si esta ruta no está
// limitada por tasa — ver rate-limit.php.
if (!checkRateLimit($pdo, 'activate:' . clientIp(), 20, 300)) {
    errorJson('demasiados intentos, inténtalo de nuevo en unos minutos', 429);
}

// UPDATE atómico: evita condición de carrera entre dos activaciones simultáneas de la
// misma clave. Idempotente si ya estaba vinculada a este mismo deviceId (reconfirmación).
$stmt = $pdo->prepare(
    'UPDATE licenses
     SET device_id = :device_id,
         activated_at = COALESCE(activated_at, NOW()),
         expires_at = COALESCE(expires_at, DATE_ADD(NOW(), INTERVAL 30 DAY))
     WHERE license_key = :license_key AND (device_id IS NULL OR device_id = :device_id_check)',
);
$stmt->execute([
    ':device_id' => $deviceId,
    ':license_key' => $licenseKey,
    ':device_id_check' => $deviceId,
]);

if ($stmt->rowCount() === 1) {
    $row = fetchLicenseByKey($pdo, $licenseKey);
    respondJson(['activated' => true, 'expiresAt' => $row['expires_at'] ?? null]);
}

// El UPDATE no afectó filas: la parte de seguridad ya quedó resuelta de forma atómica
// arriba, esta SELECT de solo lectura solo decide el mensaje de error.
$existing = fetchLicenseByKey($pdo, $licenseKey);
if ($existing === null) {
    errorJson('clave de licencia no encontrada', 404);
}

errorJson('esta licencia ya está activada en otro dispositivo', 409);
