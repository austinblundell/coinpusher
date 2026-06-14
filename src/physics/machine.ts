import type RAPIER from "@dimforge/rapier3d-compat";
import {
  DECK, SIDEWALL, PUSHER, CHANNEL, COLLECTOR,
  CHANNEL_BOARD_HALF, CHANNEL_GLASS_HALF, CHANNEL_BOARD_Z, CHANNEL_GLASS_Z,
} from "../config";

export interface Machine {
  pusher: RAPIER.RigidBody;
  update: (elapsed: number) => void;
}

// Builds the static cabinet colliders and the kinematic reciprocating pusher.
// Coordinate frame: +X right, +Y up, +Z toward the player (the cliff/payout side).
export function buildMachine(R: typeof RAPIER, world: RAPIER.World): Machine {
  const { halfWidth, backZ, cliffZ } = DECK;
  const deckMidZ = (backZ + cliffZ) / 2;
  const deckLenZ = cliffZ - backZ;

  const addBox = (
    hx: number, hy: number, hz: number,
    x: number, y: number, z: number,
    friction = 0.5, restitution = 0.02,
  ) => {
    const body = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(x, y, z));
    const desc = R.ColliderDesc.cuboid(hx, hy, hz)
      .setFriction(friction)
      .setRestitution(restitution);
    world.createCollider(desc, body);
  };

  // A box rotated about the Z axis — used for the angled collector ramps.
  const addRotatedBox = (
    hx: number, hy: number, hz: number,
    x: number, y: number, z: number,
    angleZ: number, friction = 0.5, restitution = 0.0,
  ) => {
    const q = { x: 0, y: 0, z: Math.sin(angleZ / 2), w: Math.cos(angleZ / 2) };
    const body = world.createRigidBody(
      R.RigidBodyDesc.fixed().setTranslation(x, y, z).setRotation(q),
    );
    const desc = R.ColliderDesc.cuboid(hx, hy, hz)
      .setFriction(friction)
      .setRestitution(restitution);
    world.createCollider(desc, body);
  };

  // Deck floor (coins slide on this). Low friction so the pusher glides the
  // whole bed forward toward the cliff.
  addBox(halfWidth + 0.06, 0.05, deckLenZ / 2, 0, DECK.y - 0.05, deckMidZ, 0.2, 0.0);

  // Back wall.
  addBox(halfWidth + 0.06, 0.2, 0.04, 0, 0.15, backZ - 0.04, 0.4);

  // Side walls — they stop at SIDEWALL.endZ, leaving a front "loss" gap.
  const sideLenZ = SIDEWALL.endZ - backZ;
  const sideMidZ = (backZ + SIDEWALL.endZ) / 2;
  for (const s of [-1, 1]) {
    addBox(
      SIDEWALL.thickness / 2, SIDEWALL.height / 2, sideLenZ / 2,
      s * (halfWidth + SIDEWALL.thickness / 2), SIDEWALL.height / 2, sideMidZ,
      0.3,
    );
  }

  // Metal collector hopper: slanted left/right sides → large square hole → deep shaft.
  const cDepth = COLLECTOR.frontZ - COLLECTOR.backZ;
  const cMidZ = (COLLECTOR.backZ + COLLECTOR.frontZ) / 2;
  const dx = COLLECTOR.outerX - COLLECTOR.innerX;
  const dropH = COLLECTOR.outerY - COLLECTOR.holeTopY;
  const rampLen = Math.hypot(dx, dropH);
  const rampAngle = Math.atan2(dropH, dx);
  const rampMidX = (COLLECTOR.outerX + COLLECTOR.innerX) / 2;
  const rampMidY = (COLLECTOR.outerY + COLLECTOR.holeTopY) / 2;
  // Low friction so coins reliably slide to the hole rather than resting.
  for (const s of [-1, 1]) {
    addRotatedBox(
      rampLen / 2, 0.02, cDepth / 2,
      s * rampMidX, rampMidY, cMidZ,
      s === -1 ? -rampAngle : rampAngle, 0.14, 0.0,
    );
  }
  // Deep shaft below the hole (4 walls) guiding coins straight down.
  const shaftHalfY = (COLLECTOR.holeTopY - COLLECTOR.shaftBottomY) / 2;
  const shaftMidY = (COLLECTOR.holeTopY + COLLECTOR.shaftBottomY) / 2;
  for (const s of [-1, 1]) {
    addBox(0.02, shaftHalfY, cDepth / 2, s * COLLECTOR.innerX, shaftMidY, cMidZ, 0.2); // left/right
  }
  addBox(COLLECTOR.innerX, shaftHalfY, 0.02, 0, shaftMidY, COLLECTOR.backZ, 0.2);  // back
  addBox(COLLECTOR.innerX, shaftHalfY, 0.02, 0, shaftMidY, COLLECTOR.frontZ, 0.2); // front
  // No floor: coins free-fall through the shaft and are collected mid-flight so
  // they never stack up and stall.
  // Outer housing so coins can't escape off the sides or front.
  for (const s of [-1, 1]) {
    addBox(0.03, 0.22, cDepth / 2, s * (COLLECTOR.outerX + 0.03), COLLECTOR.outerY - 0.05, cMidZ, 0.3);
  }
  addBox(COLLECTOR.outerX + 0.06, 0.14, 0.03, 0, COLLECTOR.outerY + 0.05, COLLECTOR.frontZ, 0.3);

  // ---- Vertical glass drop chute ----
  // Low friction so coins slide down freely. The board and glass colliders sit
  // OUTSIDE the free gap (see config), so a coin spawned at centerZ has real
  // clearance and never spawns interpenetrating. CCD prevents tunnelling.
  const boardMidY = (CHANNEL.topY + CHANNEL.boardBottomY) / 2;
  const boardHalfY = (CHANNEL.topY - CHANNEL.boardBottomY) / 2;
  const glassMidY = (CHANNEL.topY + CHANNEL.glassBottomY) / 2;
  const glassHalfY = (CHANNEL.topY - CHANNEL.glassBottomY) / 2;

  addBox(CHANNEL.halfWidth, boardHalfY, CHANNEL_BOARD_HALF, 0, boardMidY, CHANNEL_BOARD_Z, 0.1, 0.0); // back board
  addBox(CHANNEL.halfWidth, glassHalfY, CHANNEL_GLASS_HALF, 0, glassMidY, CHANNEL_GLASS_Z, 0.06, 0.0); // glass pane
  // Side walls span the full depth between board and glass.
  const sideHalfZ = (CHANNEL_GLASS_Z - CHANNEL_BOARD_Z) / 2 + 0.01;
  for (const s of [-1, 1]) {
    addBox(0.012, boardHalfY, sideHalfZ, s * (CHANNEL.halfWidth + 0.012), boardMidY, CHANNEL.centerZ, 0.1, 0.0);
  }

  // ---- Kinematic pusher ----
  const pusherBody = world.createRigidBody(
    R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, PUSHER.height / 2, PUSHER.baseZ),
  );
  const pusherDesc = R.ColliderDesc.cuboid(halfWidth, PUSHER.height / 2, PUSHER.length / 2)
    .setFriction(0.45)
    .setRestitution(0.0);
  world.createCollider(pusherDesc, pusherBody);

  const update = (elapsed: number) => {
    const z = PUSHER.baseZ + Math.sin(elapsed * PUSHER.speed) * PUSHER.amplitude;
    pusherBody.setNextKinematicTranslation({ x: 0, y: PUSHER.height / 2, z });
  };

  return { pusher: pusherBody, update };
}
