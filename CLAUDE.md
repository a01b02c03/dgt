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

De los 6 `ManeuverType` del modelo, `traffic-light` (`traffic-light.ts` + `traffic-light-evaluator.ts`),
`u-turn` (`u-turn-evaluator.ts`), `parallel-park` (`parallel-park-evaluator.ts`) y `give-way`
(`give-way-evaluator.ts`) tienen ya criterios de evaluación pass/fail — ver la cabecera de cada
archivo para el criterio exacto. `traffic-light` y `give-way` se usan hoy en `ruta-01`; `u-turn` y
`parallel-park` están conectados en el bucle de `main.ts` pero sin ninguna maniobra instanciada en
ninguna ruta todavía, así que no tienen efecto visible hasta que una ruta real los use.
`roundabout` y `lane-change` siguen sin criterios: su evaluación real depende de más IA de tráfico
de la que hay hoy (ver abajo) o de un modelo de carriles (`lane-change`) que este proyecto no tiene
todavía — ver "Estado y próximos pasos".

### IA de tráfico (`src/core/traffic-ai.ts`, `src/core/pedestrian-ai.ts`)

**Vehículos** (`traffic-ai.ts`): los coches de IA no tienen volante, siguen el trazado de la ruta
por distancia acumulada (`buildArcLengthTable` + `poseAtArcLength`), la misma que sigue el jugador
pero proyectada (`estimateArcLength`, ya que el vehículo del jugador se mueve libre en 2D, no por
arco). Cada coche de IA frena a una distancia fija (`BRAKING_DISTANCE_M`, sin modelo de frenada
real) ante lo primero que tenga por delante: un semáforo en rojo sin cruzar (reutiliza
`getTrafficLightPhase`), **un peatón sobre la calzada** (`isPedestrianInRoadway`, ver abajo — cede
el paso parando del todo, no solo reduciendo velocidad), o el vehículo inmediatamente delante — que
puede ser otro coche de IA o el propio jugador — guardando `FOLLOWING_GAP_M`.
`nextStopArcLengthM` toma una lista genérica de "puntos de parada" (`obstacleArcLengthsM`): en
`main.ts` se concatenan semáforos en rojo y peatones bloqueando en una sola lista antes de
llamarla, sin que `traffic-ai.ts` necesite saber la diferencia entre ambos. Vehículos y offsets de
aparición (`AI_VEHICLE_INITIAL_OFFSETS_M` en `main.ts`) son arbitrarios, no ligados a ningún dato
real de tráfico de Barcelona.

**Carriles / sentido contrario** (`core/lanes.ts`): la calzada de `ROAD_WIDTH_M` (6m) se divide en
dos mitades de 3m, una por sentido, centradas en `±LANE_OFFSET_M` (1.5m) — `offsetPoseToLane`
desplaza cualquier pose lateralmente respecto a su propio rumbo (así que para un vehículo en
sentido contrario, cuyo rumbo ya sale invertido de fábrica, "a la derecha" ya es su derecha real
sin ningún caso especial). El tráfico en sentido contrario reutiliza toda la lógica de
`traffic-ai.ts` (frenada ante rojo, distancia de seguridad) sobre un sub-trazado invertido
(`buildOncomingRoute`) restringido al **tramo de doble sentido que arranca al principio de la
ruta** — `Waypoint.twoWay` marca qué segmentos lo son, con la misma convención "aplica desde este
waypoint en adelante" que `speedLimitKmh`. Simplificación deliberada: `buildOncomingRoute` solo
detecta un único tramo de doble sentido al principio (no doble-sentido → sentido-único →
doble-sentido otra vez) — suficiente para `ruta-01`, el único caso real hoy. En `ruta-01`,
`twoWay` viene de los tags `oneway` reales de OSM para cada tramo de Carrer de la Marina (ver el
comentario de cabecera de `route.ts`): doble sentido de wp0 a wp3, sentido único de wp3 en
adelante — coincide con el R-101 (no-entry) ya colocado ahí. El tráfico normal (mismo sentido que
el jugador) también usa su propio carril (`+LANE_OFFSET_M`) en vez de circular exactamente sobre
el eje de la calzada. **No habilita `lane-change`**: esa maniobra necesita varios carriles en el
mismo sentido, no carriles opuestos — Carrer de la Marina es de un solo carril por sentido.

