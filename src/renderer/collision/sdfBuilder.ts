/**
 * SDF (Signed Distance Field) Builder
 *
 * Generates a 3D signed distance field from a triangle mesh using the Jump Flood Algorithm.
 * The SDF stores the shortest distance from each voxel to the nearest surface point.
 *
 * Convention: Negative distances = inside mesh, Positive = outside, Zero = on surface
 */

import type { BodyMesh } from '../render/bodyMesh';

export type Vec3 = [number, number, number];

export interface SDFResult {
  sdf: Float32Array;          // Signed distance values (resolution³)
  bounds: {
    min: Vec3;
    max: Vec3;
  };
  resolution: number;
  cellSize: number;            // Physical size of one voxel
}

interface VoxelData {
  distance: number;            // Unsigned distance to nearest surface
  closestPoint: Vec3 | null;   // Closest surface point (for gradient)
}

/**
 * Build a signed distance field from a triangle mesh.
 *
 * @param mesh - Input triangle mesh (positions, indices)
 * @param resolution - Grid resolution (e.g., 64 for 64³ grid)
 * @returns SDF data ready for GPU upload
 */
export function buildSDF(
  mesh: BodyMesh,
  resolution: number = 64
): SDFResult {
  console.log(`[SDF] Building ${resolution}³ SDF from ${mesh.positions.length / 3} vertices, ${mesh.indices.length / 3} triangles`);
  const startTime = performance.now();

  // Step 1: Compute bounding box
  const bounds = computeBounds(mesh.positions);
  console.log(`[SDF] Bounds: min=${bounds.min}, max=${bounds.max}`);

  // Add padding (5% on each side) to avoid boundary artifacts
  const padding = 0.05;
  const size: Vec3 = [
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2],
  ];
  bounds.min = [
    bounds.min[0] - size[0] * padding,
    bounds.min[1] - size[1] * padding,
    bounds.min[2] - size[2] * padding,
  ];
  bounds.max = [
    bounds.max[0] + size[0] * padding,
    bounds.max[1] + size[1] * padding,
    bounds.max[2] + size[2] * padding,
  ];

  // Step 2: Initialize grid
  const grid: VoxelData[] = new Array(resolution * resolution * resolution);
  for (let i = 0; i < grid.length; i++) {
    grid[i] = { distance: Infinity, closestPoint: null };
  }

  const cellSize = Math.max(
    (bounds.max[0] - bounds.min[0]) / resolution,
    (bounds.max[1] - bounds.min[1]) / resolution,
    (bounds.max[2] - bounds.min[2]) / resolution
  );

  console.log(`[SDF] Cell size: ${cellSize.toFixed(4)}`);

  // Step 3: Rasterize triangles to mark surface voxels
  rasterizeTriangles(mesh, bounds, resolution, grid);

  // Step 4: Jump Flood Algorithm to propagate distances
  jumpFlood(grid, resolution);

  // Step 5: Determine signs (inside/outside) via ray casting
  const sdf = computeSigns(mesh, grid, bounds, resolution);

  const buildTime = performance.now() - startTime;
  console.log(`[SDF] Build completed in ${buildTime.toFixed(1)}ms`);

  return {
    sdf,
    bounds,
    resolution,
    cellSize,
  };
}

/**
 * Compute axis-aligned bounding box of mesh.
 */
function computeBounds(positions: Float32Array): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < positions.length; i += 3) {
    min[0] = Math.min(min[0], positions[i]);
    min[1] = Math.min(min[1], positions[i + 1]);
    min[2] = Math.min(min[2], positions[i + 2]);

    max[0] = Math.max(max[0], positions[i]);
    max[1] = Math.max(max[1], positions[i + 1]);
    max[2] = Math.max(max[2], positions[i + 2]);
  }

  return { min, max };
}

/**
 * Rasterize mesh triangles into the voxel grid, marking surface voxels.
 */
function rasterizeTriangles(
  mesh: BodyMesh,
  bounds: { min: Vec3; max: Vec3 },
  resolution: number,
  grid: VoxelData[]
): void {
  const positions = mesh.positions;
  const indices = mesh.indices;
  const numTriangles = indices.length / 3;

  for (let t = 0; t < numTriangles; t++) {
    const i0 = indices[t * 3] * 3;
    const i1 = indices[t * 3 + 1] * 3;
    const i2 = indices[t * 3 + 2] * 3;

    const v0: Vec3 = [positions[i0], positions[i0 + 1], positions[i0 + 2]];
    const v1: Vec3 = [positions[i1], positions[i1 + 1], positions[i1 + 2]];
    const v2: Vec3 = [positions[i2], positions[i2 + 1], positions[i2 + 2]];

    // Rasterize triangle into voxels
    rasterizeTriangle(v0, v1, v2, bounds, resolution, grid);
  }

  console.log(`[SDF] Rasterized ${numTriangles} triangles`);
}

