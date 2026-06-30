import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// ONE shared WebGL renderer (a single GL context for the whole ship menu).
// paintShip renders a ship to the shared canvas, then copies the frame into a
// per-sprite 2D canvas. 2D canvases have no context limit, so we can show all
// five ships without exhausting WebGL. Renders are serialized.
//
// The camera AUTO-FITS each model's bounding box, so every ship fills its frame
// regardless of its native size/proportions (a fixed frustum framed only one of
// the five and clipped the rest to nothing).

const loader = new GLTFLoader();

let renderer, scene, camera;
let chain = Promise.resolve();
const modelCache = new Map();

function ensure() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.8));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(1, 4, 5);
  scene.add(key);
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
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

  const model = (await loadModel(kind)).clone(true);
  const box = new THREE.Box3().setFromObject(model);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);
  model.position.sub(center); // center at origin
  if (size.z > size.x) model.rotation.y = Math.PI / 2; // hull length -> X (consistent facing)
  scene.add(model);

  // Auto-fit an orthographic frustum to the model's bounding sphere.
  const radius = 0.5 * Math.hypot(size.x, size.y, size.z) || 1;
  const m = radius * 1.15;
  const aspect = w / h;
  camera.left = -m * aspect;
  camera.right = m * aspect;
  camera.top = m;
  camera.bottom = -m;
  camera.near = 0.01;
  camera.far = radius * 40;
  camera.position.set(0, radius * 1.1, radius * 5); // near-side view, slight elevation
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();

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
