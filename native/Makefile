# Build C++ to WASM with Emscripten. Requires: emcc (emsdk).
# Run: make && cp cloth_sim_native.js cloth_sim_native.wasm ../public/

CXX = emcc
OUT = cloth_sim_native.js
SRC = constraint_builder.cpp

$(OUT): $(SRC)
	$(CXX) $(SRC) -o $(OUT) -std=c++17 \
		-s EXPORTED_FUNCTIONS='[_malloc,_free,_buildGridClothCounts,_buildGridCloth]' \
		-s EXPORTED_RUNTIME_METHODS='[ccall,cwrap,HEAPF32,HEAPU32]' \
		-s MODULARIZE=1 \
		-s EXPORT_NAME=createClothSimModule \
		-s ALLOW_MEMORY_GROWTH=1

.PHONY: clean
clean:
	rm -f $(OUT) cloth_sim_native.wasm
