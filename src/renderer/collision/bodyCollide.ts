/**
 * Body Collision System (SDF-based)
 *
 * Manages cloth-to-body collision detection using a Signed Distance Field.
 * The SDF is precomputed from the body mesh and stored as a 3D texture.
 */

import bodyCollideWgsl from './bodyCollide.wgsl?raw';
import { buildSDF, type SDFResult } from './sdfBuilder';
import type { BodyMesh } from '../render/bodyMesh';

const COLLISION_PARAMS_SIZE = 16;  // 4 floats: friction, restitution, thickness, pad
const BOUNDS_BUFFER_SIZE = 48;     // 3 vec3f + padding = 12 floats

let bodyCollisionPipeline: GPUComputePipeline | null = null;
let sdfTexture: GPUTexture | null = null;
let collisionParamsBuffer: GPUBuffer | null = null;
let boundsBuffer: GPUBuffer | null = null;
let sdfResolution = 64;
let currentSDF: SDFResult | null = null;

/**
 * Initialize body collision system.
 *
 * @param device - GPU device
 * @param bodyMesh - Body mesh to build SDF from
 * @param resolution - SDF grid resolution (default: 64)
 */
export async function initBodyCollision(
  device: GPUDevice,
  bodyMesh: BodyMesh,
  resolution: number = 64
): Promise<void> {
  console.log('[BodyCollision] Initializing body collision system');

  sdfResolution = resolution;

  // Step 1: Build SDF from body mesh on CPU
  currentSDF = buildSDF(bodyMesh, resolution);

  // Step 2: Create 3D texture and upload SDF
  sdfTexture = device.createTexture({
    size: [resolution, resolution, resolution],
    format: 'r32float',
    dimension: '3d',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });

  device.queue.writeTexture(
    { texture: sdfTexture },
    currentSDF.sdf,
    {
      bytesPerRow: resolution * 4,      // 4 bytes per float
      rowsPerImage: resolution,
    },
    [resolution, resolution, resolution]
  );

  console.log('[BodyCollision] SDF texture uploaded to GPU');

  // Step 3: Create collision parameters buffer
  const paramsData = new Float32Array(4);
  paramsData[0] = 0.3;   // friction (default)
  paramsData[1] = 0.0;   // restitution (default: no bounce)
  paramsData[2] = 0.01;  // thickness (default: 1cm)
  paramsData[3] = 0.0;   // padding

  collisionParamsBuffer = device.createBuffer({
    size: COLLISION_PARAMS_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(collisionParamsBuffer, 0, paramsData);

  // Step 5: Create bounding box buffer
  const boundsData = new Float32Array(12);
  // min (vec3f + pad)
  boundsData[0] = currentSDF.bounds.min[0];
  boundsData[1] = currentSDF.bounds.min[1];
  boundsData[2] = currentSDF.bounds.min[2];
  boundsData[3] = 0.0; // padding

  // max (vec3f + pad)
  boundsData[4] = currentSDF.bounds.max[0];
  boundsData[5] = currentSDF.bounds.max[1];
  boundsData[6] = currentSDF.bounds.max[2];
  boundsData[7] = 0.0; // padding

  // invSize (vec3f + pad)
  const sizeX = currentSDF.bounds.max[0] - currentSDF.bounds.min[0];
  const sizeY = currentSDF.bounds.max[1] - currentSDF.bounds.min[1];
  const sizeZ = currentSDF.bounds.max[2] - currentSDF.bounds.min[2];
  boundsData[8] = 1.0 / sizeX;
  boundsData[9] = 1.0 / sizeY;
  boundsData[10] = 1.0 / sizeZ;
  boundsData[11] = 0.0; // padding

  boundsBuffer = device.createBuffer({
    size: BOUNDS_BUFFER_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(boundsBuffer, 0, boundsData);

  // Step 6: Create compute pipeline
  const module = device.createShaderModule({ code: bodyCollideWgsl });
  bodyCollisionPipeline = await device.createComputePipelineAsync({
    layout: 'auto',
    compute: { module, entryPoint: 'main' },
  });

  console.log('[BodyCollision] Initialization complete');
}

/**
 * Run body collision compute pass.
 *
 * @param device - GPU device
 * @param positionBuffer - Current cloth positions (read-write)
 * @param prevBuffer - Previous cloth positions (read-write, for Verlet)
 * @param pinnedBuffer - Pinned vertices (read-only)
 * @param numVertices - Number of cloth vertices
 */
export function runBodyCollision(
  device: GPUDevice,
  positionBuffer: GPUBuffer,
  prevBuffer: GPUBuffer,
  pinnedBuffer: GPUBuffer,
  numVertices: number
): void {
  if (!bodyCollisionPipeline || !sdfTexture || !collisionParamsBuffer || !boundsBuffer) {
    console.warn('[BodyCollision] Not initialized, skipping collision');
    return;
  }

  const encoder = device.createCommandEncoder({ label: 'Body Collision Encoder' });
  const pass = encoder.beginComputePass({ label: 'Body Collision Pass' });

  pass.setPipeline(bodyCollisionPipeline);
  pass.setBindGroup(
    0,
    device.createBindGroup({
      layout: bodyCollisionPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: collisionParamsBuffer } },
        { binding: 1, resource: { buffer: boundsBuffer } },
        { binding: 2, resource: sdfTexture.createView() },
        // No binding 3 - sampler removed, using textureLoad
        { binding: 3, resource: { buffer: positionBuffer } },
        { binding: 4, resource: { buffer: prevBuffer } },
        { binding: 5, resource: { buffer: pinnedBuffer } },
      ],
    })
  );

  pass.dispatchWorkgroups(Math.ceil(numVertices / 64));
  pass.end();

  device.queue.submit([encoder.finish()]);
}

/**
 * Update collision parameters (friction, restitution, thickness).
 *
 * @param device - GPU device
 * @param friction - Friction coefficient (0.0 - 1.0)
 * @param restitution - Restitution coefficient (0.0 - 1.0)
 * @param thickness - Cloth thickness offset
 */
export function updateCollisionParams(
  device: GPUDevice,
  friction: number,
  restitution: number,
  thickness: number
): void {
  if (!collisionParamsBuffer) {
    console.warn('[BodyCollision] Not initialized, cannot update params');
    return;
  }

  const paramsData = new Float32Array(4);
  paramsData[0] = friction;
  paramsData[1] = restitution;
  paramsData[2] = thickness;
  paramsData[3] = 0.0;

  device.queue.writeBuffer(collisionParamsBuffer, 0, paramsData);
}

/**
 * Update SDF when body mesh deforms (e.g., via IK).
 *
 * @param device - GPU device
 * @param bodyMesh - Updated body mesh
 */
export async function updateBodyCollisionSDF(
  device: GPUDevice,
  bodyMesh: BodyMesh
): Promise<void> {
  if (!sdfTexture) {
    console.warn('[BodyCollision] Not initialized, cannot update SDF');
    return;
  }

  console.log('[BodyCollision] Regenerating SDF for deformed body');

  // Rebuild SDF
  currentSDF = buildSDF(bodyMesh, sdfResolution);

  // Re-upload to texture
  device.queue.writeTexture(
    { texture: sdfTexture },
    currentSDF.sdf,
    {
      bytesPerRow: sdfResolution * 4,
      rowsPerImage: sdfResolution,
    },
    [sdfResolution, sdfResolution, sdfResolution]
  );

  // Update bounds buffer
  if (boundsBuffer) {
    const boundsData = new Float32Array(12);
    boundsData[0] = currentSDF.bounds.min[0];
    boundsData[1] = currentSDF.bounds.min[1];
    boundsData[2] = currentSDF.bounds.min[2];
    boundsData[3] = 0.0;

    boundsData[4] = currentSDF.bounds.max[0];
    boundsData[5] = currentSDF.bounds.max[1];
    boundsData[6] = currentSDF.bounds.max[2];
    boundsData[7] = 0.0;

    const sizeX = currentSDF.bounds.max[0] - currentSDF.bounds.min[0];
    const sizeY = currentSDF.bounds.max[1] - currentSDF.bounds.min[1];
    const sizeZ = currentSDF.bounds.max[2] - currentSDF.bounds.min[2];
    boundsData[8] = 1.0 / sizeX;
    boundsData[9] = 1.0 / sizeY;
    boundsData[10] = 1.0 / sizeZ;
    boundsData[11] = 0.0;

    device.queue.writeBuffer(boundsBuffer, 0, boundsData);
  }

  console.log('[BodyCollision] SDF updated');
}

/**
 * Check if body collision system is initialized.
 */
export function isBodyCollisionInitialized(): boolean {
  return bodyCollisionPipeline !== null && sdfTexture !== null;
}

/**
 * Clean up GPU resources.
 */
export function destroyBodyCollision(): void {
  if (sdfTexture) {
    sdfTexture.destroy();
    sdfTexture = null;
  }

  if (collisionParamsBuffer) {
    collisionParamsBuffer.destroy();
    collisionParamsBuffer = null;
  }

  if (boundsBuffer) {
    boundsBuffer.destroy();
    boundsBuffer = null;
  }

  bodyCollisionPipeline = null;
  currentSDF = null;

  console.log('[BodyCollision] Cleaned up');
}
