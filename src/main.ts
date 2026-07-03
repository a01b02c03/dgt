import { Color3, Engine, FollowCamera, HemisphericLight, MeshBuilder, Scene, StandardMaterial, Vector3 } from '@babylonjs/core';
import { findCollidingBuilding, findCollidingPoint, findCollidingRectangle, vehicleCorners } from './core/collision';
import { examOutcome, hasReachedFinish } from './core/exam-result';
import { toLocalMeters } from './core/geo';
import { currentSpeedLimitKmh, maneuverChecklistLabel, speedMsToKmh } from './core/hud';
import {
  buildOncomingRoute,
  LANE_OFFSET_M,
  laneIndexFromLateralOffsetM,
  laneOffsetM,
  mirroredArcLengthOfWaypoint,
  offsetPoseToLane,
  ownDirectionLaneCount,
} from './core/lanes';
import { licenseStatusView } from './core/license';
import { activateLicense, fetchSessionStatus, requestCheckout, validateLicense } from './license/api';
import { getOrCreateDeviceId, readStoredLicense, writeStoredLicense } from './license/storage';
import { createGiveWayEvalState, updateGiveWayOutcomes } from './core/give-way-evaluator';
import { createManeuverProgress, updateManeuverProgress } from './core/maneuver-tracker';
import { createParallelParkEvalState, updateParallelParkOutcomes } from './core/parallel-park-evaluator';
import { createRoundaboutEvalState, updateRoundaboutOutcomes } from './core/roundabout-evaluator';
import {
  advancePedestrian,
  createPedestrianState,
  isPedestrianInRoadway,
  PEDESTRIAN_CROSSING_MARGIN_M,
  pedestrianPhaseOffsetS,
  pedestrianPose,
  stepPedestrian,
} from './core/pedestrian-ai';
import { queryRoadBounds, ROAD_WIDTH_M } from './core/road-bounds';
import { getTrafficLightPhase } from './core/traffic-light';
import { createStopLineCrossingState, updateTrafficLightOutcomes } from './core/traffic-light-evaluator';
import {
  buildArcLengthTable,
  createAiVehicleState,
  estimateArcLength,
  leadVehicleArcM,
  nextStopArcLengthM,
  poseAtArcLength,
  stepAiVehicle,
} from './core/traffic-ai';
import { createUTurnEvalState, updateUTurnOutcomes } from './core/u-turn-evaluator';
import { getBuildings, getFreeRoutes } from './routes';
import { buildBuildingMeshes } from './scene/building-mesh';
import { attachKeyboardInput } from './scene/keyboard-input';
import {
  buildManeuverMarkers,
  MANEUVER_ACTIVE_COLOR,
  MANEUVER_COMPLETED_COLOR,
  MANEUVER_PENDING_COLOR,
} from './scene/maneuver-markers';
import { buildPedestrianMesh } from './scene/pedestrian-mesh';
import { buildRoadMesh } from './scene/road-mesh';
import { buildSignMarkers } from './scene/sign-markers';
import { buildTrafficLightMarkers, TRAFFIC_LIGHT_PHASE_COLORS } from './scene/traffic-light-markers';
import { createVehicleState, stepVehicle } from './scene/vehicle-controller';
import {
  AI_VEHICLE_COLOR,
  buildVehicleMesh,
  VEHICLE_LENGTH_M,
  VEHICLE_OFF_ROAD_COLOR,
  VEHICLE_ON_ROAD_COLOR,
  VEHICLE_WIDTH_M,
} from './scene/vehicle-mesh';
import { buildExamResultScreen } from './ui/exam-result-screen';
import { buildHud } from './ui/hud';
import { buildLicensePanel } from './ui/license-panel';

const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
const engine = new Engine(canvas, true);

/**
 * Panel de licencia Pro: no depende de Babylon/la escena, se inicializa aparte.
 * Hoy no gatea ninguna ruta (no existe contenido Pro todavía, ver CLAUDE.md) —
 * solo gestiona el ciclo compra → activación → estado mostrado.
 */
