/**
 * Comprehensive WebGPU mock for Node.js testing.
 * Provides fake GPU objects so all WebGPU code paths can be exercised without a real GPU.
 */
import { vi } from 'vitest';

// ---- Buffer ----
export function makeMockBuffer(size: number = 256) {
  const backing = new ArrayBuffer(Math.max(size, 4));
  return {
    size,
    usage: 0,
    label: '',
    mapState: 'unmapped' as GPUBufferMapState,
    mapAsync: vi.fn(async () => {}),
    getMappedRange: vi.fn((_offset = 0, _sz?: number) => backing),
    unmap: vi.fn(),
    destroy: vi.fn(),
  };
}

// ---- Texture / View / Sampler ----
export function makeMockTextureView() {
  return { label: '' };
}

export function makeMockTexture(desc?: Partial<GPUTextureDescriptor>) {
  return {
    label: '',
    width: 1,
    height: 1,
    depthOrArrayLayers: 1,
    mipLevelCount: 1,
    sampleCount: 1,
    dimension: '2d' as GPUTextureDimension,
    format: (desc?.format ?? 'rgba8unorm') as GPUTextureFormat,
    usage: desc?.usage ?? 0,
    createView: vi.fn(() => makeMockTextureView()),
    destroy: vi.fn(),
  };
}

export function makeMockSampler() {
  return { label: '' };
}

// ---- ShaderModule ----
export function makeMockShaderModule() {
  return {
    label: '',
    getCompilationInfo: vi.fn(async () => ({ messages: [] })),
  };
}

// ---- Layouts / BindGroup ----
export function makeMockBindGroupLayout() {
  return { label: '' };
}
export function makeMockPipelineLayout() {
  return { label: '' };
}
export function makeMockBindGroup() {
  return { label: '' };
}

// ---- Pipelines ----
export function makeMockComputePipeline() {
  return {
    label: '',
    getBindGroupLayout: vi.fn(() => makeMockBindGroupLayout()),
  };
}
export function makeMockRenderPipeline() {
  return {
    label: '',
    getBindGroupLayout: vi.fn(() => makeMockBindGroupLayout()),
  };
}

// ---- Pass Encoders ----
export function makeMockComputePassEncoder() {
  return {
    label: '',
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    dispatchWorkgroups: vi.fn(),
    dispatchWorkgroupsIndirect: vi.fn(),
    pushDebugGroup: vi.fn(),
    popDebugGroup: vi.fn(),
    insertDebugMarker: vi.fn(),
    end: vi.fn(),
  };
}

export function makeMockRenderPassEncoder() {
  return {
    label: '',
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    setVertexBuffer: vi.fn(),
    setIndexBuffer: vi.fn(),
    draw: vi.fn(),
    drawIndexed: vi.fn(),
    drawIndirect: vi.fn(),
    drawIndexedIndirect: vi.fn(),
    setViewport: vi.fn(),
    setScissorRect: vi.fn(),
    setBlendConstant: vi.fn(),
    setStencilReference: vi.fn(),
    beginOcclusionQuery: vi.fn(),
    endOcclusionQuery: vi.fn(),
    executeBundles: vi.fn(),
    pushDebugGroup: vi.fn(),
    popDebugGroup: vi.fn(),
    insertDebugMarker: vi.fn(),
    end: vi.fn(),
  };
}

// ---- CommandEncoder ----
export function makeMockCommandEncoder() {
  return {
    label: '',
    beginComputePass: vi.fn(() => makeMockComputePassEncoder()),
    beginRenderPass: vi.fn(() => makeMockRenderPassEncoder()),
    copyBufferToBuffer: vi.fn(),
    copyBufferToTexture: vi.fn(),
    copyTextureToBuffer: vi.fn(),
    copyTextureToTexture: vi.fn(),
    clearBuffer: vi.fn(),
    pushDebugGroup: vi.fn(),
    popDebugGroup: vi.fn(),
    insertDebugMarker: vi.fn(),
    resolveQuerySet: vi.fn(),
    finish: vi.fn(() => ({ label: '' })),
  };
}

// ---- Queue ----
export function makeMockQueue() {
  return {
    label: '',
    writeBuffer: vi.fn(),
    writeTexture: vi.fn(),
    copyExternalImageToTexture: vi.fn(),
    submit: vi.fn(),
    onSubmittedWorkDone: vi.fn(async () => {}),
  };
}

