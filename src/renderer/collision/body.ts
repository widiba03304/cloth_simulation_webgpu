/**
 * Collision: ground plane and (later) body mesh/SDF.
 * Exposes initGroundCollision() and runGroundCollision().
 */

import collideWgsl from './collide.wgsl?raw';

const COLLIDE_PARAMS_SIZE = 16;

let collidePipeline: GPUComputePipeline | null = null;
let collideParamsBuffer: GPUBuffer | null = null;

export async function initGroundCollision(device: GPUDevice): Promise<void> {
  const module = device.createShaderModule({ code: collideWgsl });
  collidePipeline = await device.createComputePipelineAsync({
    layout: 'auto',
    compute: { module, entryPoint: 'main' },
  });
  const params = new ArrayBuffer(COLLIDE_PARAMS_SIZE);
  new DataView(params).setFloat32(0, 0, true); // groundY
  collideParamsBuffer = device.createBuffer({
    size: COLLIDE_PARAMS_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(collideParamsBuffer, 0, params);
}

/**
 * Run ground plane collision on the current position/prev buffers.
 * Call after constraint passes in the same step.
 */
export function runGroundCollision(
  device: GPUDevice,
  positionBuffer: GPUBuffer,
  prevBuffer: GPUBuffer,
  pinnedBuffer: GPUBuffer,
  numVertices: number
): void {
  if (!collidePipeline || !collideParamsBuffer) return;
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(collidePipeline);
  pass.setBindGroup(
    0,
    device.createBindGroup({
      layout: collidePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: collideParamsBuffer } },
        { binding: 1, resource: { buffer: positionBuffer } },
        { binding: 2, resource: { buffer: prevBuffer } },
        { binding: 3, resource: { buffer: pinnedBuffer } },
      ],
    })
  );
  pass.dispatchWorkgroups(Math.ceil(numVertices / 64));
  pass.end();
  device.queue.submit([encoder.finish()]);
}
