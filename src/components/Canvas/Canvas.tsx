import { useLayoutEffect, useRef } from "react";
import { Group, Stack } from "@mantine/core";
import tinycolor from "tinycolor2";
import { TestBtn } from "./TestBtn";

type TestShape = [number, number, string];

// const testShapes: TestShape[] = [
//   [10, 10, "indianred"],
//   [10, 11, "indianred"],
//   [11, 9, "indianred"],
//   [11, 10, "indianred"],
//   [11, 11, "indianred"],
//   [12, 10, "indianred"],
//   [12, 11, "indianred"],
// ];

const testShapes: TestShape[] = [
  [10, 10, "indianred"],
  [10, 11, "indianred"],
  [10, 12, "indianred"],
];

type XYCoord = {
  x: number;
  y: number;
};

type GridCellCoord = {
  row: number;
  col: number;
};

type GridCell = {
  id: string;
  row: number;
  col: number;
  neighbors: CellNeighbors;
  fillStyle: string;
  adjacency: number;
  regionId: number;
};

const directions = ["north", "east", "south", "west"] as const;
type Direction = (typeof directions)[number];

type CellNeighbors = { [key in Direction]: GridCell | undefined };

enum CardinalBit {
  North = 1 << 3,
  East = 1 << 2,
  South = 1 << 1,
  West = 1 << 0,
}

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
  nextRegionId = 0;

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
    this.paintTestShapes();
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

  paintTestShapes() {
    testShapes.forEach(([row, col, color]) => {
      this.fillStyle = color;
      this.paintCell({
        row: this.gridOffset + row,
        col: this.gridOffset + col,
      });
    });
  }

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
        this.renderGrid();
        this.renderCells();
        this.renderCellBorders();
        this.renderHoverCell();
        this.shouldRender = false;
      }
      this.render();
    });
  }

  renderCells() {
    this.cellData.forEach((row) => {
      row.forEach((cell) => {
        const coord = this.cellCoordToWorldCoord(cell);
        this.context.fillStyle = cell.fillStyle;
        this.context.fillRect(coord.x, coord.y, this.cellSize, this.cellSize);
      });
    });
  }

  renderCellBorders(lineWidth = 2) {
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
          const from = { ...worldCoord, y: worldCoord.y + inset };
          const to = { ...from, x: from.x + this.cellSize };
          this.renderLine(from, to);
        }
        if (!this.isBitSet(cell.adjacency, CardinalBit.East)) {
          const from = {
            ...worldCoord,
            x: worldCoord.x + this.cellSize - inset,
          };
          const to = { ...from, y: from.y + this.cellSize };
          this.renderLine(from, to);
        }
        if (!this.isBitSet(cell.adjacency, CardinalBit.South)) {
          const from = {
            ...worldCoord,
            y: worldCoord.y + this.cellSize - inset,
          };
          const to = { ...from, x: from.x + this.cellSize };
          this.renderLine(from, to);
        }
        if (!this.isBitSet(cell.adjacency, CardinalBit.West)) {
          const from = { ...worldCoord, x: worldCoord.x + inset };
          const to = { ...from, y: from.y + this.cellSize };
          this.renderLine(from, to);
        }
      });
    });
    this.context.lineWidth = 1;
  }

  printCells(props?: Array<keyof GridCell>) {
    const cells = this.cellData.flat();

    if (props) {
      const mapped = cells.map((c) => {
        const ret: Record<string, unknown> = {};
        for (const prop of props) {
          ret[prop] = c[prop];
        }
        return ret;
      });
      console.log(mapped);
    } else {
      console.log(cells);
    }
  }

  renderLine(from: XYCoord, to: XYCoord) {
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

  isBitSet(mask: number, bit: CardinalBit) {
    return (mask & bit) === bit;
  }

  setCell(coord: GridCellCoord, cell: GridCell) {
    this.cellData[coord.row][coord.col] = cell;
    this.informAdjacentNeighbors(cell);
  }

  getCell(coord: GridCellCoord): GridCell | undefined {
    return this.cellData[coord.row]?.[coord.col];
  }

  updateCell(coord: GridCellCoord, update: Partial<GridCell>) {
    const cell = this.getCell(coord);
    if (!cell) return;

    Object.assign(cell, update);
    this.informAdjacentNeighbors(cell);
  }

  informAdjacentNeighbors(cell: GridCell) {
    const { north, east, south, west } = cell.neighbors;

    if (north) {
      const nextMask =
        north.fillStyle === this.fillStyle
          ? this.setMaskBit(north.adjacency, CardinalBit.South)
          : this.unsetMaskBit(north.adjacency, CardinalBit.South);
      north.adjacency = nextMask;
      north.neighbors.south = cell;
    }
    if (east) {
      const nextMask =
        east.fillStyle === this.fillStyle
          ? this.setMaskBit(east.adjacency, CardinalBit.West)
          : this.unsetMaskBit(east.adjacency, CardinalBit.West);
      east.adjacency = nextMask;
      east.neighbors.west = cell;
    }
    if (south) {
      const nextMask =
        south.fillStyle === this.fillStyle
          ? this.setMaskBit(south.adjacency, CardinalBit.North)
          : this.unsetMaskBit(south.adjacency, CardinalBit.North);
      south.adjacency = nextMask;
      south.neighbors.north = cell;
    }
    if (west) {
      const nextMask =
        west.fillStyle === this.fillStyle
          ? this.setMaskBit(west.adjacency, CardinalBit.East)
          : this.unsetMaskBit(west.adjacency, CardinalBit.East);
      west.adjacency = nextMask;
      west.neighbors.east = cell;
    }
  }

  getAdjacentLikeRegionIds(neighbors: CellNeighbors) {
    const adjacentRegions = new Set<number>();
    Object.values(neighbors).forEach(
      (n) => n?.fillStyle === this.fillStyle && adjacentRegions.add(n.regionId)
    );

    return [...adjacentRegions];
  }

  getPotentiallyCleavedNeighbors(cell: GridCell, regionId: number) {
    const dirs: Array<keyof CellNeighbors> = [];

    Object.entries(cell.neighbors).forEach(([key, neighbor]) => {
      if (neighbor?.regionId === regionId) {
        dirs.push(key as keyof CellNeighbors);
      }
    });

    return dirs.length > 1 ? dirs : [];
  }

  parseCellId(id: string) {
    return id.split(".");
  }

  searchRegionForCells(
    startCell: GridCell | undefined,
    searchIds: Set<string>
  ) {
    const visited = new Set<string>();
    const foundIds = new Set<string>();
    if (!startCell) return foundIds;

    const visitCell = (currentCell: GridCell) => {
      if (visited.has(currentCell.id) || foundIds.size === searchIds.size)
        return;
      visited.add(currentCell.id);

      if (currentCell.regionId !== startCell.regionId) return;

      if (searchIds.has(currentCell.id)) {
        foundIds.add(currentCell.id);
      }

      for (const neighbor of Object.values(currentCell.neighbors)) {
        if (!neighbor) continue;
        visitCell(neighbor);
      }
    };

    visitCell(startCell);

    return foundIds;
  }

  getCellCoord(cell: GridCell) {
    return { row: cell.row, col: cell.col };
  }

  floodFill(
    startCell: GridCell,
    conditionFn: (cell: GridCell) => boolean,
    update: (cell: GridCell) => void
  ) {
    const visited = new Set<string>();

    // walk all connected cells and update their regionId
    const visitCell = (currentCell: GridCell) => {
      if (visited.has(currentCell.id)) return;
      visited.add(currentCell.id);

      if (conditionFn(currentCell)) {
        update(currentCell);
      }

      for (const dir of directions) {
        const neighbor = currentCell.neighbors[dir];
        if (!neighbor) continue;
        visitCell(neighbor);
      }
    };

    visitCell(startCell);
  }

  // TODO: is this walking all cells, and not just region cells?
  setIdForRegion(startCell: GridCell, prevRegionId?: number) {
    this.floodFill(
      startCell,
      (cell) => cell.fillStyle === startCell.fillStyle,
      (cell) => this.updateCell(cell, { regionId: startCell.regionId })
    );

    // if neighbor is potentiall cleaved, update regionIds
    // pessimistic fill off the cuff seems similar to search then fill perf
    // if (prevRegionId !== undefined) {
    //   const dirsToCheck = this.getPotentiallyCleavedNeighbors(
    //     startCell,
    //     prevRegionId
    //   );

    //   if (dirsToCheck.length) {
    //     for (const dir of dirsToCheck) {
    //       const neighbor = startCell.neighbors[dir];

    //       if (neighbor?.regionId === prevRegionId) {
    //         console.log("should fill");
    //         const nextRegionId = this.nextRegionId++;

    //         this.floodFill(
    //           neighbor,
    //           (cell) => cell.regionId === prevRegionId,
    //           (cell) => this.updateCell(cell, { regionId: nextRegionId })
    //         );
    //       }
    //     }
    //   }
    // }
  }

  shouldPaintCell(cellCoord: GridCellCoord) {
    return (
      this.cellData[cellCoord.row]?.[cellCoord.col]?.fillStyle !==
      this.fillStyle
    );
  }

  paintCell(cellCoord: GridCellCoord) {
    if (!this.shouldPaintCell(cellCoord)) return;

    if (!this.cellData[cellCoord.row]) {
      this.cellData[cellCoord.row] = [];
    }

    const neighbors = this.getCellNeighbors(cellCoord);
    const adjacentLikeRegionIds = this.getAdjacentLikeRegionIds(neighbors);

    const prevRegionId = this.getCell(cellCoord)?.regionId;
    const regionId = adjacentLikeRegionIds[0] ?? this.nextRegionId++;
    const mask = this.makeAdjacencyMask(neighbors);

    const cell: GridCell = {
      id: `${cellCoord.row}.${cellCoord.col}`,
      row: cellCoord.row,
      col: cellCoord.col,
      neighbors,
      fillStyle: this.fillStyle,
      adjacency: parseInt(mask.toString(2), 2),
      regionId,
    };

    console.log({ mask, painting: cell });

    this.setCell(cellCoord, cell);
    this.setIdForRegion(cell, prevRegionId);

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
