# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

drive-test.eu: simulador de examen de conducción DGT en el navegador, con calles y señalización
reales de Barcelona. Producto en fase inicial. Alcance de la versión gratuita: **una sola ruta**
(`ruta-01`, Eixample). La infraestructura del gate de licencia Pro ya está construida (backend
PHP/MySQL/Stripe + panel frontend, ver "Gate de licencia Pro" abajo), pero no gatea nada todavía:
no existe ningún contenido Pro (rutas adicionales, circulación libre) — ver "Estado y próximos
pasos" abajo.

## Comandos

- `npm install` — instalar dependencias
- `npm run dev` — servidor de desarrollo (Vite) con hot reload
- `npm run build` — type-check (`tsc --noEmit`) + build de producción
- `npm run preview` — sirve el build de `dist/` localmente
- `npm run lint` — ESLint sobre `src/`
- `npm test` — ejecuta toda la suite (Vitest)
- `npx vitest run src/routes/index.test.ts` — ejecutar un único archivo de test
- `npx vitest run -t "nombre del test"` — ejecutar un test por nombre
- `php backend/tests/run.php` — suite de tests del backend de licencias (sin dependencias)
- `php -S localhost:8000 -t backend/public` — servidor local del backend; con
  `server.proxy` en `vite.config.ts` (`/api` → `localhost:8000`), `npm run dev` sirve el
  panel de licencia contra este backend local sin configuración adicional

## Stack

- **Motor 3D**: Babylon.js (`@babylonjs/core`, `@babylonjs/loaders`), elegido sobre Three.js por
  traer físicas de vehículo y carga de assets (glTF) más integradas, y sobre Unity/Unreal porque
  corre nativo en el navegador sin coste de servidor por sesión.
- **Build**: Vite + TypeScript estricto (`strict: true` en `tsconfig.json`).
- **Tests**: Vitest.

## Arquitectura

### Modelo de ruta (`src/core/route-types.ts`)

Una `RouteDefinition` es la unidad central del simulador: agrupa el trazado (`waypoints`, cada
uno con posición geográfica, heading y límite de velocidad), la señalización (`signs`) y las
maniobras evaluables del examen (`maneuvers`, ancladas a un índice de waypoint). Cualquier
funcionalidad nueva relacionada con conducción (IA de tráfico, evaluación de la maniobra, HUD)
debe leer estos datos en vez de hardcodear geometría en el código de escena.

### Registro de rutas (`src/routes/index.ts`)

Punto único de verdad de qué rutas existen en el build. `routeRegistry` es la lista completa;
`getFreeRoutes()` filtra por `isFree: true`. **La versión gratuita del producto se define aquí**:
solo debe haber una ruta con `isFree: true` en producción. Cuando se implemente el gate de
licencia Pro, debe consultar este registro (no una lista separada) para decidir qué rutas
desbloquear.

### Rutas individuales (`src/routes/<id>/route.ts`)

Cada ruta vive en su propia carpeta y exporta un único `RouteDefinition`. `ruta-01/route.ts` tiene
ya geometría real extraída de OpenStreetMap (Carrer de la Marina, el Fort Pienc/Eixample, Gran
Via, 7 waypoints, ~419m), con señalización real (`src/routes/ruta-01/route.ts`) y 326 edificios
extruidos desde sus huellas OSM (`src/routes/ruta-01/buildings.ts`). El método de verificación de
cada dato (señales, semáforos, exclusión de cruces ambiguos) está documentado en el comentario de
cabecera de `route.ts` — consultarlo antes de asumir que un dato es aproximado.

De los 6 `ManeuverType` del modelo, solo `traffic-light` tiene criterios de evaluación pass/fail
implementados (`src/core/traffic-light.ts` + `traffic-light-evaluator.ts`) y es el único que usa
`ruta-01`. `parallel-park`, `roundabout`, `u-turn`, `lane-change` y `give-way` existen en el tipo
pero no tienen lógica de evaluación ni maniobras instanciadas en ninguna ruta todavía.

### Pipeline de construcción de una ruta (decidido, no automatizado todavía)

1. Extraer geometría de calles de una zona concreta de Barcelona desde OpenStreetMap (no la
   ciudad entera de golpe).
2. Convertir ese grafo a mallas 3D utilizables por Babylon.js.
3. Colocar señalización manualmente sobre esa ruta (OSM no trae señalización fiable).
4. Definir las maniobras de examen sobre esa ruta (aparcamiento, rotonda, cambio de sentido...).
5. La IA de tráfico/peatones se programa una vez de forma genérica y se reutiliza en todas las
   rutas — no es un paso por-ruta.