**Peatones** (`pedestrian-ai.ts`): un peatón por cada `SignPlacement` de tipo `pedestrian-crossing`
de la ruta, cruzando en línea recta perpendicular a la calzada en ese punto (`pedestrianPose`),
esperando `DWELL_TIME_S` (placeholder determinista, misma clase de simplificación que el ciclo de
`traffic-light.ts`) en cada acera antes de volver a cruzar. `ruta-01` tiene 3 pasos reales (cerca de
wp1, wp5/Avinguda Diagonal y wp6), del inventario oficial "infraestructures-inventari-pas-vianants"
del Ajuntament — ver el comentario de cabecera de `route.ts` para el método de verificación
(distancia punto-segmento a la geometría real de OSM, para confirmar que cada uno pertenece a
Carrer de la Marina y no a la calle transversal del mismo cruce). Otros 3 candidatos del mismo
cruce se descartaron por pertenecer claramente a la transversal, o por ambigüedad genuina en la
propia esquina (ver `route.ts`) — no es que falte verificarlos, ya se revisaron y no aplican.
El peatón en sí no reacciona al tráfico (sigue su ciclo de cruce pase lo que pase) — es la IA de
vehículos la que le cede el paso, ver `isPedestrianInRoadway` arriba. Simplificación conocida: los
3 peatones de `ruta-01` arrancan en el mismo estado (sin desfase entre ellos, a diferencia de los
semáforos que sí tienen `trafficLightPhaseOffsetS`), así que hoy cruzan sincronizados.

La IA de vehículos cede el paso a peatones (ver arriba); el jugador no tiene nada que le obligue a
hacerlo. Colisión física del jugador con vehículos de IA y con peatones (`core/collision.ts`,
`findCollidingRectangle`/`findCollidingPoint`): bloquea el movimiento igual que con un edificio.
Los vehículos usan solape de rectángulos orientados (`rectanglesOverlap`, SAT) en vez de solo
comprobar si una esquina cae dentro del otro — necesario para no perderse un cruce en T donde
ninguna esquina de ninguno de los dos vehículos cae dentro del otro pero sí se solapan. Los
peatones se tratan como un punto (su posición) dentro del rectángulo del jugador, sin footprint
propio (son un cilindro pequeño, suficiente para este primer corte). No hay colisión física entre
vehículos de IA entre sí, ni entre IA y peatones — solo jugador↔lo-demás.

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
teclado (`keyboard-input.ts`), colisión bloqueante con edificios, vehículos de IA y peatones
(`core/collision.ts`), detección de salida de calzada no bloqueante (`core/road-bounds.ts`),
señalización real, maniobras de semáforo, cambio de sentido y aparcamiento con evaluación pass/fail,
un primer HUD (velocímetro + checklist de maniobras, `src/ui/hud.ts` + `core/hud.ts`), una pantalla
final de resultado del examen
(`core/exam-result.ts` + `src/ui/exam-result-screen.ts`): veredicto agregado apto/no apto —
`'fail'` en cuanto cualquier maniobra evaluada falla (como una falta eliminatoria real, no hace
falta llegar al final), `'pass'` solo al llegar al final de la ruta (radio de 10m al último
waypoint) sin ningún fallo — y un primer corte de IA de tráfico (`core/traffic-ai.ts` +
`core/pedestrian-ai.ts` + `core/lanes.ts`, ver arriba): vehículos ambiente en su propio carril que
respetan semáforos en rojo, ceden el paso a peatones sobre la calzada y guardan distancia, tráfico
en sentido contrario en el tramo de doble sentido de `ruta-01` (wp0-wp3), y 3 peatones reales (wp1,
wp5, wp6) que cruzan de acera a acera. Gate de licencia Pro completo (ver arriba), sin nada Pro que
gatear todavía.

**No implementado todavía**:
- Criterios de evaluación para `roundabout`, `lane-change` y `give-way` (los otros 3
  `ManeuverType` sin lógica) — `traffic-light`, `u-turn` y `parallel-park` ya la tienen (ver
  arriba), pero solo `traffic-light` se usa en una ruta real hoy.
- Físicas de vehículo "de verdad" (motor de físicas de Babylon) — el controlador actual es
  cinemático, decisión deliberada hasta ahora, no una limitación técnica descubierta.
- Modelo de varios carriles en el mismo sentido (necesario para `lane-change`) — el modelo de
  carriles actual (ver arriba) solo distingue sentido propio/contrario, un carril cada uno.
- Ceder el paso del jugador: nada le obliga a parar ante un peatón (solo la IA de vehículos lo
  hace); tampoco hay cruces con prioridad entre el tráfico de IA de distintas calles.
- Desfase entre los 3 peatones de `ruta-01` — hoy cruzan sincronizados (ver arriba).
- Colisión física entre vehículos de IA entre sí, o entre IA y peatones — hoy solo hay colisión
  jugador↔lo-demás (edificios, vehículos de IA, peatones), ver `core/collision.ts`.
- Verificación del checkout de Stripe contra la API real (hoy solo probado con un fake HTTP
  inyectado en los tests del backend).
- Defecto cosmético menor: triangulación del techo (roof cap) rota en edificios con huella
  compleja/muchos puntos (p. ej. `osm-120022089`), por posible auto-intersección del polígono OSM.
  No afecta a la cámara de conducción (no se ve el techo desde ahí); baja prioridad salvo que se
  añada una vista aérea o mapa.
- Rutas o circulación libre de la versión Pro — el gate de licencia ya existe (ver arriba), pero
  no hay ningún contenido Pro que gatear todavía.
