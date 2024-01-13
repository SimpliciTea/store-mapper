import { useLayoutEffect, useRef } from "react";
import { Button, Group, Stack } from "@mantine/core";
import tinycolor from "tinycolor2";
import { TestBtn } from "./TestBtn";

type XYCoord = {
  x: number;
  y: number;
};

type GridCellCoord = {
  row: number;
  col: number;
};

type GridCell = {
  row: number;
  col: number;
  fillStyle: string;
  adjacency: number;
  paintCount: number;
};

type CellNeighbors = {
  north?: GridCell;
  east?: GridCell;
  south?: GridCell;
  west?: GridCell;
};

enum CardinalBit {
  North = 1 << 3,
  East = 1 << 2,
  South = 1 << 1,
  West = 1 << 0,
}

const cardinalBits = [
  CardinalBit.North,
  CardinalBit.East,
  CardinalBit.South,
  CardinalBit.West,
];

let paintCount = 0;

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
  strokeStyle?: React.CSSProperties["color"];
  fillStyle?: React.CSSProperties["color"];
};

const colors = {
  red: "indianred",
  blue: "#4b76ff",
};

const DEFAULT_GRID_SIZE = 300;
const DEFAULT_GRID_OFFSET = DEFAULT_GRID_SIZE / 2;
const DEFAULT_BASE_GRID_UNIT_PX = 20;
const DEFAULT_MAX_PAN: XYCoord = {
  x: DEFAULT_GRID_OFFSET * DEFAULT_BASE_GRID_UNIT_PX,
  y: DEFAULT_GRID_OFFSET * DEFAULT_BASE_GRID_UNIT_PX,
};
const DEFAULT_MIN_PAN: XYCoord = {
  x: -DEFAULT_MAX_PAN.x,
  y: -DEFAULT_MAX_PAN.y,
};

enum CursorMode {
  Pan = 0,
  Paint,
  Erase,
  Rest,
}

class Canvas {
  minScale = 0.3;
  maxScale = 3;
  worldHeight: number;
  worldWidth: number;
  cellSize = 20;
  currentTransform: DOMMatrix = new DOMMatrix();
  shouldRender = true;
  mousePos?: XYCoord;
  mouseCellCoord?: GridCellCoord;
  cursorMode = CursorMode.Rest;
  isPanning = false;
  mouseDown = false;
  fillStyle = colors.red;

  gridSize = DEFAULT_GRID_SIZE;
  gridOffset = DEFAULT_GRID_SIZE / 2;
  minPan = DEFAULT_MIN_PAN;
  maxPan = DEFAULT_MAX_PAN;

  cellData: GridCell[][] = [];

  canvas: HTMLCanvasElement;
  clientRect: DOMRect;
  context: CanvasRenderingContext2D;

  minPaintedCoord?: XYCoord;
  maxPaintedCoord?: XYCoord;

  constructor(canvasRef: React.RefObject<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) throw new Error("Canvas ref null");
    this.canvas = canvas;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("Couldn't initialize 2d context");
    this.context = context;

    this.clientRect = canvas.getBoundingClientRect();

    this.worldHeight = this.clientRect.height;
    this.worldWidth = this.clientRect.width;