/**
 * Rasterize a single triangle into the voxel grid.
 * For each voxel near the triangle, compute distance and store closest point.
 */
function rasterizeTriangle(
  v0: Vec3,
  v1: Vec3,
  v2: Vec3,
  bounds: { min: Vec3; max: Vec3 },
  resolution: number,
  grid: VoxelData[]
): void {
  // Compute triangle bounding box
  const triMin: Vec3 = [
    Math.min(v0[0], v1[0], v2[0]),
    Math.min(v0[1], v1[1], v2[1]),
    Math.min(v0[2], v1[2], v2[2]),
  ];
  const triMax: Vec3 = [
    Math.max(v0[0], v1[0], v2[0]),
    Math.max(v0[1], v1[1], v2[1]),
    Math.max(v0[2], v1[2], v2[2]),
  ];

  // Convert to voxel coordinates
  const cellSize: Vec3 = [
    (bounds.max[0] - bounds.min[0]) / resolution,
    (bounds.max[1] - bounds.min[1]) / resolution,
    (bounds.max[2] - bounds.min[2]) / resolution,
  ];

  const voxelMin: Vec3 = [
    Math.max(0, Math.floor((triMin[0] - bounds.min[0]) / cellSize[0])),
    Math.max(0, Math.floor((triMin[1] - bounds.min[1]) / cellSize[1])),
    Math.max(0, Math.floor((triMin[2] - bounds.min[2]) / cellSize[2])),
  ];

  const voxelMax: Vec3 = [
    Math.min(resolution - 1, Math.ceil((triMax[0] - bounds.min[0]) / cellSize[0])),
    Math.min(resolution - 1, Math.ceil((triMax[1] - bounds.min[1]) / cellSize[1])),
    Math.min(resolution - 1, Math.ceil((triMax[2] - bounds.min[2]) / cellSize[2])),
  ];

  // For each voxel in triangle's bounding box
  for (let z = voxelMin[2]; z <= voxelMax[2]; z++) {
    for (let y = voxelMin[1]; y <= voxelMax[1]; y++) {
      for (let x = voxelMin[0]; x <= voxelMax[0]; x++) {
        // Voxel center in world space
        const voxelCenter: Vec3 = [
          bounds.min[0] + (x + 0.5) * cellSize[0],
          bounds.min[1] + (y + 0.5) * cellSize[1],
          bounds.min[2] + (z + 0.5) * cellSize[2],
        ];

        // Compute closest point on triangle to voxel center
        const closestPoint = closestPointOnTriangle(voxelCenter, v0, v1, v2);
        const distance = vec3Distance(voxelCenter, closestPoint);

        // Update voxel if this triangle is closer
        const idx = x + y * resolution + z * resolution * resolution;
        if (distance < grid[idx].distance) {
          grid[idx].distance = distance;
          grid[idx].closestPoint = closestPoint;
        }
      }
    }
  }
}

/**
 * Jump Flood Algorithm to propagate distances across the grid.
 *
 * This efficiently propagates distance information from surface voxels
 * to all voxels in the grid using a series of increasingly smaller jumps.
 */
