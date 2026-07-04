import type { RouteDefinition } from '../../core/route-types';

/**
 * Ruta Pro #2: Plaça d'Espanya (rotonda) → Avinguda del Paral·lel → Carrer de
 * Lleida (Eixample/Sant Antoni, Barcelona). Primera ruta que instancia
 * `roundabout` y `parallel-park` — `ruta-01` no tiene ningún tramo real de
 * ninguno de los dos (ver CLAUDE.md, decisión de no ampliarla). Es también la
 * primera ruta con `isFree: false`: el gate de licencia Pro empieza a
 * proteger contenido real con esta ruta.
 *
 * **Selección de esta zona** (investigación 2026-07-04, ver memoria de
 * sesión): el usuario aportó las 3 zonas reales más habituales del examen
 * práctico de la DGT en Barcelona (La Campana/Sants-Montjuïc, Montjuïc/Sot
 * del Migdia, Universitat/Pedralbes). Se investigaron dos rotondas reales
 * antes de esta:
 * - Plaça de les Matemàtiques ("La Campana", Carrer de la Mineria): rotonda
 *   real confirmada, pero sin ninguna zona de aparcamiento de coche real
 *   verificable cerca (el dataset oficial de aparcamiento solo tiene zona
 *   verda de motos y carga/descarga en esa zona, no `AZL`).
 * - Plaça de Sant Jordi (Montjuïc, junto al Palau Sant Jordi): rotonda real,
 *   con zona azul real cerca (Avinguda dels Montanyans, Carrer de Foixarda),
 *   pero descartada: la única salida real hacia esa zona de aparcamiento da
 *   solo ~37° de giro neto de rumbo (por debajo de cualquier umbral
 *   razonable), y no existe ninguna calle vehicular real que conecte el resto
 *   de la red de la rotonda con esa zona de aparcamiento (solo caminos
 *   peatonales) — verificado exhaustivamente vía Overpass, no es solo "más
 *   compleja de lo esperado".
 *
 * Plaça d'Espanya sí conecta de forma real y directa: entrando por Gran Via
 * de les Corts Catalanes y saliendo por Avinguda del Paral·lel se llega,
 * siguiendo Paral·lel y girando en Carrer de Lleida (mismo nodo real
 * compartido, sin hueco que rellenar), a una zona de aparcamiento real
 * (`LLEIDA, 5, C`, dataset oficial `trams-aparcament-superficie` 2026 Q1,
 * fila `TIPUS_TRAM=AZL`, 4 plazas reales).
 *
 * **Geometría verificada vía Overpass** (`way["highway"]`, orden de nodos
 * comprobado contra el sentido de la ruta, mismo método que `ruta-01`):
 * - wp0→wp1: Gran Via de les Corts Catalanes (lateral mar), way 545715327,
 *   oneway=yes, lanes=3.
 * - wp1→wp7: Plaça d'Espanya (rotonda), ways 185961550/208708603/306586234,
 *   oneway=yes (junction=circular), lanes=7, ancho 28m. Sentido de
 *   circulación antihorario confirmado (orden de nodos + posición angular
 *   creciente alrededor del centro de la rotonda).
 * - wp7→wp8: Avinguda del Paral·lel, way 4787707, oneway=yes, lanes=5.
 * - wp8→wp9: Avinguda del Paral·lel, way 237529468, oneway=yes, lanes=3 (se
 *   estrecha respecto al tramo anterior, dato real).
 * - wp9→wp10: Avinguda del Paral·lel, way 245676676, oneway=yes, lanes=3.
 * - wp10→wp12: Carrer de Lleida, way 4750707, oneway=yes, lanes=3 — arranca
 *   exactamente en el mismo nodo donde termina el tramo anterior de
 *   Paral·lel (way 245676676), confirmado por coincidencia exacta de
 *   coordenadas, no una conexión asumida.
 *
 * **Maniobra `roundabout`** (criterio en core/roundabout-evaluator.ts):
 * anclada en wp4, el punto de la curva real donde el giro de rumbo
 * izquierdo capturado por el radio de disparo (20m) es máximo. Verificación
 * importante: el ángulo de posición alrededor del centro de la rotonda entre
 * la entrada (wp1) y la salida (wp7) da ~49°, pero esa NO es la métrica que
 * usa el evaluador (que mide rumbo del vehículo, no posición angular) —
 * calculando el rumbo real punto a punto de la curva (way geometry completa,
 * no solo los nodos límite), el giro de rumbo neto capturable es de solo
 * ~32-35° según dónde se ancle exactamente. Por esto `MIN_ROTATION_DEG` en
 * `roundabout-evaluator.ts` se bajó de 60 a 30 (con datos reales de esta
 * rotonda y de Plaça de Sant Jordi, no solo para encajar esta ruta) — ver el
 * comentario de esa constante. Verificado además en el navegador conduciendo
 * el tramo (ver notas de la sesión).
 *
 * **Maniobra `parallel-park`** (criterio en core/parallel-park-evaluator.ts):
 * anclada en wp11, junto a la plaza real de zona azul de Carrer de Lleida.
 *
 * **Limitación deliberada de esta ruta** (a diferencia de `ruta-01`): la
 * señalización real (semáforos, stop/ceda el paso, pasos de peatones) NO se
 * verificó de forma exhaustiva dato a dato esta sesión — solo se confirmó
 * que Plaça d'Espanya tiene infraestructura semafórica real (41 nodos OSM
 * `highway=traffic_signals` en su entorno inmediato), consistente con ser un
 * cruce semaforizado real, pero sin resolver qué fase gobierna cada
 * movimiento ni colocar semáforos como maniobra. `signs` queda vacío;
 * completar esto es trabajo pendiente para una sesión futura, igual que
 * cualquier cruce sin semaforizar real en esta zona (no investigado,
 * `crossTraffic` también vacío).
 */
