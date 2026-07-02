<?php

declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/../../private/db.php';
require_once __DIR__ . '/../../private/lib/StripeClient.php';
require_once __DIR__ . '/../../private/lib/rate-limit.php';

requireMethod('POST');

$input = jsonInput();
$email = is_string($input['email'] ?? null) ? trim($input['email']) : '';

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    errorJson('email inválido', 422);
}

$pdo = createDbConnection();

if (!checkRateLimit($pdo, 'checkout:' . clientIp(), 10, 300)) {
    errorJson('demasiadas solicitudes, inténtalo de nuevo en unos minutos', 429);
}

$stripe = new StripeClient(STRIPE_SECRET_KEY);

try {
    $session = $stripe->createCheckoutSession(
        STRIPE_PRICE_ID,
        $email,
        APP_BASE_URL . '/pro/success?session_id={CHECKOUT_SESSION_ID}',
        APP_BASE_URL . '/pro/cancel',
    );
} catch (RuntimeException) {
    errorJson('no se pudo iniciar el pago, inténtalo de nuevo', 502);
}

respondJson(['url' => $session['url'] ?? null, 'sessionId' => $session['id'] ?? null]);
