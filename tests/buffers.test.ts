import { describe, it, expect, vi } from 'vitest';
import { createBuffer, createStorageBuffer, createUniformBuffer, copyBuffer } from '../src/renderer/webgpu/buffers';
import { makeMockDevice, makeMockCommandEncoder } from './mocks/webgpu';

describe('createBuffer', () => {
  it('calls device.createBuffer with given size and usage', () => {
    const device = makeMockDevice();
    createBuffer(device, 256, GPUBufferUsage.STORAGE);
    expect(device.createBuffer).toHaveBeenCalledWith(expect.objectContaining({ size: 256 }));
  });

  it('returns a GPUBuffer', () => {
    const device = makeMockDevice();
    const buf = createBuffer(device, 64, GPUBufferUsage.UNIFORM);
    expect(buf).toBeDefined();
    expect(buf.size).toBe(64);
  });

  it('writes initial data when provided', () => {
    const device = makeMockDevice();
    const data = new Float32Array([1, 2, 3, 4]);
    createBuffer(device, data.byteLength, GPUBufferUsage.STORAGE, data);
    // createBuffer passes data.buffer (underlying ArrayBuffer) to writeBuffer
    expect(device.queue.writeBuffer).toHaveBeenCalledWith(
      expect.anything(),
      0,
      data.buffer
    );
  });

  it('does not write data when none provided', () => {
    const device = makeMockDevice();
    createBuffer(device, 64, GPUBufferUsage.UNIFORM);
    expect(device.queue.writeBuffer).not.toHaveBeenCalled();
  });

  it('aligns size to 16 bytes minimum for storage buffer', () => {
    const device = makeMockDevice();
    createStorageBuffer(device, 4); // less than 16
    const call = (device.createBuffer as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.size).toBeGreaterThanOrEqual(16);
  });

  it('aligns size to 16 bytes minimum for uniform buffer', () => {
    const device = makeMockDevice();
    createUniformBuffer(device, 4);
    const call = (device.createBuffer as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.size).toBeGreaterThanOrEqual(16);
  });
});

describe('createStorageBuffer', () => {
  it('creates buffer with STORAGE usage flag', () => {
    const device = makeMockDevice();
    createStorageBuffer(device, 256);
    const call = (device.createBuffer as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.usage & GPUBufferUsage.STORAGE).toBeTruthy();
  });

  it('writes initial data when provided', () => {
    const device = makeMockDevice();
    const data = new Uint32Array([1, 2, 3, 4]);
    createStorageBuffer(device, data.byteLength, data);
    expect(device.queue.writeBuffer).toHaveBeenCalled();
  });
});

describe('createUniformBuffer', () => {
  it('creates buffer with UNIFORM usage flag', () => {
    const device = makeMockDevice();
    createUniformBuffer(device, 256);
    const call = (device.createBuffer as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.usage & GPUBufferUsage.UNIFORM).toBeTruthy();
  });

  it('accepts ArrayBuffer data', () => {
    const device = makeMockDevice();
    const data = new ArrayBuffer(32);
    createUniformBuffer(device, 32, data);
    expect(device.queue.writeBuffer).toHaveBeenCalled();
  });
});

describe('copyBuffer', () => {
  it('calls commandEncoder.copyBufferToBuffer', () => {
    const encoder = makeMockCommandEncoder();
    const src = makeMockDevice().createBuffer({ size: 64, usage: GPUBufferUsage.COPY_SRC });
    const dst = makeMockDevice().createBuffer({ size: 64, usage: GPUBufferUsage.COPY_DST });
    copyBuffer(encoder as unknown as GPUCommandEncoder, src, dst, 64);
    expect(encoder.copyBufferToBuffer).toHaveBeenCalledWith(src, 0, dst, 0, 64);
  });
});
