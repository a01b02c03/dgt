import { Color3, Engine, FollowCamera, HemisphericLight, MeshBuilder, Scene, StandardMaterial, Vector3 } from '@babylonjs/core';
import { findCollidingBuilding, vehicleCorners } from './core/collision';
import { toLocalMeters } from './core/geo';
import { createManeuverProgress, updateManeuverProgress } from './core/maneuver-tracker';
import { queryRoadBounds, ROAD_WIDTH_M } from './core/road-bounds';
import { getTrafficLightPhase } from './core/traffic-light';
import { createStopLineCrossingState, updateTrafficLightOutcomes } from './core/traffic-light-evaluator';
import { getBuildings, getFreeRoutes } from './routes';
import { buildBuildingMeshes } from './scene/building-mesh';
import { attachKeyboardInput } from './scene/keyboard-input';
import {
  buildManeuverMarkers,
  MANEUVER_ACTIVE_COLOR,
  MANEUVER_COMPLETED_COLOR,
  MANEUVER_PENDING_COLOR,
} from './scene/maneuver-markers';
import { buildRoadMesh } from './scene/road-mesh';
import { buildSignMarkers } from './scene/sign-markers';
import { buildTrafficLightMarkers, TRAFFIC_LIGHT_PHASE_COLORS } from './scene/traffic-light-markers';
import { createVehicleState, stepVehicle } from './scene/vehicle-controller';
import {
  buildVehicleMesh,
  VEHICLE_LENGTH_M,
  VEHICLE_OFF_ROAD_COLOR,
  VEHICLE_ON_ROAD_COLOR,
  VEHICLE_WIDTH_M,
} from './scene/vehicle-mesh';

const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
const engine = new Engine(canvas, true);

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

  const maneuverMarkers = buildManeuverMarkers(freeRoute, origin, scene);
  const trafficLightMarkers = buildTrafficLightMarkers(freeRoute, origin, scene);
  let maneuverProgress = createManeuverProgress(freeRoute.maneuvers);
  let crossingState = createStopLineCrossingState(freeRoute.maneuvers.length);

  const getInput = attachKeyboardInput();
  let wasOnRoad = true;
  let wasColliding = false;
  let elapsedSimS = 0;
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
      console.log(`Maniobra "${entry.maneuver.description}": outcome ${entry.outcome}`);
    });

    // Semáforos: recoloreado continuo (no solo en transición), según la fase actual.
    trafficLightMarkers.forEach((marker) => {
      const maneuver = freeRoute.maneuvers[marker.maneuverIndex];
      const phase = getTrafficLightPhase(elapsedSimS, maneuver.atWaypointIndex);
      marker.material.diffuseColor = TRAFFIC_LIGHT_PHASE_COLORS[phase];
    });
  });

  console.log(`Ruta cargada: ${freeRoute.name} (${freeRoute.waypoints.length} waypoints)`);

  return scene;
}

const scene = createScene();

engine.runRenderLoop(() => {
  scene.render();
});

window.addEventListener('resize', () => {
  engine.resize();
});