// ---- Device ----
export function makeMockDevice() {
  const queue = makeMockQueue();
  return {
    label: '',
    lost: new Promise<GPUDeviceLostInfo>(() => {}),
    features: new Set<GPUFeatureName>(),
    limits: {
      maxTextureDimension2D: 8192,
      maxBufferSize: 268435456,
      minUniformBufferOffsetAlignment: 256,
      minStorageBufferOffsetAlignment: 256,
      maxComputeWorkgroupSizeX: 256,
      maxComputeWorkgroupSizeY: 256,
      maxComputeWorkgroupSizeZ: 64,
      maxComputeInvocationsPerWorkgroup: 256,
    } as unknown as GPUSupportedLimits,
    adapterInfo: {},
    queue,
    createBuffer: vi.fn((desc: GPUBufferDescriptor) => makeMockBuffer(desc.size)),
    createTexture: vi.fn((desc: GPUTextureDescriptor) => makeMockTexture(desc)),
    createSampler: vi.fn(() => makeMockSampler()),
    createShaderModule: vi.fn(() => makeMockShaderModule()),
    createBindGroupLayout: vi.fn(() => makeMockBindGroupLayout()),
    createPipelineLayout: vi.fn(() => makeMockPipelineLayout()),
    createComputePipeline: vi.fn(() => makeMockComputePipeline()),
    createRenderPipeline: vi.fn(() => makeMockRenderPipeline()),
    createComputePipelineAsync: vi.fn(async () => makeMockComputePipeline()),
    createRenderPipelineAsync: vi.fn(async () => makeMockRenderPipeline()),
    createBindGroup: vi.fn(() => makeMockBindGroup()),
    createCommandEncoder: vi.fn(() => makeMockCommandEncoder()),
    createQuerySet: vi.fn(() => ({ count: 0, type: 'timestamp', destroy: vi.fn() })),
    importExternalTexture: vi.fn(() => ({})),
    pushErrorScope: vi.fn(),
    popErrorScope: vi.fn(async () => null),
    destroy: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => false),
  } as unknown as GPUDevice;
}

// ---- Adapter ----
export function makeMockAdapter() {
  return {
    label: '',
    features: new Set<GPUFeatureName>(),
    limits: {} as GPUSupportedLimits,
    isFallbackAdapter: false,
    requestDevice: vi.fn(async () => makeMockDevice()),
    requestAdapterInfo: vi.fn(async () => ({})),
  } as unknown as GPUAdapter;
}

// ---- GPUCanvasContext ----
export function makeMockGPUCanvasContext() {
  return {
    configure: vi.fn(),
    unconfigure: vi.fn(),
    getCurrentTexture: vi.fn(() => makeMockTexture()),
    getPreferredFormat: vi.fn(() => 'bgra8unorm' as GPUTextureFormat),
  };
}

// ---- Canvas 2D Context ----
export function makeMockCanvas2DContext() {
  return {
    canvas: null as unknown as HTMLCanvasElement,
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    arcTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    clip: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    measureText: vi.fn(() => ({ width: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 })),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    transform: vi.fn(),
    setTransform: vi.fn(),
    getTransform: vi.fn(() => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })),
    resetTransform: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createPattern: vi.fn(() => null),
    createImageData: vi.fn((w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h, colorSpace: 'srgb' })),
    getImageData: vi.fn((x: number, y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h, colorSpace: 'srgb' })),
    putImageData: vi.fn(),
    isPointInPath: vi.fn(() => false),
    isPointInStroke: vi.fn(() => false),
    toDataURL: vi.fn(() => 'data:image/png;base64,'),
    fillStyle: '' as string | CanvasGradient | CanvasPattern,
    strokeStyle: '' as string | CanvasGradient | CanvasPattern,
    lineWidth: 1,
    lineCap: 'butt' as CanvasLineCap,
    lineJoin: 'miter' as CanvasLineJoin,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over' as GlobalCompositeOperation,
    font: '10px sans-serif',
    textAlign: 'start' as CanvasTextAlign,
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    shadowBlur: 0,
    shadowColor: 'rgba(0,0,0,0)',
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    lineDashOffset: 0,
    setLineDash: vi.fn(),
    getLineDash: vi.fn(() => []),
    ellipse: vi.fn(),
    rect: vi.fn(),
  };
}

