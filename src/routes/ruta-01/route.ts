import type { RouteDefinition } from '../../core/route-types';

/**
 * Ruta gratuita #1: Carrer de la Marina, tramo entre la Gran Via de les Corts
 * Catalanes y Carrer d'Aragó (el Fort Pienc, Eixample, Barcelona). El nombre de
 * calle final se corrigió de un "Carrer d'Alí Bei" asumido inicialmente: el
 * waypoint 6 real (ver más abajo) cae en el cruce con Aragó, verificado por
 * reverse-geocoding de sus coordenadas contra OpenStreetMap.
 *
 * Waypoints extraídos de la geometría real de OpenStreetMap (paso 1 del pipeline,
 * ver CLAUDE.md): trazado viene de los `way["highway"]`; headingDeg se calculó
 * con el rumbo (bearing) entre waypoints consecutivos.
 *
 * Señalización (paso 3 del pipeline) tomada del inventario oficial de señales
 * verticales del Ajuntament de Barcelona (datos.gob.es / opendata-ajuntament,
 * CSV actualizado semanalmente, filtrado a señales activas —Data_Baixa vacío—
 * a <15m del eje de la ruta):
 * - R-301_30 (id 1991588, a 11.1m) cerca del cruce con Carrer de la Diputació:
 *   límite real señalizado de 30 km/h, no 50 como asumía el tag maxstart de OSM.
 *   Por eso speedLimitKmh baja a 30 desde el waypoint 3 en adelante (sin señal
 *   contraria detectada más allá en el tramo).
 * - R-101 (id 2186299, a 7.6m) junto al waypoint 4: coincide con el punto donde
 *   OSM ya marcaba oneway=yes — dos fuentes independientes de acuerdo.
 * headingDeg de estas señales es el rumbo de la ruta en el waypoint más cercano
 * (convención ya usada en este archivo), no el ángulo real del panel —ese dato
 * no está en el CSV. Hay 7 señales reales más (R-100/R-101, activas, <21m del
 * cruce de Gran Via) que deliberadamente no se incluyen: se resolvió a qué calle
 * gobierna cada una cruzando su coordenada contra la geometría real de calles de
 * OpenStreetMap (Overpass, distancia punto-segmento a cada `way["highway"]`
 * vehicular cercano) y las 7 caen a 3-7.5m de un tramo de la propia Gran Via
 * (calzada central o alguno de sus dos carrils laterals, todos oneway=yes) —
 * ninguna gobierna Carrer de la Marina, que en este cruce es de doble sentido
 * (`237521097`/`490655483`, oneway=no). No es una ambigüedad sin resolver: son
 * señales de sentido único de la propia Gran Via, irrelevantes para esta ruta.
 *
 * Maniobras `traffic-light` (paso 4 del pipeline) verificadas contra el
 * inventario oficial de semáforos del Ajuntament de Barcelona
 * (opendata-ajuntament.barcelona.cat, datasets "infraestructures-inventari-semafors"
 * + "infraestructures-tipologia-semafors", filtrado a elementos activos —
 * Data_Baixa vacío— y a códigos de semáforo vehicular: prefijo `11-`/`12-`/
 * `13-`/`43-`, o `Bus …`/`Tramvia …`). Cada cruce candidato se confirmó cruzando
 * el nombre de la calle real (vía OSM/Overpass) con el número de elementos
 * semafóricos activos a <25m del eje de la ruta:
 * - wp0 (Gran Via): 11 elementos a <25m (el más cercano, id 391828, a 15.8m).
 * - wp3 (Carrer de la Diputació): 13 elementos a <25m (más cercano id 391886, 13.7m).
 * - wp4 (Carrer del Consell de Cent): 4 elementos a <25m (más cercano id 391568, ¡3.9m!).
 * - wp5 (Avinguda Diagonal): solo semáforos peatonales/de tranvía a <15m (id 527444,
 *   12.2m); el vehicular más próximo está a ~30m, al otro lado de la avenida — es
 *   una avenida ancha, así que los postes vehiculares reales quedan más lejos del
 *   eje de Carrer de la Marina que en un cruce normal, pero Diagonal siempre está
 *   semaforizada.
 * - wp6 (Carrer d'Aragó): 7 elementos a <25m (más cercano id 527383, 22.9m).
 * wp1 y wp2 no tienen maniobra: wp1 cae dentro del mismo cruce de Gran Via que
 * wp0 (10 elementos a <25m, mismas coordenadas de cruce), y wp2 no tiene ningún
 * elemento semafórico activo a <25m.
 *
 * wp2 investigado también como posible cruce sin semaforizar (candidato a
 * maniobra de prioridad/ceda el paso): descartado. Overpass (`way[highway]`
 * a <70m de wp2, lat 41.3996031/lon 2.1806113) no devuelve ninguna calle
 * transversal — solo los propios tramos de Carrer de la Marina (ways
 * 44029286/237521097/490667333) y las Gran Via/laterals que ya pertenecen al
 * cruce de wp0/wp1, demasiado lejos para ser el mismo cruce. wp2 es
 * simplemente el punto de una ligera curva del trazado de Marina (headingDeg
 * pasa de 314.9° a 315.1°), no una intersección real. No hay, por tanto,
 * ningún cruce sin semaforizar verificable en esta ruta hoy.
 *
 * Señales `pedestrian-crossing` tomadas del inventario oficial de pasos de peatones
 * del Ajuntament de Barcelona (dataset "infraestructures-inventari-pas-vianants",
 * filtrado a Data_Baixa vacío = activo). El dataset mezcla pasos de peatones
 * reales (Codi_Pas `255128000_Taco` = "Pas de tacs", `255000000_Pastilla` =
 * "Pas de pastilles", ver dataset enlazado "infraestructures-tipologia-pas-vianants")
 * con pasos de bicicleta (`000000255_Ciclista`, descartados por no ser de
 * peatones). Cada candidato "Taco"/"Pastilla" a <30m de un waypoint se confirmó
 * cruzando su coordenada contra la geometría real de OpenStreetMap (Overpass,
 * distancia punto-segmento a cada `way["highway"]` cercano), igual que la
 * resolución de las señales R-100/R-101 de Gran Via más arriba — un paso de
 * peatones en un cruce puede pertenecer a cualquiera de las calles que se
 * cruzan ahí, no solo a Carrer de la Marina:
 * - id 10775653 (Pas de tacs, a 10.3m de wp5): confirmado sobre Marina — 2.6m
 *   de su `way["highway"="primary"]`, 14.5m del footway más cercano de Avinguda
 *   Diagonal.
 * - id 8284852 (Pas de tacs, a 16.9m de wp1): confirmado sobre Marina — 0.3m de
 *   su primary/footway, 8.7m del footway más cercano de Gran Via.
 * - id 10775619 (Pas de tacs, a 27.3m de wp6): confirmado sobre Marina — 2.0m
 *   de su primary, 10.7m del footway más cercano de Carrer d'Aragó.
 * headingDeg de las tres es el rumbo de la ruta en el waypoint más cercano
 * (misma convención que el resto de señales de este archivo), no la orientación
 * real del paso —ese dato tampoco está en el CSV.
 * Tres candidatos más se descartaron por pertenecer a otra calle del mismo
 * cruce, o por ambigüedad genuina: id 9666096 (cerca de wp0/wp1, 0.4-0.8m de
 * la Gran Via/su lateral, 15.6m de Marina) y id 9772800 (cerca de wp3, 0.1m de
 * Carrer de la Diputació) están claramente en la calle transversal, no en
 * Marina. id 10775760 (cerca de wp4) queda a 1.1m de Consell de Cent y 1.2m de
 * Marina — empatado dentro del margen de error, justo en la esquina del
 * cruce; tratado como no resuelto en vez de adivinar. id 10775583 (cerca de
 * wp6, 0.5m de Carrer d'Aragó) también es de la transversal.
 *
 * `twoWay` por waypoint (usado por la IA de tráfico en sentido contrario, ver
 * core/lanes.ts) viene del tag `oneway` de los `way["highway"="primary"]` reales
 * de Carrer de la Marina en cada tramo (Overpass, bbox de toda la ruta):
 * wp0→wp1 (way 44029286, oneway=no), wp1→wp2 (237521097, oneway=no) y wp2→wp3
 * (490667333, oneway=no) son de doble sentido; wp3→wp4 (237519393, oneway=yes),
 * wp4→wp5 (674507833/165522954, oneway=yes) y wp5→wp6 (313379198, oneway=yes)
 * son de sentido único — coincide con el R-101 (no-entry) ya colocado cerca de
 * wp4 más arriba, que marca justo este cambio. No hay tramos de doble sentido
 * más allá de wp3 en esta ruta.
 *
 * `ownDirectionLanes` viene de los tags `lanes`/`lanes:forward`/`lanes:backward` de los
 * mismos `way["highway"="primary"]` ya verificados arriba para `twoWay` (Overpass, misma
 * consulta): Carrer de la Marina NO es de un único carril por sentido — corrección sobre
 * una afirmación anterior de este archivo/CLAUDE.md que solo había comprobado `oneway`, no
 * el número de carriles. Para los tramos de doble sentido se comprobó también que el orden
 * de nodos de cada `way` (Overpass `out geom`) coincide con el sentido wp→wp+1 de la ruta,
 * no al revés, así que `lanes:forward` es el propio sentido:
 * - wp0→wp1 (44029286): `lanes=4`, `lanes:forward=3`, `lanes:backward=1` → ownDirectionLanes 3.
 * - wp1→wp2 (237521097): `lanes=6`, `lanes:forward=5`, `lanes:backward=1` → ownDirectionLanes 5.
 * - wp2→wp3 (490667333): `lanes=6`, `lanes:forward=5`, `lanes:backward=1` → ownDirectionLanes 5.
 * - wp3→wp4 (237519393, oneway=yes): `lanes=5` → ownDirectionLanes 5.
 * - wp4→wp5 (165522954/674507833, oneway=yes): `lanes=5` en ambos → ownDirectionLanes 5.
 * - wp5→wp6 (313379198, oneway=yes): `lanes=5` → ownDirectionLanes 5.
 * El carril "backward" de los tres tramos de doble sentido es en realidad un carril
 * bus-designated (`bus:lanes:backward=designated`), no un carril de coche genérico —
 * simplificación preexistente del tráfico en sentido contrario (core/traffic-ai.ts lo trata
 * como un carril de coche normal) que esta corrección hace más visible pero no crea ni
 * resuelve, ver CLAUDE.md.
 *
 * Maniobras `give-way` (criterio en core/give-way-evaluator.ts): una por cada
 * paso de peatones real verificado arriba, anclada al mismo waypoint que se
 * usó para calcular su headingDeg (wp1, wp5, wp6) — no un waypoint nuevo, el
 * emparejamiento maniobra↔peatón en main.ts es "el peatón más cercano al
 * waypoint de la maniobra", así que reutilizar el mismo waypoint que ya
 * identificaba a cada paso es lo que hace que ese emparejamiento resuelva al
 * peatón correcto.
 *
 * Maniobra `lane-change` (criterio en core/lane-change-evaluator.ts): anclada a wp2, el
 * único waypoint sin otra maniobra ya asignada (no cae en un cruce semaforizado ni en un
 * paso de peatones real, ver la investigación de wp2 como cruce sin semaforizar más arriba)
 * y con carriles reales de sobra a ambos lados (wp1→wp2 y wp2→wp3 tienen 5 carriles propios
 * cada uno, ver arriba) — el jugador puede cambiar de carril con margen sin que el número de
 * carriles cambie a mitad de la maniobra.
 */