function jumpFlood(grid: VoxelData[], resolution: number): void {
  // Jump sizes: 32, 16, 8, 4, 2, 1 for 64³ grid
  const maxJump = Math.floor(resolution / 2);
  const jumpSteps: number[] = [];
  for (let jump = maxJump; jump >= 1; jump = Math.floor(jump / 2)) {
    jumpSteps.push(jump);
  }

  console.log(`[SDF] Jump Flood steps: ${jumpSteps.join(', ')}`);

  for (const step of jumpSteps) {
    const newGrid: VoxelData[] = new Array(grid.length);

    for (let z = 0; z < resolution; z++) {
      for (let y = 0; y < resolution; y++) {
        for (let x = 0; x < resolution; x++) {
          const idx = x + y * resolution + z * resolution * resolution;

          // Start with current voxel's data
          newGrid[idx] = { ...grid[idx] };

          // Check 26 neighbors at step distance (or fewer at boundaries)
          for (let dz = -1; dz <= 1; dz++) {
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                const nx = x + dx * step;
                const ny = y + dy * step;
                const nz = z + dz * step;

                // Skip out-of-bounds
                if (nx < 0 || nx >= resolution || ny < 0 || ny >= resolution || nz < 0 || nz >= resolution) {
                  continue;
                }

                const neighborIdx = nx + ny * resolution + nz * resolution * resolution;
                const neighbor = grid[neighborIdx];

                if (neighbor.closestPoint !== null) {
                  // Compute distance from current voxel to neighbor's closest point
                  const voxelCenter: Vec3 = [x, y, z]; // In voxel coordinates
                  const neighborCenter: Vec3 = [nx, ny, nz];

                  // Use closestPoint to recompute distance
                  const distance = neighbor.distance + vec3Distance(voxelCenter, neighborCenter);

                  if (distance < newGrid[idx].distance) {
                    newGrid[idx].distance = distance;
                    newGrid[idx].closestPoint = neighbor.closestPoint;
                  }
                }
              }
            }
          }
        }
      }
    }

    // Swap grids
    for (let i = 0; i < grid.length; i++) {
      grid[i] = newGrid[i];
    }
  }

  console.log(`[SDF] Jump Flood completed`);
}

/**
 * Compute signs (inside/outside) for all voxels using ray casting.
 *
 * OPTIMIZED: Only ray cast for voxels near the surface (distance < threshold).
 * Voxels far from surface are assumed to be outside.
 */
function computeSigns(
  mesh: BodyMesh,
  grid: VoxelData[],
  bounds: { min: Vec3; max: Vec3 },
  resolution: number
): Float32Array {
  const sdf = new Float32Array(resolution * resolution * resolution);
  const cellSize: Vec3 = [
    (bounds.max[0] - bounds.min[0]) / resolution,
    (bounds.max[1] - bounds.min[1]) / resolution,
    (bounds.max[2] - bounds.min[2]) / resolution,
  ];

  // Threshold: only ray cast for voxels within this distance of surface
  const maxCellSize = Math.max(cellSize[0], cellSize[1], cellSize[2]);
  const raycastThreshold = maxCellSize * 3; // 3 voxels from surface

  let insideCount = 0;
  let raycastCount = 0;
  let progressReported = 0;

  for (let z = 0; z < resolution; z++) {
    // Report progress every 10%
    const progress = (z / resolution) * 100;
    if (progress >= progressReported + 10) {
      console.log(`[SDF] Computing signs: ${progress.toFixed(0)}%`);
      progressReported = Math.floor(progress / 10) * 10;
    }

    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        const idx = x + y * resolution + z * resolution * resolution;
        const unsignedDistance = grid[idx].distance;

        // Optimization: Only ray cast for voxels near surface
        if (unsignedDistance > raycastThreshold) {
          // Far from surface: assume outside
          sdf[idx] = unsignedDistance;
        } else {
          // Near surface: ray cast to determine inside/outside
          const voxelCenter: Vec3 = [
            bounds.min[0] + (x + 0.5) * cellSize[0],
            bounds.min[1] + (y + 0.5) * cellSize[1],
            bounds.min[2] + (z + 0.5) * cellSize[2],
          ];

          const rayOrigin = voxelCenter;
          const rayDir: Vec3 = [1, 0, 0];
          const intersections = countRayIntersections(mesh, rayOrigin, rayDir);

          // Odd intersections = inside
          const isInside = (intersections % 2) === 1;

          // Apply sign: negative inside, positive outside
          sdf[idx] = isInside ? -unsignedDistance : unsignedDistance;

          if (isInside) insideCount++;
          raycastCount++;
        }
      }
    }
  }

  console.log(`[SDF] Ray cast ${raycastCount} voxels (${(100 * raycastCount / sdf.length).toFixed(1)}% of total)`);
  console.log(`[SDF] Inside voxels: ${insideCount} / ${raycastCount} near surface`);

  return sdf;
}

/**
 * Count ray-triangle intersections for inside/outside test.
 * Optimized: Skip triangles that can't possibly intersect based on bounding box.
 */
