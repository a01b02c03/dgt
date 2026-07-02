<?php

declare(strict_types=1);

// Alfabeto Crockford base32: excluye I, L, O, U para que una clave transcrita
// a mano (desde el email) no sea ambigua.
const LICENSE_KEY_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Clave de licencia de 80 bits (random_bytes, CSPRNG — nunca rand()/mt_rand()),
 * formateada como XXXX-XXXX-XXXX-XXXX. 80 bits = 16 grupos de 5 bits exactos,
 * sin relleno. La entropía por sí sola no basta contra fuerza bruta si
 * activate.php no está limitado por tasa — ver rate-limit.php.
 */
function generateLicenseKey(): string
{
    $bytes = random_bytes(10);

    $bits = '';
    foreach (str_split($bytes) as $byte) {
        $bits .= str_pad(decbin(ord($byte)), 8, '0', STR_PAD_LEFT);
    }

    $chars = '';
    foreach (str_split($bits, 5) as $group) {
        $chars .= LICENSE_KEY_ALPHABET[bindec($group)];
    }

    return implode('-', str_split($chars, 4));
}