// ---- Install global WebGPU mock ----
export function installWebGPUMock() {
  // Install WebGPU numeric constants (not available in Node/jsdom)
  const gpuConstants: Record<string, Record<string, number>> = {
    GPUBufferUsage: {
      MAP_READ: 0x0001, MAP_WRITE: 0x0002,
      COPY_SRC: 0x0004, COPY_DST: 0x0008,
      INDEX: 0x0010, VERTEX: 0x0020,
      UNIFORM: 0x0040, STORAGE: 0x0080,
      INDIRECT: 0x0100, QUERY_RESOLVE: 0x0200,
    },
    GPUTextureUsage: {
      COPY_SRC: 0x01, COPY_DST: 0x02,
      TEXTURE_BINDING: 0x04, STORAGE_BINDING: 0x08,
      RENDER_ATTACHMENT: 0x10,
    },
    GPUShaderStage: { VERTEX: 0x1, FRAGMENT: 0x2, COMPUTE: 0x4 },
    GPUMapMode:     { READ: 0x1, WRITE: 0x2 },
    GPUColorWrite:  { RED: 1, GREEN: 2, BLUE: 4, ALPHA: 8, ALL: 15 },
    GPUQueryType:   { OCCLUSION: 0, TIMESTAMP: 1 },
  };
  for (const [name, value] of Object.entries(gpuConstants)) {
    if (typeof (globalThis as any)[name] === 'undefined') {
      (globalThis as any)[name] = value;
    }
  }

  const adapter = makeMockAdapter();
  const gpu = {
    requestAdapter: vi.fn(async () => adapter),
    getPreferredCanvasFormat: vi.fn(() => 'bgra8unorm' as GPUTextureFormat),
    wgslLanguageFeatures: new Set<string>(),
  };

  // Install navigator.gpu
  if (typeof globalThis.navigator === 'undefined') {
    (globalThis as any).navigator = {};
  }
  Object.defineProperty(globalThis.navigator, 'gpu', {
    value: gpu,
    writable: true,
    configurable: true,
  });

  // Install DOMMatrix if missing (Node env)
  if (typeof (globalThis as any).DOMMatrix === 'undefined') {
    (globalThis as any).DOMMatrix = class DOMMatrixMock {
      m11 = 1; m12 = 0; m13 = 0; m14 = 0;
      m21 = 0; m22 = 1; m23 = 0; m24 = 0;
      m31 = 0; m32 = 0; m33 = 1; m34 = 0;
      m41 = 0; m42 = 0; m43 = 0; m44 = 1;
      static fromFloat32Array(arr: Float32Array) {
        const m = new (globalThis as any).DOMMatrix();
        m.m11 = arr[0];  m.m12 = arr[1];  m.m13 = arr[2];  m.m14 = arr[3];
        m.m21 = arr[4];  m.m22 = arr[5];  m.m23 = arr[6];  m.m24 = arr[7];
        m.m31 = arr[8];  m.m32 = arr[9];  m.m33 = arr[10]; m.m34 = arr[11];
        m.m41 = arr[12]; m.m42 = arr[13]; m.m43 = arr[14]; m.m44 = arr[15];
        return m;
      }
      inverse() {
        // Return identity inverse for mock
        return new (globalThis as any).DOMMatrix();
      }
      toFloat32Array() {
        return new Float32Array([
          this.m11, this.m12, this.m13, this.m14,
          this.m21, this.m22, this.m23, this.m24,
          this.m31, this.m32, this.m33, this.m34,
          this.m41, this.m42, this.m43, this.m44,
        ]);
      }
    };
  }

  // Install createImageBitmap mock
  (globalThis as any).createImageBitmap = vi.fn(async (_blob: Blob) => ({
    width: 256,
    height: 256,
    close: vi.fn(),
  }));

  // Patch HTMLCanvasElement.prototype.getContext if available
  if (typeof HTMLCanvasElement !== 'undefined') {
    const origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(contextId: string, ...args: any[]) {
      if (contextId === 'webgpu') {
        return makeMockGPUCanvasContext();
      }
      if (contextId === '2d') {
        const ctx = makeMockCanvas2DContext();
        Object.defineProperty(ctx, 'canvas', { value: this, configurable: true });
        return ctx;
      }
      return origGetContext ? origGetContext.call(this, contextId, ...args) : null;
    } as typeof HTMLCanvasElement.prototype.getContext;
  }

  return { gpu, adapter };
}
