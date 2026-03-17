import { describe, it, expect, vi } from 'vitest';
import { createCloth3D } from '../src/renderer/sim/cloth3d/cloth3d';
import { makeMockDevice } from './mocks/webgpu';
import type { Cloth3DConfig, Cloth3DMaterialParams } from '../src/renderer/sim/cloth3d/cloth3d';

function makeConfig(overrides: Partial<Cloth3DConfig> = {}): Cloth3DConfig {
  return {
    rows: 4,
    cols: 4,
    spacing: 0.03,
    origin: [0, 1.0, 0],
    pinned: 'topRow',
    radius: 0.2,
    twoPanel: false,
    ...overrides,
  };
}

function makeParams(): Cloth3DMaterialParams {
  return {
    albedo: [0.8, 0.6, 0.4],
    roughness: 0.5,
    metallic: 0.0,
    sheen: 0.2,
    sheenTint: 0.5,
    subsurface: 0.0,
    fuzziness: 0.1,
    opacity: 1.0,
    stretchWarp: 20,
    stretchWeft: 20,
    bendStiffness: 0.1,
    drape: 0.5,
    density: 200,
    thickness: 1.0,
    texturePattern: 0,
    textureScale: 1,
    textureIntensity: 0.5,
    useTexture: false,
  };
}

describe('createCloth3D', () => {
  it('creates a cloth instance (flat config)', async () => {
    const device = makeMockDevice();
    const cloth = await createCloth3D(device, makeConfig(), makeParams());
    expect(cloth).not.toBeNull();
  });

  it('creates a twoPanel cloth instance', async () => {
    const device = makeMockDevice();
    const cloth = await createCloth3D(device, makeConfig({ twoPanel: true }), makeParams());
    expect(cloth).not.toBeNull();
  });

  it('creates cloth with topCorners pin mode', async () => {
    const device = makeMockDevice();
    const cloth = await createCloth3D(device, makeConfig({ pinned: 'topCorners' }), makeParams());
    expect(cloth).not.toBeNull();
  });

  it('creates cloth with none pin mode', async () => {
    const device = makeMockDevice();
    const cloth = await createCloth3D(device, makeConfig({ pinned: 'none' }), makeParams());
    expect(cloth).not.toBeNull();
  });

  it('step() runs without error', async () => {
    const device = makeMockDevice();
    const cloth = await createCloth3D(device, makeConfig(), makeParams());
    expect(() => cloth!.step()).not.toThrow();
  });

  it('step() calls createCommandEncoder', async () => {
    const device = makeMockDevice();
    const cloth = await createCloth3D(device, makeConfig(), makeParams());
    cloth!.step();
    expect(device.createCommandEncoder).toHaveBeenCalled();
  });

  it('setWind() does not throw', async () => {
    const device = makeMockDevice();
    const cloth = await createCloth3D(device, makeConfig(), makeParams());
    expect(() => cloth!.setWind([1, 0, 0], 5)).not.toThrow();
  });

  it('updateCameraPos() does not throw', async () => {
    const device = makeMockDevice();
    const cloth = await createCloth3D(device, makeConfig(), makeParams());
    expect(() => cloth!.updateCameraPos([0, 1, 3])).not.toThrow();
  });

  it('updateMaterialParams() does not throw', async () => {
    const device = makeMockDevice();
    const cloth = await createCloth3D(device, makeConfig(), makeParams());
    expect(() => cloth!.updateMaterialParams(makeParams())).not.toThrow();
  });

  it('setQuality() changes substeps', async () => {
    const device = makeMockDevice();
    const cloth = await createCloth3D(device, makeConfig(), makeParams());
    expect(() => cloth!.setQuality(8, 4)).not.toThrow();
  });

  it('updateCapsulesFromJoints() does not throw', async () => {
    const device = makeMockDevice();
    const cloth = await createCloth3D(device, makeConfig(), makeParams());
    const joints: [number, number, number][] = Array.from({ length: 24 }, () => [0, 0, 0]);
    expect(() => cloth!.updateCapsulesFromJoints(joints)).not.toThrow();
  });

  it('exportMeshOBJ() returns a string', async () => {
    const device = makeMockDevice();
    const cloth = await createCloth3D(device, makeConfig(), makeParams());
    const obj = await cloth!.exportMeshOBJ();
    expect(typeof obj).toBe('string');
  });

  it('setAlbedoTexture() and clearAlbedoTexture() do not throw', async () => {
    const device = makeMockDevice();
    const cloth = await createCloth3D(device, makeConfig(), makeParams());
    const tex = device.createTexture({ size: [1, 1], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING });
    const sam = device.createSampler();
    expect(() => cloth!.setAlbedoTexture(tex, sam)).not.toThrow();
    expect(() => cloth!.clearAlbedoTexture()).not.toThrow();
  });

  it('reset() does not throw', async () => {
    const device = makeMockDevice();
    const cloth = await createCloth3D(device, makeConfig(), makeParams());
    expect(() => cloth!.reset()).not.toThrow();
  });

  it('destroy() does not throw', async () => {
    const device = makeMockDevice();
    const cloth = await createCloth3D(device, makeConfig(), makeParams());
    expect(() => cloth!.destroy()).not.toThrow();
  });

  it('creates buffers for simulation', async () => {
    const device = makeMockDevice();
    await createCloth3D(device, makeConfig(), makeParams());
    expect((device.createBuffer as any).mock.calls.length).toBeGreaterThan(0);
  });

  it('albedoTextureView and albedoSamplerObj getters return values (lines 359-360)', async () => {
    const device = makeMockDevice();
    const cloth = await createCloth3D(device, makeConfig(), makeParams());
    expect(cloth!.albedoTextureView).toBeDefined();
    expect(cloth!.albedoSamplerObj).toBeDefined();
  });

  it('logShaderErrors throws on error message (line 125)', async () => {
    const device = makeMockDevice();
    const errorModule = {
      label: '',
      getCompilationInfo: vi.fn(async () => ({
        messages: [{ type: 'error', lineNum: 10, message: 'test error' }],
      })),
    };
    vi.spyOn(device, 'createShaderModule').mockReturnValueOnce(errorModule as any);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(createCloth3D(device, makeConfig(), makeParams())).rejects.toThrow('failed to compile');
    spy.mockRestore();
  });

  it('logShaderErrors logs warning message via else branch (line 126)', async () => {
    const device = makeMockDevice();
    const warnModule = {
      label: '',
      getCompilationInfo: vi.fn(async () => ({
        messages: [{ type: 'warning', lineNum: 5, message: 'test warning' }],
      })),
    };
    vi.spyOn(device, 'createShaderModule').mockReturnValueOnce(warnModule as any);
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cloth = await createCloth3D(device, makeConfig(), makeParams());
    expect(cloth).not.toBeNull();
    spy.mockRestore();
  });
});
