import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// Renders each ship .glb once to a cached PNG data URL for the ship menu, so the
// menu shows the actual game art without a live WebGL context per item. Renders
// are serialized through one shared offscreen renderer/scene.

const cache = new Map(); // kind -> Promise<dataURL>
const loader = new GLTFLoader();
let renderer, scene, camera;
let chain = Promise.resolve();

function ensure() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(180, 130);
  scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 1.9);
  key.position.set(3, 5, 4);
  scene.add(key);
  camera = new THREE.PerspectiveCamera(34, 180 / 130, 0.1, 100);
  camera.position.set(2.4, 1.9, 2.6);
  camera.lookAt(0, 0, 0);
}

function loadModel(kind) {
  return new Promise((resolve, reject) =>
    loader.load(`${process.env.PUBLIC_URL}/assets/ships/${kind}.glb`, (g) => resolve(g.scene), undefined, reject)
  );
}

async function render(kind) {
  ensure();
  const model = (await loadModel(kind)).clone(true);
  // Center and normalize so every ship fills the frame consistently.
  const box = new THREE.Box3().setFromObject(model);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);
  model.position.sub(center);
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  model.scale.setScalar(2.0 / maxDim);
  scene.add(model);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL("image/png");
  scene.remove(model);
  return url;
}

export function thumbnailFor(kind) {
  if (cache.has(kind)) return cache.get(kind);
  const p = chain.then(() => render(kind)); // serialize: one model in the scene at a time
  chain = p.catch(() => {});
  cache.set(kind, p);
  return p;
}
