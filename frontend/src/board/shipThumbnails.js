import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { SHIP_KINDS } from "./ships.js";

// Renders each ship .glb once to a cached side-view PNG (transparent) for the
// ship menu: a true side profile (orthographic side camera) scaled to each
// hull's length, so the sprites are proportional like the design doc.
//
// Each render uses its OWN short-lived renderer that's disposed right after the
// capture — sharing one renderer across captures proved flaky (only the first
// thumbnail survived). Renders are still serialized so only one GL context is
// alive at a time.

const cache = new Map(); // kind -> Promise<dataURL>
const loader = new GLTFLoader();
let chain = Promise.resolve();

const HALF_W = 3.4;
const HALF_H = 1.5;
const W = 320;
const H = 140;

function loadModel(kind) {
  return new Promise((resolve, reject) =>
    loader.load(`${process.env.PUBLIC_URL}/assets/ships/${kind}.glb`, (g) => resolve(g.scene), undefined, reject)
  );
}

async function render(kind) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(W, H);
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.7);
  key.position.set(1, 4, 5);
  scene.add(key);
  const camera = new THREE.OrthographicCamera(-HALF_W, HALF_W, HALF_H, -HALF_H, 0.01, 100);
  camera.position.set(0, 0.5, 8); // side view, slight elevation
  camera.lookAt(0, 0, 0);

  try {
    const model = (await loadModel(kind)).clone(true);
    const box = new THREE.Box3().setFromObject(model);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    model.position.sub(center);
    if (size.z > size.x) model.rotation.y = Math.PI / 2; // hull length -> X
    const lengthDim = Math.max(size.x, size.z) || 1;
    model.scale.setScalar(SHIP_KINDS[kind].length / lengthDim); // length = N cells
    scene.add(model);
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL("image/png");
  } finally {
    renderer.dispose();
    renderer.forceContextLoss?.();
  }
}

export function thumbnailFor(kind) {
  if (cache.has(kind)) return cache.get(kind);
  const p = chain.then(() => render(kind)); // serialize: one GL context at a time
  chain = p.catch(() => {});
  cache.set(kind, p);
  return p;
}
