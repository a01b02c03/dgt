import { Color3, Engine, FollowCamera, HemisphericLight, MeshBuilder, Scene, StandardMaterial, Vector3 } from '@babylonjs/core';
import { findCollidingBuilding, vehicleCorners } from './core/collision';
import { examOutcome, hasReachedFinish } from './core/exam-result';
import { toLocalMeters } from './core/geo';
import { currentSpeedLimitKmh, maneuverChecklistLabel, speedMsToKmh } from './core/hud';
import { licenseStatusView } from './core/license';
import { activateLicense, fetchSessionStatus, requestCheckout, validateLicense } from './license/api';
import { getOrCreateDeviceId, readStoredLicense, writeStoredLicense } from './license/storage';
import { createManeuverProgress, updateManeuverProgress } from './core/maneuver-tracker';
import { createParallelParkEvalState, updateParallelParkOutcomes } from './core/parallel-park-evaluator';
import {
  createPedestrianState,
  PEDESTRIAN_CROSSING_MARGIN_M,
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
  // jugador (todavía no hay modelo de carriles/sentido contrario, ver
  // CLAUDE.md), respetan los semáforos en rojo y guardan distancia con el
  // vehículo inmediatamente delante (jugador u otro coche de IA) — ver
  // core/traffic-ai.ts. Offsets iniciales arbitrarios, no ligados a ningún
  // dato real; se descartan los que caen más allá del final de la ruta.
  const arcLengthTable = buildArcLengthTable(routePoints);
  const routeLengthM = arcLengthTable[arcLengthTable.length - 1];
  const AI_VEHICLE_INITIAL_OFFSETS_M = [60, 140];
  const aiVehicles = AI_VEHICLE_INITIAL_OFFSETS_M.filter((offsetM) => offsetM < routeLengthM).map((offsetM) => {
    const { mesh, bodyMaterial } = buildVehicleMesh(scene);
    bodyMaterial.diffuseColor = AI_VEHICLE_COLOR;
    const pose = poseAtArcLength(routePoints, arcLengthTable, offsetM);
    mesh.position.x = pose.x;
    mesh.position.z = pose.z;
    mesh.rotation.y = pose.headingRad;
    return { mesh, state: createAiVehicleState(offsetM) };
  });

  // Peatones: uno por cada señal 'pedestrian-crossing' de la ruta, cruzando
  // perpendicular a la calzada en ese punto (ver core/pedestrian-ai.ts).
  // ruta-01 no tiene todavía ninguna señal de este tipo (ver CLAUDE.md), así
  // que este array está vacío hoy y no tiene efecto visible.
  const pedestrianCrossingHalfWidthM = ROAD_WIDTH_M / 2 + PEDESTRIAN_CROSSING_MARGIN_M;
  const pedestrians = freeRoute.signs
    .filter((sign) => sign.type === 'pedestrian-crossing')
    .map((sign) => {
      const crossing = { position: toLocalMeters(origin, sign.position), headingDeg: sign.headingDeg };
      const { mesh } = buildPedestrianMesh(scene);
      const state = createPedestrianState(-pedestrianCrossingHalfWidthM);
      const pose = pedestrianPose(crossing, state);
      mesh.position.x = pose.x;
      mesh.position.z = pose.z;
      mesh.rotation.y = pose.headingRad;
      return { mesh, crossing, state };
    });

  const maneuverMarkers = buildManeuverMarkers(freeRoute, origin, scene);
  const trafficLightMarkers = buildTrafficLightMarkers(freeRoute, origin, scene);
  let maneuverProgress = createManeuverProgress(freeRoute.maneuvers);
  let crossingState = createStopLineCrossingState(freeRoute.maneuvers.length);
  let uTurnEvalState = createUTurnEvalState(freeRoute.maneuvers.length);
  let parallelParkEvalState = createParallelParkEvalState(freeRoute.maneuvers.length);

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

    // Colisión con edificios: a diferencia de los límites de calzada, un coche
    // real no puede atravesar una pared, así que aquí sí bloqueamos el
    // movimiento (se cancela el desplazamiento y se detiene, como al chocar).
    const corners = vehicleCorners(candidate.x, candidate.z, candidate.headingRad, VEHICLE_LENGTH_M, VEHICLE_WIDTH_M);
    const collision = findCollidingBuilding(corners, buildingShapes);
    if (Boolean(collision) !== wasColliding) {
      console.log(collision ? `Colisión con edificio ${collision.id}` : 'Sin colisión');
      wasColliding = Boolean(collision);
    }
    vehicleState = collision
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

    // Evaluación pass/fail de maniobras u-turn y parallel-park: ver
    // u-turn-evaluator.ts / parallel-park-evaluator.ts para el criterio de
    // cada una. Ninguna ruta instancia todavía estos tipos de maniobra
    // (ver CLAUDE.md), así que estas llamadas no tienen efecto visible hoy.
    const previousUTurnParkOutcomes = maneuverProgress.map((entry) => entry.outcome);
    const uTurnResult = updateUTurnOutcomes(
      maneuverProgress,
      uTurnEvalState,
      { headingRad: vehicleState.headingRad },
      bounds.onRoad,
      Boolean(collision),
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
      Boolean(collision),
    );
    maneuverProgress = parallelParkResult.progress;
    parallelParkEvalState = parallelParkResult.evalState;
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

    // Tráfico de IA: cada vehículo frena ante semáforos en rojo por delante o
    // ante el vehículo inmediatamente delante suyo (jugador u otro coche de
    // IA), ver core/traffic-ai.ts. Se usa un snapshot de las distancias antes
    // de este frame para que el orden de iteración no afecte al resultado.
    const redLightArcLengths = freeRoute.maneuvers
      .filter((maneuver) => maneuver.type === 'traffic-light')
      .filter((maneuver) => getTrafficLightPhase(elapsedSimS, maneuver.atWaypointIndex) === 'red')
      .map((maneuver) => arcLengthTable[maneuver.atWaypointIndex]);
    const playerArcM = estimateArcLength(routePoints, arcLengthTable, { x: vehicleState.x, z: vehicleState.z });
    const aiArcsBeforeStep = aiVehicles.map((vehicle) => vehicle.state.distanceAlongRouteM);

    aiVehicles.forEach((vehicle, index) => {
      const otherArcs = [playerArcM, ...aiArcsBeforeStep.filter((_, otherIndex) => otherIndex !== index)];
      const arcsAhead = otherArcs.filter((arc) => arc > vehicle.state.distanceAlongRouteM);
      const leadArcM = arcsAhead.length > 0 ? Math.min(...arcsAhead) : null;

      const aiBounds = queryRoadBounds(routePoints, ROAD_WIDTH_M, {
        x: vehicle.mesh.position.x,
        z: vehicle.mesh.position.z,
      });
      const speedLimitMs = currentSpeedLimitKmh(freeRoute.waypoints, aiBounds.segmentIndex) / 3.6;
      const stopLineArcM = nextStopArcLengthM(vehicle.state.distanceAlongRouteM, redLightArcLengths, leadArcM);

      vehicle.state = stepAiVehicle(vehicle.state, { speedLimitMs, stopLineArcM }, dtSeconds);
      const pose = poseAtArcLength(routePoints, arcLengthTable, vehicle.state.distanceAlongRouteM);
      vehicle.mesh.position.x = pose.x;
      vehicle.mesh.position.z = pose.z;
      vehicle.mesh.rotation.y = pose.headingRad;
    });

    // Peatones: cruzan de acera a acera de forma autónoma (ver
    // core/pedestrian-ai.ts). Ningún vehículo (jugador ni IA) les cede el
    // paso todavía, gap conocido documentado en CLAUDE.md.
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
