// profiling structs in devtools

export const TestBtn = () => {
  return <button onClick={testFn}>test</button>;
};

type XYCoord = {
  x: number;
  y: number;
};

let arrayAllocated: unknown[];
let arrayUnallocated: unknown[];
let array2dAllocated: unknown[][];
let array2dUnallocated: unknown[][];
let hashMapUnallocated: Record<string, unknown>;
let hashMapAllocated: Record<string, unknown>;
let hashMap2dUnallocated: Record<string, Record<string, unknown>>;
let hashMap2dAllocated: Record<string, Record<string, unknown>>;
let points: XYCoord[];

const testFn = () => {
  const size = 300;

  function genPoints() {
    points = [];

    for (let i = 0; i < Math.floor(size * size * 0.2); i++) {
      const x = Math.floor(Math.random() * size);
      const y = Math.floor(Math.random() * size);

      points.push({ x, y });
    }
  }

  function initStructs() {
    arrayAllocated = new Array(size * size);
    arrayUnallocated = [];

    array2dAllocated = new Array(size).fill(null).map(() => new Array(size));
    array2dUnallocated = [];

    hashMapUnallocated = {};
    hashMap2dUnallocated = {};

    hashMapAllocated = {};
    for (let x = 0; x < size; x++) {
      for (let y = 0; y < size; y++) {
        hashMapAllocated[hashPoint({ x: x, y: y })] = {};
      }
    }

    hashMap2dAllocated = {};
    for (let x = 0; x < size; x++) {
      hashMap2dAllocated[x] = {};
      for (let y = 0; y < size; y++) {
        hashMap2dAllocated[x][y] = null;
      }
    }

    points = [];
  }

  function fillArrayAllocated() {
    for (const point of points) {
      arrayAllocated[point.x + size * point.y] = structuredClone(point);
    }
  }

  function fillArrayUnallocated() {
    for (const point of points) {
      arrayUnallocated[point.x + size * point.y] = structuredClone(point);
    }
  }

  function fillArray2dUnallocated() {
    for (const point of points) {
      if (!array2dUnallocated[point.x]) array2dUnallocated[point.x] = [];

      array2dUnallocated[point.x][point.y] = structuredClone(point);
    }
  }

  function fillArray2dAllocated() {
    for (const point of points) {
      array2dAllocated[point.x][point.y] = structuredClone(point);
    }
  }

  function hashPoint(point: XYCoord) {
    return `${point.x}.${point.y}`;
  }

  function fillHashMapUnallocated() {
    for (const point of points) {
      hashMapUnallocated[hashPoint(point)] = structuredClone(point);
    }
  }

  function fillHashMapAllocated() {
    for (const point of points) {
      hashMapAllocated[hashPoint(point)] = structuredClone(point);
    }
  }

  function fillHashMap2dUnallocated() {
    for (const point of points) {
      if (!(point.x in hashMap2dUnallocated)) {
        hashMap2dUnallocated[point.x] = {};
      }
      hashMap2dUnallocated[point.x][point.y] = structuredClone(point);
    }
  }

  function fillHashMap2dAllocated() {
    for (const point of points) {
      hashMap2dAllocated[point.x][point.y] = structuredClone(point);
    }
  }

  initStructs();
  genPoints();

  fillArrayAllocated();

  // genPoints();
  fillArrayUnallocated();

  // genPoints();
  fillArray2dUnallocated();

  // genPoints();
  fillArray2dAllocated();

  // genPoints();
  fillHashMapUnallocated();

  // genPoints();
  fillHashMapAllocated();

  // genPoints();
  fillHashMap2dUnallocated();

  // genPoints();
  fillHashMap2dAllocated();
};
