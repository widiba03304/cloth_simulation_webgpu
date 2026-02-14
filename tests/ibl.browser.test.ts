/**
 * WebGPU IBL (Image-Based Lighting) Tests - Browser Mode
 * Tests cubemap creation, PBR buffers, and bind groups with actual WebGPU
 *
 * Run with: npm run test:gpu
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createFallbackCubemap } from '../src/renderer/render/cubemap';

describe('IBL - WebGPU Browser', () => {
  let device: GPUDevice;
  let adapter: GPUAdapter;

  beforeAll(async () => {
    if (!navigator.gpu) {
      throw new Error('WebGPU not supported in this browser');
    }

    adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error('No WebGPU adapter available');
    }

    device = await adapter.requestDevice();
    if (!device) {
      throw new Error('Failed to get WebGPU device');
    }
  });

  describe('Fallback Cubemap Creation', () => {
    it('should create a valid fallback cubemap texture', () => {
      const cubemap = createFallbackCubemap(device);

      expect(cubemap).toBeDefined();
      expect(cubemap.texture).toBeDefined();
      expect(cubemap.view).toBeDefined();
    });

    it('should create texture with correct dimensions', () => {
      const cubemap = createFallbackCubemap(device);

      expect(cubemap.texture.width).toBe(16);
      expect(cubemap.texture.height).toBe(16);
      expect(cubemap.texture.depthOrArrayLayers).toBe(6); // 6 faces
    });

    it('should create texture with correct format', () => {
      const cubemap = createFallbackCubemap(device);

      expect(cubemap.texture.format).toBe('rgba8unorm');
    });

    it('should create texture with correct usage flags', () => {
      const cubemap = createFallbackCubemap(device);

      // TEXTURE_BINDING allows sampling in shaders
      expect(cubemap.texture.usage & GPUTextureUsage.TEXTURE_BINDING).toBeTruthy();
    });

    it('should create cube texture view', () => {
      const cubemap = createFallbackCubemap(device);

      expect(cubemap.view.dimension).toBe('cube');
    });

    it('should be able to destroy cubemap without errors', () => {
      const cubemap = createFallbackCubemap(device);

      expect(() => cubemap.texture.destroy()).not.toThrow();
    });
  });

  describe('PBR Parameters Buffer', () => {
    it('should create valid PBR parameters buffer', () => {
      const pbrParamsBuffer = device.createBuffer({
        size: 16, // 4 floats
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

      expect(pbrParamsBuffer).toBeDefined();
      expect(pbrParamsBuffer.size).toBe(16);
    });

    it('should write PBR parameters to buffer', () => {
      const pbrParamsBuffer = device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

      const pbrParams = new Float32Array([0.5, 0.1, 0.3, 0.1]);
      device.queue.writeBuffer(pbrParamsBuffer, 0, pbrParams);

      // If this doesn't throw, the write was successful
      expect(pbrParamsBuffer).toBeDefined();
    });

    it('should update PBR parameters multiple times', () => {
      const pbrParamsBuffer = device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

      // First update
      const pbrParams1 = new Float32Array([0.5, 0.1, 0.3, 0.1]);
      device.queue.writeBuffer(pbrParamsBuffer, 0, pbrParams1);

      // Second update
      const pbrParams2 = new Float32Array([0.7, 0.8, 0.2, 0.5]);
      device.queue.writeBuffer(pbrParamsBuffer, 0, pbrParams2);

      expect(pbrParamsBuffer).toBeDefined();
    });
  });

  describe('Cubemap Sampler', () => {
    it('should create cubemap sampler with linear filtering', () => {
      const sampler = device.createSampler({
        minFilter: 'linear',
        magFilter: 'linear',
      });

      expect(sampler).toBeDefined();
    });

    it('should create sampler with different addressing modes', () => {
      const sampler = device.createSampler({
        minFilter: 'linear',
        magFilter: 'linear',
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
        addressModeW: 'clamp-to-edge',
      });

      expect(sampler).toBeDefined();
    });
  });

  describe('Bind Group 3 - Combined Cubemap and PBR', () => {
    it('should create bind group with all three bindings', () => {
      const cubemap = createFallbackCubemap(device);
      const sampler = device.createSampler({
        minFilter: 'linear',
        magFilter: 'linear',
      });
      const pbrParamsBuffer = device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

      // Create a minimal shader to get the bind group layout
      const shaderCode = `
        @group(3) @binding(0) var envCubemap: texture_cube<f32>;
        @group(3) @binding(1) var envSampler: sampler;

        struct PBRParams {
          roughness: f32,
          metallic: f32,
          ambientStrength: f32,
          reflectionStrength: f32,
        }
        @group(3) @binding(2) var<uniform> pbr: PBRParams;

        @fragment
        fn main() -> @location(0) vec4f {
          return vec4f(0.0, 0.0, 0.0, 1.0);
        }
      `;

      const shaderModule = device.createShaderModule({ code: shaderCode });
      const pipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: {
          module: shaderModule,
          entryPoint: 'main',
          buffers: [],
        },
        fragment: {
          module: shaderModule,
          entryPoint: 'main',
          targets: [{ format: 'bgra8unorm' }],
        },
        primitive: { topology: 'triangle-list' },
      });

      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(3),
        entries: [
          { binding: 0, resource: cubemap.view },
          { binding: 1, resource: sampler },
          { binding: 2, resource: { buffer: pbrParamsBuffer } },
        ],
      });

      expect(bindGroup).toBeDefined();

      // Cleanup
      cubemap.texture.destroy();
      pbrParamsBuffer.destroy();
    });

    it('should fail if missing binding 0 (cubemap texture)', () => {
      const cubemap = createFallbackCubemap(device);
      const sampler = device.createSampler({ minFilter: 'linear', magFilter: 'linear' });
      const pbrParamsBuffer = device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

      const shaderCode = `
        @group(3) @binding(0) var envCubemap: texture_cube<f32>;
        @group(3) @binding(1) var envSampler: sampler;

        struct PBRParams {
          roughness: f32,
          metallic: f32,
          ambientStrength: f32,
          reflectionStrength: f32,
        }
        @group(3) @binding(2) var<uniform> pbr: PBRParams;

        @fragment
        fn main() -> @location(0) vec4f {
          return vec4f(0.0, 0.0, 0.0, 1.0);
        }
      `;

      const shaderModule = device.createShaderModule({ code: shaderCode });
      const pipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: {
          module: shaderModule,
          entryPoint: 'main',
          buffers: [],
        },
        fragment: {
          module: shaderModule,
          entryPoint: 'main',
          targets: [{ format: 'bgra8unorm' }],
        },
        primitive: { topology: 'triangle-list' },
      });

      // Try to create bind group without binding 0
      expect(() => {
        device.createBindGroup({
          layout: pipeline.getBindGroupLayout(3),
          entries: [
            // Missing binding 0!
            { binding: 1, resource: sampler },
            { binding: 2, resource: { buffer: pbrParamsBuffer } },
          ],
        });
      }).toThrow();

      // Cleanup
      cubemap.texture.destroy();
      pbrParamsBuffer.destroy();
    });

    it('should fail if missing binding 2 (PBR buffer)', () => {
      const cubemap = createFallbackCubemap(device);
      const sampler = device.createSampler({ minFilter: 'linear', magFilter: 'linear' });
      const pbrParamsBuffer = device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

      const shaderCode = `
        @group(3) @binding(0) var envCubemap: texture_cube<f32>;
        @group(3) @binding(1) var envSampler: sampler;

        struct PBRParams {
          roughness: f32,
          metallic: f32,
          ambientStrength: f32,
          reflectionStrength: f32,
        }
        @group(3) @binding(2) var<uniform> pbr: PBRParams;

        @fragment
        fn main() -> @location(0) vec4f {
          return vec4f(0.0, 0.0, 0.0, 1.0);
        }
      `;

      const shaderModule = device.createShaderModule({ code: shaderCode });
      const pipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: {
          module: shaderModule,
          entryPoint: 'main',
          buffers: [],
        },
        fragment: {
          module: shaderModule,
          entryPoint: 'main',
          targets: [{ format: 'bgra8unorm' }],
        },
        primitive: { topology: 'triangle-list' },
      });

      // Try to create bind group without binding 2
      expect(() => {
        device.createBindGroup({
          layout: pipeline.getBindGroupLayout(3),
          entries: [
            { binding: 0, resource: cubemap.view },
            { binding: 1, resource: sampler },
            // Missing binding 2!
          ],
        });
      }).toThrow();

      // Cleanup
      cubemap.texture.destroy();
      pbrParamsBuffer.destroy();
    });
  });

  describe('Shader Compilation', () => {
    it('should compile cloth fragment shader with IBL', () => {
      const shaderCode = `
        struct FragmentInput {
          @location(0) worldPos: vec3f,
          @location(1) normal: vec3f,
        }

        @group(3) @binding(0) var envCubemap: texture_cube<f32>;
        @group(3) @binding(1) var envSampler: sampler;

        struct PBRParams {
          roughness: f32,
          metallic: f32,
          ambientStrength: f32,
          reflectionStrength: f32,
        }
        @group(3) @binding(2) var<uniform> pbr: PBRParams;

        @fragment
        fn main(in: FragmentInput) -> @location(0) vec4f {
          let n = normalize(in.normal);
          let viewDir = normalize(in.worldPos);
          let reflectDir = reflect(viewDir, n);

          let envAmbient = textureSample(envCubemap, envSampler, n).rgb;
          let envReflection = textureSample(envCubemap, envSampler, reflectDir).rgb;

          let diffuseContribution = mix(1.0, 0.0, pbr.metallic);
          let specularContribution = mix(0.04, 1.0, pbr.metallic);

          let directWeight = 1.0 - (pbr.ambientStrength + pbr.reflectionStrength);
          let directLight = vec3f(0.5, 0.5, 0.5);

          let finalColor = directLight * directWeight * diffuseContribution
                         + envAmbient * pbr.ambientStrength * diffuseContribution
                         + envReflection * pbr.reflectionStrength * specularContribution;

          return vec4f(finalColor, 1.0);
        }
      `;

      expect(() => {
        device.createShaderModule({ code: shaderCode });
      }).not.toThrow();
    });

    it('should compile body fragment shader with IBL', () => {
      const shaderCode = `
        struct FragmentInput {
          @location(0) worldPos: vec3f,
          @location(1) normal: vec3f,
        }

        @group(0) @binding(1) var<uniform> color: vec4f;

        @group(3) @binding(0) var envCubemap: texture_cube<f32>;
        @group(3) @binding(1) var envSampler: sampler;

        struct PBRParams {
          roughness: f32,
          metallic: f32,
          ambientStrength: f32,
          reflectionStrength: f32,
        }
        @group(3) @binding(2) var<uniform> pbr: PBRParams;

        @fragment
        fn main(in: FragmentInput) -> @location(0) vec4f {
          let n = normalize(in.normal);
          let viewDir = normalize(in.worldPos);
          let reflectDir = reflect(viewDir, n);

          let envAmbient = textureSample(envCubemap, envSampler, n).rgb * color.rgb;
          let envReflection = textureSample(envCubemap, envSampler, reflectDir).rgb;

          let diffuseContribution = mix(1.0, 0.0, pbr.metallic);
          let specularContribution = mix(0.04, 1.0, pbr.metallic);

          let directWeight = 1.0 - (pbr.ambientStrength + pbr.reflectionStrength);
          let directLight = vec3f(0.5, 0.5, 0.5) * color.rgb;

          let finalColor = directLight * directWeight * diffuseContribution
                         + envAmbient * pbr.ambientStrength * diffuseContribution
                         + envReflection * pbr.reflectionStrength * specularContribution;

          return vec4f(finalColor, color.a);
        }
      `;

      expect(() => {
        device.createShaderModule({ code: shaderCode });
      }).not.toThrow();
    });
  });

  describe('Bind Group Limits', () => {
    it('should support bind groups 0-3 (WebGPU limit)', () => {
      const shaderCode = `
        @group(0) @binding(0) var<uniform> g0: vec4f;
        @group(1) @binding(0) var<uniform> g1: vec4f;
        @group(2) @binding(0) var<uniform> g2: vec4f;
        @group(3) @binding(0) var<uniform> g3: vec4f;

        @fragment
        fn main() -> @location(0) vec4f {
          return g0 + g1 + g2 + g3;
        }
      `;

      expect(() => {
        device.createShaderModule({ code: shaderCode });
      }).not.toThrow();
    });

    it('should reject bind group 4 (exceeds limit)', () => {
      const shaderCode = `
        @group(0) @binding(0) var<uniform> g0: vec4f;
        @group(4) @binding(0) var<uniform> g4: vec4f;

        @fragment
        fn main() -> @location(0) vec4f {
          return g0 + g4;
        }
      `;

      const shaderModule = device.createShaderModule({ code: shaderCode });

      // Pipeline creation should fail
      expect(() => {
        device.createRenderPipeline({
          layout: 'auto',
          vertex: {
            module: shaderModule,
            entryPoint: 'main',
            buffers: [],
          },
          fragment: {
            module: shaderModule,
            entryPoint: 'main',
            targets: [{ format: 'bgra8unorm' }],
          },
          primitive: { topology: 'triangle-list' },
        });
      }).toThrow();
    });
  });
});
