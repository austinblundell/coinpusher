import * as THREE from "three";
import type RAPIER from "@dimforge/rapier3d-compat";
import { DECK, KILL_Y, COLLECT_Y, PAYOUT_Z } from "../config";
import type { Physics } from "../physics/world";

// Shiny winnable prizes that sit on the deck among the coins. The pusher and the
// flood of quarters shove them toward the cliff; when one tumbles over and down
// the collector it pays out its (large) value. Prizes then respawn at the back
// so there is always something to chase.

export interface PrizeEvents {
  onWin: (value: number, name: string, world: THREE.Vector3) => void;
}

interface Prize {
  body: RAPIER.RigidBody;
  obj: THREE.Object3D;
  value: number;
  name: string;
  half: THREE.Vector3; // collider half-extents
  won: boolean;
}

// ---- Shared materials ----
const gold = new THREE.MeshStandardMaterial({ color: 0xffce4d, metalness: 1.0, roughness: 0.16 });
const silver = new THREE.MeshStandardMaterial({ color: 0xdfe4ea, metalness: 1.0, roughness: 0.14 });
const crystal = new THREE.MeshPhysicalMaterial({
  color: 0xbfeaff, metalness: 0.0, roughness: 0.02,
  transmission: 0.9, ior: 2.2, thickness: 0.08, reflectivity: 0.6,
  clearcoat: 1.0, clearcoatRoughness: 0.02,
});

function strapTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#f4efe2"; ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = "#b9302a";
  ctx.font = "bold 30px Georgia"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("$10,000", 128, 32);
  ctx.strokeStyle = "#b9302a"; ctx.lineWidth = 3;
  ctx.strokeRect(6, 6, 244, 52);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function cashTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#3f7d57"; ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.arc(128, 64, 8 + i * 7, 0, Math.PI * 2); ctx.stroke(); }
  ctx.fillStyle = "rgba(230,245,235,0.85)";
  ctx.font = "bold 40px Georgia"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("100", 128, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---- Prize builders: each returns a centred Object3D + collider half-extents ----

function buildStar(): { obj: THREE.Object3D; half: THREE.Vector3 } {
  const shape = new THREE.Shape();
  const spikes = 5, outer = 0.12, inner = 0.05;
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.035, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2 });
  geo.center();
  const mesh = new THREE.Mesh(geo, gold);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return { obj: mesh, half: new THREE.Vector3(0.12, 0.12, 0.035) };
}

function buildGem(): { obj: THREE.Object3D; half: THREE.Vector3 } {
  const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), crystal);
  mesh.scale.set(1, 1.3, 1);
  mesh.castShadow = true;
  return { obj: mesh, half: new THREE.Vector3(0.09, 0.11, 0.09) };
}

function buildTrophy(): { obj: THREE.Object3D; half: THREE.Vector3 } {
  const pts = [
    new THREE.Vector2(0.052, 0.0),
    new THREE.Vector2(0.052, 0.016),
    new THREE.Vector2(0.02, 0.024),
    new THREE.Vector2(0.018, 0.062),
    new THREE.Vector2(0.05, 0.078),
    new THREE.Vector2(0.078, 0.17),
    new THREE.Vector2(0.072, 0.17),
    new THREE.Vector2(0.045, 0.08),
    new THREE.Vector2(0.0, 0.072),
  ];
  const geo = new THREE.LatheGeometry(pts, 32);
  const group = new THREE.Group();
  const cup = new THREE.Mesh(geo, gold);
  cup.castShadow = true; cup.receiveShadow = true;
  cup.position.y = -0.085; // centre the ~0.17 tall trophy on the group origin
  group.add(cup);
  // Simple handles.
  for (const s of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.008, 8, 16, Math.PI), gold);
    h.position.set(s * 0.07, 0.045, 0);
    h.rotation.z = s < 0 ? Math.PI / 2 : -Math.PI / 2;
    group.add(h);
  }
  return { obj: group, half: new THREE.Vector3(0.08, 0.09, 0.06) };
}

