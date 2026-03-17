// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRenderPipeline, updateBodyMesh, drawMainPass, drawBody, drawCloth3D, updateCubemap, setBackgroundGrid } from '../src/renderer/render/pipeline';
import { makeMockDevice, makeMockGPUCanvasContext, makeMockTexture } from './mocks/webgpu';

function makeCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 600;
  return canvas;
}

function makeBodyMesh() {
  return {
    positions: new Float32Array([0,0,0, 1,0,0, 0,1,0, 1,1,0]),
    indices: new Uint32Array([0,1,2, 1,3,2]),
    normals: new Float32Array(12),
  };
}

async function makeRenderContext() {
  const device = makeMockDevice();
  const ctx = makeMockGPUCanvasContext();
  // Make getCurrentTexture return a texture with createView
  const tex = makeMockTexture();
  ctx.getCurrentTexture = vi.fn(() => tex);
  const fmt = 'bgra8unorm' as GPUTextureFormat;
  return await createRenderPipeline(device, ctx as unknown as GPUCanvasContext, fmt, makeBodyMesh() as any);
}

describe('createRenderPipeline', () => {
  it('creates render context without error', async () => {
    const ctx = await makeRenderContext();
    expect(ctx).not.toBeNull();
  });

  it('creates render context without body mesh', async () => {
    const device = makeMockDevice();
    const ctx = makeMockGPUCanvasContext();
    const fmt = 'bgra8unorm' as GPUTextureFormat;
    const rctx = await createRenderPipeline(device, ctx as unknown as GPUCanvasContext, fmt, null);
    expect(rctx).not.toBeNull();
  });

  it('creates multiple render pipelines', async () => {
    const device = makeMockDevice();
    const ctx = makeMockGPUCanvasContext();
    await createRenderPipeline(device, ctx as unknown as GPUCanvasContext, 'bgra8unorm', null);
    expect((device.createRenderPipeline as any).mock.calls.length).toBeGreaterThan(0);
  });

  it('creates shader modules for body and cloth', async () => {
    const device = makeMockDevice();
    const ctx = makeMockGPUCanvasContext();
    await createRenderPipeline(device, ctx as unknown as GPUCanvasContext, 'bgra8unorm', null);
    expect((device.createShaderModule as any).mock.calls.length).toBeGreaterThan(0);
  });
});

describe('updateBodyMesh', () => {
  it('writes to body buffers', async () => {
    const rctx = await makeRenderContext();
    const device = (rctx as any).device;
    updateBodyMesh(rctx!, makeBodyMesh() as any);
    expect(device.queue.writeBuffer).toHaveBeenCalled();
  });
});

describe('drawMainPass', () => {
  it('runs without error', async () => {
    const rctx = await makeRenderContext();
    const vp = new Float32Array(16);
    expect(() => drawMainPass(rctx!, vp)).not.toThrow();
  });

  it('runs with camera eye position', async () => {
    const rctx = await makeRenderContext();
    const vp = new Float32Array(16);
    expect(() => drawMainPass(rctx!, vp, [0, 1, 3])).not.toThrow();
  });

  it('creates command encoder per call', async () => {
    const rctx = await makeRenderContext();
    const device = (rctx as any).device;
    const vp = new Float32Array(16);
    drawMainPass(rctx!, vp);
    expect(device.createCommandEncoder).toHaveBeenCalled();
  });
});

describe('drawBody', () => {
  it('runs without error', async () => {
    const rctx = await makeRenderContext();
    const vp = new Float32Array(16);
    expect(() => drawBody(rctx!, vp)).not.toThrow();
  });
});

describe('drawCloth3D', () => {
  it('runs without error with minimal cloth data', async () => {
    const rctx = await makeRenderContext();
    const device = (rctx as any).device;
    const cloth3DData = {
      vertexBuffer: device.createBuffer({ size: 256, usage: GPUBufferUsage.VERTEX }),
      normalBuffer: device.createBuffer({ size: 256, usage: GPUBufferUsage.VERTEX }),
      indexBuffer: device.createBuffer({ size: 256, usage: GPUBufferUsage.INDEX }),
      indexCount: 6,
      albedoTexture: makeMockTexture(),
      albedoSampler: device.createSampler(),
      albedoView: makeMockTexture().createView(),
      useTexture: false,
    };
    expect(() => drawCloth3D(rctx!, cloth3DData as any)).not.toThrow();
  });
});

describe('updateCubemap', () => {
  it('runs without error', async () => {
    const rctx = await makeRenderContext();
    global.fetch = vi.fn(async () => { throw new Error('no fetch'); });
    await expect(updateCubemap(rctx!, 'studio_1')).resolves.not.toThrow();
  });
});

describe('setBackgroundGrid', () => {
  it('sets grid mode', async () => {
    const rctx = await makeRenderContext();
    expect(() => setBackgroundGrid(rctx!)).not.toThrow();
  });
});
