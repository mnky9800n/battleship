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
// Rather than rotate models into an isometric pose (which stands them on end
// unless the model's up-axis is known), we project level (up = +Y) models
// through the SAME isometric transform the 2D board uses. Ships then lie flat on
// the water by construction and share the grid's exact geometry.
//
// In tile units, the projection sends each basis vector to camera pixels (x
// right, y up): grid +x -> down-right, grid +y -> down-left, height +Y -> up.
const TILE_DX = tileWidth / 2;  // unzoomed; horizontal px of one grid-step
const TILE_DY = tileHeight / 2; // unzoomed; vertical px of one grid-step
const LIFT = elevationScale;    // unzoomed; pixels per unit of model height

// A ship spans its length in cells; SHIP_FILL leaves a small margin within them.
const SHIP_FILL = 0.9;
// Lift each hull above the waterline by this fraction of its own height, so the
// ship floats on the surface instead of being centered (half-submerged) on it.
const SHIP_RAISE = 0.5;

// Per-cell hit damage marker (a red glow on the hit section of a hull), in tile
// units. A ship turns wholly red only once every section is hit (sunk).
const MARK_RADIUS = 0.3;
const MARK_RAISE = 0.55;

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

    const state = { scene, camera, renderer, ships: [], marks: [] };
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

      const sx = TILE_DX * z;
      const sy = TILE_DY * z;
      const lift = LIFT * z;
      const surfaceY = -0.35 * elevationScale * z;
      for (const entry of state.ships) {
        const { group } = entry;
        const center = shipCenterTile(entry.ship.cells);
        const { screenX, screenY } = toScreenCoords(center.x, center.y, z, offsetX, offsetY);
        // Tile center on the water surface, in camera pixels (x right, y up).
        const camX = screenX - halfW;
        const camY = halfH - (screenY + sy + surfaceY);
        const camZ = (center.x + center.y) * sy;

        // Isometric projection matrix (tile units -> camera pixels). Columns are
        // the images of grid +x, model height +Y, and grid +y; the 4th column is
        // the ship's tile-center translation. Children carry centering + scale +
        // orientation, so this matrix only projects and places.
        group.matrix.set(
          sx, 0, -sx, camX,
          -sy, lift, -sy, camY,
          sy, lift, sy, camZ,
          0, 0, 0, 1
        );
        group.matrixWorldNeedsUpdate = true; // matrixAutoUpdate is off
      }

      // Per-cell damage markers, projected the same way and nudged forward in
      // depth (+1) so they sit on top of the hull.
      for (const mark of state.marks) {
        const { screenX, screenY } = toScreenCoords(mark.cell.x, mark.cell.y, z, offsetX, offsetY);
        const camX = screenX - halfW;
        const camY = halfH - (screenY + sy + surfaceY);
        const camZ = (mark.cell.x + mark.cell.y) * sy + 1;
        mark.group.matrix.set(
          sx, 0, -sx, camX,
          -sy, lift, -sy, camY,
          sy, lift, sy, camZ,
          0, 0, 0, 1
        );
        mark.group.matrixWorldNeedsUpdate = true;
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

    // Clear existing ships and damage markers.
    for (const entry of state.ships) state.scene.remove(entry.group);
    for (const mark of state.marks) state.scene.remove(mark.group);
    state.ships = [];
    state.marks = [];

    // Cells that have taken a hit (incoming on your board, outgoing on enemy).
    const hitCells = new Set();
    for (const s of [...(view?.incoming ?? []), ...(view?.outgoing ?? [])]) {
      if (s.result === "hit") hitCells.add(`${s.x},${s.y}`);
    }
    // A red glow marks each hit section of a still-floating ship. Sunk ships are
    // wholly red, so they need no per-cell markers.
    for (const ship of view?.ships ?? []) {
      if (ship.sunk) continue;
      for (const cell of ship.cells) {
        if (!hitCells.has(`${cell.x},${cell.y}`)) continue;
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(MARK_RADIUS, 16, 12),
          new THREE.MeshBasicMaterial({ color: 0xff2b2b })
        );
        mesh.position.y = MARK_RAISE;
        const g = new THREE.Group();
        g.matrixAutoUpdate = false;
        g.add(mesh);
        state.scene.add(g);
        state.marks.push({ group: g, cell });
      }
    }

    const ships = view?.ships ?? [];
    for (const ship of ships) {
      loadModel(ship.kind).then((sceneModel) => {
        if (cancelled || !threeRef.current) return;
        const model = sceneModel.clone(true);

        // Sunk ships are recolored red (design doc), tinting each material.
        // Preserve the original single-vs-array material shape: replacing a
        // single material with a 1-element array renders nothing (no geometry
        // groups), which previously made sunk ships invisible.
        if (ship.sunk) {
          model.traverse((child) => {
            if (!child.material) return;
            const wasArray = Array.isArray(child.material);
            const mats = wasArray ? child.material : [child.material];
            const tinted = mats.map((m) => {
              const t = m.clone();
              if (t.color) t.color.setHex(0xc0392b);
              if (t.map) t.map = null; // drop texture so the red tint reads clearly
              return t;
            });
            child.material = wasArray ? tinted : tinted[0];
          });
        }

        // Measure the model (level, up = +Y). Its longer horizontal axis is the
        // hull length; recenter so transforms pivot on the ship's middle.
        const box = new THREE.Box3().setFromObject(model);
        const center = new THREE.Vector3();
        const size = new THREE.Vector3();
        box.getCenter(center);
        box.getSize(size);
        model.position.sub(center);
        model.position.y += size.y * SHIP_RAISE; // float above the waterline
        const lengthAlongZ = size.z > size.x;
        const modelLength = Math.max(size.x, size.z) || 1;

        // Pivot bakes scale + axis choice; the outer group carries the iso matrix.
        // Scale so the hull spans its length in cells (tile units). Align the hull
        // to grid +x for horizontal ships, grid +z for vertical ones; the model
        // stays level (up = +Y) so it lies flat once projected.
        const cells = SHIP_KINDS[ship.kind].length * SHIP_FILL;
        const lengthAxis = lengthAlongZ ? "z" : "x";
        const targetAxis = ship.orientation === "v" ? "z" : "x";

        const pivot = new THREE.Group();
        pivot.add(model);
        pivot.scale.setScalar(cells / modelLength);
        if (lengthAxis !== targetAxis) pivot.rotation.y = Math.PI / 2; // swap x<->z

        const group = new THREE.Group();
        group.matrixAutoUpdate = false; // we set group.matrix to the iso projection
        group.add(pivot);
        state.scene.add(group);
        state.ships.push({ group, ship });
      }).catch((err) => console.warn(`failed to load ship model ${ship.kind}`, err));
    }

    return () => {
      cancelled = true;
    };
  }, [view]);

  return (
    <div
      ref={containerRef}
      style={{ position: "absolute", inset: 0, zIndex: 3, pointerEvents: "none" }}
    />
  );
};

export default ShipLayer;
