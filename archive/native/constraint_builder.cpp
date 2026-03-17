/**
 * Grid cloth mesh and constraint builder.
 * Outputs positions, triangle indices, and structural/shear/bend constraint pairs
 * for a nx x ny grid. Used by TS to upload to GPU.
 */

#include <cmath>
#include <cstdint>
#include <vector>

extern "C" {

/** Constraint: two vertex indices (uint32) and rest length (float). */
struct Constraint {
  uint32_t i;
  uint32_t j;
  float restLength;
};

/**
 * Get counts for a grid cloth (nx x ny quads).
 * Out params: numVertices, numIndices, numStructural, numShear, numBend.
 */
void buildGridClothCounts(
  int nx, int ny,
  int* outNumVertices,
  int* outNumIndices,
  int* outNumStructural,
  int* outNumShear,
  int* outNumBend
) {
  if (nx < 2) nx = 2;
  if (ny < 2) ny = 2;
  int nv = nx * ny;
  int nq = (nx - 1) * (ny - 1);
  *outNumVertices = nv;
  *outNumIndices = nq * 6;  /* 2 triangles per quad, 3 indices each */
  /* Structural: horizontal (ny rows * (nx-1)) + vertical (nx cols * (ny-1)) */
  *outNumStructural = (nx - 1) * ny + nx * (ny - 1);
  /* Shear: 2 diagonals per quad */
  *outNumShear = nq * 2;
  /* Bend: horizontal (ny * (nx-2)) + vertical ((ny-2) * nx) - edges between quads */
  int bendH = ny * (nx > 2 ? nx - 2 : 0);
  int bendV = (ny > 2 ? ny - 2 : 0) * nx;
  *outNumBend = bendH + bendV;
}

/**
 * Build grid cloth: positions (float x,y,z per vertex), indices (uint32 tri list),
 * structural/shear/bend constraints (i, j, restLength each).
 * Buffers must be pre-allocated by caller with sizes from buildGridClothCounts.
 * positions: 3 * numVertices floats
 * indices: numIndices uint32
 * structural: 3 * numStructural (i, j, restLength per constraint)
 * shear: 3 * numShear
 * bend: 3 * numBend
 */
void buildGridCloth(
  int nx, int ny, float scale,
  float* positions,
  uint32_t* indices,
  float* structural,
  float* shear,
  float* bend
) {
  if (nx < 2) nx = 2;
  if (ny < 2) ny = 2;
  const int nv = nx * ny;
  const int nq = (nx - 1) * (ny - 1);
  const float dx = scale / (float)(nx - 1);
  const float dy = scale / (float)(ny - 1);

  /* Positions: row-major, y-up */
  for (int j = 0; j < ny; ++j) {
    for (int i = 0; i < nx; ++i) {
      int idx = (j * nx + i) * 3;
      positions[idx + 0] = i * dx - scale * 0.5f;
      positions[idx + 1] = j * dy;
      positions[idx + 2] = 0.f;
    }
  }

  /* Triangle indices (two per quad) */
  int triIdx = 0;
  for (int j = 0; j < ny - 1; ++j) {
    for (int i = 0; i < nx - 1; ++i) {
      int v00 = j * nx + i;
      int v10 = j * nx + (i + 1);
      int v01 = (j + 1) * nx + i;
      int v11 = (j + 1) * nx + (i + 1);
      indices[triIdx++] = (uint32_t)v00;
      indices[triIdx++] = (uint32_t)v01;
      indices[triIdx++] = (uint32_t)v10;
      indices[triIdx++] = (uint32_t)v10;
      indices[triIdx++] = (uint32_t)v01;
      indices[triIdx++] = (uint32_t)v11;
    }
  }

  auto dist = [&](int a, int b) {
    float* pa = positions + a * 3;
    float* pb = positions + b * 3;
    return std::sqrt((pa[0]-pb[0])*(pa[0]-pb[0]) + (pa[1]-pb[1])*(pa[1]-pb[1]) + (pa[2]-pb[2])*(pa[2]-pb[2]));
  };

  /* Structural constraints */
  int sIdx = 0;
  for (int j = 0; j < ny; ++j) {
    for (int i = 0; i < nx - 1; ++i) {
      int a = j * nx + i;
      int b = j * nx + (i + 1);
      structural[sIdx++] = (float)a;
      structural[sIdx++] = (float)b;
      structural[sIdx++] = dist(a, b);
    }
  }
  for (int j = 0; j < ny - 1; ++j) {
    for (int i = 0; i < nx; ++i) {
      int a = j * nx + i;
      int b = (j + 1) * nx + i;
      structural[sIdx++] = (float)a;
      structural[sIdx++] = (float)b;
      structural[sIdx++] = dist(a, b);
    }
  }

  /* Shear (diagonals) */
  int shIdx = 0;
  for (int j = 0; j < ny - 1; ++j) {
    for (int i = 0; i < nx - 1; ++i) {
      int v00 = j * nx + i;
      int v11 = (j + 1) * nx + (i + 1);
      int v10 = j * nx + (i + 1);
      int v01 = (j + 1) * nx + i;
      shear[shIdx++] = (float)v00;
      shear[shIdx++] = (float)v11;
      shear[shIdx++] = dist(v00, v11);
      shear[shIdx++] = (float)v10;
      shear[shIdx++] = (float)v01;
      shear[shIdx++] = dist(v10, v01);
    }
  }

  /* Bend (skip one vertex along row/column) */
  int bIdx = 0;
  for (int j = 0; j < ny; ++j) {
    for (int i = 0; i < nx - 2; ++i) {
      int a = j * nx + i;
      int b = j * nx + (i + 2);
      bend[bIdx++] = (float)a;
      bend[bIdx++] = (float)b;
      bend[bIdx++] = dist(a, b);
    }
  }
  for (int j = 0; j < ny - 2; ++j) {
    for (int i = 0; i < nx; ++i) {
      int a = j * nx + i;
      int b = (j + 2) * nx + i;
      bend[bIdx++] = (float)a;
      bend[bIdx++] = (float)b;
      bend[bIdx++] = dist(a, b);
    }
  }
}

}  // extern "C"
