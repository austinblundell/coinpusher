// Shared constants used by both the physics and render layers so the visible
// cabinet and the invisible colliders always agree on geometry.
//
// World units are roughly "decimeters" — chosen so a US quarter is ~0.17 units
// across, which keeps Rapier's solver happy with many small stacked bodies.

export interface Denom {
  id: "penny" | "nickel" | "dime" | "quarter" | "gold";
  name: string;          // shown on the reverse / picker
  value: number;         // dollars
  radius: number;        // world units
  thickness: number;     // world units
  metal: "copper" | "silver" | "gold";
  baseColor: number;     // specular tint for the metal
  rimText: string;       // arc text around the top of the obverse
  bottomText: string;    // arc text around the bottom of the reverse
  reeded: boolean;       // milled/reeded edge (dime, quarter) vs plain
  emblem: "memorial" | "monticello" | "torch" | "eagle";
}

// Real proportions preserved (penny 19.05mm, nickel 21.21, dime 17.91,
// quarter 24.26), scaled into world units.
export const DENOMS: Denom[] = [
  {
    id: "penny", name: "ONE CENT", value: 0.01,
    radius: 0.067, thickness: 0.0152, metal: "copper", baseColor: 0xb87333,
    rimText: "IN GOD WE TRUST", bottomText: "ONE CENT", reeded: false, emblem: "memorial",
  },
  {
    id: "nickel", name: "FIVE CENTS", value: 0.05,
    radius: 0.0746, thickness: 0.0195, metal: "silver", baseColor: 0xb9bcc2,
    rimText: "IN GOD WE TRUST", bottomText: "FIVE CENTS", reeded: false, emblem: "monticello",
  },
  {
    id: "dime", name: "ONE DIME", value: 0.10,
    radius: 0.0630, thickness: 0.0135, metal: "silver", baseColor: 0xc7cace,
    rimText: "IN GOD WE TRUST", bottomText: "ONE DIME", reeded: true, emblem: "torch",
  },
  {
    id: "quarter", name: "QUARTER DOLLAR", value: 0.25,
    radius: 0.0853, thickness: 0.0175, metal: "silver", baseColor: 0xc7cace,
    rimText: "IN GOD WE TRUST", bottomText: "QUARTER DOLLAR", reeded: true, emblem: "eagle",
  },
  // Shiny gold coins — only ever appear in the prepopulated bed (a prize to push
  // off), never dropped by the player.
  {
    id: "gold", name: "ONE DOLLAR", value: 1.0,
    radius: 0.092, thickness: 0.019, metal: "gold", baseColor: 0xffce4d,
    rimText: "IN GOD WE TRUST", bottomText: "ONE DOLLAR", reeded: true, emblem: "eagle",
  },
];

// The player only ever drops quarters.
export const PLAYER_DENOM = 3;

// ---- Machine layout ----
export const DECK = {
  halfWidth: 0.9,     // playfield spans x in [-0.9, 0.9]
  backZ: -0.92,       // back wall
  cliffZ: 0.85,       // front edge — coins past this fall into the payout tray
  y: 0,               // deck surface height
};

export const SIDEWALL = {
  endZ: 0.58,         // side walls stop here, leaving a front "loss" zone
  height: 0.26,
  thickness: 0.04,
};

// The reciprocating pusher: a kinematic box that slides along Z. Its top is a
// moving shelf; its front face shoves deck coins toward the cliff.
export const PUSHER = {
  length: 0.70,
  height: 0.16,
  baseZ: -0.34,       // center oscillates baseZ ± amplitude
  amplitude: 0.20,    // front face now sweeps to z≈0.21, well into the coin bed
  speed: 1.35,        // radians/sec
};

// Vertical glass-fronted drop chute. Coins fall face-on through a thin gap
// (one coin thick) between an opaque back board and a transparent glass pane,
// then tumble out the open bottom-front onto the pusher's top shelf.
// It sits over the zone that is always covered by the pusher, so coins never
// fall behind the pusher and jam.
export const CHANNEL = {
  centerZ: -0.46,        // depth of the channel (always above the pusher shelf)
  gap: 0.032,            // FREE space between board and glass faces. The thickest
                         // coin (nickel, 0.0195) fits with clearance. Colliders
                         // sit OUTSIDE this gap, so it is the real opening width.
  halfWidth: 0.84,       // inner half-width
  topY: 0.98,            // top of the board/glass
  glassBottomY: 0.30,    // glass stops here, leaving the front open at the bottom
  boardBottomY: 0.14,    // back board reaches down near the shelf
  spawnY: 0.9,           // where dropped coins enter the chute
};

// Collider/visual half-thicknesses, and the resulting face-aligned centers so
// the physics colliders and the cabinet meshes agree exactly.
export const CHANNEL_BOARD_HALF = 0.02;
export const CHANNEL_GLASS_HALF = 0.006;
export const CHANNEL_BOARD_Z = CHANNEL.centerZ - CHANNEL.gap / 2 - CHANNEL_BOARD_HALF;
export const CHANNEL_GLASS_Z = CHANNEL.centerZ + CHANNEL.gap / 2 + CHANNEL_GLASS_HALF;

export const DROP = { y: CHANNEL.spawnY, z: CHANNEL.centerZ };

// Metal collector hopper just past the cliff: slanted metal sides angle down
// from the left and right toward a LARGE SQUARE HOLE in the middle. Coins funnel
// into the hole, drop a long way down a metal shaft, then are collected.
export const COLLECTOR = {
  outerX: DECK.halfWidth + 0.04, // slanted sides reach the machine's side walls
  innerX: 0.32,                  // half-width of the large square hole (0.64 wide)
  outerY: -0.05,                 // slanted side top, just under the deck
  holeTopY: -0.55,               // steep slants meet the hole here (≈39°, nothing rests)
  backZ: DECK.cliffZ,            // hopper starts right at the cliff
  frontZ: DECK.cliffZ + 0.64,    // front of the hopper (square in plan with the hole)
  shaftBottomY: -0.95,           // floor of the deep collection shaft
};

// Despawn / scoring thresholds.
export const KILL_Y = -0.28;     // a coin off the side gutters is lost here
export const COLLECT_Y = -0.85;  // collected mid-fall in the shaft (no floor to stack on)
export const PAYOUT_Z = 0.88;    // past the cliff (vs. lost off the sides)

// High cap so the player can keep dropping; if it is ever reached the manager
// recycles the oldest coin rather than blocking the drop.
export const MAX_COINS = 600;

// Jackpot: this many payouts within the window triggers the celebration.
export const JACKPOT_COUNT = 8;
export const JACKPOT_WINDOW = 1.4; // seconds
