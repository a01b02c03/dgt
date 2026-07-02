<?php

declare(strict_types=1);

// Copiar a config.php y rellenar con credenciales reales. NUNCA commitear config.php.

define('DB_HOST', 'localhost');
define('DB_NAME', 'drivetest_licenses');
define('DB_USER', 'CHANGE_ME');
define('DB_PASS', 'CHANGE_ME');

define('STRIPE_SECRET_KEY', 'sk_live_CHANGE_ME');
define('STRIPE_WEBHOOK_SECRET', 'whsec_CHANGE_ME');
// Price creado una vez en el Dashboard de Stripe (pago único, no recurrente).
define('STRIPE_PRICE_ID', 'price_CHANGE_ME');

// Dirección fija usada como remitente de los emails de licencia. Nunca usar
// el email del comprador aquí (ver mail.php: previene inyección de cabeceras).
define('MAIL_FROM_ADDRESS', 'no-reply@drive-test.eu');

// URL pública del frontend, usada para construir success_url/cancel_url de Stripe.
define('APP_BASE_URL', 'https://drive-test.eu');
