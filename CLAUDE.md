# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

drive-test.eu: simulador de examen de conducción DGT en el navegador, con calles y señalización
reales de Barcelona. Producto en fase inicial. Alcance de la versión gratuita: **una sola ruta**
(`ruta-01`, Eixample). El gate de licencia Pro (backend PHP/MySQL/Stripe + panel frontend, ver
"Gate de licencia Pro" abajo) ya protege contenido real: `ruta-02` (Plaça d'Espanya) y `ruta-03`
(Zona Franca/C-31, ver abajo) son rutas Pro (`isFree: false`) — ver "Estado y próximos pasos" abajo.

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
`getFreeRoutes()` filtra por `isFree: true` (hoy: solo `ruta-01`); `getAccessibleRoutes(hasProAccess)`
añade las rutas Pro (`isFree: false`, hoy: `ruta-02` y `ruta-03`) cuando el usuario tiene licencia activa —
`main.ts` la usa para decidir qué rutas ofrecer, ver "Gate de licencia Pro" abajo.

### Rutas individuales (`src/routes/<id>/route.ts`)

Cada ruta vive en su propia carpeta y exporta un único `RouteDefinition`. `ruta-01/route.ts` tiene
ya geometría real extraída de OpenStreetMap (Carrer de la Marina, el Fort Pienc/Eixample, Gran
Via, 7 waypoints, ~419m), con señalización real (`src/routes/ruta-01/route.ts`) y 326 edificios
extruidos desde sus huellas OSM (`src/routes/ruta-01/buildings.ts`). `ruta-02/route.ts` (primera
ruta Pro, `isFree: false`) tiene geometría real de Plaça d'Espanya (rotonda) → Avinguda del
Paral·lel → Carrer de Lleida (Eixample/Sant Antoni, 13 waypoints, ~580m) y 27 edificios
(`src/routes/ruta-02/buildings.ts`) — su señalización real (semáforos, pasos de peatones,
límite de 30 km/h cerca del aparcamiento) se verificó y añadió el 2026-07-04 con el mismo método
de datasets oficiales que `ruta-01` (ver "Estado y próximos pasos" y el comentario de cabecera de
`ruta-02/route.ts`); el interior de la propia rotonda queda deliberadamente sin resolver (ver
abajo). `ruta-03/route.ts` (segunda ruta Pro) es la primera ruta larga y de vía rápida: Passeig de
la Zona Franca → Plaça d'Ildefons Cerdà → C-31 a 80 km/h → cambio de sentido en la glorieta del
enlace Granvia L'Hospitalet → vuelta por Gran Via → Montjuïc (Carrer de La Foixarda), ~6.1km, 94
waypoints, 228 edificios (`ruta-03/buildings.ts`, extraídos por corredor `around:60m` sobre la
polilínea, no por bbox). Recorte de una ruta real documentada del examen de la zona "La Campana".
Instancia 13 maniobras, incluidas la primera `u-turn` (con `triggerRadiusM: 50`, ver arriba) y una
`parallel-park` junto a la zona azul real de Foixarda. Su tramo de L'Hospitalet (C-31 y glorieta)
no tiene cobertura de los datasets oficiales de Barcelona — allí la señalización viene solo de tags
OSM, desviación consciente documentada en su cabecera. El método de verificación de cada dato está
documentado en el comentario de cabecera de cada `route.ts` — consultarlo antes de asumir que un
dato es aproximado.

Los 6 `ManeuverType` del modelo tienen ya criterios de evaluación pass/fail: `traffic-light`
(`traffic-light.ts` + `traffic-light-evaluator.ts`), `u-turn` (`u-turn-evaluator.ts`), `parallel-park`
(`parallel-park-evaluator.ts`), `roundabout` (`roundabout-evaluator.ts`), `give-way`
(`give-way-evaluator.ts`) y `lane-change` (`lane-change-evaluator.ts`) — ver la cabecera de cada
archivo para el criterio exacto. `traffic-light`, `give-way` y `lane-change` se usan en `ruta-01`;
`roundabout` y `parallel-park` se usan en `ruta-02`; `u-turn` se instancia por primera vez en
`ruta-03` (glorieta del enlace Granvia L'Hospitalet de la C-31) — desde `ruta-03`, los 6 tipos
tienen maniobra real en alguna ruta. `Maneuver.triggerRadiusM` (opcional, ver su comentario en
`route-types.ts`) permite a una maniobra concreta un radio de disparo distinto del global de 20m
(`TRIGGER_RADIUS_M` en `maneuver-tracker.ts`): el u-turn de `ruta-03` necesita 50m porque en una
glorieta real de ~30m de radio de giro, un círculo de 20m solo captura ~88° de rotación —
geométricamente imposible acercarse a los 180°±45° que exige `u-turn-evaluator.ts`. El criterio v1 de `roundabout`
es deliberadamente simplificado (gira a la izquierda lo suficiente, no se detiene sin necesidad, no
sale de calzada ni colisiona) y NO evalúa si el vehículo cedió el paso al tráfico que ya circula por
la rotonda — no hay IA de tráfico circulando en rotondas todavía (ver "IA de tráfico" abajo,
`traffic-ai.ts` sigue un trazado lineal, no un óvalo). Su umbral `MIN_ROTATION_DEG` se bajó de 60 a
30 (2026-07-04, ver el comentario de esa constante en `roundabout-evaluator.ts` y el comentario de
cabecera de `ruta-02/route.ts`): con datos reales de dos rotondas de Barcelona (Plaça de Sant Jordi
y Plaça d'Espanya), la combinación de entrada/salida real más natural gira solo ~32-35° de rumbo
neto — 60° era un valor elegido sin contrastar contra geometría real. El criterio v1 de
`lane-change` (anclado a wp2 de `ruta-01`, ver el comentario de cabecera de `route.ts`) es igual de
simplificado: el carril de salida debe ser distinto y adyacente (±1) al de entrada, sin salir de
calzada ni colisionar — NO evalúa uso de intermitente ni comprobación de
retrovisor (ninguno de los dos está modelado).

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
real de tráfico de Barcelona. Al superar el final del trazado, cada vehículo de IA (propio sentido
y oncoming, cada uno sobre la longitud de su trazado) **recircula al arco 0** (2026-07-04): sin ese
envolvimiento, `poseAtArcLength` los clampaba en el último waypoint y quedaban aparcados para
siempre — visible en `ruta-02`, cuyo último waypoint es un semáforo (los coches se quedaban
plantados en él aunque estuviera en verde) y además es la meta, que bloqueaban físicamente.

**Carriles / sentido contrario** (`core/lanes.ts`): el layout transversal está **centrado en la
polilínea de waypoints** (2026-07-05, ver el comentario de cabecera de `lanes.ts`): la franja
izquierda es el único carril del sentido contrario (si `twoWay`) y el resto son los carriles
propios — la polilínea viene del eje de calle de OSM, que es el centro físico real de la calzada,
así que este layout coincide con la cinta visual (`road-mesh.ts`), con `road-bounds.ts` y con las
fachadas reales. Antes los carriles propios arrancaban en el eje (+1.5, +4.5…) y el contrario iba
fijo en −1.5 (`LANE_OFFSET_M`, eliminado): coincidía con la cinta centrada solo en el caso 1+1 —
con los 3-5 carriles reales de `ruta-01`, el bloque modelado sobresalía hasta 6m de la cinta por
la derecha, invisible hasta que hubo que pintar la señalización horizontal (ver abajo).
`oncomingLaneOffsetM(ownLaneCount)` da el offset del carril contrario desde el rumbo ya invertido
del vehículo (crece con los carriles propios para seguir pegado al borde real; puede saltar 3m al
cruzar un waypoint donde cambia el número de carriles, misma clase de simplificación que el
clampeo de carril de la IA). `offsetPoseToLane` desplaza cualquier pose lateralmente respecto a su
propio rumbo (así que para un vehículo en sentido contrario, cuyo rumbo ya sale invertido de
fábrica, "a la derecha" ya es su derecha real sin ningún caso especial). El tráfico en sentido contrario reutiliza toda la lógica de
`traffic-ai.ts` (frenada ante rojo, distancia de seguridad) sobre un sub-trazado invertido
(`buildOncomingRoute`) restringido al **tramo de doble sentido que arranca al principio de la
ruta** — `Waypoint.twoWay` marca qué segmentos lo son, con la misma convención "aplica desde este
waypoint en adelante" que `speedLimitKmh`. Simplificación deliberada: `buildOncomingRoute` solo
detecta un único tramo de doble sentido al principio (no doble-sentido → sentido-único →
doble-sentido otra vez) — suficiente para `ruta-01`, el único caso real hoy. En `ruta-01`,
`twoWay` viene de los tags `oneway` reales de OSM para cada tramo de Carrer de la Marina (ver el
comentario de cabecera de `route.ts`): doble sentido de wp0 a wp3, sentido único de wp3 en
adelante — coincide con el R-101 (no-entry) ya colocado ahí.

**Varios carriles en el mismo sentido** (`core/lanes.ts`): `Waypoint.ownDirectionLanes` (misma
convención "aplica desde este waypoint en adelante" que `twoWay`/`speedLimitKmh`) generaliza el
carril único de siempre a un bloque de `N` carriles de `LANE_WIDTH_M` (3m) cada uno, `laneOffsetM`
calcula el desplazamiento lateral del carril `i` (0 = el más a la izquierda del bloque propio, en
el layout centrado descrito arriba — por eso ahora recibe también `twoWay`) y `ownDirectionLaneCount`
lee cuántos carriles hay en un segmento dado. Cada vehículo de IA (no el sentido contrario, que sigue
siendo siempre de un carril) recibe un carril fijo al aparecer (reparto por turnos entre los
carriles disponibles en su punto de arranque) y lo mantiene toda la ruta — no hay modelo de cambio
de carril de la IA todavía, así que si el tramo siguiente tiene menos carriles se recorta al último
disponible (`laneOffsetM` clampa el índice) en vez de fusionarse de forma realista. La distancia de
seguimiento (`leadVehicleArcM` en `traffic-ai.ts`) ahora es por carril: un vehículo solo frena por el
que tiene delante en su propio carril, no por todo el tráfico de su sentido — el carril "actual" del
jugador (que se mueve libre en 2D, no por carril fijo) se deriva de su desplazamiento lateral
(`laneIndexFromLateralOffsetM`) solo para saber si bloquea a la IA que le sigue.

**`ruta-01` sí tiene varios carriles por sentido, en todo su recorrido** — corrección sobre una
afirmación anterior de este documento, que daba `ownDirectionLanes: 1` en todos los waypoints porque
solo se había verificado el tag `oneway` de cada `way["highway"="primary"]`, no `lanes`/
`lanes:forward`/`lanes:backward`. Reverificado por Overpass (mismo método que el resto de
`route.ts`), con el orden de nodos de cada `way` confirmado contra el sentido de la ruta: wp0→wp1
tiene 3 carriles propios (`lanes:forward=3`), wp1→wp2 y wp2→wp3 tienen 5 cada uno, y los tres tramos
de sentido único (wp3→wp4, wp4→wp5, wp5→wp6) tienen 5 carriles cada uno — ver el comentario de
cabecera de `route.ts` para el detalle por `way`. El carril "contrario" de los tres tramos de doble
sentido es en realidad un carril bus-designated (`bus:lanes:backward=designated`), no un carril de
coche genérico — el tráfico en sentido contrario de este documento (arriba) ya lo trata como un
carril de coche normal, simplificación preexistente que esta corrección hace más visible pero no
resuelve.

`road-mesh.ts` (ancho visual de la calzada) y `road-bounds.ts` (detección de salida de calzada)
derivan el ancho de `ownDirectionLanes` en vez de un `ROAD_WIDTH_M` fijo: `roadWidthMAtSegment`
(`core/lanes.ts`) calcula, por tramo, `carriles del propio sentido × LANE_WIDTH_M` más un carril más
de sentido contrario si `twoWay` — la misma cinta (`road-mesh.ts`) se estrecha/ensancha exactamente
en los waypoints donde cambia `twoWay`/`ownDirectionLanes`, y `queryRoadBounds`
(`core/road-bounds.ts`) recibe una función `(segmentIndex) => anchoM` en vez de un número, consultada
solo con el segmento ya elegido (la búsqueda del segmento más cercano sigue siendo puramente
geométrica). Con los carriles reales de `ruta-01` esto da una calzada de 12-18m según el tramo (antes
6m fijos en toda la ruta) — mucho más ancha, y más realista frente a las fachadas reales de los 326
edificios ya extruidos (ver arriba), que están a su distancia real de la vía. El ancho por el que
cruzan los peatones (`PEDESTRIAN_CROSSING_MARGIN_M` en `main.ts`) también se deriva por cruce (antes
un valor global compartido), para no desalinear a los peatones de wp5/wp6 respecto a la calzada real
en su tramo. **Esto desbloqueó `lane-change`** (ver arriba): `ruta-01` ya ancla una maniobra de este
tipo en wp2, con carriles de sobra a ambos lados del waypoint.

**Peatones** (`pedestrian-ai.ts`): un peatón por cada `SignPlacement` de tipo `pedestrian-crossing`
de la ruta, cruzando en línea recta perpendicular a la calzada en ese punto (`pedestrianPose`),
esperando `DWELL_TIME_S` (placeholder determinista, misma clase de simplificación que el ciclo de
`traffic-light.ts`; subido de 4s a 25s el 2026-07-05 — con 4s cada peatón estaba sobre la calzada
~2/3 del tiempo en las calzadas reales de 15-18m de `ruta-01` y el tráfico de IA casi nunca
circulaba, ver el comentario de la constante) en cada acera antes de volver a cruzar. El ancla de
cada paso es la **proyección de la coordenada oficial sobre la polilínea**
(`RoadBoundsQuery.closestPoint`, 2026-07-05), no la coordenada cruda del dataset: esta puede caer
desplazada del eje (el paso #0 de `ruta-02` está a -5.6m, fuera del propio asfalto de 9m — el
peatón cruzaba, y la cebra se pintaba, sobre la acera izquierda en vez de sobre la calle); la
cebra pintada hace el mismo encaje dentro de `buildZebraQuads`, así pintura y comportamiento
coinciden por construcción. `ruta-01` tiene 3 pasos reales (cerca de
wp1, wp5/Avinguda Diagonal y wp6), del inventario oficial "infraestructures-inventari-pas-vianants"
del Ajuntament — ver el comentario de cabecera de `route.ts` para el método de verificación
(distancia punto-segmento a la geometría real de OSM, para confirmar que cada uno pertenece a
Carrer de la Marina y no a la calle transversal del mismo cruce). Otros 3 candidatos del mismo
cruce se descartaron por pertenecer claramente a la transversal, o por ambigüedad genuina en la
propia esquina (ver `route.ts`) — no es que falte verificarlos, ya se revisaron y no aplican.
El peatón en sí no reacciona al tráfico (sigue su ciclo de cruce pase lo que pase) — es la IA de
vehículos la que le cede el paso, ver `isPedestrianInRoadway` arriba. Cada peatón arranca desfasado
según su índice de aparición en la ruta (`pedestrianPhaseOffsetS`, mismo patrón de espaciado
determinista que `trafficLightPhaseOffsetS` en `traffic-light.ts`): a diferencia de los semáforos
(cuya fase se recalcula cada frame a partir de `elapsedSimS`, sin estado propio), el modelo de
peatón es incremental (`stepPedestrian` acumula `dtSeconds` sobre el estado del frame anterior), así
que aplicar el desfase requiere simular ese intervalo por adelantado una sola vez al construir la
escena (`advancePedestrian`, en incrementos pequeños para no saltarse una transición
espera↔cruce dentro del propio desfase) en vez de sumarlo a un reloj absoluto.

La IA de vehículos cede el paso a peatones (ver arriba). El jugador tiene dos consecuencias
distintas si no lo hace: colisión física del jugador con vehículos de IA y con peatones
(`core/collision.ts`, `findCollidingRectangle`/`findCollidingPoint`), que bloquea el movimiento
igual que con un edificio; y, en los 3 pasos reales de `ruta-01` (ver `give-way-evaluator.ts`), una
maniobra `give-way` que se marca `'fail'` si el jugador cruza la línea de ese paso con el peatón
todavía sobre la calzada — mismo evento de cruce que `traffic-light-evaluator.ts`
(`projectOntoHeadingAxis`), pero el criterio es la presencia del peatón en vez de la fase del
semáforo. La línea de cruce del give-way es la **posición real de la cebra emparejada**
(`lineOrigins` en `updateGiveWayOutcomes`, derivado en `main.ts` del mismo emparejamiento
maniobra↔peatón), no el waypoint de la maniobra (2026-07-05): en `ruta-01` los pasos reales quedan
a 10-27m de su waypoint, y evaluar en el waypoint permitía suspender 27m después de haber cedido
el paso correctamente en la cebra (wp6) o aprobar habiendo cruzado por delante del peatón
(wp1/wp5). El eje sigue siendo el headingDeg del waypoint (el de la señal es el mismo por
convención de los `route.ts`); las maniobras give-way emparejadas con tráfico transversal (sin
peatón) siguen evaluando en el waypoint. El emparejamiento maniobra↔peatón (`giveWayPedestrianIndices` en `main.ts`) es "el peatón
más cercano al waypoint de la maniobra", calculado una sola vez al construir la escena — funciona
porque cada maniobra `give-way` de `ruta-01` está anclada al mismo waypoint que ya identificaba a
ese paso de peatones en la verificación de datos (ver cabecera de `route.ts`).

Los vehículos usan solape de rectángulos orientados (`rectanglesOverlap`, SAT) en vez de solo
comprobar si una esquina cae dentro del otro — necesario para no perderse un cruce en T donde
ninguna esquina de ninguno de los dos vehículos cae dentro del otro pero sí se solapan. Los
peatones se tratan como un punto (su posición) dentro del rectángulo del jugador, sin footprint
propio (son un cilindro pequeño, suficiente para este primer corte).

Los vehículos de IA (propio sentido y oncoming) también tienen esta misma colisión física entre sí
y con peatones, no solo con el jugador: en `main.ts`, cada `aiVehicles`/`oncomingVehicles.forEach`
calcula su estado candidato (`stepAiVehicle`) y, si el rectángulo resultante solaparía con otro
vehículo de IA o contendría a un peatón (reutilizando el mismo snapshot `otherVehicleCorners`/
`pedestrianPoints` del frame que ya usa la colisión del jugador), descarta el candidato y mantiene
su posición anterior con velocidad 0 — mismo patrón exacto de "cancelar el desplazamiento" que la
colisión del jugador. En la práctica es sobre todo una red de seguridad: la distancia de
seguimiento (`FOLLOWING_GAP_M`, ver `traffic-ai.ts`) ya evita casi siempre el solape dentro del
mismo carril; esto cubre los casos que ese modelo 1D (por distancia acumulada) no ve, como un
peatón que entra en la calzada muy cerca de un vehículo que ya iba a cruzar esa línea.

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
- **`getAccessibleRoutes(hasProAccess)`** en `src/routes/index.ts` es el único punto que decide qué
  rutas desbloquear — desde `ruta-02` (`isFree: false`) esto ya no se comporta igual que
  `getFreeRoutes()` para un usuario con acceso Pro.
- **Selector de ruta** (`main.ts` + `src/ui/route-select-screen.ts`): al arrancar, `main.ts` calcula
  `hasProAccess` de forma síncrona y "optimista" desde `localStorage` (`isLicenseActive(readStoredLicense(), Date.now())`,
  sin esperar la validación async contra el backend que ya hace `initLicensePanel()` — si el backend
  revoca la licencia a mitad de sesión, la ruta Pro ya cargada no se retira, mismo límite que la
  propia validación de `initLicensePanel()` no interrumpe la escena hoy). Con una sola ruta accesible
  (el caso de un usuario gratuito) se entra directo, sin selector — el selector
  (`buildRouteSelectScreen`, mismo patrón que `exam-result-screen.ts`) solo aparece si hay más de una.
  `createScene(route, mode)` recibe la ruta y el modo ya elegidos en vez de decidir internamente.
- **Circulación libre** (`src/core/drive-mode.ts`, `DriveMode = 'exam' | 'free'`): la feature Pro de
  conducir una ruta sin examen. En `'free'` el mundo simulado completo se mantiene (tráfico de IA,
  semáforos con su fase y la IA frenando en rojo, peatones, colisiones físicas, límites de calzada)
  porque es conducción, no evaluación; se desactiva solo la capa de examen: los 6 evaluadores de
  maniobra, el checklist del HUD, los postes de maniobra (`maneuver-markers.ts` — los marcadores de
  semáforo sí se construyen, son mundo) y el veredicto/pantalla final. Llegar al último waypoint no
  termina nada. El modo se elige en el selector de ruta (botones "Examen" / "Circulación libre" por
  ruta cuando `hasProAccess`); un usuario gratuito entra directo a su única ruta en `'exam'`, sin
  selector, como siempre.
- **Límite deliberado**: el gate protege el frontend (build estático) llamando a estos endpoints;
  alguien técnico podría eludirlo. Es un límite blando, igual que el `deviceId` en `localStorage`
  (no es DRM real). No sobre-diseñar esto más allá de lo que ya hay.

## Estado y próximos pasos

**Ya construido** (todo en `master`, ver `git log` para el detalle commit a commit): geometría real
de `ruta-01` + mallas de calle/edificios (`src/scene/road-mesh.ts`, `building-mesh.ts`), vehículo
con controlador **cinemático** (no motor de físicas — `src/scene/vehicle-controller.ts`) e input de
teclado (`keyboard-input.ts`), colisión bloqueante con edificios, vehículos de IA y peatones
(`core/collision.ts`), detección de salida de calzada no bloqueante (`core/road-bounds.ts`, con
ancho de calzada derivado de `ownDirectionLanes` por tramo, ver "IA de tráfico" arriba), señalización
real, maniobras de semáforo, cambio de sentido, aparcamiento, rotonda y cambio de carril con
evaluación pass/fail (los 6 `ManeuverType` del modelo ya tienen criterio, ver arriba — `traffic-light`,
`give-way` y `lane-change` instanciados en `ruta-01`), un primer HUD (velocímetro + checklist de maniobras, `src/ui/hud.ts` + `core/hud.ts`), una pantalla
final de resultado del examen
(`core/exam-result.ts` + `src/ui/exam-result-screen.ts`): veredicto agregado apto/no apto —
`'fail'` en cuanto cualquier maniobra evaluada falla (como una falta eliminatoria real, no hace
falta llegar al final), `'pass'` solo al llegar al final de la ruta (radio de 10m al último
waypoint) sin ningún fallo — y un primer corte de IA de tráfico (`core/traffic-ai.ts` +
`core/pedestrian-ai.ts` + `core/lanes.ts`, ver arriba): vehículos ambiente en su propio carril que
respetan semáforos en rojo, ceden el paso a peatones sobre la calzada y guardan distancia, tráfico
en sentido contrario en el tramo de doble sentido de `ruta-01` (wp0-wp3), y 3 peatones reales (wp1,
wp5, wp6) que cruzan de acera a acera, desfasados entre sí (`pedestrianPhaseOffsetS` +
`advancePedestrian`, ver arriba), con colisión física también entre vehículos de IA entre sí y con
peatones (no solo jugador↔lo-demás, ver arriba). Cesión de paso del jugador: además de la colisión
física, `ruta-01` tiene 3 maniobras `give-way` (una por cada paso de peatones real, ver arriba) que
fallan si el jugador cruza con el peatón todavía en la calzada. **`ruta-02`** (Plaça d'Espanya →
Avinguda del Paral·lel → Carrer de Lleida, Eixample/Sant Antoni, 13 waypoints, ~580m): primera ruta
Pro (`isFree: false`), primer contenido real que protege el gate de licencia. Instancia `roundabout`
(anclada en el punto de la curva real de la rotonda con mayor giro capturable, ver arriba) y
`parallel-park` (junto a una plaza real de zona azul en Carrer de Lleida, dataset oficial
`trams-aparcament-superficie` del Ajuntament). Ambas maniobras verificadas como aprobables: a nivel
matemático (con las cabeceras/rumbos reales de la curva) y conduciendo en vivo en el navegador
(`roundabout`, con el timing de giro adecuado). Selector de ruta (`ui/route-select-screen.ts`)
cableado en `main.ts` para cuando hay más de una ruta accesible. Gate de licencia Pro completo (ver
arriba), ya gateando `ruta-02` de verdad. **Señalización real de `ruta-02`** (2026-07-04, mismo
método de datasets oficiales que `ruta-01`, ver el comentario de cabecera de `ruta-02/route.ts`
para el detalle completo de distancias y fuentes): 3 maniobras `traffic-light` (entrada
semaforizada a la rotonda desde Gran Via lateral mar en wp0, cruce de Paral·lel con Lleida en
wp10, cruce con Carrer de Tamarit en wp12), 3 maniobras `give-way` con sus pasos de peatones reales
(wp0, wp9, wp12), y un límite real de 30 km/h cerca del aparcamiento (wp11 en adelante, antes 50 —
confirmado por una señal R-301_30 real y por el tag `zone:maxspeed=30` de OSM en Carrer de Lleida).
El interior de la propia rotonda (wp1, wp3-wp8) queda deliberadamente sin resolver: tiene elementos
semafóricos reales cerca pero pertenecen a la regulación de un nudo de muchos brazos y no se pudo
aislar qué fase gobierna cada punto del anillo — ver el comentario de cabecera de `route.ts` para
el detalle de qué se descartó y por qué. **Circulación libre Pro** (2026-07-04, ver "Gate de
licencia Pro" arriba): modo `'free'` en `createScene(route, mode)` — mundo simulado intacto, capa
de examen desactivada, elegible por ruta en el selector con acceso Pro. Verificado en vivo en el
navegador: cero eventos de maniobra conduciendo por puntos que en `'exam'` evalúan de inmediato, y
el modo examen intacto en la misma build. **`ruta-03`** (2026-07-04, Zona Franca → Plaça Cerdà →
C-31 → glorieta del enlace Granvia L'Hospitalet → Gran Via → Montjuïc/Foixarda, ~6.1km, 94
waypoints): segunda ruta Pro, primera de vía rápida (80 km/h) y primera que instancia `u-turn` —
completando los 6 `ManeuverType` con maniobra real en alguna ruta. Trazado validado con Dijkstra
sobre el grafo dirigido real de OSM (ningún tramo contra el sentido de circulación); 13 maniobras
(6 `traffic-light`, 4 `give-way`, `lane-change` en plena C-31, `u-turn` con el nuevo
`Maneuver.triggerRadiusM: 50` — ver "Rutas individuales" arriba — y `parallel-park` en la zona azul
real de Foixarda, dataset `trams-aparcament-superficie`); zona 20 real detectada por 4 señales
R-301_20 que corrigen un `maxspeed=30` desactualizado de OSM (misma clase de corrección que
Diputació/Lleida). El u-turn se verificó aprobable conduciendo la polilínea real por los
evaluadores de verdad (rotación capturada ~-172° a -180° con radio 50m, patrón zzz-verify,
test desechable ya borrado). Las 3 estructuras de cambio de sentido de la C-31 se compararon antes
de elegir esta glorieta — el detalle completo, incluido el tramo de L'Hospitalet sin datasets
oficiales, está en la cabecera de `ruta-03/route.ts`.

**Primera sesión de pruebas en vivo como Pro** (2026-07-04, con una licencia real de la BD local —
ver `backend/README.md` para el entorno local): destapó y se corrigieron 3 defectos: (1) la
`FollowCamera` de Babylon traía las flechas asignadas de fábrica (↑/↓ altura, ←/→ rotación) y se
las disputaba a `keyboard-input.ts` — se le quitó la entrada de teclado (`removeByType`), conserva
ratón/rueda; (2) la pantalla de resultado no tenía forma de reiniciar — botón "Volver a empezar"
(`exam-result-screen.ts` recibe `onRestart`, hoy `window.location.reload()`); (3) los vehículos de
IA quedaban aparcados para siempre al acabar el trazado — ahora recirculan (ver "IA de tráfico"
arriba). La conducción completa de `ruta-03` en vivo (rendimiento con 94 waypoints/228 edificios,
sensación de los 80 km/h, u-turn en la glorieta) quedó pendiente de esa sesión.

**Segunda sesión de pruebas + revisión de semáforos/peatones de `ruta-01`** (2026-07-05): dos
defectos más reportados por el usuario y corregidos: el botón "Volver a empezar" solo se *veía* en
`ruta-02` (con 9+ maniobras la lista desbordaba el centrado flex de `#exam-result` y empujaba el
botón fuera de pantalla — ahora la lista scrollea dentro de 55vh), y el selector muestra el número
de ruta del código ("Ruta 03 — …", derivado del `id`). Una revisión a fondo del comportamiento de
semáforos y peatones de `ruta-01` produjo 3 arreglos más: (1) la línea del give-way ahora es la
cebra real, no el waypoint (ver "IA de tráfico" arriba); (2) `DWELL_TIME_S` 4s→25s (ídem); (3) la
**simulación entera arranca congelada (dt=0) hasta el primer input de conducción** (`simStarted`
en `main.ts`): el jugador aparece sobre la línea de stop del semáforo de wp0 con el marcador
encima de la cabeza, y con el reloj corriendo desde el primer frame, tardar >9s en arrancar
(desfase 0: verde 0-6s, ámbar 6-9s, rojo 9-17s) suspendía ese semáforo invisible nada más moverse
— congelado, wp0 está siempre recién puesto en verde al arrancar. Pendiente conocido de esa
revisión (cambio de diseño mayor, no abordado): los peatones ignoran la fase del semáforo de su
cruce — en wp5/wp6 cruzan también con el semáforo del coche en verde, obligando al jugador a
pararse en verde para no suspender el give-way; en un cruce semaforizado real cruzarían en su
propia fase (la contraria).

**Señalización horizontal** (2026-07-05, `core/road-markings.ts` + `scene/road-marking-mesh.ts`):
la calzada era una cinta gris sin marcas — con una maniobra `lane-change` que exigía cambiar de
carril sin que hubiera carriles visibles. Tres familias de marcas, cada una alineada con el modelo
que ya gobierna el comportamiento (no son decorado independiente): líneas de carril (separador
continuo de sentidos + discontinuas entre carriles propios, las mismas fronteras que usa
`laneIndexFromLateralOffsetM`), cebras en la posición real de cada paso (donde cruza el peatón y
evalúa el give-way) y líneas de detención en los semáforos (el mismo eje que evalúa
`traffic-light-evaluator.ts`). Todo en una única malla por ruta (un draw call; ruta-03 genera
~1.7k quads). Las líneas longitudinales se anclan a los mismos frames por vértice que la cinta de
`road-mesh.ts` (normal promediada + semiancho por punto, offset como fracción del semiancho), así
que giran/estrechan con el asfalto y nunca se salen de él — verificado sobre la geometría real de
las 3 rutas (patrón zzz-verify): exceden el criterio de `road-bounds` estrictamente menos que los
propios bordes de la cinta (esa divergencia cinta↔bounds en esquinas cerradas es preexistente y
solo cosmética/gameplay, no la introducen las marcas). Medidas placeholder aproximadas a la norma
española (trazo 0.15m, discontinua 2m/4m, cebra 0.5m/0.5m×4m, detención 0.4m), no calibradas
contra ningún plano real. Pintar las marcas obligó a arreglar antes el anclaje del modelo de
carriles (ver "Carriles / sentido contrario" arriba).

**No implementado todavía**:
- Físicas de vehículo "de verdad" (motor de físicas de Babylon) — el controlador actual es
  cinemático, decisión deliberada hasta ahora, no una limitación técnica descubierta.
- Verificación del checkout de Stripe contra la API real (hoy solo probado con un fake HTTP
  inyectado en los tests del backend).

**Investigado y descartado**: el defecto cosmético de triangulación del techo (roof cap) que este
documento reportaba antes en edificios de huella compleja (p. ej. `osm-120022089`, por sospecha de
auto-intersección del polígono OSM) no se reproduce hoy — verificado dos veces: (1) `earcut` +
`deviation()` sobre los 326 edificios de `ruta-01` da desviación ~0 y el número de triángulos
esperado (`n-2`) en los 326, ninguno sospechoso; (2) inspección visual aislada de `osm-120022089`
en el navegador (cámara cenital temporal) muestra un techo completo, sin huecos. Probablemente ya
lo arregló de rebote el commit `14be366` (backface culling con `DOUBLESIDE` en `building-mesh.ts`,
ver más arriba) — lo que se veía como "techo roto" eran huecos de pared trasera visibles desde
ciertos ángulos, no un fallo real de triangulación del cap.

wp2 de `ruta-01` (único waypoint sin maniobra `traffic-light` que no cae dentro del cruce de
Gran Via de wp0/wp1, ver el comentario de cabecera de `ruta-01/route.ts`) se investigó como
candidato a cruce sin semaforizar (maniobra de prioridad/ceda el paso) y se descartó: una consulta
Overpass de todo `way["highway"]` a <70m de sus coordenadas no devuelve ninguna calle transversal,
solo los propios tramos de Carrer de la Marina y la Gran Via ya asociada al cruce de wp0/wp1 — wp2
es solo el punto de una ligera curva del trazado de Marina (headingDeg 314.9°→315.1°), no una
intersección real. Los 5 cruces reales de `ruta-01` (Gran Via, Diputació, Consell de Cent,
Diagonal, Aragó) ya están semaforizados (ver maniobras `traffic-light` arriba). Reverificado
2026-07-04 con una búsqueda más amplia, no solo alrededor de wp2: todas las `way["highway"]`
vehiculares (primary/secondary/tertiary/unclassified/residential) en el bbox de toda la ruta. Las
dos calles reales más cercanas al trazado que no eran ya conocidas, Carrer de Sardenya y Carrer de
Lepant, corren paralelas a Carrer de la Marina (mismo eje diagonal del Eixample), no la cruzan —
confirmado por ausencia de nodos compartidos con ninguna de las 7 `way` de Marina. **Hoy no existe
en `ruta-01` ningún cruce sin semaforizar** sobre el que construir cesión de paso entre tráfico de
IA de distintas calles — haría falta una ruta nueva con un cruce real de ese tipo para que tenga
efecto visible.

**Infraestructura genérica construida igualmente** (2026-07-04, mismo patrón que `roundabout`
antes de tener ruta real): `core/cross-traffic-ai.ts` modela un vehículo de tráfico transversal por
`CrossTrafficSpawn` (nuevo campo `RouteDefinition.crossTraffic`, vacío en `ruta-01`) — sin estado
propio, su posición es una función pura de `elapsedSimS` (mismo patrón que `getTrafficLightPhase`
en `traffic-light.ts`, no un vaivén incremental como los peatones: un coche real cruza y sigue, no
aparca en la otra acera y vuelve marcha atrás), en bucle continuo en un único sentido
(`fromSide: 'left' | 'right'`, el otro lado de la calle transversal no está modelado). No se creó
ningún `ManeuverType` nuevo: la maniobra `give-way` ya existente se generalizó (renombrando el
parámetro de `updateGiveWayOutcomes` de `obstructedByPedestrian` a `obstructed`, sin cambiar la
lógica — ya era genérica) para que el jugador ceda el paso a este tráfico transversal exactamente
igual que ya cede el paso a un peatón, emparejando cada maniobra `give-way` con el `CrossTrafficSpawn`
del mismo `atWaypointIndex` (`giveWayCrossTrafficIndices` en `main.ts`). Tiene colisión física con
el jugador y el resto de vehículos de IA (se añade a `otherVehicleCorners` mientras `onCrossing`).
**Limitación deliberada**: el tráfico transversal nunca cede el paso él mismo (tiene prioridad
siempre) y no distingue R-1 (ceda el paso) de R-2 (stop) — el criterio es binario, igual que con
peatones; tampoco modela la regla general de prioridad-a-la-derecha sin señal. `ruta-01` define
`crossTraffic: []`, así que nada de esto tiene efecto visible hoy.

**Selección de zona para `ruta-02`** (2026-07-04): el usuario aportó las 3 zonas reales más
habituales del examen práctico de la DGT en Barcelona (La Campana/Sants-Montjuïc, Montjuïc/Sot del
Migdia, Universitat/Pedralbes). Se investigaron y descartaron dos rotondas reales antes de Plaça
d'Espanya:
- **Plaça de les Matemàtiques** ("La Campana", Carrer de la Mineria): rotonda real confirmada, pero
  sin ninguna zona de aparcamiento de coche real verificable cerca (el dataset oficial de
  aparcamiento solo tiene zona verda de motos y carga/descarga en esa zona, no `AZL`).
- **Plaça de Sant Jordi** (Montjuïc, junto al Palau Sant Jordi): rotonda real, con zona azul real
  cerca (Avinguda dels Montanyans, Carrer de Foixarda), pero descartada por dos motivos
  independientes: (1) la única salida real hacia esa zona de aparcamiento da solo ~37° de giro neto
  de rumbo entre las dos calles, un límite fijo de la topología del anillo (no depende de cuánto
  rodeo dé el conductor); (2) no existe ninguna calle vehicular real que conecte el resto de la red
  de la rotonda con esa zona de aparcamiento — solo caminos peatonales, verificado exhaustivamente
  vía Overpass en la zona entre el anillo del Estadi Olímpic y Montanyans/Mirador del Palau Nacional.

Esto también reveló que **medir el ángulo de posición alrededor del centro de una rotonda no es lo
mismo que medir la rotación de rumbo real del vehículo** (lo que de verdad comprueba
`roundabout-evaluator.ts`) — para un anillo real no perfectamente circular, la primera métrica puede
ser mucho mayor que la segunda. Ver `ruta-02/route.ts` para el detalle completo de la geometría que
sí funcionó (Plaça d'Espanya, Gran Via → Paral·lel).
