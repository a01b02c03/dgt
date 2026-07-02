<?php

declare(strict_types=1);

/**
 * Envía la clave de licencia por email. El único dato externo que llega a esta
 * función es $toEmail; se valida estrictamente y se rechaza cualquier \r\n
 * (inyección de cabeceras clásica de mail()). El remitente es siempre la
 * constante MAIL_FROM_ADDRESS de config.php, nunca un valor de usuario —
 * validar solo el destinatario no basta si el remitente se contamina.
 */
function sendLicenseEmail(string $toEmail, string $licenseKey): bool
{
    if (!filter_var($toEmail, FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n]/', $toEmail) === 1) {
        throw new InvalidArgumentException('destinatario de email inválido');
    }

    $subject = mb_encode_mimeheader('Tu licencia drive-test.eu Pro', 'UTF-8');
    $body = "Gracias por tu compra.\n\n"
        . "Tu clave de licencia:\n\n{$licenseKey}\n\n"
        . "Actívala en drive-test.eu — válida 30 días desde la activación, en un solo dispositivo.\n";
    $headers = 'From: drive-test.eu <' . MAIL_FROM_ADDRESS . ">\r\n"
        . "Content-Type: text/plain; charset=UTF-8\r\n";

    return mail($toEmail, $subject, $body, $headers);
}
