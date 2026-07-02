<?php

declare(strict_types=1);

/**
 * Límite simple de peticiones por bucket (p.ej. "activate:<ip>") en una ventana
 * de $windowSeconds. Sin cron: la poda de filas viejas ocurre de forma
 * perezosa en cada llamada, antes de contar. Sin esto, la entropía de
 * generateLicenseKey() no protege nada — activate.php sería un oráculo de
 * fuerza bruta sin límite de intentos.
 */
function checkRateLimit(PDO $pdo, string $bucket, int $maxAttempts, int $windowSeconds): bool
{
    $pdo->prepare('DELETE FROM rate_limits WHERE window_start < :cutoff')
        ->execute([':cutoff' => gmdate('Y-m-d H:i:s', time() - $windowSeconds)]);

    $windowStart = gmdate('Y-m-d H:i:s', intdiv(time(), $windowSeconds) * $windowSeconds);

    $stmt = $pdo->prepare(
        'INSERT INTO rate_limits (bucket, window_start, count) VALUES (:bucket, :window_start, 1)
         ON DUPLICATE KEY UPDATE count = count + 1',
    );
    $stmt->execute([':bucket' => $bucket, ':window_start' => $windowStart]);

    $countStmt = $pdo->prepare(
        'SELECT count FROM rate_limits WHERE bucket = :bucket AND window_start = :window_start',
    );
    $countStmt->execute([':bucket' => $bucket, ':window_start' => $windowStart]);
    $count = (int) $countStmt->fetchColumn();

    return $count <= $maxAttempts;
}
