/**
 * Compute pipeline: integrate + constraint passes. Ping-pong position buffers.
 * Public API: createSimulation(), stepSimulation(), getVertexBuffer().
 */

import type { ClothData, SimulationParams } from '../types/simulation';
import { createStorageBuffer, createUniformBuffer } from '../webgpu/buffers';
import { initGroundCollision, runGroundCollision } from '../collision/body';
import { initBodyCollision, runBodyCollision, isBodyCollisionInitialized } from '../collision/bodyCollide';
import type { BodyMesh } from '../render/bodyMesh';
import integrateWgsl from './integrate.wgsl?raw';
import constraintsWgsl from './constraints.wgsl?raw';
import constraintsBendWgsl from './constraints_bend.wgsl?raw';

const INTEGRATE_PARAMS_SIZE = 32; // vec3 gravity + f32 dt + f32 damping + pad
const CONSTRAINT_PARAMS_SIZE = 16; // f32 stiffness + pad

export interface SimulationContext {
  device: GPUDevice;
  numVertices: number;
  numStructural: number;
  numShear: number;
  numBend: number;
  positionBuffers: [GPUBuffer, GPUBuffer];
  prevPositionBuffers: [GPUBuffer, GPUBuffer];
  pinnedBuffer: GPUBuffer;
  structuralBuffer: GPUBuffer;
  shearBuffer: GPUBuffer;
  bendBuffer: GPUBuffer;
  integratePipeline: GPUComputePipeline;
  constraintPipeline: GPUComputePipeline;
  bendPipeline: GPUComputePipeline;
  paramsUniform: GPUBuffer;
  constraintUniform: GPUBuffer;
  bendUniform: GPUBuffer;
  /** Which buffer index holds current positions (0 or 1) after step */
  currentIndex: number;
}

/**
 * Create simulation context from cloth data and params. Uploads initial buffers to GPU.
 */
export async function createSimulation(
  device: GPUDevice,
  cloth: ClothData,
  params: SimulationParams,
  pinnedVertices?: Uint32Array,
  bodyMesh?: BodyMesh
): Promise<SimulationContext> {
  const nv = cloth.mesh.numVertices;
  const posSize = nv * 3 * 4; // vec3 per vertex
  const pinned = pinnedVertices ?? new Uint32Array(nv);

  const positionA = createStorageBuffer(device, posSize, cloth.mesh.positions);
  const positionB = device.createBuffer({
    size: posSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  });
  device.queue.writeBuffer(positionB, 0, cloth.mesh.positions);

  const prevA = createStorageBuffer(device, posSize, cloth.mesh.positions);
  const prevB = device.createBuffer({
    size: posSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  });
  device.queue.writeBuffer(prevB, 0, cloth.mesh.positions);

  const pinnedBuffer = createStorageBuffer(device, nv * 4, pinned);
  const structuralBuffer = createStorageBuffer(device, cloth.constraints.structural.byteLength, cloth.constraints.structural);
  const shearBuffer = createStorageBuffer(device, cloth.constraints.shear.byteLength, cloth.constraints.shear);
  const bendBuffer = createStorageBuffer(device, cloth.constraints.bend.byteLength, cloth.constraints.bend);

  const paramsData = new ArrayBuffer(INTEGRATE_PARAMS_SIZE);
  const paramsView = new DataView(paramsData);
  paramsView.setFloat32(0, params.gravity[0], true);
  paramsView.setFloat32(4, params.gravity[1], true);
  paramsView.setFloat32(8, params.gravity[2], true);
  paramsView.setFloat32(12, params.dt, true);
  paramsView.setFloat32(16, params.damping, true);
  const paramsUniform = createUniformBuffer(device, INTEGRATE_PARAMS_SIZE, paramsData);

  const stiffData = new ArrayBuffer(CONSTRAINT_PARAMS_SIZE);
  new DataView(stiffData).setFloat32(0, params.stiffness, true);
  const constraintUniform = createUniformBuffer(device, CONSTRAINT_PARAMS_SIZE, stiffData);
  const bendStiffData = new ArrayBuffer(CONSTRAINT_PARAMS_SIZE);
  new DataView(bendStiffData).setFloat32(0, params.bendStiffness, true);
  const bendUniform = createUniformBuffer(device, CONSTRAINT_PARAMS_SIZE, bendStiffData);

  const integrateShader = device.createShaderModule({ code: integrateWgsl });
  const constraintShader = device.createShaderModule({ code: constraintsWgsl });
  const bendShader = device.createShaderModule({ code: constraintsBendWgsl });

  const [integratePipeline, constraintPipeline, bendPipeline] = await Promise.all([
    device.createComputePipelineAsync({
      layout: 'auto',
      compute: {
        module: integrateShader,
        entryPoint: 'main',
      },
    }),
    device.createComputePipelineAsync({
      layout: 'auto',
      compute: {
        module: constraintShader,
        entryPoint: 'main',
      },
    }),
    device.createComputePipelineAsync({
      layout: 'auto',
      compute: {
        module: bendShader,
        entryPoint: 'main',
      },
    }),
  ]);

  await initGroundCollision(device);

  // Initialize body collision if body mesh provided
  if (bodyMesh) {
    console.log('[Simulation] Initializing body collision');
    await initBodyCollision(device, bodyMesh, 64);
  }

  return {
    device,
    numVertices: nv,
    numStructural: cloth.constraints.numStructural,
    numShear: cloth.constraints.numShear,
    numBend: cloth.constraints.numBend,
    positionBuffers: [positionA, positionB],
    prevPositionBuffers: [prevA, prevB],
    pinnedBuffer,
    structuralBuffer,
    shearBuffer,
    bendBuffer,
    integratePipeline,
    constraintPipeline,
    bendPipeline,
    paramsUniform,
    constraintUniform,
    bendUniform,
    currentIndex: 0,
  };
}

