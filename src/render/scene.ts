import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  bloom: UnrealBloomPass;
  render: () => void;
  resize: () => void;
}

export function createStage(canvas: HTMLCanvasElement): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0d16);

  // Procedural studio environment for crisp metallic reflections (no HDR asset).
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  // Atmospheric backdrop gradient via a large inverted sphere.
  const bg = new THREE.Mesh(
    new THREE.SphereGeometry(20, 32, 32),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {},
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);} `,
      fragmentShader: `varying vec3 vP; void main(){ float t = clamp(vP.y*0.04+0.5,0.0,1.0); vec3 a=vec3(0.02,0.03,0.07); vec3 b=vec3(0.09,0.12,0.22); gl_FragColor=vec4(mix(a,b,t),1.0);} `,
    }),
  );
  scene.add(bg);

  const camera = new THREE.PerspectiveCamera(44, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 1.75, 2.8);

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0.12, 0.25);
  controls.enablePan = false;
  controls.minDistance = 0.55; // allow zooming in to admire the minted relief
  controls.maxDistance = 3.4;
  controls.minPolarAngle = 0.25;
  controls.maxPolarAngle = Math.PI * 0.46;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.update();

  // ---- Lighting ----
  scene.add(new THREE.HemisphereLight(0xbfd2ff, 0x202024, 0.5));

  const key = new THREE.DirectionalLight(0xffffff, 2.6);
  key.position.set(2.2, 4.0, 2.4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 12;
  const d = 1.8;
  key.shadow.camera.left = -d;
  key.shadow.camera.right = d;
  key.shadow.camera.top = d;
  key.shadow.camera.bottom = -d;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0x88aaff, 0.5);
  fill.position.set(-3, 2, 1);
  scene.add(fill);

  // Front fill so the steel collector funnel reads clearly from the camera side.
  const front = new THREE.DirectionalLight(0xdfe8ff, 0.7);
  front.position.set(0, 1.2, 4);
  scene.add(front);

  // Warm rim accent grazing from the back-left to make gold trim and coin edges
  // sparkle without forming a hot reflection on the open deck.
  const rim = new THREE.SpotLight(0xffe6a8, 6, 9, 0.6, 1.0, 1.4);
  rim.position.set(-2.2, 2.4, -2.0);
  rim.target.position.set(-0.3, 0, -0.6);
  scene.add(rim);
  scene.add(rim.target);

  // ---- Post-processing (subtle bloom on the metal highlights) ----
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.28, // strength
    0.5,  // radius
    0.9,  // threshold — only the brightest metal specular highlights bloom
  );
  composer.addPass(bloom);

  const render = () => {
    controls.update();
    composer.render();
  };

  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
  };
  window.addEventListener("resize", resize);

  return { renderer, scene, camera, controls, bloom, render, resize };
}
