import type { LocalPoint } from './geo';
import { isTwoWaySegment, LANE_WIDTH_M, ownDirectionLaneCount, roadWidthMAtSegment } from './lanes';
import { queryRoadBounds } from './road-bounds';
import type { Maneuver, Waypoint } from './route-types';

/**
 * Señalización horizontal de la calzada como geometría pura (cuadriláteros en
 * el plano XZ, en metros locales) — la malla en sí la construye
 * scene/road-marking-mesh.ts a partir de estos quads, mismo reparto
 * core-puro/scene-glue que el resto del proyecto. Tres familias, cada una
 * alineada con el modelo que ya gobierna el comportamiento (no son decorado
 * independiente):
 *
 * - Líneas de carril (`buildLaneLineQuads`): derivadas del layout transversal
 *   centrado de core/lanes.ts — separador continuo entre sentidos donde
 *   `twoWay`, y línea discontinua entre carriles propios contiguos
 *   (`ownDirectionLanes`). Son las mismas fronteras que usa
 *   `laneIndexFromLateralOffsetM` (criterio de lane-change y bloqueo de IA).
 * - Pasos de cebra (`buildZebraQuads`): bandas longitudinales en la posición
 *   real de cada señal 'pedestrian-crossing' — el mismo punto donde cruza el
 *   peatón (pedestrian-ai.ts) y donde evalúa el give-way (lineOrigins).
 * - Líneas de detención (`buildStopLineQuads`): banda transversal sobre los
 *   carriles propios justo antes del waypoint de cada maniobra
 *   'traffic-light' — la misma línea que evalúa traffic-light-evaluator.ts.
 *
 * Medidas aproximadas a la norma española de marcas viales (M-1.x/M-4.x):
 * 0.10-0.15m de trazo, discontinua ~2m pintados/~4m de hueco en vía urbana,
 * cebra de bandas de ~0.5m — valores redondeados, no calibrados contra
 * ningún plano real del Ajuntament (misma clase de placeholder que el ciclo
 * de traffic-light.ts).
 */
export interface MarkingQuad {
  /** 4 esquinas en XZ local, en orden de contorno (sin cruzarse). */
  corners: [LocalPoint, LocalPoint, LocalPoint, LocalPoint];
}

export const LINE_WIDTH_M = 0.15;
export const DASH_LENGTH_M = 2;
export const DASH_GAP_M = 4;
export const ZEBRA_STRIPE_WIDTH_M = 0.5;
export const ZEBRA_STRIPE_GAP_M = 0.5;
export const ZEBRA_STRIPE_LENGTH_M = 4;
export const STOP_LINE_THICKNESS_M = 0.4;

interface SegmentFrame {
  origin: LocalPoint;
  /** Unitario de avance del tramo. */
  forward: { x: number; z: number };
  /** Unitario perpendicular, positivo = derecha del sentido de circulación (mismo convenio que lateralOffsetM). */
  right: { x: number; z: number };
  lengthM: number;
}

// Igual que offsetPoseToLane: con forward = (sin h, cos h), la derecha es
// (cos h, -sin h) = (forward.z, -forward.x).
function headingFrame(origin: LocalPoint, headingDeg: number): SegmentFrame {
  const headingRad = (headingDeg * Math.PI) / 180;
  const forward = { x: Math.sin(headingRad), z: Math.cos(headingRad) };
  return { origin, forward, right: { x: forward.z, z: -forward.x }, lengthM: 0 };
}

function pointAt(frame: SegmentFrame, alongM: number, lateralM: number): LocalPoint {
  return {
    x: frame.origin.x + frame.forward.x * alongM + frame.right.x * lateralM,
    z: frame.origin.z + frame.forward.z * alongM + frame.right.z * lateralM,
  };
}

/** Quad alineado al frame: [along0, along1] x [lateral0, lateral1]. */
function frameQuad(frame: SegmentFrame, along0: number, along1: number, lateral0: number, lateral1: number): MarkingQuad {
  return {
    corners: [
      pointAt(frame, along0, lateral0),
      pointAt(frame, along0, lateral1),
      pointAt(frame, along1, lateral1),
      pointAt(frame, along1, lateral0),
    ],
  };
}

