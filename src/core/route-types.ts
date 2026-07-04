export interface GeoPoint {
  lat: number;
  lon: number;
}

/** Un punto del trazado de la calle, con la altura/orientación ya resuelta para el motor 3D. */
export interface Waypoint {
  position: GeoPoint;
  headingDeg: number;
  speedLimitKmh: number;
  /**
   * Si el tramo de calzada que empieza en este waypoint es de doble sentido.
   * Misma convención "aplica desde este waypoint en adelante" que
   * speedLimitKmh — ver core/lanes.ts para dónde se usa (tráfico de IA en
   * sentido contrario).
   */
  twoWay: boolean;
  /**
   * Número de carriles del propio sentido de circulación en el tramo que
   * empieza en este waypoint (misma convención "aplica desde este waypoint en
   * adelante" que speedLimitKmh/twoWay). No afecta al sentido contrario, que
   * siempre se modela con un único carril — ver core/lanes.ts.
   */
  ownDirectionLanes: number;
}

export type SignType =
  | 'stop'
  | 'yield'
  | 'speed-limit'
  | 'no-entry'
  | 'pedestrian-crossing'
  | 'roundabout';

export interface SignPlacement {
  type: SignType;
  position: GeoPoint;
  headingDeg: number;
  /** Solo para 'speed-limit'. */
  valueKmh?: number;
}

export type ManeuverType =
  | 'parallel-park'
  | 'roundabout'
  | 'u-turn'
  | 'lane-change'
  | 'give-way'
  | 'traffic-light';

export interface Maneuver {
  type: ManeuverType;
  atWaypointIndex: number;
  description: string;
  /**
   * Radio de disparo (m) de esta maniobra, si necesita uno distinto del global
   * (TRIGGER_RADIUS_M = 20 en core/maneuver-tracker.ts). Motivación real: un
   * cambio de sentido por glorieta de enlace de autovía (raqueta) tiene un
   * radio de giro real de ~30m, así que dentro de un círculo de 20m solo se
   * capturan ~85° de giro — geométricamente imposible acercarse a los 180°±45°
   * que exige u-turn-evaluator.ts (haría falta un radio de giro real ≤18m).
   * Medido con la geometría OSM real de las 3 raquetas de la C-31 en
   * L'Hospitalet (2026-07-04, ver CLAUDE.md): con 40m+ las dos glorietas de
   * enlace capturan ~163-172° y el criterio funciona. Mismo patrón
   * evidencia-real que MIN_ROTATION_DEG en roundabout-evaluator.ts.
   */
  triggerRadiusM?: number;
}

/**
 * Cruce sin semaforizar con tráfico de IA de una calle transversal (ver
 * core/cross-traffic-ai.ts). Anclado a un waypoint del trazado principal,
 * igual que `Maneuver` — normalmente emparejado con una maniobra `give-way`
 * en ese mismo waypoint (el jugador cede el paso al tráfico transversal,
 * igual que ya cede el paso a un peatón). Infraestructura genérica: ninguna
 * ruta real instancia esto todavía (ver CLAUDE.md), así que `crossTraffic`
 * es un array vacío en `ruta-01`.
 */
export interface CrossTrafficSpawn {
  atWaypointIndex: number;
  /**
   * Lado del que llega el tráfico transversal, relativo al rumbo del tramo
   * principal en ese waypoint. v1 solo modela un sentido a la vez (ver
   * core/cross-traffic-ai.ts) — el otro lado de la calle transversal no
   * está modelado todavía.
   */
  fromSide: 'left' | 'right';
}

/** Definición completa de una ruta de examen: trazado + señalización + maniobras evaluables. */
export interface RouteDefinition {
  id: string;
  name: string;
  city: 'Barcelona';
  isFree: boolean;
  waypoints: Waypoint[];
  signs: SignPlacement[];
  maneuvers: Maneuver[];
  crossTraffic: CrossTrafficSpawn[];
}
