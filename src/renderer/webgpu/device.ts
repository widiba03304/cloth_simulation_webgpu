/**
 * WebGPU device acquisition and lost handling.
 * No business logic; only adapter/device creation and lifecycle.
 */

export interface GPUContext {
  adapter: GPUAdapter;
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
}

const defaultFormat = 'bgra8unorm';

/**
 * Request WebGPU adapter and device. Returns null if unavailable.
 */
export async function requestGPUContext(canvas: HTMLCanvasElement): Promise<GPUContext | null> {
  if (!navigator.gpu) {
    return null;
  }
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) return null;
  const device = await adapter.requestDevice();
  const context = canvas.getContext('webgpu');
  if (!context) return null;
  context.configure({
    device,
    format: defaultFormat,
    alphaMode: 'opaque',
  });
  return { adapter, device, context, format: defaultFormat };
}

/**
 * Re-initialize canvas context after device lost. Call from app when device.lost resolves.
 */
export async function reconfigureCanvas(
  canvas: HTMLCanvasElement,
  device: GPUDevice
): Promise<GPUCanvasContext | null> {
  const context = canvas.getContext('webgpu');
  if (!context) return null;
  context.configure({
    device,
    format: defaultFormat,
    alphaMode: 'opaque',
  });
  return context;
}
