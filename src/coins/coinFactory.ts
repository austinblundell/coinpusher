import * as THREE from "three";
import { DENOMS, MAX_COINS, type Denom } from "../config";
import { mintCoin } from "./coinTexture";

// One InstancedMesh per denomination. A CylinderGeometry naturally lies "flat"
// (its circular caps face up/down), which matches how a coin rests. The geometry
// exposes three material groups — side, top cap, bottom cap — so we can put the
// reeded edge on the side and the obverse/reverse reliefs on the caps.

export interface CoinRenderer {
  denom: Denom;
  mesh: THREE.InstancedMesh;
  capacity: number;
}

// The player only ever drops quarters, so any single denom can approach the cap.
// Give every instanced mesh full headroom.
const PER_DENOM_CAPACITY = MAX_COINS;

function buildMaterials(denom: Denom): THREE.Material[] {
  const minted = mintCoin(denom);
  const color = new THREE.Color(denom.baseColor);

  const edge = new THREE.MeshStandardMaterial({
    color,
    metalness: 1.0,
    roughness: denom.reeded ? 0.34 : 0.4,
    normalMap: minted.edgeNormal ?? null,
    normalScale: new THREE.Vector2(1, 1),
  });
  if (minted.edgeNormal) {
    minted.edgeNormal.repeat.set(denom.reeded ? 1 : 1, 1);
  }

  const faceMat = (maps: ReturnType<typeof mintCoin>["obverse"]) =>
    new THREE.MeshStandardMaterial({
      color,
      map: maps.map,
      normalMap: maps.normalMap,
      normalScale: new THREE.Vector2(0.9, 0.9),
      roughnessMap: maps.roughnessMap,
      metalness: 1.0,
      roughness: 0.42,
    });

  // Group order for CylinderGeometry: [0]=side, [1]=top cap, [2]=bottom cap.
  return [edge, faceMat(minted.obverse), faceMat(minted.reverse)];
}

export function createCoinRenderers(): CoinRenderer[] {
  return DENOMS.map((denom) => {
    const geo = new THREE.CylinderGeometry(
      denom.radius,
      denom.radius,
      denom.thickness,
      48,
      1,
    );
    const mats = buildMaterials(denom);
    const mesh = new THREE.InstancedMesh(geo, mats, PER_DENOM_CAPACITY);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.count = 0;
    mesh.frustumCulled = false;
    return { denom, mesh, capacity: PER_DENOM_CAPACITY };
  });
}