function buildRing(): { obj: THREE.Object3D; half: THREE.Vector3 } {
  const group = new THREE.Group();
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.018, 16, 40), gold);
  band.rotation.x = Math.PI / 2; // ring lies flat
  band.castShadow = true;
  group.add(band);
  const stone = new THREE.Mesh(new THREE.OctahedronGeometry(0.045, 0), crystal);
  stone.position.y = 0.06;
  group.add(stone);
  // Prongs / setting.
  const setting = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.03, 12), gold);
  setting.position.y = 0.028;
  group.add(setting);
  return { obj: group, half: new THREE.Vector3(0.09, 0.06, 0.09) };
}

function buildCashBrick(): { obj: THREE.Object3D; half: THREE.Vector3 } {
  const group = new THREE.Group();
  const w = 0.28, h = 0.12, d = 0.16;
  const cashMat = new THREE.MeshStandardMaterial({ map: cashTexture(), color: 0xffffff, metalness: 0.0, roughness: 0.85 });
  const brick = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), cashMat);
  brick.castShadow = true; brick.receiveShadow = true;
  group.add(brick);
  // Paper strap around the middle.
  const strapMat = new THREE.MeshStandardMaterial({ map: strapTexture(), color: 0xffffff, metalness: 0.0, roughness: 0.7 });
  const strap = new THREE.Mesh(new THREE.BoxGeometry(w * 0.34, h + 0.004, d + 0.004), strapMat);
  group.add(strap);
  return { obj: group, half: new THREE.Vector3(w / 2, h / 2, d / 2) };
}

const SPECS: { name: string; value: number; build: () => { obj: THREE.Object3D; half: THREE.Vector3 } }[] = [
  { name: "GOLD STAR", value: 100, build: buildStar },
  { name: "GOLD STAR", value: 100, build: buildStar },
  { name: "SAPPHIRE", value: 500, build: buildGem },
  { name: "TROPHY", value: 1000, build: buildTrophy },
  { name: "DIAMOND RING", value: 2500, build: buildRing },
  { name: "CASH $10,000", value: 10000, build: buildCashBrick },
];

export class PrizeManager {
  group = new THREE.Group();
  private prizes: Prize[] = [];

  constructor(private physics: Physics, private events: PrizeEvents) {}

  spawnInitial() {
    const { RAPIER, world } = this.physics;
    SPECS.forEach((spec, i) => {
      const { obj, half } = spec.build();
      this.group.add(obj);
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setLinearDamping(0.1)
          .setAngularDamping(0.4)
          .setCcdEnabled(true),
      );
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z)
          .setDensity(5.0)
          .setFriction(0.6)
          .setRestitution(0.02),
        body,
      );
      const prize: Prize = { body, obj, value: spec.value, name: spec.name, half, won: false };
      this.placeOnDeck(prize, -0.45 + (i / (SPECS.length - 1)) * 0.9);
      this.prizes.push(prize);
    });
  }

  // Drop a prize onto the deck at a given x, spread through the field.
  private placeOnDeck(prize: Prize, x: number) {
    const z = 0.15 + Math.random() * 0.45;
    this.reset(prize, x, 0.45 + prize.half.y, z);
  }

  private reset(prize: Prize, x: number, y: number, z: number) {
    prize.won = false;
    prize.body.setTranslation({ x, y, z }, true);
    prize.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    prize.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    prize.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  }

  update() {
    for (const prize of this.prizes) {
      const t = prize.body.translation();
      const r = prize.body.rotation();
      prize.obj.position.set(t.x, t.y, t.z);
      prize.obj.quaternion.set(r.x, r.y, r.z, r.w);

      const overFront = t.z > PAYOUT_Z;

      // Award once, the moment it tips over the front cliff.
      if (!prize.won && overFront && t.y < KILL_Y) {
        prize.won = true;
        this.events.onWin(prize.value, prize.name, new THREE.Vector3(t.x, t.y, t.z));
      }

      // Recycle back onto the deck once it has dropped away (or was lost a side).
      const gone = t.y < COLLECT_Y || Math.abs(t.x) > 3 || t.z > 3;
      const lostSide = t.y < KILL_Y && !overFront;
      if (gone || lostSide) {
        this.placeOnDeck(prize, (Math.random() - 0.5) * 1.0);
      }
    }
  }
}