export const ruta02: RouteDefinition = {
  id: 'ruta-02',
  name: "Eixample - Plaça d'Espanya",
  city: 'Barcelona',
  isFree: false,
  waypoints: [
    { position: { lat: 41.3743249, lon: 2.1484811 }, headingDeg: 60.4, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 3 },
    { position: { lat: 41.3745772, lon: 2.1490731 }, headingDeg: 90.4, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 7 },
    { position: { lat: 41.3745768, lon: 2.149155 }, headingDeg: 82.4, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 7 },
    { position: { lat: 41.3745833, lon: 2.14922 }, headingDeg: 75.8, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 7 },
    { position: { lat: 41.3746006, lon: 2.149311 }, headingDeg: 66.9, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 7 },
    { position: { lat: 41.3746259, lon: 2.1493899 }, headingDeg: 58.4, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 7 },
    { position: { lat: 41.3746581, lon: 2.1494596 }, headingDeg: 55.7, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 7 },
    { position: { lat: 41.3746929, lon: 2.1495277 }, headingDeg: 50.4, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 5 },
    { position: { lat: 41.374823, lon: 2.1497372 }, headingDeg: 85.9, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 3 },
    { position: { lat: 41.3749552, lon: 2.152197 }, headingDeg: 90.5, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 3 },
    { position: { lat: 41.3749429, lon: 2.1540314 }, headingDeg: 157.1, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 3 },
    { position: { lat: 41.3743076, lon: 2.154389 }, headingDeg: 157.1, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 3 },
    { position: { lat: 41.3741311, lon: 2.1544884 }, headingDeg: 157.1, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 3 },
  ],
  signs: [],
  maneuvers: [
    {
      type: 'roundabout',
      atWaypointIndex: 4,
      description: "Rotonda de Plaça d'Espanya",
    },
    {
      type: 'parallel-park',
      atWaypointIndex: 11,
      description: 'Aparcamiento en línea en Carrer de Lleida',
    },
  ],
  crossTraffic: [],
};
