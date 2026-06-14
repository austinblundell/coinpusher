import * as THREE from "three";
import { createStage } from "./render/scene";
import { buildCabinet } from "./render/cabinet";
import { createPhysics } from "./physics/world";
import { buildMachine } from "./physics/machine";
import { CoinManager } from "./coins/coinManager";
import { PrizeManager } from "./prizes/prizes";
import { GameState } from "./game/state";
import { Sfx } from "./audio/sfx";
import { Hud } from "./ui/hud";
import { DECK, CHANNEL, PLAYER_DENOM } from "./config";

const money = (v: number) =>
  "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function main() {
  const canvas = document.getElementById("scene") as HTMLCanvasElement;
  const stage = createStage(canvas);
  const { pusherMesh } = buildCabinet(stage.scene);

  const sfx = new Sfx();
  const state = new GameState();
  const hud = new Hud();
  state.onChange = () => hud.setWinnings(state.winnings);

  const projectToScreen = (world: THREE.Vector3) => {
    const v = world.clone().project(stage.camera);
    return {
      x: (v.x * 0.5 + 0.5) * window.innerWidth,
      y: (-v.y * 0.5 + 0.5) * window.innerHeight,
    };
  };

  // ---- Jackpot / celebration feedback ----
  let bloomBoost = 0;
  const celebrate = () => {
    hud.showJackpot();
    sfx.jackpot();
    bloomBoost = 1.0;
  };
  state.onJackpot = celebrate;

  // ---- Physics (async wasm init) ----
  const physics = await createPhysics();
  const machine = buildMachine(physics.RAPIER, physics.world);

  // ---- Coins ----
  const coins = new CoinManager(physics, sfx, {
    onPayout: (value, world) => {
      state.award(value, clock.elapsedTime);
      sfx.payout();
      const s = projectToScreen(world);
      hud.floater(`+${money(value)}`, s.x, s.y, false);
    },
    onLoss: (world) => {
      const s = projectToScreen(world);
      hud.floater("lost", s.x, s.y, true);
    },
  });
  stage.scene.add(coins.group);
  coins.prime(); // start the deck full

  // ---- Prizes ----
  const prizes = new PrizeManager(physics, {
    onWin: (value, name, world) => {
      state.award(value, clock.elapsedTime);
      sfx.payout();
      const s = projectToScreen(world);
      hud.floater(`${name}  +${money(value)}`, s.x, s.y, false);
      if (value >= 1000) celebrate(); // trophies, rings and the cash brick pop off
    },
  });
  stage.scene.add(prizes.group);
  prizes.spawnInitial();

  // ---- Aim indicator: a face-on ring hovering at the chute entry ----
  const aim = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.05, 0.072, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd54a, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
  );
  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.05, 0.08, 3),
    new THREE.MeshBasicMaterial({ color: 0xffd54a, transparent: true, opacity: 0.85 }),
  );
  arrow.position.y = 0.11;
  aim.add(ring, arrow);
  aim.position.set(0, CHANNEL.topY + 0.12, CHANNEL.centerZ + 0.06);
  stage.scene.add(aim);

  // ---- Input: drag to orbit, click to drop an (unlimited) quarter ----
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const deckPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -DECK.y);
  const hit = new THREE.Vector3();
  const maxX = CHANNEL.halfWidth - 0.1;

  let dropX = 0;
  const pointerToDeckX = (clientX: number, clientY: number): number | null => {
    ndc.x = (clientX / window.innerWidth) * 2 - 1;
    ndc.y = -(clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(ndc, stage.camera);
    if (!raycaster.ray.intersectPlane(deckPlane, hit)) return null;
    return THREE.MathUtils.clamp(hit.x, -maxX, maxX);
  };

  const drop = () => coins.drop(PLAYER_DENOM, dropX);
  const unlockAudio = () => { sfx.resume(); sfx.startMusic(); };

  // Tap (or click) drops one coin; press-and-hold streams coins — the touch
  // equivalent of holding Space. Dragging orbits the camera (OrbitControls) and
  // drops nothing.
  const HOLD_DELAY = 200;   // ms a press must be held before it starts streaming
  const STREAM_EVERY = 110; // ms between streamed coins while held
  let downX = 0, downY = 0, downT = 0, dragged = false, streaming = false;
  let holdTimer = 0, streamTimer = 0;

  const stopHold = () => {
    clearTimeout(holdTimer);
    clearInterval(streamTimer);
    holdTimer = 0; streamTimer = 0;
  };

  canvas.addEventListener("pointerdown", (e) => {
    unlockAudio();
    downX = e.clientX; downY = e.clientY; downT = performance.now();
    dragged = false; streaming = false;
    const x = pointerToDeckX(e.clientX, e.clientY);
    if (x !== null) { dropX = x; aim.position.x = x; }
    stopHold();
    holdTimer = window.setTimeout(() => {
      if (dragged) return; // became an orbit drag before the hold elapsed
      streaming = true;
      drop(); // first coin of the stream
      streamTimer = window.setInterval(drop, STREAM_EVERY);
    }, HOLD_DELAY);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (e.buttons && (Math.abs(e.clientX - downX) > 5 || Math.abs(e.clientY - downY) > 5)) {
      if (!streaming) dragged = true; // moving before the stream starts = orbit
    }
    if (dragged) stopHold();
    const x = pointerToDeckX(e.clientX, e.clientY);
    if (x !== null) { dropX = x; aim.position.x = x; }
  });
  const endPress = () => {
    stopHold();
    // A quick tap that never turned into a drag or a stream drops a single coin.
    if (!dragged && !streaming && performance.now() - downT <= 400) drop();
    streaming = false;
  };
  canvas.addEventListener("pointerup", endPress);
  canvas.addEventListener("pointercancel", () => { stopHold(); streaming = false; });

  // Spacebar also drops a quarter at the current aim (hold to repeat via key-repeat).
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") { e.preventDefault(); unlockAudio(); drop(); }
  });

  // ---- Reveal once everything is ready ----
  hud.reveal();

  // ---- Main loop ----
  const clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    const dt = clock.getDelta();
    const t = clock.elapsedTime;

    machine.update(t);
    physics.step(dt);
    coins.update();
    prizes.update();

    // Sync pusher visual to its kinematic body.
    const pt = machine.pusher.translation();
    pusherMesh.position.set(pt.x, pt.y, pt.z);

    // Pulse the aim ring.
    const pulse = 1 + Math.sin(t * 6) * 0.08;
    ring.scale.set(pulse, pulse, 1);

    // Ease bloom back down after a celebration.
    if (bloomBoost > 0) {
      bloomBoost = Math.max(0, bloomBoost - dt * 0.8);
      stage.bloom.strength = 0.32 + bloomBoost * 1.1;
    }

    hud.tick();
    stage.render();
  }
  frame();
}

main().catch((err) => {
  console.error(err);
  const loader = document.getElementById("loader");
  if (loader) loader.innerHTML = `<div class="loader-text">Failed to start: ${err}</div>`;
});
