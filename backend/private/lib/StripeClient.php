<?php

declare(strict_types=1);

/**
 * Cliente mínimo para la API REST de Stripe vía cURL — deliberadamente sin el
 * SDK oficial (stripe-php), que requiere Composer y no está garantizado en
 * hosting compartido tipo Freehostia. La llamada HTTP es inyectable como
 * callable para poder testear sin red real (ver tests/run.php).
 */
final class StripeClient
{
    /** @var callable(string, string, array<string>, ?string): array{status:int, body:string} */
    private $httpCall;

    public function __construct(
        private readonly string $secretKey,
        ?callable $httpCall = null,
    ) {
        $this->httpCall = $httpCall ?? self::curlCall(...);
    }

    /**
     * @param array<string> $headers
     * @return array{status:int, body:string}
     */
    public static function curlCall(string $method, string $url, array $headers, ?string $body): array
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_RETURNTRANSFER => true,
            // Bundle propio en vez de fiarse del bundle del sistema del hosting
            // (puede estar desactualizado) — y nunca desactivar la verificación
            // como "arreglo" si hay un error de certificado.
            CURLOPT_CAINFO => __DIR__ . '/cacert.pem',
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);

        $responseBody = curl_exec($ch);
        if ($responseBody === false) {
            $error = curl_error($ch);
            curl_close($ch);
            throw new RuntimeException('Stripe cURL error: ' . $error);
        }

        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        return ['status' => $status, 'body' => (string) $responseBody];
    }

    /**
     * Crea una Checkout Session de pago único (mode=payment) para el Price ya
     * definido en el Dashboard de Stripe (STRIPE_PRICE_ID), devuelve el array
     * decodificado de la respuesta de Stripe (incluye 'id' y 'url').
     *
     * @return array<string, mixed>
     */
    public function createCheckoutSession(string $priceId, string $customerEmail, string $successUrl, string $cancelUrl): array
    {
        $params = http_build_query([
            'mode' => 'payment',
            'customer_email' => $customerEmail,
            'success_url' => $successUrl,
            'cancel_url' => $cancelUrl,
            'line_items[0][price]' => $priceId,
            'line_items[0][quantity]' => 1,
        ]);

        return $this->post('checkout/sessions', $params);
    }

    /** @return array<string, mixed> */
    public function retrieveCheckoutSession(string $sessionId): array
    {
        $resp = ($this->httpCall)(
            'GET',
            'https://api.stripe.com/v1/checkout/sessions/' . rawurlencode($sessionId),
            $this->authHeaders(),
            null,
        );

        return $this->decodeOrThrow($resp);
    }

    /** @return array<string, mixed> */
    private function post(string $path, string $formEncodedBody): array
    {
        $resp = ($this->httpCall)(
            'POST',
            'https://api.stripe.com/v1/' . $path,
            [...$this->authHeaders(), 'Content-Type: application/x-www-form-urlencoded'],
            $formEncodedBody,
        );

        return $this->decodeOrThrow($resp);
    }

    /** @return array<string> */
    private function authHeaders(): array
    {
        return ['Authorization: Bearer ' . $this->secretKey];
    }

    /**
     * @param array{status:int, body:string} $resp
     * @return array<string, mixed>
     */
    private function decodeOrThrow(array $resp): array
    {
        if ($resp['status'] >= 300) {
            throw new RuntimeException('Stripe API error (HTTP ' . $resp['status'] . '): ' . $resp['body']);
        }

        return json_decode($resp['body'], true, 512, JSON_THROW_ON_ERROR);
    }
}
