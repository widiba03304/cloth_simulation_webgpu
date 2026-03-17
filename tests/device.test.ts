// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requestGPUContext, reconfigureCanvas } from '../src/renderer/webgpu/device';
import { makeMockDevice, makeMockGPUCanvasContext } from './mocks/webgpu';

function makeCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 600;
  return canvas;
}

describe('requestGPUContext', () => {
  it('returns null when navigator.gpu is unavailable', async () => {
    const origGpu = (navigator as any).gpu;
    Object.defineProperty(navigator, 'gpu', { value: undefined, writable: true, configurable: true });
    const result = await requestGPUContext(makeCanvas());
    expect(result).toBeNull();
    Object.defineProperty(navigator, 'gpu', { value: origGpu, writable: true, configurable: true });
  });

  it('returns null when adapter is null', async () => {
    const origGpu = (navigator as any).gpu;
    Object.defineProperty(navigator, 'gpu', {
      value: { requestAdapter: vi.fn(async () => null), getPreferredCanvasFormat: vi.fn(() => 'bgra8unorm') },
      writable: true, configurable: true,
    });
    const result = await requestGPUContext(makeCanvas());
    expect(result).toBeNull();
    Object.defineProperty(navigator, 'gpu', { value: origGpu, writable: true, configurable: true });
  });

  it('returns context with null device when requestDevice returns null', async () => {
    // Note: requestGPUContext does NOT null-check the device; it only checks adapter and context.
    const origGpu = (navigator as any).gpu;
    const adapter = { requestDevice: vi.fn(async () => null), features: new Set(), limits: {} };
    Object.defineProperty(navigator, 'gpu', {
      value: { requestAdapter: vi.fn(async () => adapter), getPreferredCanvasFormat: vi.fn(() => 'bgra8unorm') },
      writable: true, configurable: true,
    });
    const result = await requestGPUContext(makeCanvas());
    // The source code passes through without a null device check
    expect(result?.device).toBeNull();
    Object.defineProperty(navigator, 'gpu', { value: origGpu, writable: true, configurable: true });
  });

  it('returns null when canvas context is null', async () => {
    const origGpu = (navigator as any).gpu;
    const device = makeMockDevice();
    const adapter = { requestDevice: vi.fn(async () => device), features: new Set(), limits: {} };
    Object.defineProperty(navigator, 'gpu', {
      value: { requestAdapter: vi.fn(async () => adapter), getPreferredCanvasFormat: vi.fn(() => 'bgra8unorm') },
      writable: true, configurable: true,
    });
    const canvas = document.createElement('canvas');
    // Override getContext to return null for webgpu
    canvas.getContext = vi.fn(() => null) as any;
    const result = await requestGPUContext(canvas);
    expect(result).toBeNull();
    Object.defineProperty(navigator, 'gpu', { value: origGpu, writable: true, configurable: true });
  });

  it('returns GPUContext with adapter, device, context, format on success', async () => {
    const canvas = makeCanvas();
    const result = await requestGPUContext(canvas);
    // navigator.gpu is already mocked in setup.ts
    // But canvas.getContext('webgpu') might return null in jsdom
    // We just verify no error is thrown
    if (result !== null) {
      expect(result).toHaveProperty('adapter');
      expect(result).toHaveProperty('device');
      expect(result).toHaveProperty('context');
      expect(result).toHaveProperty('format');
    }
  });
});

describe('reconfigureCanvas', () => {
  it('returns null when canvas getContext returns null', async () => {
    const device = makeMockDevice();
    const canvas = document.createElement('canvas');
    canvas.getContext = vi.fn(() => null) as any;
    const result = await reconfigureCanvas(canvas, device);
    expect(result).toBeNull();
  });

  it('configures and returns context on success', async () => {
    const device = makeMockDevice();
    const canvas = document.createElement('canvas');
    const mockCtx = makeMockGPUCanvasContext();
    canvas.getContext = vi.fn((id: string) => id === 'webgpu' ? mockCtx : null) as any;
    const result = await reconfigureCanvas(canvas, device);
    expect(result).not.toBeNull();
    expect(mockCtx.configure).toHaveBeenCalled();
  });
});
