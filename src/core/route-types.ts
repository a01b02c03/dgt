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