/** Offset lateral donde empieza el bloque de carriles propios (borde izquierdo del carril 0) en un tramo. */
function ownLanesStartM(waypoints: Waypoint[], segmentIndex: number): number {
  const widthM = roadWidthMAtSegment(waypoints, segmentIndex);
  return -widthM / 2 + (isTwoWaySegment(waypoints, segmentIndex) ? LANE_WIDTH_M : 0);
}

/**
 * Frame por vértice de la polilínea, con la MISMA geometría que la cinta de
 * road-mesh.ts: normal promediada prev→next y semiancho del tramo que empieza
 * en ese vértice. Las líneas longitudinales se anclan a estos frames (no al
 * frame recto de cada segmento) para quedar siempre dentro del asfalto: con
 * la normal del propio segmento, en las curvas cerradas de una rotonda o en
 * un cambio de número de carriles las líneas sobresalían hasta 3m de la cinta
 * (medido sobre ruta-02/ruta-03 con la geometría real).
 */
interface PointFrame {
  point: LocalPoint;
  /** Unitario perpendicular promediado, positivo = derecha del sentido de circulación. */
  right: { x: number; z: number };
  halfWidthM: number;
}

function buildPointFrames(waypoints: Waypoint[], routePoints: LocalPoint[]): PointFrame[] {
  return routePoints.map((point, i) => {
    const prev = routePoints[Math.max(i - 1, 0)];
    const next = routePoints[Math.min(i + 1, routePoints.length - 1)];
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const lengthM = Math.hypot(dx, dz) || 1;
    return {
      point,
      right: { x: dz / lengthM, z: -dx / lengthM },
      halfWidthM: roadWidthMAtSegment(waypoints, i) / 2,
    };
  });
}

/**
 * Líneas longitudinales: separador continuo de sentidos (solo si twoWay) +
 * discontinuas entre carriles propios (`ownDirectionLanes`). El offset
 * lateral de cada línea se expresa como fracción del semiancho del tramo y se
 * evalúa contra el frame de cada vértice (ver PointFrame arriba) — exactamente
 * la misma interpolación que los bordes de la cinta, así que las líneas se
 * estrechan/giran con el asfalto y nunca se salen de él. En un vértice donde
 * cambia el número de carriles, las líneas del tramo ancho convergen hacia el
 * ancho nuevo (mismo taper que la cinta), sin empalmar 1:1 con las del tramo
 * siguiente — aceptable en v1, como en una reducción de carriles real.
 */
export function buildLaneLineQuads(waypoints: Waypoint[], routePoints: LocalPoint[]): MarkingQuad[] {
  const frames = buildPointFrames(waypoints, routePoints);
  const quads: MarkingQuad[] = [];

  for (let i = 0; i < routePoints.length - 1; i++) {
    const start = frames[i];
    const end = frames[i + 1];
    const segmentLengthM =
      Math.hypot(end.point.x - start.point.x, end.point.z - start.point.z) || 1;
    const laneCount = ownDirectionLaneCount(waypoints, i);
    const startLanesM = ownLanesStartM(waypoints, i);

    const pointAtFraction = (t: number, lateralFraction: number): LocalPoint => {
      const ax = start.point.x + start.right.x * lateralFraction * start.halfWidthM;
      const az = start.point.z + start.right.z * lateralFraction * start.halfWidthM;
      const bx = end.point.x + end.right.x * lateralFraction * end.halfWidthM;
      const bz = end.point.z + end.right.z * lateralFraction * end.halfWidthM;
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t };
    };

    const lineQuad = (along0M: number, along1M: number, lateralM: number): MarkingQuad => {
      const t0 = along0M / segmentLengthM;
      const t1 = along1M / segmentLengthM;
      const f0 = (lateralM - LINE_WIDTH_M / 2) / start.halfWidthM;
      const f1 = (lateralM + LINE_WIDTH_M / 2) / start.halfWidthM;
      return {
        corners: [pointAtFraction(t0, f0), pointAtFraction(t0, f1), pointAtFraction(t1, f1), pointAtFraction(t1, f0)],
      };
    };

    if (isTwoWaySegment(waypoints, i)) {
      quads.push(lineQuad(0, segmentLengthM, startLanesM));
    }

    for (let lane = 1; lane < laneCount; lane++) {
      const lateralM = startLanesM + lane * LANE_WIDTH_M;
      for (let alongM = 0; alongM < segmentLengthM; alongM += DASH_LENGTH_M + DASH_GAP_M) {
        quads.push(lineQuad(alongM, Math.min(alongM + DASH_LENGTH_M, segmentLengthM), lateralM));
      }
    }
  }

  return quads;
}

