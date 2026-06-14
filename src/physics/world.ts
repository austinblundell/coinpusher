import RAPIER from "@dimforge/rapier3d-compat";

export interface Physics {
  RAPIER: typeof RAPIER;
  world: RAPIER.World;
  eventQueue: RAPIER.EventQueue;
  step: (dt: number) => void;
}

// Rapier's compat build loads inlined wasm; await init() before constructing a World.
export async function createPhysics(): Promise<Physics> {
  await RAPIER.init();

  const gravity = { x: 0, y: -9.81, z: 0 };
  const world = new RAPIER.World(gravity);
  world.timestep = 1 / 120;
  const eventQueue = new RAPIER.EventQueue(true);

  // Fixed-timestep accumulator so physics stays stable regardless of frame rate.
  let acc = 0;
  const MAX_STEPS = 6;
  const step = (dt: number) => {
    acc += Math.min(dt, 0.1);
    let n = 0;
    while (acc >= world.timestep && n < MAX_STEPS) {
      world.step(eventQueue);
      acc -= world.timestep;
      n++;
    }
  };

  return { RAPIER, world, eventQueue, step };
}
