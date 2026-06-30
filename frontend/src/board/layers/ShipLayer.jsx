import React, { useRef, useEffect } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { useBoardContext } from "../BoardContext.jsx";
import { getOffsets } from "../isometric.js";
import { toScreenCoords } from "../rendering.js";
import { tileWidth, tileHeight, elevationScale } from "../constants.js";
import { SHIP_KINDS } from "../ships.js";

// 3D ship overlay. Forked from rainy-city's WhaleLayer: a transparent WebGL
// canvas with an orthographic camera whose frustum is the screen in pixels, so a
// model placed at a tile's screen coordinate lines up with the 2D board beneath.
//
// The board is isometric, so its grid axes run along the screen diagonals at
// ISO = atan(tileHeight/tileWidth) (~26.57deg for a 2:1 diamond), NOT along the
// screen horizontal/vertical. Ships are rendered deck-up (top-down) and rolled
// about the view axis so the hull lies along the correct grid diagonal: a
// horizontal ship (along grid-x) points down-right, a vertical ship down-left.
const ISO = Math.atan(tileHeight / tileWidth);
const ROLL_H = -ISO; // horizontal ship (along grid +x) -> down-right
const ROLL_V = ISO;  // vertical ship (along grid +y)   -> down-left

// On-screen length of one cell step along an iso axis, in unzoomed px.
const CELL_DIAG = Math.hypot(tileWidth / 2, tileHeight / 2);
// A ship spans its length in cells; SHIP_FILL leaves a small margin within them.
const SHIP_FILL = 0.9;

// Flip if a model loads showing its hull instead of its deck.
const DECK_SIGN = 1;

const MODEL_URL = (kind) => `${process.env.PUBLIC_URL}/assets/ships/${kind}.glb`;

// Cache loaded GLTF scenes per kind so each model file is fetched once.
const modelCache = new Map();
function loadModel(kind) {
  if (!modelCache.has(kind)) {
    const loader = new GLTFLoader();
    modelCache.set(
      kind,
      new Promise((resolve, reject) =>
        loader.load(MODEL_URL(kind), (gltf) => resolve(gltf.scene), undefined, reject)
      )
    );
  }
  return modelCache.get(kind);
}

// Average tile of a ship's cells (lands on a half-cell for even-length ships,
// which correctly centers the model over the run).
function shipCenterTile(cells) {
  const sum = cells.reduce((a, c) => ({ x: a.x + c.x, y: a.y + c.y }), { x: 0, y: 0 });
  return { x: sum.x / cells.length, y: sum.y / cells.length };
}

const ShipLayer = () => {
  const containerRef = useRef(null);
  const { dimensions, zoom, panX, panY, view } = useBoardContext();

  // Live view values for the rAF loop (avoids re-creating the scene on pan/zoom).
  const viewRef = useRef({ dimensions, zoom, panX, panY });
  useEffect(() => {
    viewRef.current = { dimensions, zoom, panX, panY };
  }, [dimensions, zoom, panX, panY]);

  const threeRef = useRef(null);

  // Scene setup + render loop, once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -2000, 2000);
    camera.position.set(0, 0, 1000);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(-200, 400, 500);
    scene.add(key);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    const state = { scene, camera, renderer, ships: [] };
    threeRef.current = state;

    let rafId;
    const tick = () => {
      rafId = requestAnimationFrame(tick);
      const { dimensions: dim, zoom: z, panX: px, panY: py } = viewRef.current;
      const { offsetX, offsetY } = getOffsets(dim, z, px, py);

      const halfW = dim.width / 2;
      const halfH = dim.height / 2;
      camera.left = -halfW;
      camera.right = halfW;
      camera.top = halfH;
      camera.bottom = -halfH;
      camera.updateProjectionMatrix();
      if (renderer.domElement.width !== dim.width * renderer.getPixelRatio() ||
          renderer.domElement.height !== dim.height * renderer.getPixelRatio()) {
        renderer.setSize(dim.width, dim.height);
      }

      const surfaceY = -0.35 * elevationScale * z;
      for (const entry of state.ships) {
        const { group, ship, modelLength } = entry;
        const center = shipCenterTile(ship.cells);
        const { screenX, screenY } = toScreenCoords(center.x, center.y, z, offsetX, offsetY);
        // Screen pixels -> camera space (y flips: screen-down is world-up).
        const camX = screenX - halfW;
        const camY = halfH - (screenY + tileHeight * z * 0.5 + surfaceY);
        group.position.set(camX, camY, 0);

        // Scale the model's long axis to span exactly N cells along the diagonal.
        const cellRun = SHIP_KINDS[ship.kind].length;
        const targetPx = cellRun * CELL_DIAG * SHIP_FILL;
        group.scale.setScalar((targetPx / modelLength) * z);

        // Roll about the view axis (Z) to lie along the grid diagonal. The deck
        // is already turned to face the camera by the model's own rotation, set
        // once at load, so this roll spins the top-down silhouette in-plane.
        group.rotation.set(0, 0, ship.orientation === "v" ? ROLL_V : ROLL_H);
      }
      renderer.render(scene, camera);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      threeRef.current = null;
    };
  }, []);

  // Load/sync ship models whenever the fleet changes.
  useEffect(() => {
    const state = threeRef.current;
    if (!state) return;
    let cancelled = false;

    // Clear existing.
    for (const entry of state.ships) state.scene.remove(entry.group);
    state.ships = [];

    const ships = view?.ships ?? [];
    for (const ship of ships) {
      loadModel(ship.kind).then((sceneModel) => {
        if (cancelled || !threeRef.current) return;
        const model = sceneModel.clone(true);

        // Sunk ships are recolored red (design doc), tinting each material.
        if (ship.sunk) {
          model.traverse((child) => {
            if (child.material) {
              const mats = Array.isArray(child.material) ? child.material : [child.material];
              child.material = mats.map((m) => {
                const tinted = m.clone();
                if (tinted.color) tinted.color.setHex(0xc0392b);
                return tinted;
              });
              if (!Array.isArray(child.material)) child.material = child.material[0];
            }
          });
        }

        // Measure the model in its native orientation: its longest horizontal
        // axis is the hull length, which we align to world-X.
        const box = new THREE.Box3().setFromObject(model);
        const center = new THREE.Vector3();
        const size = new THREE.Vector3();
        box.getCenter(center);
        box.getSize(size);
        model.position.sub(center); // center at origin so rotations keep it centered
        const lengthAlongZ = size.z > size.x;
        const modelLength = Math.max(size.x, size.z) || 1;

        // Orient once: turn the deck (+Y) to face the camera (+Z) and bring the
        // hull length onto world-X. The in-plane roll to the grid diagonal is
        // applied per-frame on the parent group.
        model.rotation.order = "YXZ";
        model.rotation.y = lengthAlongZ ? Math.PI / 2 : 0; // swap Z-length onto X
        model.rotation.x = DECK_SIGN * (Math.PI / 2); // deck up -> toward camera

        const group = new THREE.Group();
        group.add(model);
        state.scene.add(group);
        state.ships.push({ group, ship, modelLength });
      }).catch((err) => console.warn(`failed to load ship model ${ship.kind}`, err));
    }

    return () => {
      cancelled = true;
    };
  }, [view]);

  return (
    <div
      ref={containerRef}
      style={{ position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none" }}
    />
  );
};

export default ShipLayer;