function initLicensePanel(): void {
  const deviceId = getOrCreateDeviceId();
  let licenseState = readStoredLicense();

  const panel = buildLicensePanel({
    async onCheckout(email) {
      panel.setMessage(null);
      try {
        const { url } = await requestCheckout(email);
        window.location.href = url;
      } catch (err) {
        panel.setMessage(err instanceof Error ? err.message : 'No se pudo iniciar el pago');
      }
    },
    async onActivate(licenseKey) {
      panel.setMessage(null);
      try {
        const { expiresAt } = await activateLicense(licenseKey, deviceId);
        licenseState = { licenseKey, deviceId, expiresAt };
        writeStoredLicense(licenseState);
        panel.render(licenseStatusView(licenseState, Date.now()));
        panel.setMessage('Licencia activada.');
      } catch (err) {
        panel.setMessage(err instanceof Error ? err.message : 'No se pudo activar la licencia');
      }
    },
  });

  panel.render(licenseStatusView(licenseState, Date.now()));

  if (licenseState) {
    const stored = licenseState;
    // Confirmación contra el backend: la copia local puede estar desactualizada
    // (activada mientras tanto en otro dispositivo, o revocada).
    validateLicense(stored.licenseKey, deviceId)
      .then((result) => {
        licenseState =
          result.valid && result.expiresAt
            ? { licenseKey: stored.licenseKey, deviceId, expiresAt: result.expiresAt }
            : null;
        if (licenseState) {
          writeStoredLicense(licenseState);
        }
        panel.render(licenseStatusView(licenseState, Date.now()));
      })
      .catch(() => {
        // Sin conexión o backend caído: se mantiene el estado guardado localmente.
      });
  }

  const sessionId = new URLSearchParams(window.location.search).get('session_id');
  if (sessionId) {
    fetchSessionStatus(sessionId)
      .then((status) => {
        panel.setMessage(
          status.status === 'complete' && status.licenseKey
            ? `Compra completada. Tu clave: ${status.licenseKey} — actívala abajo.`
            : 'Compra recibida, procesando. Revisa tu email en unos segundos.',
        );
      })
      .catch(() => {
        panel.setMessage('No se pudo comprobar el estado del pago.');
      });
  }
}