El coste alto está en la primera ruta (herramientas + formato de datos); las siguientes reutilizan
el mismo pipeline.

### Gate de licencia Pro (`backend/`, `src/core/license.ts`, `src/license/`, `src/ui/license-panel.ts`)

Infraestructura completa de pago único (30 días de acceso, caducidad desde la *activación* no la
compra, un dispositivo por licencia, sin renovación automática). Ver `backend/README.md` para el
despliegue en Freehostia (PHP 8.4 + MySQL 8) y el contrato de los 5 endpoints.

- **Backend** (`backend/public/api/*.php` + `backend/private/`): `checkout.php` crea la Checkout
  Session de Stripe, `webhook.php` verifica la firma HMAC y crea la licencia al completarse el
  pago, `activate.php` vincula un dispositivo con un `UPDATE` atómico (idempotente si se
  reconfirma el mismo dispositivo — requiere `PDO::MYSQL_ATTR_FOUND_ROWS` en `db.php`, si no
  `rowCount()` da 0 en la reconfirmación y se confunde con un conflicto), `validate.php` confirma
  el acceso, `session-status.php` es el respaldo de UX si el email con la clave no llega. Sin
  dependencias de Composer (Freehostia no lo garantiza) — tests propios en `backend/tests/run.php`.
- **Frontend**: `src/core/license.ts` es la única lógica pura y testeada (`isLicenseActive`,
  `licenseStatusView`); `src/license/storage.ts` (localStorage) y `src/license/api.ts` (fetch a
  `/api/*`) son glue sin test; `src/ui/license-panel.ts` sigue el mismo patrón que `ui/hud.ts`
  (escritura DOM sobre contenedores estáticos de `index.html`); se inicializa en `main.ts`
  independientemente de `createScene()`, no depende de Babylon.
- **`getAccessibleRoutes(hasProAccess)`** en `src/routes/index.ts` es el único punto donde el
  gate decidirá qué rutas desbloquear — hoy se comporta igual que `getFreeRoutes()` porque no
  hay ninguna ruta con `isFree: false` registrada todavía.
- **Límite deliberado**: el gate protege el frontend (build estático) llamando a estos endpoints;
  alguien técnico podría eludirlo. Es un límite blando, igual que el `deviceId` en `localStorage`
  (no es DRM real). No sobre-diseñar esto más allá de lo que ya hay.

## Estado y próximos pasos

**Ya construido** (todo en `master`, ver `git log` para el detalle commit a commit): geometría real
de `ruta-01` + mallas de calle/edificios (`src/scene/road-mesh.ts`, `building-mesh.ts`), vehículo
con controlador **cinemático** (no motor de físicas — `src/scene/vehicle-controller.ts`) e input de
teclado (`keyboard-input.ts`), colisión bloqueante con edificios (`core/collision.ts`), detección de
salida de calzada no bloqueante (`core/road-bounds.ts`), señalización real, maniobras de semáforo
con evaluación pass/fail, y un primer HUD (velocímetro + checklist de maniobras, `src/ui/hud.ts` +
`core/hud.ts`). Gate de licencia Pro completo (ver arriba), sin nada Pro que gatear todavía.

**No implementado todavía**:
- Criterios de evaluación para los otros 5 `ManeuverType` (aparcamiento, rotonda, cambio de
  sentido, cambio de carril, ceda el paso) — hoy solo `traffic-light` tiene lógica y es el único
  usado en `ruta-01`.
- Pantalla de resultado final del examen (apto/no apto agregado); hoy el HUD solo muestra estado
  por maniobra individual, no hay resumen al terminar la ruta.
- Físicas de vehículo "de verdad" (motor de físicas de Babylon) — el controlador actual es
  cinemático, decisión deliberada hasta ahora, no una limitación técnica descubierta.
- IA de tráfico/peatones (ver pipeline arriba, paso 5 — pensado como genérico y reutilizable,
  todavía no empezado).
- Verificación del checkout de Stripe contra la API real (hoy solo probado con un fake HTTP
  inyectado en los tests del backend).
- Defecto cosmético menor: triangulación del techo (roof cap) rota en edificios con huella
  compleja/muchos puntos (p. ej. `osm-120022089`), por posible auto-intersección del polígono OSM.
  No afecta a la cámara de conducción (no se ve el techo desde ahí); baja prioridad salvo que se
  añada una vista aérea o mapa.
- Rutas o circulación libre de la versión Pro — el gate de licencia ya existe (ver arriba), pero
  no hay ningún contenido Pro que gatear todavía.
