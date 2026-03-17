cmake_minimum_required(VERSION 3.15)
project(cloth_sim_native CXX)

set(CMAKE_CXX_STANDARD 17)

# Emscripten: use emscripten.cmake toolchain
# Build with: emcmake cmake -B build -S . && cmake --build build

add_executable(cloth_sim_native
  constraint_builder.cpp
)

# When building with Emscripten, output .js and .wasm
if(EMSCRIPTEN)
  set_target_properties(cloth_sim_native PROPERTIES
    SUFFIX ".js"
    EMCACHE "${CMAKE_BINARY_DIR}/emcache"
  )
  target_link_options(cloth_sim_native PRIVATE
    "SHELL:-s EXPORTED_FUNCTIONS=[_malloc,_free,_buildGridClothCounts,_buildGridCloth]"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=[ccall,cwrap,HEAPF32,HEAPU32]"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME=createClothSimModule"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  )
endif()