export interface ZebraCrossing {
  position: LocalPoint;
  /** Rumbo de la calzada en el paso (mismo convenio que SignPlacement.headingDeg). */
  headingDeg: number;
}

/**
 * Bandas de cebra en la posición real de cada paso: franjas alargadas en el
 * sentido de la marcha, repartidas a lo ancho de la calzada del tramo al que
 * pertenece el paso (queryRoadBounds, el mismo emparejamiento
 * posición→tramo que usan los peatones en main.ts para su ancho de cruce).
 * El ancla lateral es la **proyección de la posición sobre la polilínea**
 * (`closestPoint`), no la posición cruda del dataset: la coordenada oficial
 * de un paso puede caer desplazada del eje (el paso #0 de ruta-02 está a
 * -5.6m en una calzada de 9m — con el ancla cruda, la cebra quedaba pintada
 * sobre la acera izquierda en vez de cubrir la calle). main.ts hace el mismo
 * encaje para el paseo del peatón, así pintura y comportamiento coinciden.
 */
export function buildZebraQuads(crossings: ZebraCrossing[], waypoints: Waypoint[], routePoints: LocalPoint[]): MarkingQuad[] {
  const widthAt = (segmentIndex: number) => roadWidthMAtSegment(waypoints, segmentIndex);
  const quads: MarkingQuad[] = [];

  crossings.forEach((crossing) => {
    const bounds = queryRoadBounds(routePoints, widthAt, crossing.position);
    const halfWidthM = widthAt(bounds.segmentIndex) / 2;
    const frame = headingFrame(bounds.closestPoint, crossing.headingDeg);

    const stepM = ZEBRA_STRIPE_WIDTH_M + ZEBRA_STRIPE_GAP_M;
    for (let center = -halfWidthM + ZEBRA_STRIPE_WIDTH_M / 2; center + ZEBRA_STRIPE_WIDTH_M / 2 <= halfWidthM; center += stepM) {
      quads.push(
        frameQuad(
          frame,
          -ZEBRA_STRIPE_LENGTH_M / 2,
          ZEBRA_STRIPE_LENGTH_M / 2,
          center - ZEBRA_STRIPE_WIDTH_M / 2,
          center + ZEBRA_STRIPE_WIDTH_M / 2,
        ),
      );
    }
  });

  return quads;
}

/**
 * Línea de detención de cada maniobra 'traffic-light': banda transversal que
 * cubre solo los carriles propios (no la franja del sentido contrario),
 * terminando exactamente en el waypoint — el mismo eje donde
 * traffic-light-evaluator.ts detecta el cruce. El ancho/carriles se toman del
 * tramo de aproximación (el que termina en el waypoint), porque la línea
 * gobierna a quien llega, no a quien sale.
 */
export function buildStopLineQuads(maneuvers: Maneuver[], waypoints: Waypoint[], routePoints: LocalPoint[]): MarkingQuad[] {
  return maneuvers
    .filter((maneuver) => maneuver.type === 'traffic-light')
    .map((maneuver) => {
      const waypointIndex = maneuver.atWaypointIndex;
      const approachSegment = Math.max(0, waypointIndex - 1);
      const frame = headingFrame(routePoints[waypointIndex], waypoints[waypointIndex].headingDeg);
      const startM = ownLanesStartM(waypoints, approachSegment);
      const halfWidthM = roadWidthMAtSegment(waypoints, approachSegment) / 2;
      return frameQuad(frame, -STOP_LINE_THICKNESS_M, 0, startM, halfWidthM);
    });
}
