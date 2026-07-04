import type { RouteDefinition } from '../../core/route-types';

/**
 * Ruta Pro #3: Passeig de la Zona Franca → Plaça d'Ildefons Cerdà → C-31
 * (Autovia de Castelldefels) → cambio de sentido en la glorieta del enlace
 * Granvia L'Hospitalet/el Gornal → vuelta por Gran Via → Carrer de Mandoni /
 * Sant Fructuós / Morabos → Avinguda de Francesc Ferrer i Guàrdia → Carrer de
 * La Foixarda (Sants-Montjuïc, Barcelona + un tramo de L'Hospitalet de
 * Llobregat). ~6.1km, 94 waypoints — la primera ruta de vía rápida (80 km/h)
 * y la primera que instancia `u-turn`. Recorte de una ruta real documentada
 * del examen práctico de la DGT en Barcelona (zona de examen "La Campana":
 * salida por Gran Via hacia la C-31, cambio de sentido en los enlaces de
 * Bellvitge/Granvia L'Hospitalet, vuelta por Plaça Cerdà y aparcamiento final
 * en una calle tranquila de la falda de Montjuïc).
 *
 * **Trazado verificado vía Overpass** (2026-07-04, mismo método que
 * ruta-01/ruta-02: grafo dirigido de `way["highway"]` reales, orden de nodos
 * comprobado contra el sentido de la marcha en cada way — el camino se validó
 * con Dijkstra sobre aristas dirigidas, así que ningún tramo va contra el
 * sentido real de circulación). Secuencia de calles (ver ways y carriles en
 * el data dump de la sesión; los principales):
 * - wp0→wp4: Passeig de la Zona Franca, calzada norte (ways 545901480/
 *   1395701659/746448764/251742369, oneway=yes, 2-3 carriles, zona 30 REAL:
 *   señal R-301_30 id 2103248 a 4.9m del eje en el arranque — OSM
 *   maxspeed=30 coincide, dos fuentes independientes).
 * - wp4→wp14: Plaça d'Ildefons Cerdà, arco oeste del anillo (ways 34054316/
 *   360830951/1393162855/542458005/360830945, junction=circular, 4-5
 *   carriles, 50). Cruce semaforizado real (35 cabezas car-facing a <30m del
 *   eje en la aproximación+anillo, dataset oficial de semáforos).
 * - wp14→wp18: Gran Via lateral muntanya → Avinguda de la Granvia de
 *   l'Hospitalet (4→3 carriles, 50) y trunk_link de incorporación a la C-31
 *   (way 79766968, destination=C-31 Aeroport, 1 carril).
 * - wp18(≈)→wp27: C-31 "Autovia de Castelldefels" sentido Castelldefels
 *   (motorway, oneway, 4 carriles, maxspeed=80 — primer tramo de vía rápida
 *   del simulador; ~750m de calzada antes de la salida).
 * - wp27→wp43: salida (motorway_link, 2 carriles) → glorieta elevada del
 *   enlace Granvia L'Hospitalet/el Gornal (8 ways junction=roundabout sin
 *   nombre, 4 carriles, maxspeed=50, centro ~(41.35432,2.12178), radio real
 *   ~30m) → motorway_link de reincorporación (1 carril) → C-31 sentido
 *   Barcelona. Es el "cambio de sentido por la glorieta superior" de la ruta
 *   real de examen — ver la maniobra `u-turn` abajo.
 * - wp43→wp53: C-31 sentido Barcelona (3-4 carriles, 80) que pasa a
 *   Avinguda de la Granvia de l'Hospitalet en superficie (trunk, 60→50) y
 *   Gran Via de les Corts Catalanes (trunk, 3 carriles, 50 — señal real
 *   R-301_50 id 2069720 a 5.9m en el arco ~4335m).
 * - wp53→wp64: trunk_link de subida al lateral mar de Gran Via
 *   (primary_link 3 carriles → residential 1-2 carriles, zona 20/30 de OSM).
 * - wp64→wp76: Carrer de Mandoni (oneway, 1 carril, R-301_30 real id 2054365
 *   a 10.7m) → Carrer de Sant Fructuós (DOBLE SENTIDO real: way 244033514
 *   oneway=no y way 76168871 lanes:forward=1/lanes:backward=1, recorrido
 *   contra el orden de nodos ⇒ ownDirectionLanes = lanes:backward = 1) →
 *   zona 20 REAL entre los arcos ~5246-5351: 4 señales R-301_20 (ids
 *   2187098/2186201/2186203/2187096, a 6.3-15.2m del eje) — OSM dice
 *   maxspeed=30 ahí; se corrige a 20 por las señales, la misma clase de
 *   corrección de tag OSM desactualizado que ruta-01 (Diputació) y ruta-02
 *   (Lleida) — → Carrer dels Morabos (oneway, 1 carril, R-301_30 real id
 *   2106845).
 * - wp76→wp88: Avinguda de Francesc Ferrer i Guàrdia (tertiary, oneway=no,
 *   lanes=4 sin lanes:forward/backward ⇒ se asume reparto simétrico 2+2,
 *   único dato de carriles asumido y no medido de toda la ruta; maxspeed=40
 *   de OSM, sin señal real encontrada que lo confirme o corrija).
 * - wp88→wp93: Carrer de La Foixarda (residential, oneway=yes, 1 carril, 30),
 *   con la zona azul real al inicio — ver `parallel-park` abajo.
 *
 * **Tramo en L'Hospitalet de Llobregat** (aprox. del arco ~900m al ~3750m:
 * Granvia de l'Hospitalet, toda la C-31 y la glorieta del cambio de sentido;
 * término municipal confirmado por reverse-geocoding de ambas glorietas):
 * TODOS los datasets oficiales de señalización que usa este proyecto son del
 * Ajuntament de Barcelona y NO cubren L'Hospitalet, y su portal de datos
 * abiertos (dadesobertes.l-h.cat, comprobado 2026-07-04) no publica
 * inventarios equivalentes de semáforos/señales/pasos. La señalización de
 * ese tramo (límites de la C-31, la propia glorieta) viene solo de los tags
 * de OSM (maxspeed=80/50) — una desviación consciente del estándar
 * "dataset oficial o nada" del resto del proyecto, documentada aquí. Ningún
 * semáforo/paso instanciado cae en ese tramo.
 *
 * **Maniobra `u-turn`** (criterio en core/u-turn-evaluator.ts; primera ruta
 * que la instancia): anclada en wp37, el punto del anillo de la glorieta más
 * cercano al ápice del bucle real, con `triggerRadiusM: 50` (ver el
 * comentario de ese campo en core/route-types.ts): con el radio global de
 * 20m el giro capturable en esta glorieta real (radio ~30m) es de solo ~88°
 * — geométricamente imposible acercarse a 180°±45°; con 50m la rotación
 * capturada medida sobre la geometría OSM real del bucle completo
 * (salida+anillo+reincorporación, densificada a 1m) es ~-172° a -180°
 * (la estimación discreta sobre nodos da -213°, también dentro de la
 * tolerancia de ±45°). Se evaluaron las otras dos estructuras reales de
 * cambio de sentido de la C-31 antes de elegir esta:
 * - glorieta del enlace más cercano a Cerdà (centro 41.35859,2.12740, radio
 *   ~32m, bucle de 504m): pasa igual de bien con radio 40m+, pero su salida
 *   está a solo ~180m de la incorporación desde Cerdà — no dejaría fase real
 *   de conducción en autovía.
 * - lazo directo por los laterales C-31LD en Bellvitge (794m): necesita
 *   radio 60m+ y no es una glorieta (la ruta real de examen pide "glorieta
 *   superior o raqueta").
 *
 * **Maniobra `parallel-park`**: anclada en wp92, junto a los tramos reales
 * de zona azul de Carrer de La Foixarda (dataset oficial
 * `trams-aparcament-superficie` 2026 Q1, filas TIPUS_TRAM=AZL "FOIXARDA, 1/
 * 6/15/16, C", 19+5+7+8 plazas; la más cercana, FOIXARDA 1, a 3m del
 * waypoint). Se investigó primero el barrio de la Marina de Port/Zona
 * Franca completo (bbox 41.352-41.372, 2.126-2.152) y NO tiene ni un solo
 * tramo AZL ni de zona verde VR — solo motos (VM), carga/descarga (DUM) y
 * bus; el mismo resultado que descartó "La Campana" como zona de
 * aparcamiento en la investigación de ruta-02. Los AZL de Avinguda dels
 * Montanyans (Montjuïc) siguen sin conexión vehicular real (nodo conducible
 * más cercano a 48m), consistente con lo verificado entonces; los de
 * Foixarda SÍ son alcanzables — este waypoint llega por la conexión real
 * Ferrer i Guàrdia → Foixarda.
 *
 * **Maniobras `traffic-light`** (6) y **`give-way`** (4): de los datasets
 * oficiales de semáforos y pasos de peatones (filtrado Data_Baixa vacío,
 * códigos car-facing 11-/12-/13-/43-, y desambiguación punto-segmento de
 * cada paso contra TODAS las vías vehiculares a <35m — el paso se instancia
 * solo si su vía más cercana es la nuestra con >2m de margen sobre la
 * transversal). 12 cruces semaforizados reales tocan el trazado; se
 * instancian los 6 con atribución más clara (los otros 6 — 2 en el arranque
 * de Zona Franca, la salida mar de Cerdà, Sarah Bernhardt, el lateral mar en
 * el arco ~4697 y Carrer de la Dàlia — quedan documentados pero sin
 * maniobra, mismo patrón que el interior de la rotonda en ruta-02). Pasos
 * descartados por ambigüedad de esquina (empate <2m entre nuestra vía y la
 * transversal): ids 10934591 (Mandoni), 10934833 (Indíbil), 10933085 (Sant
 * Fructuós), 10931830 (Gimbernat, 0.2m de la transversal — es de ella).
 * El paso del arco ~4752 (id 8859566) se descartó por caer exactamente en
 * el vértice del giro lateral mar→Mandoni (atribución genuinamente ambigua
 * en el propio giro). Los R-1/R-2 reales cercanos al trazado pertenecen a
 * las calles transversales que ceden ante la nuestra (verificado por
 * distancia), no se instancian.
 *
 * **Maniobra `lane-change`**: anclada en wp23, en plena C-31 sentido
 * Castelldefels con 4 carriles reales — sobra espacio lateral, mismo
 * criterio de anclaje que wp2 en ruta-01.
 *
 * **Asunciones documentadas** (todo lo demás es dato medido): (1) el reparto
 * 2+2 de Ferrer i Guàrdia (ver arriba); (2) las rampas de enlace sin
 * maxspeed en OSM heredan 50 (velocidad de la glorieta/avenida a la que
 * llevan) y la de incorporación a la C-31 mantiene 50 hasta pisar la
 * calzada de 80; (3) los tramos de doble sentido (Sant Fructuós, Ferrer i
 * Guàrdia) NO generan tráfico en sentido contrario — buildOncomingRoute
 * solo modela un tramo de doble sentido que arranque en wp0 (ver
 * core/lanes.ts) y esta ruta arranca en calzadas separadas de sentido
 * único; el ancho de calzada sí los refleja (roadWidthMAtSegment).
 */
