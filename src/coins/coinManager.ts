import * as THREE from "three";
import type RAPIER from "@dimforge/rapier3d-compat";
import { DENOMS, DROP, DECK, KILL_Y, COLLECT_Y, PAYOUT_Z, MAX_COINS } from "../config";
import type { Physics } from "../physics/world";
import { createCoinRenderers, type CoinRenderer } from "./coinFactory";
import type { Sfx } from "../audio/sfx";

interface Coin {
  body: RAPIER.RigidBody;
  denomIndex: number;
}

export interface CoinEvents {
  onPayout: (value: number, world: THREE.Vector3) => void;
  onLoss: (world: THREE.Vector3) => void;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);

export class CoinManager {
  renderers: CoinRenderer[];
  group = new THREE.Group();
  private coins: Coin[] = [];

  constructor(
    private physics: Physics,
    private sfx: Sfx,
    private events: CoinEvents,
  ) {
    this.renderers = createCoinRenderers();
    for (const r of this.renderers) this.group.add(r.mesh);
  }

  get count() {
    return this.coins.length;
  }


  // Drop a coin of `denomIndex` into the glass chute at world x.
  drop(denomIndex: number, x: number): boolean {
    return this.spawnAt(denomIndex, x, DROP.y, DROP.z, "channel");
  }

  // Lay a bed of coins across the deck so the machine starts primed and full,
  // the way a real arcade pusher does. Coins settle under gravity on load.
  prime(rows = 11, cols = 13) {
    const { halfWidth, cliffZ } = DECK;
    // Stay in front of the pusher's forward reach (and the chute) so primed
    // coins never start trapped behind the pusher or the back board.
    const z0 = 0.05; // within the pusher's forward reach so the bed gets pushed
    const z1 = cliffZ - 0.06;
    const gold = DENOMS.findIndex((d) => d.id === "gold");
    let n = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = -halfWidth + 0.12 + (c / (cols - 1)) * (2 * halfWidth - 0.24) + (Math.random() - 0.5) * 0.04;
        const z = z0 + (r / (rows - 1)) * (z1 - z0) + (Math.random() - 0.5) * 0.03;
        // Stagger heights so they drop in and settle without exploding apart.
        const y = 0.05 + (r % 2) * 0.04 + Math.random() * 0.02;
        const idx = r * cols + c;
        // A scattering of shiny gold coins; the rest an even mix of the US coins
        // (gold's index equals the count of US denoms, i.e. 0..3).
        const denom = idx % 7 === 3 ? gold : idx % gold;
        if (this.spawnAt(denom, x, y, z, "flat")) n++;
      }
    }
    return n;
  }

  private spawnAt(denomIndex: number, x: number, y: number, z: number, mode: "channel" | "flat"): boolean {
    // Never block a drop: at the cap, recycle the oldest coin to make room.
    if (this.coins.length >= MAX_COINS) this.despawn(this.coins[0]);
    const { RAPIER, world } = this.physics;
    const denom = DENOMS[denomIndex];

    const channel = mode === "channel";
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y, z)
      .setLinearDamping(0.08)
      .setCcdEnabled(true); // thin & fast — avoid tunnelling through deck/glass
    if (channel) {
      // Enter the chute face-on, drifting straight down with a little spin in
      // its own plane so the face is visible through the glass.
      desc.setLinvel((Math.random() - 0.5) * 0.05, -0.15, 0)
        .setAngvel({ x: 0, y: 0, z: (Math.random() - 0.5) * 5 })
        .setAngularDamping(0.25);
    } else {
      desc.setLinvel((Math.random() - 0.5) * 0.1, 0, 0.05 + Math.random() * 0.1)
        .setAngvel({ x: (Math.random() - 0.5) * 4, y: (Math.random() - 0.5) * 2, z: (Math.random() - 0.5) * 4 })
        .setAngularDamping(0.4);
    }
    const body = world.createRigidBody(desc);

    // Channel coins are oriented face-on (cylinder axis along world Z) with a
    // random in-plane spin. Bed coins lie flat (random yaw only).
    let rq: THREE.Quaternion;
    if (channel) {
      const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
      const spin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.random() * Math.PI * 2);
      rq = spin.multiply(tilt);
    } else {
      rq = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.random() * Math.PI * 2, 0));
    }
    body.setRotation({ x: rq.x, y: rq.y, z: rq.z, w: rq.w }, true);

    world.createCollider(
      RAPIER.ColliderDesc.cylinder(denom.thickness / 2, denom.radius)
        .setDensity(8.0)
        .setFriction(0.42)
        .setRestitution(0.04),
      body,
    );

    this.coins.push({ body, denomIndex });
    if (channel) this.sfx.drop();
    return true;
  }

  // Sync instanced meshes from physics + detect coins that left the deck.
  update() {
    const counts = new Array(this.renderers.length).fill(0);
    const remove: Coin[] = [];

    for (const coin of this.coins) {
      const t = coin.body.translation();

      const overFront = t.z > PAYOUT_Z;
      // z past the collector front, or far off the sides/back = gone.
      const outOfBounds = Math.abs(t.x) > 1.6 || t.z > 1.7 || t.z < -3;

      // Payout coins ride the funnel down to the chute bottom (COLLECT_Y) before
      // being collected; coins off the side gutters are lost at KILL_Y.
      if (t.y < COLLECT_Y || outOfBounds) {
        remove.push(coin);
        const pos = new THREE.Vector3(t.x, t.y, t.z);
        if (overFront) this.events.onPayout(DENOMS[coin.denomIndex].value, pos);
        else this.events.onLoss(pos);
        continue;
      }
      if (t.y < KILL_Y && !overFront) {
        remove.push(coin);
        this.events.onLoss(new THREE.Vector3(t.x, t.y, t.z));
        continue;
      }

      const r = coin.body.rotation();
      _q.set(r.x, r.y, r.z, r.w);
      _p.set(t.x, t.y, t.z);
      _m.compose(_p, _q, _s);

      const di = coin.denomIndex;
      const renderer = this.renderers[di];
      const idx = counts[di];
      if (idx < renderer.capacity) {
        renderer.mesh.setMatrixAt(idx, _m);
        counts[di] = idx + 1;
      }
    }

    for (let i = 0; i < this.renderers.length; i++) {
      const mesh = this.renderers[i].mesh;
      mesh.count = counts[i];
      mesh.instanceMatrix.needsUpdate = true;
    }

    for (const coin of remove) this.despawn(coin);
  }

  private despawn(coin: Coin) {
    const i = this.coins.indexOf(coin);
    if (i === -1) return;
    this.coins.splice(i, 1);
    this.physics.world.removeRigidBody(coin.body);
  }
}
