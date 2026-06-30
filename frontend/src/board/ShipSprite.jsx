import React, { useRef, useEffect } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { SHIP_KINDS } from "./ships.js";

// A small live side-view render of one ship .glb, in its own canvas. Each sprite
// is independent (own renderer, disposed on unmount), which is far more reliable
// than sharing one offscreen renderer across captures. The canvas is draggable,
// so the ship art itself is the drag handle.

const loader = new GLTFLoader();
const HALF_H = 1.5; // half-height of the view; width derives from the aspect

export default function ShipSprite({ kind, done, onDragStart, height = 72 }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    const w = canvas.clientWidth || 170;
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(w, height, false);

    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 1.7));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(1, 4, 5);
    scene.add(key);

    const aspect = w / height;
    const camera = new THREE.OrthographicCamera(-HALF_H * aspect, HALF_H * aspect, HALF_H, -HALF_H, 0.01, 100);
    camera.position.set(0, 0.5, 8); // side view, slight elevation
    camera.lookAt(0, 0, 0);

    let disposed = false;
    loader.load(
      `${process.env.PUBLIC_URL}/assets/ships/${kind}.glb`,
      (gltf) => {
        if (disposed) return;
        const model = gltf.scene;
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
      },
      undefined,
      (err) => console.warn("ship sprite load failed", kind, err)
    );

    return () => {
      disposed = true;
      renderer.dispose();
      renderer.forceContextLoss?.();
    };
  }, [kind, height]);

  return (
    <canvas
      ref={ref}
      draggable
      onDragStart={onDragStart}
      style={{ width: "100%", height, display: "block", opacity: done ? 0.4 : 1, cursor: "grab" }}
    />
  );
}
