import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { SHIP_KINDS } from "./ships.js";

// Renders each ship .glb once to a cached side-view PNG (transparent) for the
// ship menu. Uses an orthographic side camera and scales each hull to its length
// in cells, so the sprites are true side profiles sized proportionally (carrier
// longer than the boat), like the design doc. One shared offscreen renderer.

const cache = new Map(); // kind -> Promise<dataURL>
const loader = new GLTFLoader();
let renderer, scene, camera;
let chain = Promise.resolve();

// Frustum wide enough for the 5-cell carrier with margin.
const HALF_W = 3.4;
const HALF_H = 1.5;
const CANVAS = [300, 132];

function ensure() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(CANVAS[0], CANVAS[1]);
  scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.7);
  key.position.set(1, 4, 5);
  scene.add(key);
  camera = new THREE.OrthographicCamera(-HALF_W, HALF_W, HALF_H, -HALF_H, 0.01, 100);
  camera.position.set(0, 0.5, 8); // side view, slight elevation for a hint of deck
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
  const box = new THREE.Box3().setFromObject(model);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);
  model.position.sub(center);
  // Hull length onto X (so the side camera sees the profile), then scale that
  // length to the ship's cell count.
  if (size.z > size.x) model.rotation.y = Math.PI / 2;
  const lengthDim = Math.max(size.x, size.z) || 1;
  model.scale.setScalar(SHIP_KINDS[kind].length / lengthDim);

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