function createScene(): Scene {
  const scene = new Scene(engine);

  new HemisphericLight('light', new Vector3(0, 1, 0), scene);

  const [freeRoute] = getFreeRoutes();
  if (!freeRoute) {
    return scene;
  }

  const origin = freeRoute.waypoints[0].position;
  const buildings = getBuildings(freeRoute.id);
  buildRoadMesh(freeRoute, origin, scene);
  buildBuildingMeshes(buildings, origin, scene);

  const routePoints = freeRoute.waypoints.map((waypoint) => toLocalMeters(origin, waypoint.position));
  const buildingShapes = buildings.map((building) => ({
    id: building.id,
    footprint: building.footprint.map((corner) => toLocalMeters(origin, corner)),
  }));
  const buildingPoints = buildingShapes.flatMap((building) => building.footprint);
  const points = [...routePoints, ...buildingPoints];
  const minX = Math.min(...points.map((p) => p.x));
  const maxX = Math.max(...points.map((p) => p.x));
  const minZ = Math.min(...points.map((p) => p.z));
  const maxZ = Math.max(...points.map((p) => p.z));
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const extent = Math.max(maxX - minX, maxZ - minZ, 50);

  // Terreno de relleno bajo la calzada y los edificios (todavía sin textura/detalle de calle).
  const ground = MeshBuilder.CreateGround('ground', { width: extent * 1.2, height: extent * 1.2 }, scene);
  ground.position = new Vector3(centerX, -0.05, centerZ);
  const groundMaterial = new StandardMaterial('ground-material', scene);
  groundMaterial.diffuseColor = new Color3(0.5, 0.55, 0.45);
  ground.material = groundMaterial;

  const startWaypoint = freeRoute.waypoints[0];
  let vehicleState = createVehicleState(0, 0, (startWaypoint.headingDeg * Math.PI) / 180);

  const { mesh: vehicleMesh, bodyMaterial: vehicleBodyMaterial } = buildVehicleMesh(scene);
  vehicleMesh.position.x = vehicleState.x;
  vehicleMesh.position.z = vehicleState.z;
  vehicleMesh.rotation.y = vehicleState.headingRad;

  const camera = new FollowCamera('camera', new Vector3(0, 5, -10), scene);
  camera.lockedTarget = vehicleMesh;
  camera.radius = 9;
  camera.heightOffset = 3.5;
  camera.rotationOffset = 180;
  camera.cameraAcceleration = 0.05;
  camera.maxCameraSpeed = 20;
  camera.attachControl(true);

  buildSignMarkers(freeRoute, origin, scene);

  // Tráfico ambiente: vehículos de IA que siguen el mismo trazado que el
  // jugador, en su propio carril, respetan los semáforos en rojo y guardan
  // distancia con el vehículo inmediatamente delante en ESE carril (jugador u
  // otro coche de IA) — ver core/traffic-ai.ts. Cada vehículo recibe un
  // carril fijo al aparecer (reparto por turnos entre los carriles del propio
  // sentido en su punto de arranque, ver core/lanes.ts) y lo mantiene toda la
  // ruta: no hay modelo de cambio de carril de la IA todavía (esa es
  // precisamente la maniobra `lane-change` sin criterio, ver CLAUDE.md), así
  // que si el tramo siguiente tiene menos carriles el vehículo se recorta al
  // último disponible (laneOffsetM) en vez de fusionarse de forma realista.
  // Offsets iniciales arbitrarios, no ligados a ningún dato real; se
  // descartan los que caen más allá del final de la ruta. Ninguna ruta real
  // tiene hoy más de un carril por sentido (ruta-01: `ownDirectionLanes: 1`
  // en todos sus waypoints, ver CLAUDE.md), así que este reparto siempre
  // asigna el carril 0 y el resultado es idéntico al de un único carril.
  const arcLengthTable = buildArcLengthTable(routePoints);
  const routeLengthM = arcLengthTable[arcLengthTable.length - 1];
  const AI_VEHICLE_INITIAL_OFFSETS_M = [60, 140];
  const aiVehicles = AI_VEHICLE_INITIAL_OFFSETS_M.filter((offsetM) => offsetM < routeLengthM).map((offsetM, index) => {
    const { mesh, bodyMaterial } = buildVehicleMesh(scene);
    bodyMaterial.diffuseColor = AI_VEHICLE_COLOR;
    const centerPose = poseAtArcLength(routePoints, arcLengthTable, offsetM);
    const spawnSegmentIndex = queryRoadBounds(routePoints, ROAD_WIDTH_M, centerPose).segmentIndex;
    const laneCount = ownDirectionLaneCount(freeRoute.waypoints, spawnSegmentIndex);
    const laneIndex = index % laneCount;
    const pose = offsetPoseToLane(centerPose, laneOffsetM(laneIndex, laneCount));
    mesh.position.x = pose.x;
    mesh.position.z = pose.z;
    mesh.rotation.y = pose.headingRad;
    return { mesh, state: createAiVehicleState(offsetM), laneIndex };
  });

  // Tráfico de IA en sentido contrario: solo existe en el tramo de doble
  // sentido inicial de la ruta (ver core/lanes.ts y el comentario de cabecera
  // de ruta-01/route.ts sobre qué tramos son oneway según OSM). Reutiliza la
  // misma lógica de traffic-ai.ts sobre un sub-trazado invertido, así que el
  // rumbo de cada pose ya sale correctamente invertido sin caso especial.
  const oncomingRoute = buildOncomingRoute(freeRoute.waypoints, routePoints);
  const oncomingArcLengthTable = buildArcLengthTable(oncomingRoute.points);
  const oncomingRouteLengthM = oncomingArcLengthTable[oncomingArcLengthTable.length - 1];
  const ONCOMING_VEHICLE_INITIAL_OFFSETS_M = [30, 90];
  const oncomingVehicles = ONCOMING_VEHICLE_INITIAL_OFFSETS_M.filter((offsetM) => offsetM < oncomingRouteLengthM).map(
    (offsetM) => {
      const { mesh, bodyMaterial } = buildVehicleMesh(scene);
      bodyMaterial.diffuseColor = AI_VEHICLE_COLOR;
      const pose = offsetPoseToLane(poseAtArcLength(oncomingRoute.points, oncomingArcLengthTable, offsetM), LANE_OFFSET_M);
      mesh.position.x = pose.x;
      mesh.position.z = pose.z;
      mesh.rotation.y = pose.headingRad;
      return { mesh, state: createAiVehicleState(offsetM) };
    },
  );

  // Peatones: uno por cada señal 'pedestrian-crossing' de la ruta, cruzando
  // perpendicular a la calzada en ese punto (ver core/pedestrian-ai.ts). Cada
  // uno arranca desfasado según su índice de aparición (pedestrianPhaseOffsetS,
  // mismo patrón que trafficLightPhaseOffsetS) para que no crucen todos
  // sincronizados — el estado inicial se adelanta ese desfase con
  // advancePedestrian antes del primer frame.
  const pedestrianCrossingHalfWidthM = ROAD_WIDTH_M / 2 + PEDESTRIAN_CROSSING_MARGIN_M;
  const pedestrians = freeRoute.signs
    .filter((sign) => sign.type === 'pedestrian-crossing')
    .map((sign, index) => {
      const crossing = { position: toLocalMeters(origin, sign.position), headingDeg: sign.headingDeg };
      const { mesh } = buildPedestrianMesh(scene);
      const initialState = createPedestrianState(-pedestrianCrossingHalfWidthM);
      const state = advancePedestrian(initialState, pedestrianCrossingHalfWidthM, pedestrianPhaseOffsetS(index));
      const pose = pedestrianPose(crossing, state);
      mesh.position.x = pose.x;
      mesh.position.z = pose.z;
      mesh.rotation.y = pose.headingRad;
      return { mesh, crossing, state };
    });

  // Emparejamiento maniobra 'give-way' -> peatón más cercano a su waypoint,
  // calculado una sola vez (ni las maniobras ni las posiciones de los pasos
  // de peatones cambian en tiempo de ejecución): ruta-01 ancla cada maniobra
  // give-way justo en el waypoint más próximo a su paso de peatones real (ver
  // el comentario de cabecera de route.ts), así que "el más cercano" resuelve
  // el emparejamiento correcto sin un campo explícito en el modelo de ruta.
  const giveWayPedestrianIndices: (number | null)[] = freeRoute.maneuvers.map((maneuver) => {
    if (maneuver.type !== 'give-way') {
      return null;
    }
    const waypointLocal = routePoints[maneuver.atWaypointIndex];
    let bestIndex: number | null = null;
    let bestDistanceSq = Infinity;
    pedestrians.forEach((pedestrian, index) => {
      const distanceSq =
        (pedestrian.crossing.position.x - waypointLocal.x) ** 2 +
        (pedestrian.crossing.position.z - waypointLocal.z) ** 2;
      if (distanceSq < bestDistanceSq) {
        bestDistanceSq = distanceSq;
        bestIndex = index;
      }
    });
    return bestIndex;
  });

  const maneuverMarkers = buildManeuverMarkers(freeRoute, origin, scene);
  const trafficLightMarkers = buildTrafficLightMarkers(freeRoute, origin, scene);
  let maneuverProgress = createManeuverProgress(freeRoute.maneuvers);
  let crossingState = createStopLineCrossingState(freeRoute.maneuvers.length);
  let giveWayEvalState = createGiveWayEvalState(freeRoute.maneuvers.length);
  let uTurnEvalState = createUTurnEvalState(freeRoute.maneuvers.length);
  let parallelParkEvalState = createParallelParkEvalState(freeRoute.maneuvers.length);
  let roundaboutEvalState = createRoundaboutEvalState(freeRoute.maneuvers.length);

  const hud = buildHud(freeRoute.maneuvers);
  maneuverProgress.forEach((entry, index) => hud.setManeuverState(index, maneuverChecklistLabel(entry)));

  const examResultScreen = buildExamResultScreen();
  const lastWaypointLocal = routePoints[routePoints.length - 1];

  const getInput = attachKeyboardInput();
  let wasOnRoad = true;
  let wasColliding = false;
  let elapsedSimS = 0;
  let reachedFinish = false;
  let examOutcomeShown: ReturnType<typeof examOutcome> = null;
  scene.onBeforeRenderObservable.add(() => {
    const dtSeconds = engine.getDeltaTime() / 1000;
    elapsedSimS += dtSeconds;
    const candidate = stepVehicle(vehicleState, getInput(), dtSeconds);

    // Colisión: a diferencia de los límites de calzada, un coche real no
    // puede atravesar una pared, otro coche o un peatón, así que aquí sí
    // bloqueamos el movimiento (se cancela el desplazamiento y se detiene,
    // como al chocar). Edificios: esquina del jugador dentro del polígono
    // (isPointInPolygon). Vehículos de IA: solape de rectángulos orientados
    // (rectanglesOverlap/SAT, no solo "esquina dentro" — necesario para no
    // perderse un cruce en T). Peatones: su posición (un punto) dentro del
    // rectángulo del jugador (findCollidingPoint). Usa las posiciones del
    // frame anterior de la IA (se actualizan más abajo), mismo patrón de
    // snapshot que el resto de la IA de tráfico.
    const corners = vehicleCorners(candidate.x, candidate.z, candidate.headingRad, VEHICLE_LENGTH_M, VEHICLE_WIDTH_M);
    const collision = findCollidingBuilding(corners, buildingShapes);
    // otherVehicleCorners y pedestrianPoints son snapshots del frame anterior
    // reutilizados más abajo también por la propia IA de tráfico (aiVehicles/
    // oncomingVehicles forEach) para su propia colisión física entre sí y con
    // peatones — un único snapshot por frame, no uno distinto por consumidor.
    const otherVehicleCorners = [...aiVehicles, ...oncomingVehicles].map((v) =>
      vehicleCorners(v.mesh.position.x, v.mesh.position.z, v.mesh.rotation.y, VEHICLE_LENGTH_M, VEHICLE_WIDTH_M),
    );
    const collidingVehicleIndex = findCollidingRectangle(corners, otherVehicleCorners);
    const pedestrianPoints = pedestrians.map((p) => ({ x: p.mesh.position.x, z: p.mesh.position.z }));
    const collidingPedestrianIndex = findCollidingPoint(corners, pedestrianPoints);
    const anyCollision = Boolean(collision) || collidingVehicleIndex !== null || collidingPedestrianIndex !== null;
    if (anyCollision !== wasColliding) {
      const reason = collision
        ? `edificio ${collision.id}`
        : collidingVehicleIndex !== null
          ? 'vehículo de IA'
          : collidingPedestrianIndex !== null
            ? 'peatón'
            : null;
      console.log(reason ? `Colisión con ${reason}` : 'Sin colisión');
      wasColliding = anyCollision;
    }
    vehicleState = anyCollision
      ? { ...candidate, x: vehicleState.x, z: vehicleState.z, speedMs: 0 }
      : candidate;

    vehicleMesh.position.x = vehicleState.x;
    vehicleMesh.position.z = vehicleState.z;
    vehicleMesh.rotation.y = vehicleState.headingRad;

    // Deteccion de limites de calzada: no bloquea el movimiento, solo lo registra
    // (base para puntuar faltas de trazado en la evaluacion del examen).
    const bounds = queryRoadBounds(routePoints, ROAD_WIDTH_M, vehicleState);
    if (bounds.onRoad !== wasOnRoad) {
      vehicleBodyMaterial.diffuseColor = bounds.onRoad ? VEHICLE_ON_ROAD_COLOR : VEHICLE_OFF_ROAD_COLOR;
      console.log(bounds.onRoad ? 'Vehículo dentro de la calzada' : 'Vehículo fuera de la calzada');
      wasOnRoad = bounds.onRoad;
    }

    hud.setSpeed(speedMsToKmh(vehicleState.speedMs), currentSpeedLimitKmh(freeRoute.waypoints, bounds.segmentIndex));

    // Seguimiento de progreso de maniobras: solo registra métricas (todavía no
    // evalúa si se ejecutaron correctamente, eso requiere criterios de examen).
    const previousStatuses = maneuverProgress.map((entry) => entry.status);
    maneuverProgress = updateManeuverProgress(maneuverProgress, routePoints, {
      x: vehicleState.x,
      z: vehicleState.z,
      speedMs: vehicleState.speedMs,
    });
    maneuverProgress.forEach((entry, index) => {
      if (entry.status === previousStatuses[index]) {
        return;
      }
      const marker = maneuverMarkers[index];
      marker.material.diffuseColor =
        entry.status === 'active'
          ? MANEUVER_ACTIVE_COLOR
          : entry.status === 'completed'
            ? MANEUVER_COMPLETED_COLOR
            : MANEUVER_PENDING_COLOR;
      hud.setManeuverState(index, maneuverChecklistLabel(entry));
      console.log(`Maniobra "${entry.maneuver.description}": ${entry.status}`);
    });

    // Evaluación pass/fail de maniobras traffic-light: instante de cruce de la
    // línea de stop, criterio = fase del semáforo en ese instante (ver
    // traffic-light-evaluator.ts para el porqué de no reevaluar más de una vez).
    const previousOutcomes = maneuverProgress.map((entry) => entry.outcome);
    const trafficLightResult = updateTrafficLightOutcomes(
      maneuverProgress,
      crossingState,
      freeRoute.waypoints,
      routePoints,
      { x: vehicleState.x, z: vehicleState.z },
      elapsedSimS,
    );
    maneuverProgress = trafficLightResult.progress;
    crossingState = trafficLightResult.crossingState;
    maneuverProgress.forEach((entry, index) => {
      if (entry.outcome === previousOutcomes[index]) {
        return;
      }
      hud.setManeuverState(index, maneuverChecklistLabel(entry));
      console.log(`Maniobra "${entry.maneuver.description}": outcome ${entry.outcome}`);
    });

    // Evaluación pass/fail de maniobras give-way: mismo evento de cruce de
    // línea que traffic-light (ver give-way-evaluator.ts), pero el criterio es
    // si el peatón emparejado con esta maniobra (giveWayPedestrianIndices,
    // calculado una sola vez arriba) está sobre la calzada en el instante de
    // cruce. Usa el estado de los peatones del frame anterior (se actualizan
    // más abajo), mismo patrón de snapshot que el resto de la IA de tráfico.
    const previousGiveWayOutcomes = maneuverProgress.map((entry) => entry.outcome);
    const giveWayObstructed = freeRoute.maneuvers.map((_maneuver, index) => {
      const pedestrianIndex = giveWayPedestrianIndices[index];
      return pedestrianIndex !== null && isPedestrianInRoadway(pedestrians[pedestrianIndex].state, ROAD_WIDTH_M / 2);
    });
    const giveWayResult = updateGiveWayOutcomes(
      maneuverProgress,
      giveWayEvalState,
      freeRoute.waypoints,
      routePoints,
      { x: vehicleState.x, z: vehicleState.z },
      giveWayObstructed,
    );
    maneuverProgress = giveWayResult.progress;
    giveWayEvalState = giveWayResult.evalState;
    maneuverProgress.forEach((entry, index) => {
      if (entry.outcome === previousGiveWayOutcomes[index]) {
        return;
      }
      hud.setManeuverState(index, maneuverChecklistLabel(entry));
      console.log(`Maniobra "${entry.maneuver.description}": outcome ${entry.outcome}`);
    });

    // Evaluación pass/fail de maniobras u-turn, parallel-park y roundabout:
    // ver u-turn-evaluator.ts / parallel-park-evaluator.ts /
    // roundabout-evaluator.ts para el criterio de cada una. Ninguna ruta
    // instancia todavía estos tipos de maniobra (ver CLAUDE.md), así que
    // estas llamadas no tienen efecto visible hoy.
    const previousUTurnParkOutcomes = maneuverProgress.map((entry) => entry.outcome);
    const uTurnResult = updateUTurnOutcomes(
      maneuverProgress,
      uTurnEvalState,
      { headingRad: vehicleState.headingRad },
      bounds.onRoad,
      anyCollision,
    );
    maneuverProgress = uTurnResult.progress;
    uTurnEvalState = uTurnResult.evalState;
    const parallelParkResult = updateParallelParkOutcomes(
      maneuverProgress,
      parallelParkEvalState,
      freeRoute.waypoints,
      routePoints,
      { x: vehicleState.x, z: vehicleState.z, headingRad: vehicleState.headingRad, speedMs: vehicleState.speedMs },
      bounds.onRoad,
      anyCollision,
    );
    maneuverProgress = parallelParkResult.progress;
    parallelParkEvalState = parallelParkResult.evalState;
    const roundaboutResult = updateRoundaboutOutcomes(
      maneuverProgress,
      roundaboutEvalState,
      { headingRad: vehicleState.headingRad, speedMs: vehicleState.speedMs },
      bounds.onRoad,
      anyCollision,
    );
    maneuverProgress = roundaboutResult.progress;
    roundaboutEvalState = roundaboutResult.evalState;
    maneuverProgress.forEach((entry, index) => {
      if (entry.outcome === previousUTurnParkOutcomes[index]) {
        return;
      }
      hud.setManeuverState(index, maneuverChecklistLabel(entry));
      console.log(`Maniobra "${entry.maneuver.description}": outcome ${entry.outcome}`);
    });

    // Semáforos: recoloreado continuo (no solo en transición), según la fase actual.
    trafficLightMarkers.forEach((marker) => {
      const maneuver = freeRoute.maneuvers[marker.maneuverIndex];
      const phase = getTrafficLightPhase(elapsedSimS, maneuver.atWaypointIndex);
      marker.material.diffuseColor = TRAFFIC_LIGHT_PHASE_COLORS[phase];
    });

    // Peatones actualmente sobre la calzada (no en la acera, ver
    // isPedestrianInRoadway): la IA de vehículos les cede el paso igual que a
    // un semáforo en rojo, usando su posición del frame anterior (mismo
    // patrón de snapshot que aiArcsBeforeStep) — se actualizan más abajo.
    const blockingPedestrianForwardArcs = pedestrians
      .filter((pedestrian) => isPedestrianInRoadway(pedestrian.state, ROAD_WIDTH_M / 2))
      .map((pedestrian) => estimateArcLength(routePoints, arcLengthTable, pedestrian.crossing.position));

    // Tráfico de IA: cada vehículo frena ante semáforos en rojo por delante,
    // un peatón cruzando la calzada, o el vehículo inmediatamente delante
    // suyo (jugador u otro coche de IA), ver core/traffic-ai.ts. Se usa un
    // snapshot de las distancias antes de este frame para que el orden de
    // iteración no afecte al resultado.
    const redLightArcLengths = freeRoute.maneuvers
      .filter((maneuver) => maneuver.type === 'traffic-light')
      .filter((maneuver) => getTrafficLightPhase(elapsedSimS, maneuver.atWaypointIndex) === 'red')
      .map((maneuver) => arcLengthTable[maneuver.atWaypointIndex]);
    const stopPointArcLengths = [...redLightArcLengths, ...blockingPedestrianForwardArcs];
    const playerArcM = estimateArcLength(routePoints, arcLengthTable, { x: vehicleState.x, z: vehicleState.z });
    // El jugador no tiene un carril fijo (se mueve libre en 2D, ver
    // vehicle-controller.ts), así que su carril "actual" se deriva de su
    // desplazamiento lateral respecto al eje — solo importa para saber si
    // bloquea a un vehículo de IA que le siga por detrás en ese carril.
    const playerLaneCount = ownDirectionLaneCount(freeRoute.waypoints, bounds.segmentIndex);
    const playerLaneIndex = laneIndexFromLateralOffsetM(bounds.lateralOffsetM, playerLaneCount);
    const aiArcsBeforeStep = aiVehicles.map((vehicle) => vehicle.state.distanceAlongRouteM);

    aiVehicles.forEach((vehicle, index) => {
      const others = [
        { arcM: playerArcM, laneIndex: playerLaneIndex },
        ...aiVehicles
          .map((other, otherIndex) => ({ arcM: aiArcsBeforeStep[otherIndex], laneIndex: other.laneIndex }))
          .filter((_, otherIndex) => otherIndex !== index),
      ];
      const leadArcM = leadVehicleArcM(vehicle.laneIndex, vehicle.state.distanceAlongRouteM, others);

      const aiBounds = queryRoadBounds(routePoints, ROAD_WIDTH_M, {
        x: vehicle.mesh.position.x,
        z: vehicle.mesh.position.z,
      });
      const speedLimitMs = currentSpeedLimitKmh(freeRoute.waypoints, aiBounds.segmentIndex) / 3.6;
      const stopLineArcM = nextStopArcLengthM(vehicle.state.distanceAlongRouteM, stopPointArcLengths, leadArcM);
      const laneCount = ownDirectionLaneCount(freeRoute.waypoints, aiBounds.segmentIndex);

      // Colisión física con otro vehículo de IA (propio sentido u oncoming) o
      // un peatón: la distancia de seguimiento (leadArcM) ya evita casi
      // siempre este caso dentro del mismo carril, pero esto es la red de
      // seguridad — mismo patrón exacto que la colisión del jugador más
      // arriba (rectanglesOverlap/SAT + punto-en-rectángulo), reutilizando el
      // mismo snapshot otherVehicleCorners/pedestrianPoints del frame
      // anterior. Si colisiona, se cancela el avance (igual que al chocar el
      // jugador): se descarta el estado candidato y se mantiene la posición
      // previa con velocidad 0.
      const previousState = vehicle.state;
      const candidateState = stepAiVehicle(previousState, { speedLimitMs, stopLineArcM }, dtSeconds);
      const candidatePose = offsetPoseToLane(
        poseAtArcLength(routePoints, arcLengthTable, candidateState.distanceAlongRouteM),
        laneOffsetM(vehicle.laneIndex, laneCount),
      );
      const candidateCorners = vehicleCorners(candidatePose.x, candidatePose.z, candidatePose.headingRad, VEHICLE_LENGTH_M, VEHICLE_WIDTH_M);
      const othersCorners = otherVehicleCorners.filter((_, otherIndex) => otherIndex !== index);
      const collidesWithVehicle = findCollidingRectangle(candidateCorners, othersCorners) !== null;
      const collidesWithPedestrian = findCollidingPoint(candidateCorners, pedestrianPoints) !== null;

      vehicle.state =
        collidesWithVehicle || collidesWithPedestrian
          ? { distanceAlongRouteM: previousState.distanceAlongRouteM, speedMs: 0 }
          : candidateState;
      const pose =
        collidesWithVehicle || collidesWithPedestrian
          ? offsetPoseToLane(
              poseAtArcLength(routePoints, arcLengthTable, vehicle.state.distanceAlongRouteM),
              laneOffsetM(vehicle.laneIndex, laneCount),
            )
          : candidatePose;
      vehicle.mesh.position.x = pose.x;
      vehicle.mesh.position.z = pose.z;
      vehicle.mesh.rotation.y = pose.headingRad;
    });

    // Peatones sobre la calzada dentro del tramo de doble sentido, en la
    // distancia acumulada invertida de oncomingRoute (ver estimateArcLength
    // en traffic-ai.ts, genérica sobre cualquier lista de puntos ordenada).
    const blockingPedestrianMirroredArcs = pedestrians
      .filter((pedestrian) => isPedestrianInRoadway(pedestrian.state, ROAD_WIDTH_M / 2))
      .filter(
        (pedestrian) =>
          estimateArcLength(routePoints, arcLengthTable, pedestrian.crossing.position) <=
          arcLengthTable[oncomingRoute.twoWayEndIndex],
      )
      .map((pedestrian) => estimateArcLength(oncomingRoute.points, oncomingArcLengthTable, pedestrian.crossing.position));

    // Tráfico de IA en sentido contrario: mismos criterios que el tráfico
    // normal (semáforo en rojo por delante, peatón cruzando, o el vehículo de
    // delante en su propio sentido), pero sobre el sub-trazado invertido de
    // oncomingRoute — no interactúan con el jugador (arc-following, carriles
    // distintos), pero sí tienen la misma red de seguridad de colisión física
    // que el tráfico normal (ver el forEach de abajo).
    const oncomingRedLightArcLengths = freeRoute.maneuvers
      .filter((maneuver) => maneuver.type === 'traffic-light')
      .filter((maneuver) => getTrafficLightPhase(elapsedSimS, maneuver.atWaypointIndex) === 'red')
      .map((maneuver) => mirroredArcLengthOfWaypoint(oncomingArcLengthTable, oncomingRoute.twoWayEndIndex, maneuver.atWaypointIndex))
      .filter((arc): arc is number => arc !== null);
    const oncomingStopPointArcLengths = [...oncomingRedLightArcLengths, ...blockingPedestrianMirroredArcs];
    const oncomingArcsBeforeStep = oncomingVehicles.map((vehicle) => vehicle.state.distanceAlongRouteM);

    oncomingVehicles.forEach((vehicle, index) => {
      const otherArcs = oncomingArcsBeforeStep.filter((_, otherIndex) => otherIndex !== index);
      const arcsAhead = otherArcs.filter((arc) => arc > vehicle.state.distanceAlongRouteM);
      const leadArcM = arcsAhead.length > 0 ? Math.min(...arcsAhead) : null;

      const oncomingBounds = queryRoadBounds(routePoints, ROAD_WIDTH_M, {
        x: vehicle.mesh.position.x,
        z: vehicle.mesh.position.z,
      });
      const speedLimitMs = currentSpeedLimitKmh(freeRoute.waypoints, oncomingBounds.segmentIndex) / 3.6;
      const stopLineArcM = nextStopArcLengthM(vehicle.state.distanceAlongRouteM, oncomingStopPointArcLengths, leadArcM);

      // Misma red de seguridad de colisión física que en aiVehicles.forEach
      // arriba (otherVehicleCorners cubre ambos sentidos, el índice de este
      // vehículo dentro de ese snapshot combinado es aiVehicles.length + index).
      const previousState = vehicle.state;
      const candidateState = stepAiVehicle(previousState, { speedLimitMs, stopLineArcM }, dtSeconds);
      const candidatePose = offsetPoseToLane(
        poseAtArcLength(oncomingRoute.points, oncomingArcLengthTable, candidateState.distanceAlongRouteM),
        LANE_OFFSET_M,
      );
      const candidateCorners = vehicleCorners(candidatePose.x, candidatePose.z, candidatePose.headingRad, VEHICLE_LENGTH_M, VEHICLE_WIDTH_M);
      const selfIndex = aiVehicles.length + index;
      const othersCorners = otherVehicleCorners.filter((_, otherIndex) => otherIndex !== selfIndex);
      const collidesWithVehicle = findCollidingRectangle(candidateCorners, othersCorners) !== null;
      const collidesWithPedestrian = findCollidingPoint(candidateCorners, pedestrianPoints) !== null;

      vehicle.state =
        collidesWithVehicle || collidesWithPedestrian
          ? { distanceAlongRouteM: previousState.distanceAlongRouteM, speedMs: 0 }
          : candidateState;
      const pose =
        collidesWithVehicle || collidesWithPedestrian
          ? offsetPoseToLane(
              poseAtArcLength(oncomingRoute.points, oncomingArcLengthTable, vehicle.state.distanceAlongRouteM),
              LANE_OFFSET_M,
            )
          : candidatePose;
      vehicle.mesh.position.x = pose.x;
      vehicle.mesh.position.z = pose.z;
      vehicle.mesh.rotation.y = pose.headingRad;
    });

    // Peatones: cruzan de acera a acera de forma autónoma (ver
    // core/pedestrian-ai.ts) — el peatón no reacciona al tráfico, es la IA de
    // vehículos la que le cede el paso (ver más arriba). El jugador tiene dos
    // consecuencias si no cede: la colisión física (bloquea el movimiento,
    // igual que un edificio) y, en los 3 pasos reales de ruta-01, la maniobra
    // give-way asociada se marca 'fail' si el jugador cruza su línea con el
    // peatón todavía en calzada (ver give-way-evaluator.ts).
    pedestrians.forEach((pedestrian) => {
      pedestrian.state = stepPedestrian(pedestrian.state, pedestrianCrossingHalfWidthM, dtSeconds);
      const pose = pedestrianPose(pedestrian.crossing, pedestrian.state);
      pedestrian.mesh.position.x = pose.x;
      pedestrian.mesh.position.z = pose.z;
      pedestrian.mesh.rotation.y = pose.headingRad;
    });

    // Veredicto agregado del examen (ver core/exam-result.ts): 'fail' en cuanto
    // cualquier maniobra falla, 'pass' solo al llegar al final de la ruta sin
    // fallos. reachedFinish es "pegajoso" (una vez true, no vuelve a false) para
    // no parpadear si el vehículo se aleja del último waypoint tras llegar.
    reachedFinish = reachedFinish || hasReachedFinish({ x: vehicleState.x, z: vehicleState.z }, lastWaypointLocal);
    const outcome = examOutcome(maneuverProgress, reachedFinish);
    if (outcome !== null && outcome !== examOutcomeShown) {
      examOutcomeShown = outcome;
      examResultScreen.show(
        outcome,
        maneuverProgress.map((entry) => maneuverChecklistLabel(entry)),
      );
      console.log(`Examen finalizado: ${outcome === 'pass' ? 'Apto' : 'No apto'}`);
    }
  });

  console.log(`Ruta cargada: ${freeRoute.name} (${freeRoute.waypoints.length} waypoints)`);

  return scene;
}

initLicensePanel();

const scene = createScene();

engine.runRenderLoop(() => {
  scene.render();
});

window.addEventListener('resize', () => {
  engine.resize();
});
