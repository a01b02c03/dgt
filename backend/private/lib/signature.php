<?php

declare(strict_types=1);

/**
 * Verifica la cabecera Stripe-Signature: hmac_sha256("{timestamp}.{payload_crudo}", secret),
 * comparación en tiempo constante, comprobando TODOS los valores v1= (Stripe repite la
 * cabecera durante rotación de secreto) y rechazando timestamps con más de $toleranceSeconds
 * de antigüedad (protección contra repetición). $payload debe ser el cuerpo crudo tal cual
 * llegó (php://input), nunca re-serializado tras un json_decode — eso cambia los bytes y
 * rompe la firma.
 */
function verifyStripeSignature(string $payload, string $sigHeader, string $secret, int $toleranceSeconds = 300): bool
{
    $parts = [];
    foreach (explode(',', $sigHeader) as $pair) {
        [$key, $value] = array_pad(explode('=', $pair, 2), 2, null);
        if ($key !== null && $value !== null) {
            $parts[$key][] = $value;
        }
    }

    $timestamp = $parts['t'][0] ?? null;
    $signatures = $parts['v1'] ?? [];

    if ($timestamp === null || !ctype_digit($timestamp) || $signatures === []) {
        return false;
    }

    if (abs(time() - (int) $timestamp) > $toleranceSeconds) {
        return false;
    }

    $expected = hash_hmac('sha256', $timestamp . '.' . $payload, $secret);

    foreach ($signatures as $signature) {
        if (hash_equals($expected, $signature)) {
            return true;
        }
    }

    return false;
}
