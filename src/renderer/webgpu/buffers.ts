/**
 * WebGPU buffer and pipeline helpers.
 * Small abstraction for storage/uniform buffers and bind group creation.
 */

/**
 * Create a GPUBuffer with the given usage and size; optionally initialize from data.
 */
export function createBuffer(
  device: GPUDevice,
  size: number,
  usage: GPUBufferUsageFlags,
  data?: ArrayBuffer | ArrayBufferView
): GPUBuffer {
  const buffer = device.createBuffer({ size, usage });
  if (data) {
    const bytes = data instanceof ArrayBuffer ? data : data.buffer;
    device.queue.writeBuffer(buffer, 0, bytes);
  }
  return buffer;
}

/**
 * Create a storage buffer (read-only or read-write). Size aligned to 16 bytes for WGSL.
 */
export function createStorageBuffer(
  device: GPUDevice,
  size: number,
  data?: ArrayBuffer | ArrayBufferView
): GPUBuffer {
  const aligned = Math.ceil(size / 16) * 16;
  return createBuffer(
    device,
    aligned,
    GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    data
  );
}

/**
 * Create a uniform buffer. Max 256 bytes typically; align to 16.
 */
export function createUniformBuffer(
  device: GPUDevice,
  size: number,
  data?: ArrayBuffer | ArrayBufferView
): GPUBuffer {
  const aligned = Math.ceil(size / 16) * 16;
  return createBuffer(
    device,
    aligned,
    GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    data
  );
}

/**
 * Copy from one buffer to another (same size). For ping-pong or readback staging.
 */
export function copyBuffer(
  encoder: GPUCommandEncoder,
  src: GPUBuffer,
  dst: GPUBuffer,
  size: number
): void {
  encoder.copyBufferToBuffer(src, 0, dst, 0, size);
}