export const ruta03: RouteDefinition = {
  id: 'ruta-03',
  name: 'Zona Franca - C-31 - Montjuïc',
  city: 'Barcelona',
  isFree: false,
  waypoints: [
    { position: { lat: 41.3605794, lon: 2.138806 }, headingDeg: 331.4, speedLimitKmh: 30, twoWay: false, ownDirectionLanes: 2 },
    { position: { lat: 41.3620591, lon: 2.137729 }, headingDeg: 331.4, speedLimitKmh: 30, twoWay: false, ownDirectionLanes: 2 },
    { position: { lat: 41.3633778, lon: 2.1367693 }, headingDeg: 331.8, speedLimitKmh: 30, twoWay: false, ownDirectionLanes: 2 },
    { position: { lat: 41.3636991, lon: 2.1365397 }, headingDeg: 332.4, speedLimitKmh: 30, twoWay: false, ownDirectionLanes: 2 },
    { position: { lat: 41.364677, lon: 2.1358578 }, headingDeg: 355.2, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 5 },
    { position: { lat: 41.3647988, lon: 2.1358441 }, headingDeg: 333.2, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 5 },
    { position: { lat: 41.3649197, lon: 2.1357628 }, headingDeg: 323.2, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 5 },
    { position: { lat: 41.3650134, lon: 2.1356695 }, headingDeg: 283.9, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 5 },
    { position: { lat: 41.3650552, lon: 2.1354438 }, headingDeg: 258.3, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 5 },
    { position: { lat: 41.3650162, lon: 2.1351923 }, headingDeg: 237.7, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 4 },
    { position: { lat: 41.364958, lon: 2.1350698 }, headingDeg: 218.9, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 5 },
    { position: { lat: 41.3648762, lon: 2.1349818 }, headingDeg: 200.6, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 5 },
    { position: { lat: 41.36478, lon: 2.1349336 }, headingDeg: 183.8, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 5 },
    { position: { lat: 41.3646774, lon: 2.1349246 }, headingDeg: 185.9, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 5 },
    { position: { lat: 41.3645778, lon: 2.134911 }, headingDeg: 224.5, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 4 },
    { position: { lat: 41.3636941, lon: 2.1337535 }, headingDeg: 224.6, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 4 },
    { position: { lat: 41.3629019, lon: 2.1327122 }, headingDeg: 223.5, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 4 },
    { position: { lat: 41.3628077, lon: 2.1325933 }, headingDeg: 222.6, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 3 },
    { position: { lat: 41.3627251, lon: 2.132492 }, headingDeg: 220.7, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 1 },
    { position: { lat: 41.3614093, lon: 2.1309846 }, headingDeg: 207.5, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 1 },
    { position: { lat: 41.361279, lon: 2.1308942 }, headingDeg: 224.5, speedLimitKmh: 80, twoWay: false, ownDirectionLanes: 4 },
    { position: { lat: 41.3603337, lon: 2.1296583 }, headingDeg: 225.4, speedLimitKmh: 80, twoWay: false, ownDirectionLanes: 4 },
    { position: { lat: 41.3593657, lon: 2.1283526 }, headingDeg: 224.6, speedLimitKmh: 80, twoWay: false, ownDirectionLanes: 4 },
    { position: { lat: 41.3588345, lon: 2.1276536 }, headingDeg: 224.9, speedLimitKmh: 80, twoWay: false, ownDirectionLanes: 4 },
    { position: { lat: 41.3583628, lon: 2.1270263 }, headingDeg: 225.1, speedLimitKmh: 80, twoWay: false, ownDirectionLanes: 3 },
    { position: { lat: 41.3572818, lon: 2.125582 }, headingDeg: 224.6, speedLimitKmh: 80, twoWay: false, ownDirectionLanes: 4 },
    { position: { lat: 41.3560902, lon: 2.1240145 }, headingDeg: 232.7, speedLimitKmh: 80, twoWay: false, ownDirectionLanes: 4 },
    { position: { lat: 41.3557621, lon: 2.1234398 }, headingDeg: 226.0, speedLimitKmh: 80, twoWay: false, ownDirectionLanes: 2 },
    { position: { lat: 41.3556368, lon: 2.1232668 }, headingDeg: 226.0, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 2 },
    { position: { lat: 41.355281, lon: 2.122776 }, headingDeg: 225.1, speedLimitKmh: 80, twoWay: false, ownDirectionLanes: 2 },
    { position: { lat: 41.3547987, lon: 2.122132 }, headingDeg: 225.0, speedLimitKmh: 80, twoWay: false, ownDirectionLanes: 2 },
    { position: { lat: 41.3547362, lon: 2.1220486 }, headingDeg: 232.4, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 2 },
    { position: { lat: 41.35464, lon: 2.121882 }, headingDeg: 267.3, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 4 },
    { position: { lat: 41.3546345, lon: 2.1217256 }, headingDeg: 238.3, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 4 },
    { position: { lat: 41.3545643, lon: 2.1215741 }, headingDeg: 217.7, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 4 },
    { position: { lat: 41.3545036, lon: 2.1215117 }, headingDeg: 200.5, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 4 },
    { position: { lat: 41.3544315, lon: 2.1214757 }, headingDeg: 180.3, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 4 },
    { position: { lat: 41.3542716, lon: 2.1214747 }, headingDeg: 146.9, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 4 },
    { position: { lat: 41.3541666, lon: 2.1215659 }, headingDeg: 128.1, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 4 },
    { position: { lat: 41.354121, lon: 2.1216435 }, headingDeg: 107.9, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 4 },
    { position: { lat: 41.3540873, lon: 2.1217829 }, headingDeg: 87.2, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 4 },
    { position: { lat: 41.3540916, lon: 2.1219012 }, headingDeg: 58.7, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 4 },
    { position: { lat: 41.3541853, lon: 2.1221069 }, headingDeg: 30.3, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 4 },
    { position: { lat: 41.3542483, lon: 2.1221559 }, headingDeg: 10.8, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 4 },
    { position: { lat: 41.3543671, lon: 2.122186 }, headingDeg: 26.2, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 1 },
    { position: { lat: 41.3544874, lon: 2.1222649 }, headingDeg: 45.2, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 1 },
    { position: { lat: 41.3553829, lon: 2.123467 }, headingDeg: 38.1, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 1 },
    { position: { lat: 41.3558093, lon: 2.1239124 }, headingDeg: 44.7, speedLimitKmh: 80, twoWay: false, ownDirectionLanes: 4 },
    { position: { lat: 41.3569269, lon: 2.1253878 }, headingDeg: 44.7, speedLimitKmh: 80, twoWay: false, ownDirectionLanes: 3 },
    { position: { lat: 41.3582585, lon: 2.1271458 }, headingDeg: 45.0, speedLimitKmh: 80, twoWay: false, ownDirectionLanes: 3 },
    { position: { lat: 41.3595399, lon: 2.1288553 }, headingDeg: 46.3, speedLimitKmh: 80, twoWay: false, ownDirectionLanes: 3 },
    { position: { lat: 41.3596728, lon: 2.1290404 }, headingDeg: 44.3, speedLimitKmh: 80, twoWay: false, ownDirectionLanes: 4 },
    { position: { lat: 41.3606027, lon: 2.1302486 }, headingDeg: 44.9, speedLimitKmh: 80, twoWay: false, ownDirectionLanes: 4 },
    { position: { lat: 41.361166, lon: 2.1309974 }, headingDeg: 42.1, speedLimitKmh: 60, twoWay: false, ownDirectionLanes: 4 },
    { position: { lat: 41.3621777, lon: 2.1322155 }, headingDeg: 40.4, speedLimitKmh: 60, twoWay: false, ownDirectionLanes: 4 },
    { position: { lat: 41.3623273, lon: 2.1323852 }, headingDeg: 44.5, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 4 },
    { position: { lat: 41.363255, lon: 2.1335987 }, headingDeg: 43.7, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 3 },
    { position: { lat: 41.3643469, lon: 2.1349907 }, headingDeg: 44.9, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 3 },
    { position: { lat: 41.3648481, lon: 2.1356558 }, headingDeg: 46.9, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 1 },
    { position: { lat: 41.3659669, lon: 2.1372463 }, headingDeg: 47.8, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 1 },
    { position: { lat: 41.3662056, lon: 2.1375965 }, headingDeg: 43.7, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 3 },
    { position: { lat: 41.3663465, lon: 2.137776 }, headingDeg: 45.9, speedLimitKmh: 50, twoWay: false, ownDirectionLanes: 3 },
    { position: { lat: 41.3668776, lon: 2.1385059 }, headingDeg: 46.3, speedLimitKmh: 20, twoWay: false, ownDirectionLanes: 2 },
    { position: { lat: 41.3672673, lon: 2.1390495 }, headingDeg: 44.8, speedLimitKmh: 20, twoWay: false, ownDirectionLanes: 1 },
    { position: { lat: 41.3681688, lon: 2.1402436 }, headingDeg: 43.7, speedLimitKmh: 20, twoWay: false, ownDirectionLanes: 1 },
    { position: { lat: 41.3683703, lon: 2.1404999 }, headingDeg: 45.2, speedLimitKmh: 30, twoWay: false, ownDirectionLanes: 1 },
    { position: { lat: 41.3692312, lon: 2.1416561 }, headingDeg: 49.4, speedLimitKmh: 30, twoWay: false, ownDirectionLanes: 1 },
    { position: { lat: 41.3692982, lon: 2.1417603 }, headingDeg: 44.6, speedLimitKmh: 20, twoWay: false, ownDirectionLanes: 1 },
    { position: { lat: 41.3696378, lon: 2.1422067 }, headingDeg: 135.5, speedLimitKmh: 30, twoWay: false, ownDirectionLanes: 1 },
    { position: { lat: 41.3690918, lon: 2.1429221 }, headingDeg: 45.0, speedLimitKmh: 30, twoWay: true, ownDirectionLanes: 1 },
    { position: { lat: 41.3697586, lon: 2.1438096 }, headingDeg: 46.1, speedLimitKmh: 30, twoWay: false, ownDirectionLanes: 1 },
    { position: { lat: 41.3705734, lon: 2.1449391 }, headingDeg: 50.0, speedLimitKmh: 30, twoWay: false, ownDirectionLanes: 1 },
    { position: { lat: 41.3707554, lon: 2.1452286 }, headingDeg: 65.3, speedLimitKmh: 30, twoWay: false, ownDirectionLanes: 1 },
    { position: { lat: 41.3709503, lon: 2.1457922 }, headingDeg: 62.8, speedLimitKmh: 30, twoWay: false, ownDirectionLanes: 1 },
    { position: { lat: 41.3709983, lon: 2.1459166 }, headingDeg: 45.9, speedLimitKmh: 30, twoWay: false, ownDirectionLanes: 1 },
    { position: { lat: 41.3710528, lon: 2.1459915 }, headingDeg: 52.0, speedLimitKmh: 30, twoWay: true, ownDirectionLanes: 1 },
    { position: { lat: 41.3714966, lon: 2.1467495 }, headingDeg: 48.7, speedLimitKmh: 20, twoWay: true, ownDirectionLanes: 1 },
    { position: { lat: 41.3720914, lon: 2.1476507 }, headingDeg: 133.4, speedLimitKmh: 30, twoWay: true, ownDirectionLanes: 1 },
    { position: { lat: 41.3710649, lon: 2.1490957 }, headingDeg: 134.3, speedLimitKmh: 30, twoWay: false, ownDirectionLanes: 1 },
    { position: { lat: 41.3708336, lon: 2.1494112 }, headingDeg: 133.2, speedLimitKmh: 30, twoWay: false, ownDirectionLanes: 1 },
    { position: { lat: 41.3707654, lon: 2.149508 }, headingDeg: 189.4, speedLimitKmh: 40, twoWay: true, ownDirectionLanes: 2 },
    { position: { lat: 41.3700604, lon: 2.1493525 }, headingDeg: 203.5, speedLimitKmh: 40, twoWay: true, ownDirectionLanes: 2 },
    { position: { lat: 41.3698341, lon: 2.1492215 }, headingDeg: 217.7, speedLimitKmh: 40, twoWay: true, ownDirectionLanes: 2 },
    { position: { lat: 41.3696341, lon: 2.1490155 }, headingDeg: 237.9, speedLimitKmh: 40, twoWay: true, ownDirectionLanes: 2 },
    { position: { lat: 41.3695024, lon: 2.148736 }, headingDeg: 255.5, speedLimitKmh: 40, twoWay: true, ownDirectionLanes: 2 },
    { position: { lat: 41.3694328, lon: 2.148377 }, headingDeg: 276.0, speedLimitKmh: 40, twoWay: true, ownDirectionLanes: 2 },
    { position: { lat: 41.3694778, lon: 2.1478078 }, headingDeg: 275.3, speedLimitKmh: 40, twoWay: true, ownDirectionLanes: 2 },
    { position: { lat: 41.3695148, lon: 2.147277 }, headingDeg: 264.9, speedLimitKmh: 40, twoWay: true, ownDirectionLanes: 2 },
    { position: { lat: 41.369487, lon: 2.146863 }, headingDeg: 254.6, speedLimitKmh: 40, twoWay: true, ownDirectionLanes: 2 },
    { position: { lat: 41.3694267, lon: 2.1465706 }, headingDeg: 247.4, speedLimitKmh: 40, twoWay: true, ownDirectionLanes: 2 },
    { position: { lat: 41.3692842, lon: 2.1461141 }, headingDeg: 235.1, speedLimitKmh: 40, twoWay: true, ownDirectionLanes: 2 },
    { position: { lat: 41.3691573, lon: 2.1458721 }, headingDeg: 149.1, speedLimitKmh: 30, twoWay: false, ownDirectionLanes: 1 },
    { position: { lat: 41.3690838, lon: 2.1459306 }, headingDeg: 151.8, speedLimitKmh: 30, twoWay: false, ownDirectionLanes: 1 },
    { position: { lat: 41.3681376, lon: 2.1466075 }, headingDeg: 151.8, speedLimitKmh: 30, twoWay: false, ownDirectionLanes: 1 },
  ],
  signs: [
    {
      type: 'speed-limit',
      position: { lat: 41.360817, lon: 2.1386967 },
      headingDeg: 331.4,
      valueKmh: 30,
    },
    {
      type: 'pedestrian-crossing',
      position: { lat: 41.3620652, lon: 2.1377358 },
      headingDeg: 331.4,
    },
    {
      type: 'pedestrian-crossing',
      position: { lat: 41.3636935, lon: 2.1337514 },
      headingDeg: 224.6,
    },
    {
      type: 'speed-limit',
      position: { lat: 41.3670977, lon: 2.1387102 },
      headingDeg: 43.7,
      valueKmh: 50,
    },
    {
      type: 'pedestrian-crossing',
      position: { lat: 41.3680799, lon: 2.1401413 },
      headingDeg: 43.7,
    },
    {
      type: 'speed-limit',
      position: { lat: 41.3690037, lon: 2.1429745 },
      headingDeg: 133.5,
      valueKmh: 30,
    },
    {
      type: 'speed-limit',
      position: { lat: 41.371502, lon: 2.1466387 },
      headingDeg: 57.4,
      valueKmh: 20,
    },
    {
      type: 'speed-limit',
      position: { lat: 41.3721203, lon: 2.1475903 },
      headingDeg: 100.7,
      valueKmh: 30,
    },
    {
      type: 'pedestrian-crossing',
      position: { lat: 41.369486, lon: 2.1468493 },
      headingDeg: 254.6,
    },
  ],
  maneuvers: [
    {
      type: 'traffic-light',
      atWaypointIndex: 1,
      description: 'Semáforo del paso de peatones del Passeig de la Zona Franca',
    },
    {
      type: 'give-way',
      atWaypointIndex: 1,
      description: 'Paso de peatones en el Passeig de la Zona Franca',
    },
    {
      type: 'traffic-light',
      atWaypointIndex: 3,
      description: 'Semáforo en el cruce con Carrer de la Mineria',
    },
    {
      type: 'traffic-light',
      atWaypointIndex: 4,
      description: "Semáforo de entrada a la Plaça d'Ildefons Cerdà",
    },
    {
      type: 'give-way',
      atWaypointIndex: 15,
      description: 'Paso de peatones en la Gran Via (lateral muntanya)',
    },
    {
      type: 'lane-change',
      atWaypointIndex: 23,
      description: 'Cambio de carril en la C-31',
    },
    {
      type: 'u-turn',
      atWaypointIndex: 37,
      description: "Cambio de sentido en la glorieta del enlace Granvia L'Hospitalet",
      triggerRadiusM: 50,
    },
    {
      type: 'traffic-light',
      atWaypointIndex: 60,
      description: 'Semáforo en el cruce con Carrer de la Química',
    },
    {
      type: 'give-way',
      atWaypointIndex: 64,
      description: 'Paso de peatones en la Gran Via (lateral mar)',
    },
    {
      type: 'traffic-light',
      atWaypointIndex: 65,
      description: 'Semáforo en el cruce con Carrer de la Mineria (lateral mar)',
    },
    {
      type: 'traffic-light',
      atWaypointIndex: 79,
      description: 'Semáforo en el cruce de Carrer dels Morabos con Avinguda de Francesc Ferrer i Guàrdia',
    },
    {
      type: 'give-way',
      atWaypointIndex: 88,
      description: 'Paso de peatones en Avinguda de Francesc Ferrer i Guàrdia',
    },
    {
      type: 'parallel-park',
      atWaypointIndex: 92,
      description: 'Aparcamiento en línea en Carrer de La Foixarda',
    },
  ],
  crossTraffic: [],
};
