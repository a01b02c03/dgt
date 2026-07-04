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
 * **Señalización real** (2026-07-04, mismo método que `ruta-01`: datasets
 * oficiales del Ajuntament de Barcelona —semàfors, senyals verticals, pas de
 * vianants— filtrados a un bbox alrededor de la ruta, con verificación
 * punto-segmento contra la geometría real de OSM para confirmar a qué calle
 * pertenece cada elemento):
 * - **`traffic-light`** en wp0: entrada semaforizada a la rotonda desde Gran
 *   Via (lateral mar) — 3 elementos semafóricos car-facing (prefijo
 *   `12-`/`13-`) a <30m, el más cercano a 7.4m. A diferencia de los 5 cruces
 *   de `ruta-01` (cada uno una calle transversal nombrada), aquí no hay una
 *   calle transversal: es el punto donde el propio carril de entrada se
 *   incorpora a la calzada circular de la plaça, con semáforo propio (Plaça
 *   d'Espanya es una rotonda semaforizada, no de prioridad simple).
 * - **`traffic-light`** en wp10: cruce real de Avinguda del Paral·lel con
 *   Carrer de Lleida (y Carrer de Vilamarí/Carrer de Floridablanca en el
 *   mismo nudo, confirmado vía Overpass) — 10 elementos car-facing a <30m,
 *   el más cercano a 6.8m.
 * - **`traffic-light`** en wp12: cruce real de Carrer de Lleida con Carrer de
 *   Tamarit — confirmado por nodo OSM compartido exacto entre ambas vías
 *   (way 591263080 de Tamarit arranca en las mismas coordenadas que wp12), y
 *   4 elementos car-facing a <30m, el más cercano a 6.3m.
 * - **`give-way`** en wp0, wp9 y wp12: un paso de peatones real
 *   (`255128000_Taco`, dataset "infraestructures-inventari-pas-vianants")
 *   confirmado a 0.7m/0.3m/7.4m respectivamente de la vía real de la ruta en
 *   ese tramo (Gran Via lateral mar / Avinguda del Paral·lel / Carrer de
 *   Lleida) — misma verificación punto-segmento que `ruta-01`. El de wp9 no
 *   coincide con ningún cruce semaforizado (es un paso intermedio en mitad
 *   de Paral·lel, sin maniobra `traffic-light` asociada); los de wp0 y wp12
 *   sí coinciden con las maniobras `traffic-light` de esos mismos waypoints,
 *   mismo patrón que wp5/wp6 en `ruta-01`. Otros 2 candidatos cerca de wp9
 *   (12.8m y 39.5m de la vía) y 1 más cerca de wp10 (25.3m, empatado entre
 *   Paral·lel y Lleida, justo en la esquina del cruce) se descartaron por no
 *   ajustar tan bien o por ambigüedad de esquina — mismo criterio que los
 *   candidatos descartados de `ruta-01`.
 * - **`speed-limit`** (30 km/h) cerca de wp11: señal real R-301_30 a 8.2m de
 *   wp11 (mismo poste que una R-307 de restricción de estacionamiento, y una
 *   S-17 de aparcamiento permitido a 9m — coherente con ser la zona azul real
 *   ya usada para `parallel-park`). Confirmado además por el tag
 *   `zone:maxspeed=30` de OSM en el propio `way` de Carrer de Lleida (4750707,
 *   que declara `maxspeed=50` sin corregir, mismo tipo de tag por defecto
 *   engañoso que ya corrigió `ruta-01` en su cruce con Carrer de la
 *   Diputació) — dos fuentes independientes de acuerdo. Por eso
 *   `speedLimitKmh` baja a 30 desde wp11 en adelante (antes 50 en toda la
 *   ruta).
 * - Ningún `R-1`/`R-2` (ceda el paso/stop) ni `R-500` (aviso de rotonda) real
 *   encontrado en todo el bbox de la ruta — consistente con que los cruces de
 *   esta zona son todos semaforizados, no de prioridad simple, y con que no
 *   hay imagen de aviso de rotonda verificable para el sign type
 *   `'roundabout'`. Ambos se dejan fuera deliberadamente, no por omisión.
 * - **No resuelto todavía** (a diferencia de los puntos de arriba): wp1, wp3,
 *   wp4, wp5, wp6, wp7 y wp8 (interior de la rotonda) tienen elementos
 *   semafóricos car-facing cerca, pero pertenecen a la regulación propia de
 *   Plaça d'Espanya (con muchos brazos: Gran Via, Avinguda del Paral·lel,
 *   Carrer de la Creu Coberta, Avinguda de la Reina Maria Cristina) y no se
 *   pudo aislar qué fase gobierna cada punto del interior del anillo —
 *   tratados como no resueltos en vez de adivinar, igual que wp8 (6
 *   elementos car-facing a <30m pero sin calle transversal real que lo
 *   explique). Ningún cruce sin semaforizar verificable tampoco en esta zona
 *   (mismo resultado que `ruta-01`); `crossTraffic` queda vacío.
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
    { position: { lat: 41.3743076, lon: 2.154389 }, headingDeg: 157.1, speedLimitKmh: 30, twoWay: false, ownDirectionLanes: 3 },
    { position: { lat: 41.3741311, lon: 2.1544884 }, headingDeg: 157.1, speedLimitKmh: 30, twoWay: false, ownDirectionLanes: 3 },
  ],
  signs: [
    {
      type: 'pedestrian-crossing',
      position: { lat: 41.3744912, lon: 2.1487351 },
      headingDeg: 60.4,
    },
    {
      type: 'pedestrian-crossing',
      position: { lat: 41.374952, lon: 2.1522473 },
      headingDeg: 90.5,
    },
    {
      type: 'speed-limit',
      position: { lat: 41.3743389, lon: 2.1542999 },
      headingDeg: 157.1,
      valueKmh: 30,
    },
    {
      type: 'pedestrian-crossing',
      position: { lat: 41.374073, lon: 2.154531 },
      headingDeg: 157.1,
    },
  ],
  maneuvers: [
    {
      type: 'traffic-light',
      atWaypointIndex: 0,
      description: "Semáforo de entrada a la rotonda de Plaça d'Espanya (Gran Via, lateral mar)",
    },
    {
      type: 'traffic-light',
      atWaypointIndex: 10,
      description: 'Semáforo en el cruce de Avinguda del Paral·lel con Carrer de Lleida',
    },
    {
      type: 'traffic-light',
      atWaypointIndex: 12,
      description: 'Semáforo en el cruce con Carrer de Tamarit',
    },
    {
      type: 'give-way',
      atWaypointIndex: 0,
      description: 'Paso de peatones en la entrada a la rotonda desde Gran Via (lateral mar)',
    },
    {
      type: 'give-way',
      atWaypointIndex: 9,
      description: 'Paso de peatones en Avinguda del Paral·lel',
    },
    {
      type: 'give-way',
      atWaypointIndex: 12,
      description: 'Paso de peatones cerca de Carrer de Tamarit',
    },
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
