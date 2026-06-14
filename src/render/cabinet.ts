import * as THREE from "three";
import {
  DECK, SIDEWALL, PUSHER, CHANNEL, COLLECTOR,
  CHANNEL_BOARD_HALF, CHANNEL_GLASS_HALF, CHANNEL_BOARD_Z, CHANNEL_GLASS_Z,
} from "../config";

// Visual cabinet that mirrors the physics colliders in machine.ts: the deck,
// glossy side rails, back wall, the moving pusher, and a felt-lined payout tray.
// Returns the pusher mesh so the render loop can sync it to the kinematic body.
export function buildCabinet(scene: THREE.Scene): { pusherMesh: THREE.Object3D } {
  const { halfWidth, backZ, cliffZ } = DECK;
  const deckMidZ = (backZ + cliffZ) / 2;
  const deckLenZ = cliffZ - backZ;

  const group = new THREE.Group();
  scene.add(group);

  const deckMat = new THREE.MeshStandardMaterial({
    color: 0x123056,
    metalness: 0.05,
    roughness: 0.78,
  });
  const railMat = new THREE.MeshStandardMaterial({
    color: 0x0a0e18,
    metalness: 0.9,
    roughness: 0.18,
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xe0a92a,
    metalness: 1.0,
    roughness: 0.28,
  });

  const box = (
    w: number, h: number, d: number,
    x: number, y: number, z: number,
    mat: THREE.Material,
  ) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };

  // Deck surface.
  const deck = box(2 * halfWidth + 0.12, 0.1, deckLenZ, 0, DECK.y - 0.05, deckMidZ, deckMat);
  deck.receiveShadow = true;

  // Back wall with a gold trim cap.
  box(2 * halfWidth + 0.12, 0.4, 0.08, 0, 0.2, backZ - 0.04, railMat);
  box(2 * halfWidth + 0.12, 0.04, 0.1, 0, 0.4, backZ - 0.04, goldMat);

  // Side rails (run from the back to where the loss gap begins).
  const sideLenZ = SIDEWALL.endZ - backZ;
  const sideMidZ = (backZ + SIDEWALL.endZ) / 2;
  for (const s of [-1, 1]) {
    box(SIDEWALL.thickness, SIDEWALL.height, sideLenZ, s * (halfWidth + SIDEWALL.thickness / 2), SIDEWALL.height / 2, sideMidZ, railMat);
    box(SIDEWALL.thickness + 0.02, 0.03, sideLenZ, s * (halfWidth + SIDEWALL.thickness / 2), SIDEWALL.height, sideMidZ, goldMat);
  }

  // Outer cabinet shell under the deck (stops at the cliff so it never fills the
  // collector hole that drops below it).
  const shellMat = new THREE.MeshStandardMaterial({ color: 0x161a26, metalness: 0.6, roughness: 0.4 });
  box(2 * halfWidth + 0.5, 0.7, deckLenZ + 0.1, 0, -0.42, deckMidZ - 0.05, shellMat);

  // ---- Metal collector funnel: angled ramps feeding a central chute ----
  const steelMat = new THREE.MeshStandardMaterial({ color: 0xc2cad3, metalness: 0.85, roughness: 0.32 });
  const steelDark = new THREE.MeshStandardMaterial({ color: 0x565d66, metalness: 0.8, roughness: 0.4 });

  const cDepth = COLLECTOR.frontZ - COLLECTOR.backZ;
  const cMidZ = (COLLECTOR.backZ + COLLECTOR.frontZ) / 2;
  const dx = COLLECTOR.outerX - COLLECTOR.innerX;
  const dropH = COLLECTOR.outerY - COLLECTOR.holeTopY;
  const rampLen = Math.hypot(dx, dropH);
  const rampAngle = Math.atan2(dropH, dx);
  const rampMidX = (COLLECTOR.outerX + COLLECTOR.innerX) / 2;
  const rampMidY = (COLLECTOR.outerY + COLLECTOR.holeTopY) / 2;

  // Slanted steel sides funnelling toward the central hole.
  for (const s of [-1, 1]) {
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(rampLen, 0.03, cDepth), steelMat);
    ramp.position.set(s * rampMidX, rampMidY, cMidZ);
    ramp.rotation.z = s === -1 ? -rampAngle : rampAngle;
    ramp.castShadow = true;
    ramp.receiveShadow = true;
    group.add(ramp);
  }

  // Deep shaft below the square hole (dark steel walls + floor).
  const shaftH = COLLECTOR.holeTopY - COLLECTOR.shaftBottomY;
  const shaftMidY = (COLLECTOR.holeTopY + COLLECTOR.shaftBottomY) / 2;
  for (const s of [-1, 1]) {
    box(0.03, shaftH, cDepth, s * COLLECTOR.innerX, shaftMidY, cMidZ, steelDark);
  }
  box(2 * COLLECTOR.innerX, shaftH, 0.03, 0, shaftMidY, COLLECTOR.backZ, steelDark);
  box(2 * COLLECTOR.innerX, shaftH, 0.03, 0, shaftMidY, COLLECTOR.frontZ, steelDark);
  // A dark plate well below the collection point closes off the view down the
  // shaft without giving coins anything to stack on near COLLECT_Y.
  box(2 * COLLECTOR.innerX, 0.03, cDepth, 0, COLLECTOR.shaftBottomY - 0.25, cMidZ, steelDark);

  // Outer housing so the funnel reads as a solid metal box.
  for (const s of [-1, 1]) {
    box(0.04, 0.36, cDepth, s * (COLLECTOR.outerX + 0.04), COLLECTOR.outerY - 0.14, cMidZ, steelDark);
  }
  box(2 * COLLECTOR.outerX + 0.12, 0.36, 0.04, 0, COLLECTOR.outerY - 0.14, COLLECTOR.frontZ, steelDark);

  // Slim brushed-steel lip at the cliff edge (replaces the old gold bar).
  box(2 * halfWidth + 0.12, 0.04, 0.04, 0, DECK.y - 0.005, cliffZ, steelMat);

  // ---- Vertical glass drop chute ----
  const boardH = CHANNEL.topY - CHANNEL.boardBottomY;
  const boardMidY = (CHANNEL.topY + CHANNEL.boardBottomY) / 2;
  const glassH = CHANNEL.topY - CHANNEL.glassBottomY;
  const glassMidY = (CHANNEL.topY + CHANNEL.glassBottomY) / 2;
  const chW = 2 * CHANNEL.halfWidth;
  const chDepth = (CHANNEL_GLASS_Z - CHANNEL_BOARD_Z) + 0.04;

  // Opaque back board — brushed dark panel.
  const boardMat = new THREE.MeshStandardMaterial({ color: 0x0c1018, metalness: 0.7, roughness: 0.45 });
  box(chW + 0.05, boardH, CHANNEL_BOARD_HALF * 2, 0, boardMidY, CHANNEL_BOARD_Z, boardMat);

  // Side rails of the chute.
  for (const s of [-1, 1]) {
    box(0.05, boardH, chDepth, s * (CHANNEL.halfWidth + 0.025), boardMidY, CHANNEL.centerZ, railMat);
    box(0.06, 0.04, chDepth + 0.02, s * (CHANNEL.halfWidth + 0.025), CHANNEL.topY, CHANNEL.centerZ, goldMat);
  }

  // Gold feed hopper lip across the top where coins enter.
  box(chW + 0.12, 0.05, chDepth + 0.04, 0, CHANNEL.topY + 0.01, CHANNEL.centerZ, goldMat);

  // The glass pane — transparent, reflective, drawn last.
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xeaf4ff,
    metalness: 0.0,
    roughness: 0.06,
    transparent: true,
    opacity: 0.07,            // very clear so the coins behind read through
    reflectivity: 0.25,
    clearcoat: 0.6,
    clearcoatRoughness: 0.08,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const glass = new THREE.Mesh(new THREE.BoxGeometry(chW, glassH, CHANNEL_GLASS_HALF * 2), glassMat);
  glass.position.set(0, glassMidY, CHANNEL_GLASS_Z);
  glass.renderOrder = 2;
  group.add(glass);

  // ---- Pusher mesh (synced to the kinematic body each frame) ----
  const pusherMat = new THREE.MeshStandardMaterial({
    color: 0x1b2233,
    metalness: 0.85,
    roughness: 0.25,
  });
  const pusher = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2 * halfWidth, PUSHER.height, PUSHER.length),
    pusherMat,
  );
  body.castShadow = true;
  body.receiveShadow = true;
  pusher.add(body);
  // Gold leading edge so the push face reads clearly.
  const lip = new THREE.Mesh(
    new THREE.BoxGeometry(2 * halfWidth, PUSHER.height, 0.03),
    goldMat,
  );
  lip.position.z = PUSHER.length / 2;
  lip.castShadow = true;
  pusher.add(lip);
  group.add(pusher);

  return { pusherMesh: pusher };
}
