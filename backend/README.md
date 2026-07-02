# Backend del gate de licencia Pro

PHP 8.4 + MySQL 8 (sin dependencias de Composer), pensado para desplegarse en
hosting compartido tipo Freehostia. Gestiona el pago único de 30 días de acceso
Pro: checkout con Stripe, generación de la clave de licencia, activación
limitada a un dispositivo y validación.

**Alcance deliberado**: el gate protege el frontend (build estático) llamando a
estos endpoints — alguien con conocimientos técnicos podría eludirlo llamando
directamente a las funciones del cliente. Es un límite blando, igual que el
"un dispositivo" (un `deviceId` guardado en `localStorage`, no DRM real). No se
sobre-diseña este backend para impedirlo.

## Estructura

```
backend/
  public/api/     Los 5 endpoints — esta carpeta (y solo esta) va dentro de
                   public_html/ (o la subcarpeta del subdominio).
  private/        NUNCA dentro de public_html — credenciales y librería.
  schema.sql       Esquema de las tablas `licenses` y `rate_limits`.
  tests/run.php    Suite de tests sin dependencias (ver más abajo).
```

## 1. Separación public/private en Freehostia

Freehostia sirve `public_html/` (o `public_html/subdominio/`) directamente por
HTTP. Todo lo que esté ahí es descargable por cualquiera que adivine la URL —
por eso `private/` **no puede vivir dentro de `public_html/`**.

Layout recomendado en el hosting:

```
~/                              (fuera de public_html, no servido por HTTP)
  backend-private/               contenido de backend/private/ tal cual
public_html/
  api/                           contenido de backend/public/api/ tal cual
```

Los `require_once __DIR__ . '/../../private/...'` de los endpoints asumen que
`private/` está exactamente dos niveles por encima de `public/api/` en el
filesystem, igual que en este repo. Si el hosting obliga a otra disposición,
ajustar esas rutas relativas (o mejor, usar una constante de path definida en
un único punto) antes de subir.

Como defensa adicional, `private/.htaccess` ya trae `Deny from all` — así que
aunque `private/` acabase sirviéndose por error dentro de `public_html/`, Apache
seguiría bloqueando el acceso directo (siempre que Freehostia permita
`AllowOverride` para `.htaccess`, que en shared hosting normalmente sí).

## 2. Configuración de PHP en el panel de Freehostia

- Seleccionar **PHP 8.4** para el dominio/subdominio (Freehostia permite elegir
  versión de PHP por sitio).
- Confirmar que las extensiones `pdo_mysql` y `curl` están activas (en shared
  hosting suelen venir activas por defecto, pero conviene comprobarlo en el
  panel — sin `pdo_mysql` `db.php` no conecta, sin `curl` `StripeClient` no
  puede llamar a la API de Stripe).
- Este backend no necesita Composer ni SSH — todo el código es PHP plano.

## 3. Base de datos

1. Crear una base de datos MySQL 8 y un usuario dedicado desde el panel de
   Freehostia (no reutilizar el usuario de otro sitio ya alojado ahí).
2. Importar `schema.sql`:
   ```
   mysql -h <host> -u <usuario> -p <basededatos> < schema.sql
   ```
   (Freehostia normalmente da acceso vía phpMyAdmin si no hay `mysql` CLI
   remoto — importar el archivo desde ahí funciona igual.)

## 4. `private/config.php`

Copiar `private/config.example.php` a `private/config.php` en el servidor y
rellenar con las credenciales reales:

- `DB_HOST` / `DB_NAME` / `DB_USER` / `DB_PASS` — las del paso 3.
- `STRIPE_SECRET_KEY` — clave secreta **live** del Dashboard de Stripe
  (Developers → API keys). Nunca la de test en producción.
- `STRIPE_WEBHOOK_SECRET` — se obtiene en el paso 6, después de crear el
  webhook (no se conoce hasta entonces).
- `STRIPE_PRICE_ID` — ver paso 5.
- `MAIL_FROM_ADDRESS` — dirección del dominio propio (ver paso 7, SPF/DKIM).
- `APP_BASE_URL` — la URL pública real de drive-test.eu, sin barra final.

`config.php` nunca se commitea (está en `.gitignore` de la raíz del repo).

## 5. Configurar el producto en Stripe

En el Dashboard de Stripe (modo live):

1. Crear un **Product** ("drive-test.eu Pro — 30 días") con un **Price** de
   pago único (no recurrente, `type=one_time`).
2. Copiar el `price_id` a `STRIPE_PRICE_ID` en `config.php`.

## 6. Configurar el webhook de Stripe

1. En Dashboard → Developers → Webhooks → Add endpoint.
2. URL: `https://drive-test.eu/api/webhook.php` (ajustar al dominio real).
3. Evento a escuchar: `checkout.session.completed` (no hace falta suscribirse
   a más — `webhook.php` ignora cualquier otro tipo de evento devolviendo 200).
4. Copiar el **Signing secret** (`whsec_...`) del endpoint recién creado a
   `STRIPE_WEBHOOK_SECRET` en `config.php`.

## 7. Email

`sendLicenseEmail()` usa la función `mail()` nativa de PHP (sin SMTP externo,
para no depender de credenciales adicionales). Para que estos correos no caigan
en spam:

- Configurar registros **SPF** y **DKIM** para el dominio `drive-test.eu` desde
  el panel de Freehostia (o el proveedor DNS si el dominio está delegado fuera).
- `MAIL_FROM_ADDRESS` debe ser una dirección del propio dominio (p.ej.
  `no-reply@drive-test.eu`), nunca un dominio distinto al que envía — rompería
  SPF.

Si el email falla o se retrasa, no bloquea nada: la licencia ya quedó creada en
la tabla `licenses` en cuanto el webhook la procesa, y `session-status.php`
sirve de respaldo para que el frontend recupere la clave sin depender del
correo.

## Tests

```
php backend/tests/run.php
```

Runner propio sin dependencias (sin PHPUnit/Composer) — cubre `signature.php`,
`license.php` y `StripeClient` (con la llamada HTTP inyectada, sin red real).
Correr esto antes de cada despliegue.

### Smoke test local de los endpoints

Con una base de datos MySQL/MariaDB local con `schema.sql` importado y
`private/config.php` apuntando a ella:

```
php -S localhost:8000 -t backend/public
```

Y en otra terminal, probar cada endpoint con `curl` (ver ejemplos de payload en
los propios ficheros de `public/api/`). Nota: `checkout.php` con una
`STRIPE_SECRET_KEY` de prueba/placeholder fallará con 502 al intentar
contactar la API real de Stripe — eso es esperado en local; su lógica de éxito
ya está cubierta por el test unitario con la llamada HTTP inyectada.

## Endpoints

| Endpoint | Método | Body/Query | Respuesta |
|---|---|---|---|
| `checkout.php` | POST | `{email}` | `{url, sessionId}` — redirigir al usuario a `url` |
| `webhook.php` | POST | evento crudo de Stripe | `{received: true}` |
| `session-status.php` | GET | `?session_id=...` | `{status: 'pending'\|'complete', licenseKey?}` |
| `activate.php` | POST | `{licenseKey, deviceId}` | `{activated: true, expiresAt}` o 404/409 |
| `validate.php` | POST | `{licenseKey, deviceId}` | `{valid, expiresAt}` |
