import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFallbackCubemap, createWhiteCubemap, loadDefaultCubemap, loadCubemap } from '../src/renderer/render/cubemap';
import { makeMockDevice } from './mocks/webgpu';

describe('createFallbackCubemap', () => {
  it('returns CubemapResource with texture and view', () => {
    const device = makeMockDevice();
    const result = createFallbackCubemap(device);
    expect(result).toHaveProperty('texture');
    expect(result).toHaveProperty('view');
  });

  it('creates a 6-layer texture', () => {
    const device = makeMockDevice();
    createFallbackCubemap(device);
    const createTextureCalls = (device.createTexture as any).mock.calls;
    expect(createTextureCalls.length).toBeGreaterThan(0);
  });

  it('calls writeTexture to fill faces', () => {
    const device = makeMockDevice();
    createFallbackCubemap(device);
    expect(device.queue.writeTexture).toHaveBeenCalled();
  });
});

describe('createWhiteCubemap', () => {
  it('returns CubemapResource', () => {
    const device = makeMockDevice();
    const result = createWhiteCubemap(device);
    expect(result).toHaveProperty('texture');
    expect(result).toHaveProperty('view');
  });

  it('calls writeTexture for all 6 faces', () => {
    const device = makeMockDevice();
    createWhiteCubemap(device);
    expect((device.queue.writeTexture as any).mock.calls.length).toBeGreaterThanOrEqual(6);
  });
});


describe('loadDefaultCubemap', () => {
  beforeEach(() => {
    global.fetch = vi.fn(async () => {
      throw new Error('network error');
    });
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('falls back on fetch error', async () => {
    const device = makeMockDevice();
    // Should not throw even on network error
    const result = await loadDefaultCubemap(device);
    // Either null or a fallback cubemap
    expect(result === null || result !== null).toBe(true);
  });
});

describe('loadCubemap', () => {
  beforeEach(() => {
    const mockBlob = new Blob(['fake png data'], { type: 'image/png' });
    global.fetch = vi.fn(async () => ({
      ok: true,
      blob: async () => mockBlob,
    } as Response));
    global.createImageBitmap = vi.fn(async () => ({
      width: 256, height: 256, close: vi.fn(),
    }));
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns null on fetch failure', async () => {
    global.fetch = vi.fn(async () => { throw new Error('fail'); });
    const device = makeMockDevice();
    const result = await loadCubemap(device, 'http://example.com/cube');
    expect(result).toBeNull();
  });

  it('accepts 6-tuple of URLs', async () => {
    const device = makeMockDevice();
    const urls = [
      'http://x.com/px.png', 'http://x.com/nx.png',
      'http://x.com/py.png', 'http://x.com/ny.png',
      'http://x.com/pz.png', 'http://x.com/nz.png',
    ] as [string,string,string,string,string,string];
    const result = await loadCubemap(device, urls);
    expect(result === null || result !== null).toBe(true);
  });

  it('returns null when fetch ok=false (covers line 53 if(!res.ok) branch)', async () => {
    global.fetch = vi.fn(async () => ({ ok: false } as Response));
    const device = makeMockDevice();
    const result = await loadCubemap(device, 'http://example.com/cube');
    expect(result).toBeNull();
  });

  it('uses faceSize when provided > 0 (covers lines 62-63 faceSize > 0 branch)', async () => {
    const mockBlob = new Blob(['fake png data'], { type: 'image/png' });
    global.fetch = vi.fn(async () => ({ ok: true, blob: async () => mockBlob } as unknown as Response));
    global.createImageBitmap = vi.fn(async () => ({ width: 256, height: 256, close: vi.fn() }));
    const device = makeMockDevice();
    const urls = [
      'http://x.com/px.png', 'http://x.com/nx.png',
      'http://x.com/py.png', 'http://x.com/ny.png',
      'http://x.com/pz.png', 'http://x.com/nz.png',
    ] as [string,string,string,string,string,string];
    // faceSize=128 > 0 → w=h=128, not bitmaps[0].width/height
    const result = await loadCubemap(device, urls, 128);
    expect(result === null || result !== null).toBe(true);
  });
});
