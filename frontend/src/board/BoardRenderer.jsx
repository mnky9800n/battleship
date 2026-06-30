import React, { useRef, useEffect, useState, useCallback } from "react";
import { BoardProvider, useBoardContext } from "./BoardContext.jsx";
import { getOffsets, screenToTile } from "./isometric.js";
import { gridWidth, gridHeight, tileWidth, tileHeight } from "./constants.js";
import WaterLayer from "./layers/WaterLayer.jsx";
import GridLayer from "./layers/GridLayer.jsx";
import ShipLayer from "./layers/ShipLayer.jsx";

// Unzoomed pixel extent of the whole board, used to auto-fit the initial zoom.
const BOARD_PX_W = (gridWidth + gridHeight) * (tileWidth / 2);
const BOARD_PX_H = (gridWidth + gridHeight) * (tileHeight / 2);

// Forked from rainy-city's ZoomContainer: wheel zoom + drag pan + click, plus a
// mousemove handler that reports the hovered tile. Pointer coordinates are made
// relative to this panel so several boards can coexist. Drag is distinguished
// from click so a pan does not fire a shot.
const ViewContainer = ({ onTileClick }) => {
  const containerRef = useRef(null);
  const {
    dimensions,
    zoom,
    panX,
    panY,
    setZoom,
    setPanX,
    setPanY,
    setHoveredTile,
  } = useBoardContext();

  const isDragging = useRef(false);
  const didDrag = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const el = containerRef.current;
    const handleWheel = (e) => {
      e.preventDefault();
      const step = 0.1;
      setZoom((z) =>
        e.deltaY < 0 ? Math.min(z + step, 4) : Math.max(z - step, 0.4)
      );
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [setZoom]);

  const tileFromEvent = useCallback(
    (clientX, clientY) => {
      const rect = containerRef.current.getBoundingClientRect();
      const localX = clientX - rect.left;
      const localY = clientY - rect.top;
      const { offsetX, offsetY } = getOffsets(dimensions, zoom, panX, panY);
      const { tileX, tileY } = screenToTile(localX, localY, zoom, offsetX, offsetY);
      if (tileX < 0 || tileX >= gridWidth || tileY < 0 || tileY >= gridHeight) {
        return null;
      }
      return { x: tileX, y: tileY };
    },
    [dimensions, zoom, panX, panY]
  );

  const handleMouseDown = (e) => {
    isDragging.current = true;
    didDrag.current = false;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    containerRef.current.style.cursor = "grabbing";
  };

  const handleMouseMove = (e) => {
    if (isDragging.current) {
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) didDrag.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      setPanX((px) => px + dx);
      setPanY((py) => py + dy);
      return;
    }
    setHoveredTile(tileFromEvent(e.clientX, e.clientY));
  };

  const handleMouseUp = () => {
    isDragging.current = false;
    containerRef.current.style.cursor = "grab";
  };

  const handleMouseLeave = () => {
    isDragging.current = false;
    setHoveredTile(null);
    containerRef.current.style.cursor = "grab";
  };

  const handleClick = (e) => {
    if (didDrag.current) return;
    const tile = tileFromEvent(e.clientX, e.clientY);
    if (tile && onTileClick) onTileClick(tile);
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      style={{
        position: "absolute",
        inset: 0,
        cursor: "grab",
        touchAction: "none",
      }}
    >
      <WaterLayer />
      <GridLayer />
      <ShipLayer />
    </div>
  );
};

// Measures its own panel so the board sizes to its container, not the window.
const BoardRenderer = ({ view, onTileClick }) => {
  const rootRef = useRef(null);
  const [dim, setDim] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = rootRef.current;
    const measure = () => setDim({ width: el.clientWidth, height: el.clientHeight });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  // Fit the board to the panel with a margin.
  const fit =
    dim.width > 0
      ? Math.min(dim.width / BOARD_PX_W, dim.height / BOARD_PX_H) * 0.82
      : 1;

  return (
    <div ref={rootRef} style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
      {dim.width > 0 && (
        <BoardProvider view={view} dimensions={dim} initialZoom={fit}>
          <ViewContainer onTileClick={onTileClick} />
        </BoardProvider>
      )}
    </div>
  );
};

export default BoardRenderer;
