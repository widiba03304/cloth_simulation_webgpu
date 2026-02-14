/**
 * Loads the C++/WASM cloth sim module and exposes buildGridClothCounts / buildGridCloth.
 * Caller owns buffers; this module only passes pointers and copies back.
 */

export interface GridClothCounts {
  numVertices: number;
  numIndices: number;
  numStructural: number;
  numShear: number;
  numBend: number;
}

export interface GridClothBuffers {
  positions: Float32Array;
  indices: Uint32Array;
  structural: Float32Array;
  shear: Float32Array;
  bend: Float32Array;
}

interface EmscriptenModule {
  ccall: (
    name: string,
    returnType: string,
    argTypes: string[],
    args: unknown[]
  ) => number;
  HEAPF32: Float32Array;
  HEAPU32: Uint32Array;
  HEAP32: Int32Array;
  _malloc: (bytes: number) => number;
  _free: (ptr: number) => void;
}

let modulePromise: Promise<EmscriptenModule> | null = null;

/**
 * Load the WASM module. Uses /cloth_sim_native.js when served from public/ (Vite/Electron).
 * In packaged app, main process can pass resolved path via window.electron.getWasmPath() if needed.
 */
export function loadClothSimModule(basePath?: string): Promise<EmscriptenModule> {
  if (modulePromise) return modulePromise;
  const path = basePath ?? (typeof window !== 'undefined' ? './cloth_sim_native.js' : '');
  modulePromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = path || './cloth_sim_native.js';
    script.async = true;
    script.onload = () => {
      const createModule = (window as unknown as { createClothSimModule?: () => Promise<EmscriptenModule> }).createClothSimModule;
      if (createModule) {
        createModule().then(resolve).catch(reject);
      } else {
        reject(new Error('createClothSimModule not found'));
      }
    };
    script.onerror = () => reject(new Error('Failed to load WASM script'));
    document.head.appendChild(script);
  });
  return modulePromise;
}

/**
 * Get grid cloth counts for a nx x ny grid. Call this before allocating buffers.
 */
export function buildGridClothCounts(
  mod: EmscriptenModule,
  nx: number,
  ny: number
): GridClothCounts {
  const pCounts = mod._malloc(5 * 4); // 5 ints
  try {
    mod.ccall(
      'buildGridClothCounts',
      'null',
      ['number', 'number', 'number', 'number', 'number', 'number', 'number'],
      [nx, ny, pCounts, pCounts + 4, pCounts + 8, pCounts + 12, pCounts + 16]
    );
    const heap = mod.HEAP32;
    const byteOffset = pCounts / 4;
    return {
      numVertices: heap[byteOffset],
      numIndices: heap[byteOffset + 1],
      numStructural: heap[byteOffset + 2],
      numShear: heap[byteOffset + 3],
      numBend: heap[byteOffset + 4],
    };
  } finally {
    mod._free(pCounts);
  }
}

/**
 * Build grid cloth mesh and constraints. Buffers must be pre-allocated with sizes from buildGridClothCounts.
 * Fills the provided arrays (they must be the correct size).
 */
export function buildGridCloth(
  mod: EmscriptenModule,
  nx: number,
  ny: number,
  scale: number,
  counts: GridClothCounts,
  positions: Float32Array,
  indices: Uint32Array,
  structural: Float32Array,
  shear: Float32Array,
  bend: Float32Array
): void {
  const pPos = mod._malloc(positions.byteLength);
  const pInd = mod._malloc(indices.byteLength);
  const pStr = mod._malloc(structural.byteLength);
  const pShr = mod._malloc(shear.byteLength);
  const pBnd = mod._malloc(bend.byteLength);
  try {
    mod.ccall(
      'buildGridCloth',
      'null',
      ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
      [nx, ny, scale, pPos, pInd, pStr, pShr, pBnd]
    );
    positions.set(mod.HEAPF32.subarray(pPos / 4, pPos / 4 + positions.length));
    indices.set(mod.HEAPU32.subarray(pInd / 4, pInd / 4 + indices.length));
    structural.set(mod.HEAPF32.subarray(pStr / 4, pStr / 4 + structural.length));
    shear.set(mod.HEAPF32.subarray(pShr / 4, pShr / 4 + shear.length));
    bend.set(mod.HEAPF32.subarray(pBnd / 4, pBnd / 4 + bend.length));
  } finally {
    mod._free(pPos);
    mod._free(pInd);
    mod._free(pStr);
    mod._free(pShr);
    mod._free(pBnd);
  }
}

/**
 * Build grid cloth and return new buffers. Convenience for one-shot use.
 */
export async function buildGridClothFromWasm(
  nx: number,
  ny: number,
  scale: number,
  moduleBasePath?: string
): Promise<GridClothBuffers> {
  const mod = await loadClothSimModule(moduleBasePath);
  const counts = buildGridClothCounts(mod, nx, ny);
  const positions = new Float32Array(counts.numVertices * 3);
  const indices = new Uint32Array(counts.numIndices);
  const structural = new Float32Array(counts.numStructural * 3);
  const shear = new Float32Array(counts.numShear * 3);
  const bend = new Float32Array(counts.numBend * 3);
  buildGridCloth(mod, nx, ny, scale, counts, positions, indices, structural, shear, bend);
  return { positions, indices, structural, shear, bend };
}
