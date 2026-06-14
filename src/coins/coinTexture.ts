import * as THREE from "three";
import type { Denom } from "../config";

// Procedurally mints a US-coin look. Everything is driven by a grayscale
// "relief" heightmap drawn on a canvas:
//   - the heightmap becomes a NORMAL map (so lighting catches the raised relief)
//   - it modulates an ALBEDO map (recessed areas read slightly darker)
//   - it seeds a ROUGHNESS map (raised, worn high points are shinier)
// The result is shaded as solid metal (metalness = 1) by MeshStandardMaterial.

const SIZE = 512;

export interface CoinFaceMaps {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
}

export interface CoinMaterialSet {
  obverse: CoinFaceMaps;
  reverse: CoinFaceMaps;
  edgeNormal: THREE.CanvasTexture | null; // reeded edge, or null for plain
}

const YEAR = "2026";

function newCanvas(size = SIZE): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  return { c, ctx };
}

// Draw text following a circular arc. angleCenter is measured clockwise from the
// top (12 o'clock). If `flip` is true the glyphs are oriented for the bottom arc.
function arcText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  radius: number,
  angleCenter: number,
  spread: number,
  font: string,
  flip = false,
) {
  ctx.save();
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const n = text.length;
  if (n === 0) {
    ctx.restore();
    return;
  }
  const step = spread / Math.max(n - 1, 1);
  const start = angleCenter - spread / 2;
  for (let i = 0; i < n; i++) {
    const a = start + step * i;
    const px = cx + Math.sin(a) * radius;
    const py = cy - Math.cos(a) * radius;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(flip ? a + Math.PI : a);
    ctx.fillText(text[i], 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

// A stylized left-facing presidential bust, drawn as a filled silhouette so it
// reads as raised relief once turned into a normal map.
function bust(ctx: CanvasRenderingContext2D, cx: number, cy: number, scale: number, shade: string) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.fillStyle = shade;
  ctx.beginPath();
  // Skull / forehead
  ctx.moveTo(18, -78);
  ctx.bezierCurveTo(-42, -86, -70, -40, -64, 4);
  // Brow + nose bridge facing left
  ctx.bezierCurveTo(-66, 18, -78, 24, -86, 36);
  ctx.bezierCurveTo(-80, 44, -74, 44, -70, 50);
  // Lips + chin
  ctx.bezierCurveTo(-66, 60, -70, 70, -58, 76);
  ctx.bezierCurveTo(-48, 82, -40, 80, -30, 86);
  // Jaw + neck down to base
  ctx.bezierCurveTo(-20, 96, 6, 104, 30, 104);
  ctx.lineTo(40, 120);
  ctx.lineTo(54, 120);
  // Back of head / hair
  ctx.bezierCurveTo(60, 40, 64, -36, 18, -78);
  ctx.closePath();
  ctx.fill();
  // Brow + hair detail (slightly higher relief)
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.beginPath();
  ctx.ellipse(2, -34, 30, 26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function emblem(ctx: CanvasRenderingContext2D, kind: Denom["emblem"], cx: number, cy: number, shade: string) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = shade;
  ctx.fillStyle = shade;
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (kind === "torch") {
    // Torch of liberty flanked by an olive and oak branch.
    ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(0, 70); ctx.lineTo(0, -36); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-16, -36); ctx.lineTo(16, -36); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-12, -40);
    ctx.bezierCurveTo(-18, -78, 18, -78, 12, -40);
    ctx.fill();
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * 34, 64); ctx.quadraticCurveTo(s * 26, 0, s * 16, -28);
      ctx.lineWidth = 6; ctx.stroke();
    }
  } else if (kind === "monticello") {
    // Domed mansion: dome, columns, steps.
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(0, -18, 26, Math.PI, 0); ctx.stroke();          // dome
    ctx.beginPath(); ctx.moveTo(-2, -44); ctx.lineTo(2, -44); ctx.stroke();   // spire
    ctx.strokeRect(-46, -18, 92, 14);                                          // pediment band
    for (let i = -4; i <= 4; i++) {
      ctx.beginPath(); ctx.moveTo(i * 10, -4); ctx.lineTo(i * 10, 50); ctx.stroke();
    }
    ctx.strokeRect(-54, 50, 108, 10);                                          // base
  } else if (kind === "memorial") {
    // Lincoln Memorial colonnade.
    ctx.lineWidth = 5;
    ctx.strokeRect(-58, -40, 116, 12);                                         // roof
    for (let i = -5; i <= 5; i++) {
      ctx.beginPath(); ctx.moveTo(i * 11, -26); ctx.lineTo(i * 11, 54); ctx.stroke();
    }
    ctx.strokeRect(-66, 54, 132, 12);                                          // base
  } else {
    // Heraldic eagle: body, spread wings, shield.
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(0, -44);
    ctx.bezierCurveTo(-70, -54, -86, 6, -48, 30);   // left wing
    ctx.bezierCurveTo(-30, 40, -16, 44, 0, 46);
    ctx.bezierCurveTo(16, 44, 30, 40, 48, 30);
    ctx.bezierCurveTo(86, 6, 70, -54, 0, -44);      // right wing
    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -40); ctx.lineTo(0, 64); ctx.stroke();      // body
    ctx.strokeRect(-16, 4, 32, 34);                                            // shield
    ctx.beginPath(); ctx.moveTo(0, -44); ctx.lineTo(10, -54); ctx.stroke();    // head/beak
  }
  ctx.restore();
}

