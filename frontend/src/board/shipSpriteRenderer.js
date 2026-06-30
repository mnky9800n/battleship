import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { SHIP_KINDS } from "./ships.js";

// ONE shared WebGL renderer (a single GL context for the whole ship menu).
// paintShip renders a ship to the shared canvas, then copies the frame into a
// per-sprite 2D canvas. 2D canvases have no context limit, so we can show all
// five ships without exhausting WebGL (which crashed when each had its own
// renderer). Renders are serialized so they share the one context safely.

const loader = new GLTFLoader();
const HALF_H = 1.5; // half view height; width derives from each canvas aspect

let renderer, scene, camera;
let chain = Promise.resolve();
const modelCache = new Map();

function ensure() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.7));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(1, 4, 5);
  scene.add(key);
  camera = new THREE.OrthographicCamera(-1, 1, HALF_H, -HALF_H, 0.01, 100);
  camera.position.set(0, 0.5, 8); // side view, slight elevation
  camera.lookAt(0, 0, 0);
}

function loadModel(kind) {
  if (!modelCache.has(kind)) {
    modelCache.set(
      kind,
      new Promise((resolve, reject) =>
        loader.load(`${process.env.PUBLIC_URL}/assets/ships/${kind}.glb`, (g) => resolve(g.scene), undefined, reject)
      )
    );
  }
  return modelCache.get(kind);
}

async function paint(kind, target) {
  ensure();
  const w = target.width;
  const h = target.height;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  const aspect = w / h;
  camera.left = -HALF_H * aspect;
  camera.right = HALF_H * aspect;
  camera.updateProjectionMatrix();

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
  const ctx = target.getContext("2d");
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(renderer.domElement, 0, 0, w, h);
  scene.remove(model);
}

export function paintShip(kind, target) {
  const p = chain.then(() => paint(kind, target).catch((e) => console.warn("ship sprite", kind, e)));
  chain = p.catch(() => {});
  return p;
}
