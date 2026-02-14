# Native (C++/WASM) modules

CPU-bound logic (mesh building, parsing, export, etc.) is implemented in C++ and compiled to WebAssembly with Emscripten.

## Build requirements

- [Emscripten SDK](https://emscripten.org/docs/getting_started/downloads.html) (emcc in PATH)

## Build

From this directory:

```bash
# Option A: Makefile (emcc only)
make
cp cloth_sim_native.js cloth_sim_native.wasm ../public/

# Option B: CMake (emcmake)
emcmake cmake -B build -S .
cmake --build build
cp build/cloth_sim_native.js build/cloth_sim_native.wasm ../public/
```

From project root:

```bash
npm run build:wasm
```

## Modules

### constraint_builder.cpp

Builds a grid cloth mesh and constraint lists.

- **buildGridClothCounts(nx, ny)** → numVertices, numIndices, numStructural, numShear, numBend
- **buildGridCloth(nx, ny, scale, positionsPtr, indicesPtr, structuralPtr, shearPtr, bendPtr)** → fills pre-allocated buffers

Buffer layout:

- `positions`: 3 floats per vertex (x, y, z), row-major
- `indices`: 3 uint32 per triangle (triangle list)
- `structural` / `shear` / `bend`: 3 floats per constraint (vertex index i, vertex index j, rest length)

TypeScript loads the WASM module and calls these via `Module.ccall` or `cwrap`, passing heap pointers (HEAPF32, HEAPU32). See `src/renderer/wasm/loadSimModule.ts`.

## Adding a new module

1. Add a new `.cpp` file and implement `extern "C"` functions.
2. Add it to the Makefile `SRC` or CMakeLists.txt.
3. Add the exported function names to `EXPORTED_FUNCTIONS` in the build.
4. In TS, add a wrapper in `wasm/` that calls the exported function with the correct buffer views.