// Compose one face's grayscale heightmap. 128 = flat field; brighter = raised.
function faceHeightmap(denom: Denom, side: "obverse" | "reverse"): HTMLCanvasElement {
  const { c, ctx } = newCanvas();
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const R = SIZE / 2;

  // Flat field
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Soft domed planchet: subtle radial lift toward the center.
  const dome = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  dome.addColorStop(0, "rgba(255,255,255,0.10)");
  dome.addColorStop(0.7, "rgba(255,255,255,0.0)");
  dome.addColorStop(1, "rgba(0,0,0,0.10)");
  ctx.fillStyle = dome;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Raised rim ring.
  ctx.lineWidth = 16;
  ctx.strokeStyle = "#e8e8e8";
  ctx.beginPath();
  ctx.arc(cx, cy, R - 16, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#5a5a5a";
  ctx.beginPath();
  ctx.arc(cx, cy, R - 30, 0, Math.PI * 2);
  ctx.stroke();

  const raised = "#f2f2f2";
  const textR = R - 58;

  if (side === "obverse") {
    bust(ctx, cx + 18, cy + 6, 1.18, raised);
    arcText(ctx, denom.rimText, cx, cy, textR, 0, Math.PI * 1.05, "bold 40px Georgia", false);
    ctx.fillStyle = raised;
    ctx.font = "bold 34px Georgia";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("LIBERTY", cx - R + 64, cy - 28);
    ctx.textAlign = "right";
    ctx.fillText(YEAR, cx + R - 64, cy + 86);
  } else {
    emblem(ctx, denom.emblem, cx, cy - 6, raised);
    arcText(ctx, "UNITED STATES OF AMERICA", cx, cy, textR, 0, Math.PI * 1.15, "bold 30px Georgia", false);
    arcText(ctx, denom.bottomText, cx, cy, textR, Math.PI, Math.PI * 0.8, "bold 32px Georgia", true);
    ctx.fillStyle = raised;
    ctx.font = "bold 18px Georgia";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("E PLURIBUS UNUM", cx, cy - 64);
  }

  // Mask everything to the coin disc so corners stay neutral.
  ctx.globalCompositeOperation = "destination-in";
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";

  return c;
}

// Sobel the heightmap into a tangent-space normal map.
function normalFromHeight(height: HTMLCanvasElement, strength: number): HTMLCanvasElement {
  const { c, ctx } = newCanvas();
  const hctx = height.getContext("2d")!;
  const src = hctx.getImageData(0, 0, SIZE, SIZE).data;
  const out = ctx.createImageData(SIZE, SIZE);
  const lum = (x: number, y: number) => {
    x = Math.max(0, Math.min(SIZE - 1, x));
    y = Math.max(0, Math.min(SIZE - 1, y));
    return src[(y * SIZE + x) * 4] / 255;
  };
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx =
        (lum(x + 1, y - 1) + 2 * lum(x + 1, y) + lum(x + 1, y + 1)) -
        (lum(x - 1, y - 1) + 2 * lum(x - 1, y) + lum(x - 1, y + 1));
      const dy =
        (lum(x - 1, y + 1) + 2 * lum(x, y + 1) + lum(x + 1, y + 1)) -
        (lum(x - 1, y - 1) + 2 * lum(x, y - 1) + lum(x + 1, y - 1));
      let nx = -dx * strength;
      let ny = -dy * strength;
      let nz = 1;
      const inv = 1 / Math.hypot(nx, ny, nz);
      nx *= inv; ny *= inv; nz *= inv;
      const i = (y * SIZE + x) * 4;
      out.data[i] = (nx * 0.5 + 0.5) * 255;
      out.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      out.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return c;
}

// Albedo: a near-white specular tint that darkens slightly in recessed grooves,
// with faint worn streaks. The actual metal color comes from material.color.
function albedoFromHeight(height: HTMLCanvasElement): HTMLCanvasElement {
  const { c, ctx } = newCanvas();
  const hctx = height.getContext("2d")!;
  const src = hctx.getImageData(0, 0, SIZE, SIZE).data;
  const out = ctx.createImageData(SIZE, SIZE);
  for (let i = 0; i < src.length; i += 4) {
    const h = src[i] / 255;             // 0..1 height
    const a = src[i + 3];
    // Recesses (low h) read a touch darker; raised relief stays bright.
    const v = 200 + (h - 0.5) * 90;
    const cl = Math.max(120, Math.min(255, v));
    out.data[i] = out.data[i + 1] = out.data[i + 2] = cl;
    out.data[i + 3] = a;
  }
  ctx.putImageData(out, 0, 0);
  // Subtle circular brushed sheen.
  ctx.globalCompositeOperation = "overlay";
  const g = ctx.createLinearGradient(0, 0, SIZE, SIZE);
  g.addColorStop(0, "rgba(255,255,255,0.10)");
  g.addColorStop(0.5, "rgba(0,0,0,0.06)");
  g.addColorStop(1, "rgba(255,255,255,0.10)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.globalCompositeOperation = "source-over";
  return c;
}

function roughnessFromHeight(height: HTMLCanvasElement): HTMLCanvasElement {
  const { c, ctx } = newCanvas();
  const hctx = height.getContext("2d")!;
  const src = hctx.getImageData(0, 0, SIZE, SIZE).data;
  const out = ctx.createImageData(SIZE, SIZE);
  for (let i = 0; i < src.length; i += 4) {
    const h = src[i] / 255;
    // Raised, handled high points are polished (low roughness); fields a bit duller.
    const r = 0.5 - (h - 0.5) * 0.5;
    const cl = Math.max(0, Math.min(255, r * 255));
    out.data[i] = out.data[i + 1] = out.data[i + 2] = cl;
    out.data[i + 3] = src[i + 3];
  }
  ctx.putImageData(out, 0, 0);
  return c;
}

// Vertical reeding for the milled edge of dimes and quarters.
function reededEdgeNormal(): HTMLCanvasElement {
  const w = 512;
  const h = 64;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  const ridges = 100;
  for (let x = 0; x < w; x++) {
    const phase = (x / w) * ridges * Math.PI * 2;
    const slope = Math.cos(phase);             // derivative of the ridge profile
    let nx = -slope * 0.9;
    let nz = 1;
    const inv = 1 / Math.hypot(nx, 0, nz);
    nx *= inv; nz *= inv;
    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = 128;
      img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function faceMaps(denom: Denom, side: "obverse" | "reverse"): CoinFaceMaps {
  const height = faceHeightmap(denom, side);
  const map = new THREE.CanvasTexture(albedoFromHeight(height));
  const normalMap = new THREE.CanvasTexture(normalFromHeight(height, 2.2));
  const roughnessMap = new THREE.CanvasTexture(roughnessFromHeight(height));
  for (const t of [map, normalMap, roughnessMap]) {
    t.anisotropy = 8;
    t.needsUpdate = true;
  }
  // Albedo is color data; normal/roughness are linear data maps.
  map.colorSpace = THREE.SRGBColorSpace;
  normalMap.colorSpace = THREE.NoColorSpace;
  roughnessMap.colorSpace = THREE.NoColorSpace;
  return { map, normalMap, roughnessMap };
}

export function mintCoin(denom: Denom): CoinMaterialSet {
  let edgeNormal: THREE.CanvasTexture | null = null;
  if (denom.reeded) {
    edgeNormal = new THREE.CanvasTexture(reededEdgeNormal());
    edgeNormal.wrapS = THREE.RepeatWrapping;
    edgeNormal.wrapT = THREE.RepeatWrapping;
    edgeNormal.needsUpdate = true;
  }
  return {
    obverse: faceMaps(denom, "obverse"),
    reverse: faceMaps(denom, "reverse"),
    edgeNormal,
  };
}
