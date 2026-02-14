/**
 * WebGPU Skinning Tests - Browser Mode
 * These tests run in a real browser with WebGPU support via Playwright
 *
 * Run with: npm run test:gpu
 */

import { describe, it, expect, beforeAll } from 'vitest';

type Vec3 = [number, number, number];

describe('GPU Skinning - Browser', () => {
  let device: GPUDevice;
  let adapter: GPUAdapter;

  beforeAll(async () => {
    // Check WebGPU support
    if (!navigator.gpu) {
      throw new Error('WebGPU not supported in this browser');
    }

    // Request adapter
    adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error('No WebGPU adapter available');
    }

    // Request device
    device = await adapter.requestDevice();
    if (!device) {
      throw new Error('Failed to get WebGPU device');
    }
  });

  // Helper: Create buffer with data
  function createBufferWithData(device: GPUDevice, data: Float32Array | Uint32Array, usage: GPUBufferUsageFlags): GPUBuffer {
    const buffer = device.createBuffer({
      size: data.byteLength,
      usage: usage | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true
    });

    if (data instanceof Float32Array) {
      new Float32Array(buffer.getMappedRange()).set(data);
    } else {
      new Uint32Array(buffer.getMappedRange()).set(data);
    }

    buffer.unmap();
    return buffer;
  }

  // Helper: Read buffer data
  async function readBuffer(device: GPUDevice, buffer: GPUBuffer, size: number): Promise<Float32Array> {
    const readBuffer = device.createBuffer({
      size,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
    });

    const encoder = device.createCommandEncoder();
    encoder.copyBufferToBuffer(buffer, 0, readBuffer, 0, size);
    device.queue.submit([encoder.finish()]);

    await readBuffer.mapAsync(GPUMapMode.READ);
    const result = new Float32Array(readBuffer.getMappedRange()).slice();
    readBuffer.unmap();
    readBuffer.destroy();

    return result;
  }

  describe('Basic Skinning Shader', () => {
    it('should apply identity transform correctly', async () => {
      const vertexCount = 3;
      const vertices = new Float32Array([
        0, 0, 0,
        1, 0, 0,
        0, 1, 0
      ]);

      // Identity transform (4x4 matrix in column-major)
      const transforms = new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
      ]);

      const weights = new Float32Array([
        1, 0, 0, 0,
        1, 0, 0, 0,
        1, 0, 0, 0
      ]);

      const indices = new Uint32Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

      // Create buffers
      const vertexBuffer = createBufferWithData(device, vertices, GPUBufferUsage.STORAGE);
      const transformBuffer = createBufferWithData(device, transforms, GPUBufferUsage.STORAGE);
      const weightBuffer = createBufferWithData(device, weights, GPUBufferUsage.STORAGE);
      const indexBuffer = createBufferWithData(device, indices, GPUBufferUsage.STORAGE);
      const outputBuffer = device.createBuffer({
        size: vertices.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
      });

      // Create shader
      const shaderCode = `
        @group(0) @binding(0) var<storage, read> vertices: array<f32>;
        @group(0) @binding(1) var<storage, read> transforms: array<mat4x4<f32>>;
        @group(0) @binding(2) var<storage, read> weights: array<vec4<f32>>;
        @group(0) @binding(3) var<storage, read> indices: array<vec4<u32>>;
        @group(0) @binding(4) var<storage, read_write> output: array<f32>;

        @compute @workgroup_size(64)
        fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
          let idx = global_id.x;
          if (idx >= ${vertexCount}u) {
            return;
          }

          let v = vec3<f32>(vertices[idx * 3u], vertices[idx * 3u + 1u], vertices[idx * 3u + 2u]);
          let w = weights[idx];
          let i = indices[idx];

          var pos = vec3<f32>(0.0);
          pos += (transforms[i.x] * vec4<f32>(v, 1.0)).xyz * w.x;

          output[idx * 3u] = pos.x;
          output[idx * 3u + 1u] = pos.y;
          output[idx * 3u + 2u] = pos.z;
        }
      `;

      const shaderModule = device.createShaderModule({ code: shaderCode });
      const pipeline = device.createComputePipeline({
        layout: 'auto',
        compute: {
          module: shaderModule,
          entryPoint: 'main'
        }
      });

      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: vertexBuffer } },
          { binding: 1, resource: { buffer: transformBuffer } },
          { binding: 2, resource: { buffer: weightBuffer } },
          { binding: 3, resource: { buffer: indexBuffer } },
          { binding: 4, resource: { buffer: outputBuffer } }
        ]
      });

      // Execute
      const commandEncoder = device.createCommandEncoder();
      const passEncoder = commandEncoder.beginComputePass();
      passEncoder.setPipeline(pipeline);
      passEncoder.setBindGroup(0, bindGroup);
      passEncoder.dispatchWorkgroups(Math.ceil(vertexCount / 64));
      passEncoder.end();
      device.queue.submit([commandEncoder.finish()]);

      // Read results
      const result = await readBuffer(device, outputBuffer, vertices.byteLength);

      // Verify
      for (let i = 0; i < vertexCount; i++) {
        expect(result[i * 3]).toBeCloseTo(vertices[i * 3], 3);
        expect(result[i * 3 + 1]).toBeCloseTo(vertices[i * 3 + 1], 3);
        expect(result[i * 3 + 2]).toBeCloseTo(vertices[i * 3 + 2], 3);
      }

      // Cleanup
      vertexBuffer.destroy();
      transformBuffer.destroy();
      weightBuffer.destroy();
      indexBuffer.destroy();
      outputBuffer.destroy();
    });

    it('should apply translation correctly', async () => {
      const vertexCount = 1;
      const vertices = new Float32Array([1, 2, 3]);

      // Translation matrix: translate by (5, 6, 7)
      const transforms = new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        5, 6, 7, 1
      ]);

      const weights = new Float32Array([1, 0, 0, 0]);
      const indices = new Uint32Array([0, 0, 0, 0]);

      // Create buffers
      const vertexBuffer = createBufferWithData(device, vertices, GPUBufferUsage.STORAGE);
      const transformBuffer = createBufferWithData(device, transforms, GPUBufferUsage.STORAGE);
      const weightBuffer = createBufferWithData(device, weights, GPUBufferUsage.STORAGE);
      const indexBuffer = createBufferWithData(device, indices, GPUBufferUsage.STORAGE);
      const outputBuffer = device.createBuffer({
        size: vertices.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
      });

      const shaderCode = `
        @group(0) @binding(0) var<storage, read> vertices: array<f32>;
        @group(0) @binding(1) var<storage, read> transforms: array<mat4x4<f32>>;
        @group(0) @binding(2) var<storage, read> weights: array<vec4<f32>>;
        @group(0) @binding(3) var<storage, read> indices: array<vec4<u32>>;
        @group(0) @binding(4) var<storage, read_write> output: array<f32>;

        @compute @workgroup_size(64)
        fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
          let idx = global_id.x;
          if (idx >= ${vertexCount}u) {
            return;
          }

          let v = vec3<f32>(vertices[idx * 3u], vertices[idx * 3u + 1u], vertices[idx * 3u + 2u]);
          let w = weights[idx];
          let i = indices[idx];

          var pos = vec3<f32>(0.0);
          pos += (transforms[i.x] * vec4<f32>(v, 1.0)).xyz * w.x;

          output[idx * 3u] = pos.x;
          output[idx * 3u + 1u] = pos.y;
          output[idx * 3u + 2u] = pos.z;
        }
      `;

      const shaderModule = device.createShaderModule({ code: shaderCode });
      const pipeline = device.createComputePipeline({
        layout: 'auto',
        compute: { module: shaderModule, entryPoint: 'main' }
      });

      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: vertexBuffer } },
          { binding: 1, resource: { buffer: transformBuffer } },
          { binding: 2, resource: { buffer: weightBuffer } },
          { binding: 3, resource: { buffer: indexBuffer } },
          { binding: 4, resource: { buffer: outputBuffer } }
        ]
      });

      const commandEncoder = device.createCommandEncoder();
      const passEncoder = commandEncoder.beginComputePass();
      passEncoder.setPipeline(pipeline);
      passEncoder.setBindGroup(0, bindGroup);
      passEncoder.dispatchWorkgroups(Math.ceil(vertexCount / 64));
      passEncoder.end();
      device.queue.submit([commandEncoder.finish()]);

      const result = await readBuffer(device, outputBuffer, vertices.byteLength);

      // Expected: (1+5, 2+6, 3+7) = (6, 8, 10)
      expect(result[0]).toBeCloseTo(6, 3);
      expect(result[1]).toBeCloseTo(8, 3);
      expect(result[2]).toBeCloseTo(10, 3);

      // Cleanup
      vertexBuffer.destroy();
      transformBuffer.destroy();
      weightBuffer.destroy();
      indexBuffer.destroy();
      outputBuffer.destroy();
    });

    it('should apply rotation correctly', async () => {
      const vertexCount = 1;
      const vertices = new Float32Array([1, 0, 0]);

      // 90-degree rotation around Z-axis
      const angle = Math.PI / 2;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const transforms = new Float32Array([
        c, s, 0, 0,
        -s, c, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
      ]);

      const weights = new Float32Array([1, 0, 0, 0]);
      const indices = new Uint32Array([0, 0, 0, 0]);

      const vertexBuffer = createBufferWithData(device, vertices, GPUBufferUsage.STORAGE);
      const transformBuffer = createBufferWithData(device, transforms, GPUBufferUsage.STORAGE);
      const weightBuffer = createBufferWithData(device, weights, GPUBufferUsage.STORAGE);
      const indexBuffer = createBufferWithData(device, indices, GPUBufferUsage.STORAGE);
      const outputBuffer = device.createBuffer({
        size: vertices.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
      });

      const shaderCode = `
        @group(0) @binding(0) var<storage, read> vertices: array<f32>;
        @group(0) @binding(1) var<storage, read> transforms: array<mat4x4<f32>>;
        @group(0) @binding(2) var<storage, read> weights: array<vec4<f32>>;
        @group(0) @binding(3) var<storage, read> indices: array<vec4<u32>>;
        @group(0) @binding(4) var<storage, read_write> output: array<f32>;

        @compute @workgroup_size(64)
        fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
          let idx = global_id.x;
          if (idx >= ${vertexCount}u) {
            return;
          }

          let v = vec3<f32>(vertices[idx * 3u], vertices[idx * 3u + 1u], vertices[idx * 3u + 2u]);
          let w = weights[idx];
          let i = indices[idx];

          var pos = vec3<f32>(0.0);
          pos += (transforms[i.x] * vec4<f32>(v, 1.0)).xyz * w.x;

          output[idx * 3u] = pos.x;
          output[idx * 3u + 1u] = pos.y;
          output[idx * 3u + 2u] = pos.z;
        }
      `;

      const shaderModule = device.createShaderModule({ code: shaderCode });
      const pipeline = device.createComputePipeline({
        layout: 'auto',
        compute: { module: shaderModule, entryPoint: 'main' }
      });

      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: vertexBuffer } },
          { binding: 1, resource: { buffer: transformBuffer } },
          { binding: 2, resource: { buffer: weightBuffer } },
          { binding: 3, resource: { buffer: indexBuffer } },
          { binding: 4, resource: { buffer: outputBuffer } }
        ]
      });

      const commandEncoder = device.createCommandEncoder();
      const passEncoder = commandEncoder.beginComputePass();
      passEncoder.setPipeline(pipeline);
      passEncoder.setBindGroup(0, bindGroup);
      passEncoder.dispatchWorkgroups(Math.ceil(vertexCount / 64));
      passEncoder.end();
      device.queue.submit([commandEncoder.finish()]);

      const result = await readBuffer(device, outputBuffer, vertices.byteLength);

      // Expected: (1,0,0) rotated 90° around Z = (0,1,0)
      expect(result[0]).toBeCloseTo(0, 2);
      expect(result[1]).toBeCloseTo(1, 2);
      expect(result[2]).toBeCloseTo(0, 2);

      // Cleanup
      vertexBuffer.destroy();
      transformBuffer.destroy();
      weightBuffer.destroy();
      indexBuffer.destroy();
      outputBuffer.destroy();
    });
  });
});
