export interface GeoPoint {
  lat: number;
  lon: number;
}

/** Un punto del trazado de la calle, con la altura/orientación ya resuelta para el motor 3D. */
export interface Waypoint {
  position: GeoPoint;
  headingDeg: number;
  speedLimitKmh: number;
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

/** Definición completa de una ruta de examen: trazado + señalización + maniobras evaluables. */
export interface RouteDefinition {
  id: string;
  name: string;
  city: 'Barcelona';
  isFree: boolean;
  waypoints: Waypoint[];
  signs: SignPlacement[];
  maneuvers: Maneuver[];
}