/**
 * Run one simulation step: integrate then constraint iterations.
 */
export function stepSimulation(ctx: SimulationContext, params: SimulationParams): void {
  const readIdx = ctx.currentIndex;
  const writeIdx = 1 - readIdx;
  const posRead = ctx.positionBuffers[readIdx];
  const posWrite = ctx.positionBuffers[writeIdx];
  const prevRead = ctx.prevPositionBuffers[readIdx];
  const prevWrite = ctx.prevPositionBuffers[writeIdx];

  // Update params uniform
  const paramsData = new ArrayBuffer(INTEGRATE_PARAMS_SIZE);
  const pv = new DataView(paramsData);
  pv.setFloat32(0, params.gravity[0], true);
  pv.setFloat32(4, params.gravity[1], true);
  pv.setFloat32(8, params.gravity[2], true);
  pv.setFloat32(12, params.dt, true);
  pv.setFloat32(16, params.damping, true);
  ctx.device.queue.writeBuffer(ctx.paramsUniform, 0, paramsData);
  const stiffData = new ArrayBuffer(CONSTRAINT_PARAMS_SIZE);
  new DataView(stiffData).setFloat32(0, params.stiffness, true);
  ctx.device.queue.writeBuffer(ctx.constraintUniform, 0, stiffData);
  new DataView(stiffData).setFloat32(0, params.bendStiffness, true);
  ctx.device.queue.writeBuffer(ctx.bendUniform, 0, stiffData);

  const encoder = ctx.device.createCommandEncoder();
  const wgIntegrate = Math.ceil(ctx.numVertices / 64);
  const passIntegrate = encoder.beginComputePass();
  passIntegrate.setPipeline(ctx.integratePipeline);
  passIntegrate.setBindGroup(0, ctx.device.createBindGroup({
    layout: ctx.integratePipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: ctx.paramsUniform } },
      { binding: 1, resource: { buffer: posRead } },
      { binding: 2, resource: { buffer: prevRead } },
      { binding: 3, resource: { buffer: posWrite } },
      { binding: 4, resource: { buffer: prevWrite } },
      { binding: 5, resource: { buffer: ctx.pinnedBuffer } },
    ],
  }));
  passIntegrate.dispatchWorkgroups(wgIntegrate);
  passIntegrate.end();

  const passStruct = encoder.beginComputePass();
  passStruct.setPipeline(ctx.constraintPipeline);
  for (let iter = 0; iter < params.iterations; iter++) {
    passStruct.setBindGroup(0, ctx.device.createBindGroup({
      layout: ctx.constraintPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: ctx.constraintUniform } },
        { binding: 1, resource: { buffer: posWrite } },
        { binding: 2, resource: { buffer: ctx.structuralBuffer } },
        { binding: 3, resource: { buffer: ctx.pinnedBuffer } },
      ],
    }));
    passStruct.dispatchWorkgroups(Math.ceil(ctx.numStructural / 64));
  }
  passStruct.end();

  const passShear = encoder.beginComputePass();
  passShear.setPipeline(ctx.constraintPipeline);
  for (let iter = 0; iter < params.iterations; iter++) {
    passShear.setBindGroup(0, ctx.device.createBindGroup({
      layout: ctx.constraintPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: ctx.constraintUniform } },
        { binding: 1, resource: { buffer: posWrite } },
        { binding: 2, resource: { buffer: ctx.shearBuffer } },
        { binding: 3, resource: { buffer: ctx.pinnedBuffer } },
      ],
    }));
    passShear.dispatchWorkgroups(Math.ceil(ctx.numShear / 64));
  }
  passShear.end();

  const passBend = encoder.beginComputePass();
  passBend.setPipeline(ctx.bendPipeline);
  for (let iter = 0; iter < params.iterations; iter++) {
    passBend.setBindGroup(0, ctx.device.createBindGroup({
      layout: ctx.bendPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: ctx.bendUniform } },
        { binding: 1, resource: { buffer: posWrite } },
        { binding: 2, resource: { buffer: ctx.bendBuffer } },
        { binding: 3, resource: { buffer: ctx.pinnedBuffer } },
      ],
    }));
    passBend.dispatchWorkgroups(Math.ceil(ctx.numBend / 64));
  }
  passBend.end();

  ctx.device.queue.submit([encoder.finish()]);

  runGroundCollision(
    ctx.device,
    posWrite,
    prevWrite,
    ctx.pinnedBuffer,
    ctx.numVertices
  );

  // Run body collision if initialized
  if (isBodyCollisionInitialized()) {
    runBodyCollision(
      ctx.device,
      posWrite,
      prevWrite,
      ctx.pinnedBuffer,
      ctx.numVertices
    );
  }

  ctx.currentIndex = writeIdx;
}

/**
 * Return the GPU buffer containing current particle positions (vec3 per vertex).
 * Use for rendering or readback.
 */
export function getClothVertexBuffer(ctx: SimulationContext): GPUBuffer {
  return ctx.positionBuffers[ctx.currentIndex];
}

/**
 * Reset simulation to initial positions (e.g. after changing params or on Reset).
 */
export function resetSimulation(ctx: SimulationContext, initialPositions: Float32Array): void {
  ctx.device.queue.writeBuffer(ctx.positionBuffers[0], 0, initialPositions);
  ctx.device.queue.writeBuffer(ctx.positionBuffers[1], 0, initialPositions);
  ctx.device.queue.writeBuffer(ctx.prevPositionBuffers[0], 0, initialPositions);
  ctx.device.queue.writeBuffer(ctx.prevPositionBuffers[1], 0, initialPositions);
  ctx.currentIndex = 0;
}
