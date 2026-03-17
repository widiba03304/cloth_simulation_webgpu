/**
 * CPU-side Signed Distance Field (SDF) builder from a triangle mesh.
 *
 * Builds a 3D grid where each cell stores the signed distance to the mesh surface:
 *   positive = outside the mesh
 *   negative = inside the mesh
 *
 * Used to replace capsule-based body collision with accurate SMPL mesh collision.
 * No GPU / WebGPU dependencies — safe to import in Node test environments.
 */

export interface BodySDF {
  /** Flat f32 array [x + y*gridW + z*gridW*gridH].  Signed metres. */
  data:   Float32Array;
  gridW:  number;  // must be multiple of 64 (WebGPU bytesPerRow alignment)
  gridH:  number;
  gridD:  number;
  /** World-space origin of the (0,0,0) voxel centre. */
  minX:   number;
  minY:   number;
  minZ:   number;
  /** Total world extent covered by the grid (metres). */
  extX:   number;
  extY:   number;
  extZ:   number;
}

// ── Inline closest-point-on-triangle ─────────────────────────────────────────
// Returns squared distance and writes closest point into (outQx, outQy, outQz).
// Using explicit vars avoids tuple allocation in the hot loop.

let _qx = 0, _qy = 0, _qz = 0; // shared output (single-threaded JS is safe)

function closestPointOnTriSq(
  px: number, py: number, pz: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
): number {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;

  const d1 = abx*apx + aby*apy + abz*apz;
  const d2 = acx*apx + acy*apy + acz*apz;
  if (d1 <= 0 && d2 <= 0) { _qx = ax; _qy = ay; _qz = az; }
  else {
    const bpx = px - bx, bpy = py - by, bpz = pz - bz;
    const d3 = abx*bpx + aby*bpy + abz*bpz;
    const d4 = acx*bpx + acy*bpy + acz*bpz;
    if (d3 >= 0 && d4 <= d3) { _qx = bx; _qy = by; _qz = bz; }
    else {
      const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
      const d5 = abx*cpx + aby*cpy + abz*cpz;
      const d6 = acx*cpx + acy*cpy + acz*cpz;
      if (d6 >= 0 && d5 <= d6) { _qx = cx; _qy = cy; _qz = cz; }
      else {
        const vc = d1*d4 - d3*d2;
        if (vc <= 0 && d1 >= 0 && d3 <= 0) {
          const v = d1 / (d1 - d3);
          _qx = ax + v*abx; _qy = ay + v*aby; _qz = az + v*abz;
        } else {
          const vb = d5*d2 - d1*d6;
          if (vb <= 0 && d2 >= 0 && d6 <= 0) {
            const w = d2 / (d2 - d6);
            _qx = ax + w*acx; _qy = ay + w*acy; _qz = az + w*acz;
          } else {
            const va = d3*d6 - d5*d4;
            if (va <= 0 && (d4-d3) >= 0 && (d5-d6) >= 0) {
              const w = (d4-d3) / ((d4-d3)+(d5-d6));
              _qx = bx + w*(cx-bx); _qy = by + w*(cy-by); _qz = bz + w*(cz-bz);
            } else {
              const denom = 1 / (va + vb + vc);
              const v2 = vb * denom, w2 = vc * denom;
              _qx = ax + v2*abx + w2*acx;
              _qy = ay + v2*aby + w2*acy;
              _qz = az + v2*abz + w2*acz;
            }
          }
        }
      }
    }
  }
  const ex = px - _qx, ey = py - _qy, ez = pz - _qz;
  return ex*ex + ey*ey + ez*ez;
}

// ── Main builder ──────────────────────────────────────────────────────────────

/**
 * Build a signed-distance-field grid from a triangle mesh.
 *
 * @param positions  Flat Float32Array of xyz vertex positions (stride 3).
 * @param indices    Flat Uint32Array of triangle vertex indices (stride 3).
 * @param targetCellSize  Desired voxel size in metres (default 0.015 = 1.5 cm).
 */