    this.registerEventHandlers();
    this.render();
  }

  registerEventHandlers = () => {
    this.canvas.addEventListener("wheel", this.handleWheel);
    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    this.canvas.addEventListener("pointerup", this.handlePointerUp);
    this.canvas.addEventListener("pointermove", this.handlePointerMove);
    this.canvas.addEventListener("pointerleave", this.handlePointerLeave);
  };

  transferMouseToWindow = () => {
    this.canvas.removeEventListener("pointermove", this.handlePointerMove);
    this.canvas.removeEventListener("pointerup", this.handlePointerUp);

    window.addEventListener("pointermove", this.handlePointerMove, {
      // capture: true,
      // passive: true,
    });
    window.addEventListener("pointerup", this.transferMouseToCanvas);
  };

  transferMouseToCanvas = () => {
    this.handlePointerUp();
    window.removeEventListener("pointermove", this.handlePointerMove);
    window.removeEventListener("pointerup", this.transferMouseToCanvas);

    this.canvas.addEventListener("pointermove", this.handlePointerMove);
    this.canvas.addEventListener("pointerup", this.handlePointerUp);
  };

  get panX() {
    return this.currentTransform.e;
  }

  get panY() {
    return this.currentTransform.f;
  }

  get currentScale() {
    return this.currentTransform.a;
  }

  // setPanLimits() {
  //   const worldPxSize = this.gridSize * this.cellSize;
  //   const maxPan = worldPxSize / 2;
  //   const maxPan = worldPxSize / -2;
  // }

  clear() {
    this.context.save();
    this.context.setTransform(1, 0, 0, 1, 0, 0);
    this.context.clearRect(
      0,
      0,
      this.context.canvas.width,
      this.context.canvas.height
    );
    this.context.restore();
  }

  render() {
    requestAnimationFrame(() => {
      if (this.shouldRender) {
        this.clear();
        // this.context.translate(-0.5, -0.5);
        this.renderGrid();
        this.renderCells();
        this.renderCellBorders();
        this.renderHoverCell();
        // this.context.translate(0.5, 0.5);
        this.shouldRender = false;
      }
      this.render();
    });
  }

  renderCells() {
    // this.printCells();
    this.cellData.forEach((row) => {
      row.forEach((cell) => {
        const coord = this.cellCoordToWorldCoord(cell);
        this.context.fillStyle = cell.fillStyle;
        this.context.fillRect(coord.x, coord.y, this.cellSize, this.cellSize);
      });
    });
    // this.context.fill();
  }

  renderCellBorders(lineWidth = 2) {
    // this.context.translate(-0.5, -0.5);
    this.context.lineWidth = lineWidth;
    this.cellData.forEach((row) => {
      row.forEach((cell) => {
        if (cell.adjacency === 0b1111) return;

        this.context.strokeStyle = tinycolor(cell.fillStyle)
          .darken()
          .toString();

        const worldCoord = this.cellCoordToWorldCoord(cell);
        const inset = lineWidth / 2;

        if (!this.isBitSet(cell.adjacency, CardinalBit.North)) {
          // console.log(CardinalBit[CardinalBit.North]);
          const from = { ...worldCoord, y: worldCoord.y + inset };
          const to = { ...from, x: from.x + this.cellSize };
          this.renderLine(from, to);
        }
        if (!this.isBitSet(cell.adjacency, CardinalBit.East)) {
          console.log(CardinalBit[CardinalBit.East]);
          const from = {
            ...worldCoord,
            x: worldCoord.x + this.cellSize - inset,
          };
          const to = { ...from, y: from.y + this.cellSize };
          this.renderLine(from, to);
        }
        if (!this.isBitSet(cell.adjacency, CardinalBit.South)) {
          // console.log(CardinalBit[CardinalBit.South]);
          const from = {
            ...worldCoord,
            y: worldCoord.y + this.cellSize - inset,
          };
          const to = { ...from, x: from.x + this.cellSize };
          this.renderLine(from, to);
        }
        if (!this.isBitSet(cell.adjacency, CardinalBit.West)) {
          // console.log(CardinalBit[CardinalBit.West]);
          const from = { ...worldCoord, x: worldCoord.x + inset };
          const to = { ...from, y: from.y + this.cellSize };
          this.renderLine(from, to);
        }
      });
    });
    this.context.lineWidth = 1;
    // this.context.translate(0.5, 0.5);
  }

  printCells() {
    console.log({ cells: this.cellData.flat() });
  }

  renderLine(from: XYCoord, to: XYCoord) {
    // console.log("renderLine!", { from, to });
    this.context.beginPath();
    this.context.moveTo(from.x, from.y);
    this.context.lineTo(to.x, to.y);
    this.context.stroke();
  }

  renderGrid() {
    const worldPan = this.canvasToWorld({ x: 0, y: 0 });
    const size = this.cellSize;
    const startX = Math.ceil(worldPan.x / size) * size - size;
    const startY = Math.ceil(worldPan.y / size) * size - size;
    const endX = Math.ceil((startX + this.worldWidth) / size) * size + size;
    const endY = Math.ceil((startY + this.worldHeight) / size) * size + size;

    this.context.strokeStyle = "black";
    // this.context.translate(-0.5, -0.5);

    for (let x = startX; x <= endX; x += this.cellSize) {
      this.context.beginPath();
      this.context.moveTo(x, startY);
      this.context.lineTo(x, endY);
      this.context.stroke();
    }

    for (let y = startY; y <= endY; y += this.cellSize) {
      this.context.beginPath();
      this.context.moveTo(startX, y);
      this.context.lineTo(endX, y);
      this.context.stroke();
    }

    // this.context.translate(0.5, 0.5);
  }

  renderHoverCell() {
    if (this.mouseCellCoord) {
      const worldCoord = this.cellCoordToWorldCoord(this.mouseCellCoord);

      this.context.fillStyle = "rgba(255, 255, 255, .2)";
      this.context.fillRect(
        worldCoord.x,
        worldCoord.y,
        this.cellSize,
        this.cellSize
      );
    }
  }

  viewportToWorld(viewportCoord: XYCoord) {
    const rect = this.canvas.getBoundingClientRect();

    const canvasCoord = {
      x: viewportCoord.x - rect.x,
      y: viewportCoord.y - rect.y,
    };

    return this.canvasToWorld(canvasCoord);
  }

  canvasToWorld(canvasCoord: XYCoord) {
    return {
      x: (canvasCoord.x - this.panX) / this.currentScale,
      y: (canvasCoord.y - this.panY) / this.currentScale,
    };
  }

  handlePan(e: PointerEvent | React.PointerEvent<HTMLCanvasElement>) {
    this.context.save();
    this.context.translate(
      e.movementX / this.currentScale,
      e.movementY / this.currentScale
    );
    this.currentTransform = this.context.getTransform();
    this.shouldRender = true;
  }

  handleWheel = (e: WheelEvent) => {
    const worldOrigin = this.viewportToWorld({ x: e.clientX, y: e.clientY });
    const unclampedScaleDelta = (-1 * e.deltaY) / 320;
    const nextScale = Math.max(
      this.minScale,
      Math.min(this.currentScale + unclampedScaleDelta, this.maxScale)
    );
    const scaleFactor = nextScale / this.currentScale;

    this.context.translate(worldOrigin.x, worldOrigin.y);
    this.context.scale(scaleFactor, scaleFactor);
    this.context.translate(-worldOrigin.x, -worldOrigin.y);
    this.currentTransform = this.context.getTransform();
    this.worldHeight = this.clientRect.height / this.currentScale;
    this.worldWidth = this.clientRect.width / this.currentScale;
    this.shouldRender = true;
  };

  // NESW
  getCellNeighbors(cellCoord: GridCellCoord) {
    return {
      north: this.cellData[cellCoord.row - 1]?.[cellCoord.col],
      east: this.cellData[cellCoord.row]?.[cellCoord.col + 1],
      south: this.cellData[cellCoord.row + 1]?.[cellCoord.col],
      west: this.cellData[cellCoord.row]?.[cellCoord.col - 1],
    };
  }

  cellsAreSameType(cellA: GridCell, cellB: GridCell) {
    return cellA.fillStyle === cellB.fillStyle;
  }

  makeAdjacencyMask(neighbors: CellNeighbors) {
    let mask = 0b0000;

    if (neighbors.north?.fillStyle === this.fillStyle) {
      mask = this.setMaskBit(mask, CardinalBit.North);
    }

    if (neighbors.east?.fillStyle === this.fillStyle) {
      mask = this.setMaskBit(mask, CardinalBit.East);
    }

    if (neighbors.south?.fillStyle === this.fillStyle) {
      mask = this.setMaskBit(mask, CardinalBit.South);
    }

    if (neighbors.west?.fillStyle === this.fillStyle) {
      mask = this.setMaskBit(mask, CardinalBit.West);
    }

    return mask;
  }

  setMaskBit(mask: number, bit: CardinalBit) {
    return mask | bit;
  }

  unsetMaskBit(mask: number, bit: CardinalBit) {
    return mask & ~bit;
  }

  updateCell(coord: GridCellCoord, update: Partial<GridCell>) {
    this.cellData[coord.row][coord.col] = {
      ...this.cellData[coord.row][coord.col],
      ...update,
    };
  }

  isBitSet(mask: number, bit: CardinalBit) {
    return (mask & bit) === bit;
  }

  informAdjacentNeighbors(cell: GridCell, neighbors?: CellNeighbors) {
    if (!neighbors) neighbors = this.getCellNeighbors(cell);
    console.log({
      neighbors,
      adj: cell.adjacency,
      isSet: this.isBitSet(cell.adjacency, CardinalBit.North),
    });

    if (neighbors.north) {
      const nextMask =
        neighbors.north.fillStyle === this.fillStyle
          ? this.setMaskBit(neighbors.north.adjacency, CardinalBit.South)
          : this.unsetMaskBit(neighbors.north.adjacency, CardinalBit.South);
      this.updateCell(neighbors.north, { adjacency: nextMask });
    }
    if (neighbors.east) {
      const nextMask =
        neighbors.east.fillStyle === this.fillStyle
          ? this.setMaskBit(neighbors.east.adjacency, CardinalBit.West)
          : this.unsetMaskBit(neighbors.east.adjacency, CardinalBit.West);
      this.updateCell(neighbors.east, { adjacency: nextMask });
    }
    if (neighbors.south) {
      const nextMask =
        neighbors.south.fillStyle === this.fillStyle
          ? this.setMaskBit(neighbors.south.adjacency, CardinalBit.North)
          : this.unsetMaskBit(neighbors.south.adjacency, CardinalBit.North);
      this.updateCell(neighbors.south, { adjacency: nextMask });
    }
    if (neighbors.west) {
      const nextMask =
        neighbors.west.fillStyle === this.fillStyle
          ? this.setMaskBit(neighbors.west.adjacency, CardinalBit.East)
          : this.unsetMaskBit(neighbors.west.adjacency, CardinalBit.East);
      this.updateCell(neighbors.west, { adjacency: nextMask });
    }
  }

  paintCell(cellCoord: GridCellCoord) {
    if (!this.cellData[cellCoord.row]) {
      this.cellData[cellCoord.row] = [];
    }

    const neighbors = this.getCellNeighbors(cellCoord);
    const adj = this.makeAdjacencyMask(neighbors);
    console.log({ neighbors, adj });

    const cell: GridCell = {
      row: cellCoord.row,
      col: cellCoord.col,
      fillStyle: this.fillStyle,
      adjacency: this.makeAdjacencyMask(neighbors),
      paintCount: paintCount++,
    };

    // inform neighbors of adjacency
    this.informAdjacentNeighbors(cell, neighbors);
    this.updateCell(cellCoord, cell);

    this.shouldRender = true;
  }

  handlePointerDown = (e: PointerEvent) => {
    this.transferMouseToWindow();

    switch (e.button) {
      case 0: {
        this.cursorMode = CursorMode.Paint;
        const cellCoord = this.eventToCellCoord(e);
        this.paintCell(cellCoord);
        break;
      }
      case 1: {
        this.cursorMode = CursorMode.Pan;
        break;
      }
      case 2:
        // this.cursorMode = CursorMode.Erase;
        break;
    }
  };

  handlePointerMove = (e: PointerEvent) => {
    const worldCoord = this.viewportToWorld({ x: e.clientX, y: e.clientY });
    this.mousePos = worldCoord;

    const cellCoord = this.worldCoordToCellCoord(worldCoord);
    const isSameCell = this.isSameCell(cellCoord, this.mouseCellCoord);

    if (!isSameCell) {
      this.mouseCellCoord = cellCoord;
      this.shouldRender = true;
    }

    switch (this.cursorMode) {
      case CursorMode.Pan:
        this.handlePan(e);
        break;
      case CursorMode.Paint: {
        const coalesced = e.getCoalescedEvents();
        for (const subEvent of coalesced) {
          const coord = this.eventToCellCoord(subEvent);
          this.paintCell(coord);
        }
        break;
      }
    }
  };

  handlePointerUp = () => {
    this.cursorMode = CursorMode.Rest;
  };

  handlePointerLeave = () => {
    this.mousePos = undefined;
    this.mouseCellCoord = undefined;
    this.shouldRender = true;
  };

  setFillStyle(color: string) {
    this.fillStyle = color;
  }

  worldCoordToCellCoord(coord: XYCoord) {
    return {
      row: Math.floor(coord.y / this.cellSize) + this.gridOffset,
      col: Math.floor(coord.x / this.cellSize) + this.gridOffset,
    };
  }

  cellCoordToWorldCoord(cell: GridCellCoord) {
    return {
      x: (cell.col - this.gridOffset) * this.cellSize,
      y: (cell.row - this.gridOffset) * this.cellSize,
    };
  }

  eventToCellCoord(e: MouseEvent | PointerEvent) {
    const worldCoord = this.viewportToWorld({ x: e.clientX, y: e.clientY });
    return this.worldCoordToCellCoord(worldCoord);
  }

  getCellId(cell: GridCellCoord | GridCell) {
    return `${cell.row}:${cell.col}`;
  }

  isSameCell(cellA?: GridCellCoord, cellB?: GridCellCoord) {
    return cellA?.row === cellB?.row && cellA?.col === cellB?.col;
  }
}

export const CanvasContainer = () => {
  const canvasElementRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<Canvas>();

  useLayoutEffect(() => {
    if (!canvasRef.current && !!canvasElementRef.current) {
      canvasRef.current = new Canvas(canvasElementRef);
    }
  }, []);

  return (
    <>
      <Stack>
        <ColorPicker
          onSelectColor={(color: string) =>
            canvasRef.current?.setFillStyle(color)
          }
        />
        <TestBtn />
      </Stack>
      <div
        style={{
          backgroundColor: "seashell",
          width: 800,
          height: 600,
        }}
      >
        <canvas ref={canvasElementRef} width={800} height={600} />
      </div>
    </>
  );
};

type ColorPickerProps = {
  onSelectColor: (color: string) => void;
};

const ColorPicker = ({ onSelectColor }: ColorPickerProps) => {
  return (
    <Group gap={0}>
      {Object.values(colors).map((color) => (
        <div
          key={color}
          onClick={() => onSelectColor(color)}
          style={{
            height: 20,
            width: 20,
            backgroundColor: color,
            cursor: "pointer",
          }}
        />
      ))}
    </Group>
  );
};