function countRayIntersections(
  mesh: BodyMesh,
  rayOrigin: Vec3,
  rayDir: Vec3
): number {
  const positions = mesh.positions;
  const indices = mesh.indices;
  const numTriangles = indices.length / 3;

  let count = 0;

  for (let t = 0; t < numTriangles; t++) {
    const i0 = indices[t * 3] * 3;
    const i1 = indices[t * 3 + 1] * 3;
    const i2 = indices[t * 3 + 2] * 3;

    const v0: Vec3 = [positions[i0], positions[i0 + 1], positions[i0 + 2]];
    const v1: Vec3 = [positions[i1], positions[i1 + 1], positions[i1 + 2]];
    const v2: Vec3 = [positions[i2], positions[i2 + 1], positions[i2 + 2]];

    // Quick bounding box rejection for ray in +X direction
    const minY = Math.min(v0[1], v1[1], v2[1]);
    const maxY = Math.max(v0[1], v1[1], v2[1]);
    const minZ = Math.min(v0[2], v1[2], v2[2]);
    const maxZ = Math.max(v0[2], v1[2], v2[2]);
    const maxX = Math.max(v0[0], v1[0], v2[0]);

    // Skip if ray origin is past the triangle in X
    if (rayOrigin[0] > maxX) continue;

    // Skip if ray origin is outside triangle's YZ bounding box
    if (rayOrigin[1] < minY || rayOrigin[1] > maxY) continue;
    if (rayOrigin[2] < minZ || rayOrigin[2] > maxZ) continue;

    if (rayIntersectsTriangle(rayOrigin, rayDir, v0, v1, v2)) {
      count++;
    }
  }

  return count;
}

/**
 * Möller-Trumbore ray-triangle intersection test.
 */
function rayIntersectsTriangle(
  rayOrigin: Vec3,
  rayDir: Vec3,
  v0: Vec3,
  v1: Vec3,
  v2: Vec3
): boolean {
  const EPSILON = 0.000001;

  // Edges
  const edge1: Vec3 = vec3Sub(v1, v0);
  const edge2: Vec3 = vec3Sub(v2, v0);

  // Begin calculating determinant
  const h: Vec3 = vec3Cross(rayDir, edge2);
  const a = vec3Dot(edge1, h);

  // Ray parallel to triangle
  if (Math.abs(a) < EPSILON) {
    return false;
  }

  const f = 1.0 / a;
  const s: Vec3 = vec3Sub(rayOrigin, v0);
  const u = f * vec3Dot(s, h);

  if (u < 0.0 || u > 1.0) {
    return false;
  }

  const q: Vec3 = vec3Cross(s, edge1);
  const v = f * vec3Dot(rayDir, q);

  if (v < 0.0 || u + v > 1.0) {
    return false;
  }

  // Compute t to find intersection point
  const t = f * vec3Dot(edge2, q);

  // Intersection ahead of ray origin
  return t > EPSILON;
}

/**
 * Find closest point on triangle to given point.
 */
function closestPointOnTriangle(
  p: Vec3,
  a: Vec3,
  b: Vec3,
  c: Vec3
): Vec3 {
  // Adapted from Real-Time Collision Detection by Christer Ericson
  const ab: Vec3 = vec3Sub(b, a);
  const ac: Vec3 = vec3Sub(c, a);
  const ap: Vec3 = vec3Sub(p, a);

  const d1 = vec3Dot(ab, ap);
  const d2 = vec3Dot(ac, ap);

  // Vertex region A
  if (d1 <= 0 && d2 <= 0) {
    return a;
  }

  // Vertex region B
  const bp: Vec3 = vec3Sub(p, b);
  const d3 = vec3Dot(ab, bp);
  const d4 = vec3Dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) {
    return b;
  }

  // Edge region AB
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return vec3Add(a, vec3Scale(ab, v));
  }

  // Vertex region C
  const cp: Vec3 = vec3Sub(p, c);
  const d5 = vec3Dot(ab, cp);
  const d6 = vec3Dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) {
    return c;
  }

  // Edge region AC
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return vec3Add(a, vec3Scale(ac, w));
  }

  // Edge region BC
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return vec3Add(b, vec3Scale(vec3Sub(c, b), w));
  }

  // Inside triangle face
  const denom = 1.0 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  return vec3Add(a, vec3Add(vec3Scale(ab, v), vec3Scale(ac, w)));
}

// ============================================================================
// Vector Math Utilities
// ============================================================================

function vec3Add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function vec3Sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function vec3Scale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function vec3Dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function vec3Cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function vec3Distance(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
