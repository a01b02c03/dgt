<?php

declare(strict_types=1);

/**
 * Runner de tests sin dependencias (sin PHPUnit/Composer) — Freehostia no
 * garantiza Composer, y para este backend pequeño no compensa el coste de
 * introducir una dependencia solo para desarrollo local.
 */

require_once __DIR__ . '/../private/lib/signature.php';
require_once __DIR__ . '/../private/lib/license.php';
require_once __DIR__ . '/../private/lib/StripeClient.php';

$failures = 0;
$count = 0;

function check(string $name, callable $fn): void
{
    global $failures, $count;
    $count++;
    try {
        $fn();
        echo "  ok  {$name}\n";
    } catch (Throwable $e) {
        $failures++;
        echo "FAIL  {$name}\n";
        echo '      ' . $e->getMessage() . "\n";
    }
}

function assertTrue(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function assertSame(mixed $expected, mixed $actual, string $message): void
{
    if ($expected !== $actual) {
        $exp = var_export($expected, true);
        $act = var_export($actual, true);
        throw new RuntimeException("{$message} (esperado {$exp}, obtenido {$act})");
    }
}

// --- signature.php ---------------------------------------------------------

echo "signature.php\n";

check('acepta una firma válida', function (): void {
    $secret = 'whsec_test';
    $payload = '{"id":"evt_1"}';
    $timestamp = time();
    $sig = hash_hmac('sha256', $timestamp . '.' . $payload, $secret);
    $header = "t={$timestamp},v1={$sig}";

    assertTrue(verifyStripeSignature($payload, $header, $secret), 'la firma válida debería aceptarse');
});

check('rechaza una firma incorrecta', function (): void {
    $secret = 'whsec_test';
    $payload = '{"id":"evt_1"}';
    $timestamp = time();
    $header = "t={$timestamp},v1=" . str_repeat('0', 64);

    assertTrue(!verifyStripeSignature($payload, $header, $secret), 'la firma inválida debería rechazarse');
});

check('rechaza si el payload fue alterado', function (): void {
    $secret = 'whsec_test';
    $timestamp = time();
    $sig = hash_hmac('sha256', $timestamp . '.' . '{"id":"evt_1"}', $secret);
    $header = "t={$timestamp},v1={$sig}";

    assertTrue(!verifyStripeSignature('{"id":"evt_2"}', $header, $secret), 'el payload alterado debería rechazarse');
});

check('rechaza timestamp fuera de tolerancia (replay)', function (): void {
    $secret = 'whsec_test';
    $payload = '{"id":"evt_1"}';
    $timestamp = time() - 600; // 10 minutos, tolerancia por defecto es 300s
    $sig = hash_hmac('sha256', $timestamp . '.' . $payload, $secret);
    $header = "t={$timestamp},v1={$sig}";

    assertTrue(!verifyStripeSignature($payload, $header, $secret), 'un timestamp de hace 10 min debería rechazarse');
});

check('acepta si alguna de varias firmas v1= coincide (rotación de secreto)', function (): void {
    $secret = 'whsec_test';
    $payload = '{"id":"evt_1"}';
    $timestamp = time();
    $sig = hash_hmac('sha256', $timestamp . '.' . $payload, $secret);
    $header = "t={$timestamp},v1=" . str_repeat('f', 64) . ",v1={$sig}";

    assertTrue(verifyStripeSignature($payload, $header, $secret), 'debería aceptar si cualquier v1= coincide');
});

check('rechaza cabecera malformada', function (): void {
    assertTrue(!verifyStripeSignature('{}', 'esto-no-es-una-cabecera-valida', 'whsec_test'), 'cabecera malformada debería rechazarse');
});

// --- license.php -------------------------------------------------------

echo "license.php\n";

check('genera claves con el formato XXXX-XXXX-XXXX-XXXX', function (): void {
    $key = generateLicenseKey();
    assertTrue(
        preg_match('/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/', $key) === 1,
        "la clave '{$key}' no tiene el formato esperado",
    );
});

check('no usa caracteres ambiguos (I, L, O, U)', function (): void {
    for ($i = 0; $i < 200; $i++) {
        $key = generateLicenseKey();
        assertTrue(preg_match('/[ILOU]/', $key) === 0, "la clave '{$key}' contiene un carácter ambiguo");
    }
});

check('genera claves únicas en 2000 generaciones', function (): void {
    $seen = [];
    for ($i = 0; $i < 2000; $i++) {
        $seen[generateLicenseKey()] = true;
    }
    assertSame(2000, count($seen), 'se esperaban 2000 claves únicas');
});

// --- StripeClient --------------------------------------------------------

echo "StripeClient\n";

check('createCheckoutSession llama a POST checkout/sessions y decodifica la respuesta', function (): void {
    $calls = [];
    $fake = function (string $method, string $url, array $headers, ?string $body) use (&$calls): array {
        $calls[] = ['method' => $method, 'url' => $url, 'headers' => $headers, 'body' => $body];
        return ['status' => 200, 'body' => json_encode(['id' => 'cs_test_123', 'url' => 'https://checkout.stripe.com/x'])];
    };

    $client = new StripeClient('sk_test_dummy', $fake);
    $result = $client->createCheckoutSession('price_123', 'user@example.com', 'https://x/ok', 'https://x/cancel');

    assertSame(1, count($calls), 'se esperaba exactamente una llamada HTTP');
    assertSame('POST', $calls[0]['method'], 'método incorrecto');
    assertSame('https://api.stripe.com/v1/checkout/sessions', $calls[0]['url'], 'URL incorrecta');
    assertTrue(str_contains($calls[0]['body'] ?? '', 'customer_email=user%40example.com'), 'el body debería incluir el email codificado');
    assertTrue(str_contains($calls[0]['body'] ?? '', 'mode=payment'), 'el body debería fijar mode=payment');
    assertSame('cs_test_123', $result['id'], 'debería devolver el id decodificado');
});

check('retrieveCheckoutSession llama a GET con el id en la URL', function (): void {
    $calls = [];
    $fake = function (string $method, string $url, array $headers, ?string $body) use (&$calls): array {
        $calls[] = ['method' => $method, 'url' => $url];
        return ['status' => 200, 'body' => json_encode(['id' => 'cs_test_123', 'payment_status' => 'paid'])];
    };

    $client = new StripeClient('sk_test_dummy', $fake);
    $result = $client->retrieveCheckoutSession('cs_test_123');

    assertSame('GET', $calls[0]['method'], 'método incorrecto');
    assertSame('https://api.stripe.com/v1/checkout/sessions/cs_test_123', $calls[0]['url'], 'URL incorrecta');
    assertSame('paid', $result['payment_status'], 'debería devolver el payment_status decodificado');
});

check('lanza RuntimeException si Stripe responde con error', function (): void {
    $fake = fn (string $method, string $url, array $headers, ?string $body): array
        => ['status' => 402, 'body' => json_encode(['error' => ['message' => 'tarjeta rechazada']])];

    $client = new StripeClient('sk_test_dummy', $fake);

    $threw = false;
    try {
        $client->retrieveCheckoutSession('cs_test_fail');
    } catch (RuntimeException) {
        $threw = true;
    }
    assertTrue($threw, 'debería lanzar RuntimeException en respuestas de error');
});

// --- resumen ---------------------------------------------------------------

echo "\n{$count} tests, " . ($count - $failures) . " ok, {$failures} fallidos\n";

exit($failures > 0 ? 1 : 0);