export const ruta01: RouteDefinition = {
  id: 'ruta-01',
  name: 'Eixample - Carrer de la Marina',
  city: 'Barcelona',
  isFree: true,
  waypoints: [
    { position: { lat: 41.3991287, lon: 2.1812288 }, headingDeg: 317.4, speedLimitKmh: 50, twoWay: true, ownDirectionLanes: 3 },
    { position: { lat: 41.3992773, lon: 2.1810465 }, headingDeg: 314.9, speedLimitKmh: 50, twoWay: true, ownDirectionLanes: 5 },
    { position: { lat: 41.3996031, lon: 2.1806113 }, headingDeg: 315.1, speedLimitKmh: 50, twoWay: true, ownDirectionLanes: 5 },
    { position: { lat: 41.4000834, lon: 2.1799739 }, headingDeg: 315.6, speedLimitKmh: 30, twoWay: false, ownDirectionLanes: 5 },
    { position: { lat: 41.4008045, lon: 2.179034 }, headingDeg: 322.0, speedLimitKmh: 30, twoWay: false, ownDirectionLanes: 5 },
    { position: { lat: 41.4014084, lon: 2.1784059 }, headingDeg: 318.8, speedLimitKmh: 30, twoWay: false, ownDirectionLanes: 5 },
    { position: { lat: 41.4018988, lon: 2.1778328 }, headingDeg: 318.8, speedLimitKmh: 30, twoWay: false, ownDirectionLanes: 5 },
  ],
  signs: [
    {
      type: 'speed-limit',
      position: { lat: 41.3999552, lon: 2.1799556 },
      headingDeg: 315.6,
      valueKmh: 30,
    },
    {
      type: 'no-entry',
      position: { lat: 41.4009138, lon: 2.1790367 },
      headingDeg: 322.0,
    },
    {
      type: 'pedestrian-crossing',
      position: { lat: 41.4014622, lon: 2.1783051 },
      headingDeg: 318.8,
    },
    {
      type: 'pedestrian-crossing',
      position: { lat: 41.399381, lon: 2.1808991 },
      headingDeg: 314.9,
    },
    {
      type: 'pedestrian-crossing',
      position: { lat: 41.4017116, lon: 2.1780453 },
      headingDeg: 318.8,
    },
  ],
  maneuvers: [
    {
      type: 'traffic-light',
      atWaypointIndex: 0,
      description: 'Semáforo en el cruce con la Gran Via de les Corts Catalanes',
    },
    {
      type: 'traffic-light',
      atWaypointIndex: 3,
      description: 'Semáforo en el cruce con Carrer de la Diputació',
    },
    {
      type: 'traffic-light',
      atWaypointIndex: 4,
      description: 'Semáforo en el cruce con Carrer del Consell de Cent',
    },
    {
      type: 'traffic-light',
      atWaypointIndex: 5,
      description: 'Semáforo en el cruce con Avinguda Diagonal',
    },
    {
      type: 'traffic-light',
      atWaypointIndex: 6,
      description: "Semáforo en el cruce con Carrer d'Aragó",
    },
    {
      type: 'give-way',
      atWaypointIndex: 1,
      description: 'Paso de peatones cerca de la Gran Via de les Corts Catalanes',
    },
    {
      type: 'give-way',
      atWaypointIndex: 5,
      description: 'Paso de peatones en Avinguda Diagonal',
    },
    {
      type: 'give-way',
      atWaypointIndex: 6,
      description: "Paso de peatones cerca de Carrer d'Aragó",
    },
    {
      type: 'lane-change',
      atWaypointIndex: 2,
      description: 'Cambio de carril en Carrer de la Marina',
    },
  ],
  // Sin tráfico de IA transversal: los 5 cruces reales de esta ruta (Gran Via,
  // Diputació, Consell de Cent, Diagonal, Aragó) ya están semaforizados, y wp2
  // se investigó y descartó como cruce sin semaforizar (ver el comentario de
  // wp2 más arriba y CLAUDE.md "Investigado y descartado"). Reverificado
  // 2026-07-04 con una búsqueda más amplia (todas las `way["highway"]` de tipo
  // vehicular en el bbox de la ruta, no solo alrededor de wp2): Carrer de
  // Sardenya y Carrer de Lepant, las dos calles vehiculares reales más
  // cercanas al trazado, corren paralelas a Marina (mismo eje diagonal del
  // Eixample), no la cruzan — confirmado por ausencia de nodos compartidos
  // con ninguna de las 7 `way` de Marina. No hay, por tanto, ningún cruce real
  // sobre el que instanciar un CrossTrafficSpawn en esta ruta.
  crossTraffic: [],
};