export function buildBodySDF(
  positions: Float32Array,
  indices:   Uint32Array,
  targetCellSize = 0.015,
): BodySDF {
  const numTris = indices.length / 3;

  // ── 1. Mesh AABB + margin ───────────────────────────────────────────────────
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    if (positions[i]!     < minX) minX = positions[i]!;
    if (positions[i]!     > maxX) maxX = positions[i]!;
    if (positions[i+1]!   < minY) minY = positions[i+1]!;
    if (positions[i+1]!   > maxY) maxY = positions[i+1]!;
    if (positions[i+2]!   < minZ) minZ = positions[i+2]!;
    if (positions[i+2]!   > maxZ) maxZ = positions[i+2]!;
  }
  const margin = 0.07;
  minX -= margin; minY -= margin; minZ -= margin;
  maxX += margin; maxY += margin; maxZ += margin;

  const extX = maxX - minX, extY = maxY - minY, extZ = maxZ - minZ;

  // gridW must be a multiple of 64 → bytesPerRow = gridW×4 is multiple of 256.
  const rawW = Math.max(4, Math.ceil(extX / targetCellSize) + 1);
  const gridW = Math.ceil(rawW / 64) * 64;
  const gridH = Math.max(4, Math.ceil(extY / targetCellSize) + 1);
  const gridD = Math.max(4, Math.ceil(extZ / targetCellSize) + 1);
  const N_VOX = gridW * gridH * gridD;

  const cellX = extX / (gridW - 1);
  const cellY = extY / (gridH - 1);
  const cellZ = extZ / (gridD - 1);

  // ── 2. Precompute face normals ─────────────────────────────────────────────
  const faceNx = new Float32Array(numTris);
  const faceNy = new Float32Array(numTris);
  const faceNz = new Float32Array(numTris);
  for (let ti = 0; ti < numTris; ti++) {
    const i0 = indices[ti*3]!, i1 = indices[ti*3+1]!, i2 = indices[ti*3+2]!;
    const ax = positions[i0*3]!, ay = positions[i0*3+1]!, az = positions[i0*3+2]!;
    const bx = positions[i1*3]!, by = positions[i1*3+1]!, bz = positions[i1*3+2]!;
    const cx = positions[i2*3]!, cy = positions[i2*3+1]!, cz = positions[i2*3+2]!;
    let nx = (by-ay)*(cz-az) - (bz-az)*(cy-ay);
    let ny = (bz-az)*(cx-ax) - (bx-ax)*(cz-az);
    let nz = (bx-ax)*(cy-ay) - (by-ay)*(cx-ax);
    const len = Math.sqrt(nx*nx + ny*ny + nz*nz);
    if (len > 1e-10) { nx /= len; ny /= len; nz /= len; }
    faceNx[ti] = nx; faceNy[ti] = ny; faceNz[ti] = nz;
  }

  // ── 3. Coarse spatial grid (factor 2 over fine grid) ──────────────────────
  // cgFactor=2 → coarse cell ≈ 2×targetCellSize ≈ 3cm.
  // 3×3×3 = 27-cell search radius ≈ ±6cm. Handles surface proximity well.
  const cgFactor = 2;
  const cgCellX = cellX * cgFactor;
  const cgCellY = cellY * cgFactor;
  const cgCellZ = cellZ * cgFactor;
  const cgW = Math.max(1, Math.ceil(extX / cgCellX));
  const cgH = Math.max(1, Math.ceil(extY / cgCellY));
  const cgD = Math.max(1, Math.ceil(extZ / cgCellZ));
  const cgSize = cgW * cgH * cgD;

  // Use flat typed arrays for the coarse-grid triangle lists to avoid GC.
  // First pass: count triangles per cell.
  const cgCounts = new Int32Array(cgSize);
  for (let ti = 0; ti < numTris; ti++) {
    const i0 = indices[ti*3]!, i1 = indices[ti*3+1]!, i2 = indices[ti*3+2]!;
    const ax = positions[i0*3]!, bx = positions[i1*3]!, cx = positions[i2*3]!;
    const ay = positions[i0*3+1]!, by = positions[i1*3+1]!, cy = positions[i2*3+1]!;
    const az = positions[i0*3+2]!, bz = positions[i1*3+2]!, cz = positions[i2*3+2]!;

    const gc0x = Math.max(0, Math.floor((Math.min(ax,bx,cx)-minX)/cgCellX)-1);
    const gc0y = Math.max(0, Math.floor((Math.min(ay,by,cy)-minY)/cgCellY)-1);
    const gc0z = Math.max(0, Math.floor((Math.min(az,bz,cz)-minZ)/cgCellZ)-1);
    const gc1x = Math.min(cgW-1, Math.floor((Math.max(ax,bx,cx)-minX)/cgCellX)+1);
    const gc1y = Math.min(cgH-1, Math.floor((Math.max(ay,by,cy)-minY)/cgCellY)+1);
    const gc1z = Math.min(cgD-1, Math.floor((Math.max(az,bz,cz)-minZ)/cgCellZ)+1);

    for (let gz = gc0z; gz <= gc1z; gz++)
    for (let gy = gc0y; gy <= gc1y; gy++)
    for (let gx = gc0x; gx <= gc1x; gx++)
      cgCounts[gz*cgH*cgW + gy*cgW + gx]++;
  }

  // Prefix sum to get cell start offsets.
  const cgOffsets = new Int32Array(cgSize + 1);
  for (let i = 0; i < cgSize; i++) cgOffsets[i+1] = cgOffsets[i] + cgCounts[i];
  const totalCgEntries = cgOffsets[cgSize];

  // Second pass: fill triangle index list.
  const cgTris = new Int32Array(totalCgEntries);
  const cgFill  = new Int32Array(cgSize); // current fill pointer per cell
  for (let ti = 0; ti < numTris; ti++) {
    const i0 = indices[ti*3]!, i1 = indices[ti*3+1]!, i2 = indices[ti*3+2]!;
    const ax = positions[i0*3]!, bx = positions[i1*3]!, cx = positions[i2*3]!;
    const ay = positions[i0*3+1]!, by = positions[i1*3+1]!, cy = positions[i2*3+1]!;
    const az = positions[i0*3+2]!, bz = positions[i1*3+2]!, cz = positions[i2*3+2]!;

    const gc0x = Math.max(0, Math.floor((Math.min(ax,bx,cx)-minX)/cgCellX)-1);
    const gc0y = Math.max(0, Math.floor((Math.min(ay,by,cy)-minY)/cgCellY)-1);
    const gc0z = Math.max(0, Math.floor((Math.min(az,bz,cz)-minZ)/cgCellZ)-1);
    const gc1x = Math.min(cgW-1, Math.floor((Math.max(ax,bx,cx)-minX)/cgCellX)+1);
    const gc1y = Math.min(cgH-1, Math.floor((Math.max(ay,by,cy)-minY)/cgCellY)+1);
    const gc1z = Math.min(cgD-1, Math.floor((Math.max(az,bz,cz)-minZ)/cgCellZ)+1);

    for (let gz = gc0z; gz <= gc1z; gz++)
    for (let gy = gc0y; gy <= gc1y; gy++)
    for (let gx = gc0x; gx <= gc1x; gx++) {
      const ci = gz*cgH*cgW + gy*cgW + gx;
      cgTris[cgOffsets[ci] + cgFill[ci]] = ti;
      cgFill[ci]++;
    }
  }

  // ── 4. Per-voxel: nearest-triangle signed distance ─────────────────────────
  // Unassigned voxels (no nearby triangle found) default to +1 (outside).
  const data = new Float32Array(N_VOX).fill(1.0);

  for (let iz = 0; iz < gridD; iz++)
  for (let iy = 0; iy < gridH; iy++)
  for (let ix = 0; ix < gridW; ix++) {
    const px = minX + ix * cellX;
    const py = minY + iy * cellY;
    const pz = minZ + iz * cellZ;

    const cgx = Math.min(cgW-1, Math.max(0, Math.floor((px-minX)/cgCellX)));
    const cgy = Math.min(cgH-1, Math.max(0, Math.floor((py-minY)/cgCellY)));
    const cgz = Math.min(cgD-1, Math.max(0, Math.floor((pz-minZ)/cgCellZ)));

    let bestDist2 = Infinity;
    let bestSign  = 1;

    for (let dz = -1; dz <= 1; dz++)
    for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const gx2 = cgx+dx, gy2 = cgy+dy, gz2 = cgz+dz;
      if (gx2 < 0||gx2 >= cgW||gy2 < 0||gy2 >= cgH||gz2 < 0||gz2 >= cgD) continue;
      const ci    = gz2*cgH*cgW + gy2*cgW + gx2;
      const start = cgOffsets[ci];
      const end   = cgOffsets[ci+1];

      for (let k = start; k < end; k++) {
        const ti = cgTris[k]!;
        const i0 = indices[ti*3]!, i1 = indices[ti*3+1]!, i2 = indices[ti*3+2]!;
        const ax = positions[i0*3]!, ay = positions[i0*3+1]!, az = positions[i0*3+2]!;
        const bx = positions[i1*3]!, by = positions[i1*3+1]!, bz = positions[i1*3+2]!;
        const cx = positions[i2*3]!, cy = positions[i2*3+1]!, cz = positions[i2*3+2]!;

        const d2 = closestPointOnTriSq(px,py,pz, ax,ay,az, bx,by,bz, cx,cy,cz);
        if (d2 < bestDist2) {
          bestDist2 = d2;
          const dot = faceNx[ti]! * (px-_qx) + faceNy[ti]! * (py-_qy) + faceNz[ti]! * (pz-_qz);
          bestSign = dot >= 0 ? 1 : -1;
        }
      }
    }

    if (isFinite(bestDist2)) {
      data[iz*gridH*gridW + iy*gridW + ix] = Math.sqrt(bestDist2) * bestSign;
    }
    // else stays +1.0 — corrected by flood fill below
  }

  // ── 5. Flood-fill to fix interior voxels (value +1 but surrounded by neg) ──
  // BFS from all border voxels outward through the +1-valued region.
  // Unvisited +1 voxels surrounded by negative values = inside → set to -0.3.
  const visited = new Uint8Array(N_VOX);
  const queue   = new Int32Array(N_VOX);
  let   qHead   = 0, qTail = 0;

  // Seed: all border voxels that are clearly outside (value >= 0)
  for (let iz = 0; iz < gridD; iz++)
  for (let iy = 0; iy < gridH; iy++)
  for (let ix = 0; ix < gridW; ix++) {
    const isBorder = ix===0 || ix===gridW-1 || iy===0 || iy===gridH-1 || iz===0 || iz===gridD-1;
    if (!isBorder) continue;
    const idx = iz*gridH*gridW + iy*gridW + ix;
    if (data[idx]! >= 0 && !visited[idx]) {
      visited[idx] = 1;
      queue[qTail++] = idx;
    }
  }

  // BFS: propagate through non-negative voxels
  const strides = [1, -1, gridW, -gridW, gridH*gridW, -gridH*gridW];
  while (qHead < qTail) {
    const idx = queue[qHead++]!;
    for (const stride of strides) {
      const nIdx = idx + stride;
      if (nIdx < 0 || nIdx >= N_VOX || visited[nIdx]) continue;
      if (data[nIdx]! >= 0) { // unassigned (+1) or positive SDF = outside
        visited[nIdx] = 1;
        queue[qTail++] = nIdx;
      }
    }
  }

  // Any +1 voxel NOT reached by BFS = deep interior → mark negative
  for (let i = 0; i < N_VOX; i++) {
    if (data[i]! === 1.0 && !visited[i]) {
      data[i] = -0.3; // clearly inside body (30 cm inward as safe large value)
    }
  }

  return { data, gridW, gridH, gridD, minX, minY, minZ, extX, extY, extZ };
}
