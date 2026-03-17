/**
 * Render pipeline: mannequin body, ground, skybox. IBL only (no directional light).
 */

import bodyVertWgsl from './body.vert.wgsl?raw';
import bodyFragWgsl from './body.frag.wgsl?raw';
import skyboxVertWgsl from './skybox.vert.wgsl?raw';
import skyboxFragWgsl from './skybox.frag.wgsl?raw';
import gridVertWgsl from './grid.vert.wgsl?raw';
import gridFragWgsl from './grid.frag.wgsl?raw';
import cloth3dVertWgsl from './cloth3d.vert.wgsl?raw';
import cloth3dFragWgsl from './cloth3d.frag.wgsl?raw';
import { buildMannequinMesh, type BodyMesh } from './bodyMesh';
import { createWhiteCubemap, loadCubemap, createFallbackCubemap, CUBEMAP_BASE_URL, type CubemapResource } from './cubemap';
import type { Cloth3DRenderData } from '../sim/cloth3d/cloth3d';

const VIEW_PROJ_SIZE = 64; // mat4
const BODY_COLOR_SIZE = 16; // vec4

export interface RenderContext {
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  viewProjBuffer: GPUBuffer;
  bodyPipeline: GPURenderPipeline;
  bodyVertexBuffer: GPUBuffer;
  bodyNormalBuffer: GPUBuffer;
  bodyIndexBuffer: GPUBuffer;
  bodyNumIndices: number;
  bodyColorBuffer: GPUBuffer;
  groundVertexBuffer: GPUBuffer;
  groundNormalBuffer: GPUBuffer;
  groundIndexBuffer: GPUBuffer;
  groundColorBuffer: GPUBuffer;
  cubemap: CubemapResource;
  /** 'grid' = white + grid background; 'cubemap' = skybox. */
  backgroundMode: 'grid' | 'cubemap';
  skyboxPipeline: GPURenderPipeline;
  skyboxVertexBuffer: GPUBuffer;
  skyboxIndexBuffer: GPUBuffer;
  skyboxInvViewProjBuffer: GPUBuffer;
  gridPipeline: GPURenderPipeline;
  cubemapSampler: GPUSampler;
  groundPbrBuffer: GPUBuffer;
  bodyPbrBuffer: GPUBuffer;
  mainDepthTexture?: GPUTexture;
  mainDepthView?: GPUTextureView;
  /** Pipeline for 3D cloth rendering (double-sided IBL PBR). */
  clothPipeline: GPURenderPipeline;
}

// Cube centered at origin; must fit inside camera far plane (100) so use 50
const SKYBOX_SCALE = 50;
const SKYBOX_VERTS = new Float32Array([
  SKYBOX_SCALE, SKYBOX_SCALE, SKYBOX_SCALE, SKYBOX_SCALE, -SKYBOX_SCALE, SKYBOX_SCALE,
  SKYBOX_SCALE, -SKYBOX_SCALE, -SKYBOX_SCALE, SKYBOX_SCALE, SKYBOX_SCALE, -SKYBOX_SCALE,
  -SKYBOX_SCALE, SKYBOX_SCALE, SKYBOX_SCALE, -SKYBOX_SCALE, -SKYBOX_SCALE, SKYBOX_SCALE,
  -SKYBOX_SCALE, -SKYBOX_SCALE, -SKYBOX_SCALE, -SKYBOX_SCALE, SKYBOX_SCALE, -SKYBOX_SCALE,
]);
const SKYBOX_INDICES = new Uint32Array([
  0, 1, 2, 0, 2, 3, 5, 4, 7, 5, 7, 6, 4, 0, 3, 4, 3, 7, 5, 6, 2, 5, 2, 1, 4, 5, 1, 4, 1, 0, 3, 2, 6, 3, 6, 7,
]);

/**
 * Create render context. bodyMesh: optional SMPL/mannequin; if null/undefined, uses built-in cylinder+sphere.
 * Loads default cubemap from src/renderer/assets/samples/cubemaps/studio_1.
 */
export async function createRenderPipeline(
  device: GPUDevice,
  context: GPUCanvasContext,
  format: GPUTextureFormat,
  bodyMesh?: BodyMesh | null
): Promise<RenderContext> {
  const viewProjBuffer = device.createBuffer({
    size: VIEW_PROJ_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const bodySource = bodyMesh ?? buildMannequinMesh();
  const bodyPos = bodySource.positions;
  const bodyNorm = bodySource.normals ?? bodySource.positions; // Fallback to positions if no normals
  const bodyIdx = bodySource.indices;
  const bodyVertexBuffer = device.createBuffer({
    size: bodyPos.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(bodyVertexBuffer, 0, bodyPos);
  const bodyNormalBuffer = device.createBuffer({
    size: bodyNorm.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(bodyNormalBuffer, 0, bodyNorm);
  const bodyIndexBuffer = device.createBuffer({
    size: bodyIdx.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(bodyIndexBuffer, 0, bodyIdx);
  const bodyColorBuffer = device.createBuffer({
    size: BODY_COLOR_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const bodyColor = new Float32Array([1, 1, 1, 1]); // white
  device.queue.writeBuffer(bodyColorBuffer, 0, bodyColor);

  const groundY = -0.05;
  const groundVerts = new Float32Array([
    -2, groundY, -2, 2, groundY, -2, 2, groundY, 2, -2, groundY, 2,
  ]);
  // All normals point up (0, 1, 0) for ground plane
  const groundNormals = new Float32Array([
    0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,
  ]);
  // Winding so normal points up (visible from above); 0=(-2,0,-2), 1=(2,0,-2), 2=(2,0,2), 3=(-2,0,2)
  const groundIndices = new Uint32Array([0, 2, 1, 0, 3, 2]);
  const groundVertexBuffer = device.createBuffer({
    size: groundVerts.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(groundVertexBuffer, 0, groundVerts);
  const groundNormalBuffer = device.createBuffer({
    size: groundNormals.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(groundNormalBuffer, 0, groundNormals);
  const groundIndexBuffer = device.createBuffer({
    size: groundIndices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(groundIndexBuffer, 0, groundIndices);
  const groundColorBuffer = device.createBuffer({
    size: BODY_COLOR_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const groundColor = new Float32Array([0.15, 0.14, 0.18, 1]); // dark floor
  device.queue.writeBuffer(groundColorBuffer, 0, groundColor);

  const bodyVertModule = device.createShaderModule({ code: bodyVertWgsl, label: 'Body Vertex' });
  const bodyFragModule = device.createShaderModule({ code: bodyFragWgsl, label: 'Body Fragment' });

  bodyVertModule.getCompilationInfo().then(info => {
    for (const m of info.messages) if (m.type === 'error') console.error(`[Body Vert] ${m.message} line ${m.lineNum}`);
  });
  bodyFragModule.getCompilationInfo().then(info => {
    for (const m of info.messages) if (m.type === 'error') console.error(`[Body Frag] ${m.message} line ${m.lineNum}`);
  });

  const bodyPipeline = device.createRenderPipeline({
    layout: 'auto',
    label: 'Body Pipeline',
    vertex: {
      module: bodyVertModule,
      entryPoint: 'main',
      buffers: [
        {
          // Position buffer
          arrayStride: 12,
          attributes: [{ format: 'float32x3', offset: 0, shaderLocation: 0 }],
        },
        {
          // Normal buffer
          arrayStride: 12,
          attributes: [{ format: 'float32x3', offset: 0, shaderLocation: 1 }],
        },
      ],
    },
    fragment: {
      module: bodyFragModule,
      entryPoint: 'main',
      targets: [{ format }],
    },
    // SMPL/OBJ mesh winding: cull front so outward-facing triangles (drawn as back in our NDC) are visible.
    primitive: { topology: 'triangle-list', cullMode: 'front' },
    depthStencil: {
      format: 'depth32float',
      depthWriteEnabled: true,
      depthCompare: 'less-equal',
      // Push body slightly deeper to prevent z-fighting with cloth at surface
      depthBias: 2,
      depthBiasSlopeScale: 1.0,
    },
  });

  const skyboxVertexBuffer = device.createBuffer({
    size: SKYBOX_VERTS.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(skyboxVertexBuffer, 0, SKYBOX_VERTS);
  const skyboxIndexBuffer = device.createBuffer({
    size: SKYBOX_INDICES.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(skyboxIndexBuffer, 0, SKYBOX_INDICES);

  // Currently unused, kept for compatibility with RenderContext.
  const skyboxInvViewProjBuffer = device.createBuffer({
    size: VIEW_PROJ_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const skyboxPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: device.createShaderModule({ code: skyboxVertWgsl }),
      entryPoint: 'main',
      buffers: [
        {
          arrayStride: 12,
          attributes: [{ format: 'float32x3', offset: 0, shaderLocation: 0 }],
        },
      ],
    },
    fragment: {
      module: device.createShaderModule({ code: skyboxFragWgsl }),
      entryPoint: 'main',
      targets: [{ format }],
    },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: {
      format: 'depth32float',
      depthWriteEnabled: false,
      depthCompare: 'less-equal',
    },
  });

  const gridPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: device.createShaderModule({ code: gridVertWgsl }),
      entryPoint: 'main',
    },
    fragment: {
      module: device.createShaderModule({ code: gridFragWgsl }),
      entryPoint: 'main',
      targets: [{ format }],
    },
    primitive: { topology: 'triangle-list' },
    depthStencil: {
      format: 'depth32float',
      depthWriteEnabled: true,
      depthCompare: 'less-equal',
    },
  });

  // Default: white cubemap for IBL and grid background (no cubemap image loaded).
  const cubemap = createWhiteCubemap(device);

  const cubemapSampler = device.createSampler({ minFilter: 'linear', magFilter: 'linear' });

  // ── Cloth 3D render pipeline (double-sided, matches body bind group layout) ──
  const cloth3dVertModule = device.createShaderModule({ code: cloth3dVertWgsl, label: 'Cloth3D Vert' });
  const cloth3dFragModule = device.createShaderModule({ code: cloth3dFragWgsl, label: 'Cloth3D Frag' });
  cloth3dVertModule.getCompilationInfo().then(info => {
    for (const m of info.messages) if (m.type === 'error') console.error(`[Cloth3D Vert] ${m.message} line ${m.lineNum}`);
  });
  cloth3dFragModule.getCompilationInfo().then(info => {
    for (const m of info.messages) if (m.type === 'error') console.error(`[Cloth3D Frag] ${m.message} line ${m.lineNum}`);
  });

  const clothPipeline = device.createRenderPipeline({
    layout: 'auto',
    label: 'Cloth3D Pipeline',
    vertex: {
      module: cloth3dVertModule,
      entryPoint: 'main',
      buffers: [
        { arrayStride: 12, attributes: [{ format: 'float32x3', offset: 0, shaderLocation: 0 }] }, // pos
        { arrayStride: 12, attributes: [{ format: 'float32x3', offset: 0, shaderLocation: 1 }] }, // normal
      ],
    },
    fragment: {
      module: cloth3dFragModule,
      entryPoint: 'main',
      targets: [{
        format,
        blend: {
          color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          alpha: { srcFactor: 'one',       dstFactor: 'one-minus-src-alpha', operation: 'add' },
        },
      }],
    },
    primitive: { topology: 'triangle-list', cullMode: 'none' },  // double-sided
    depthStencil: {
      format: 'depth32float',
      depthWriteEnabled: true,
      depthCompare: 'less-equal',
    },
  });

  const PBR_BUFFER_SIZE = 32; // 8 floats: roughness, metallic, ambientStrength, reflectionStrength, cameraPos(xyz), padding
  const createPbrBuffer = (r: number, m: number, a: number, refl: number): GPUBuffer => {
    const buf = device.createBuffer({
      size: PBR_BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(buf, 0, new Float32Array([r, m, a, refl, 0, 0, 3, 0]));
    return buf;
  };
  const groundPbrBuffer = createPbrBuffer(0.9, 0, 0.4, 0.1);
  const bodyPbrBuffer = createPbrBuffer(1, 0, 1, 0.5);

  return {
    device,
    context,
    format,
    viewProjBuffer,
    bodyPipeline,
    bodyVertexBuffer,
    bodyNormalBuffer,
    bodyIndexBuffer,
    bodyNumIndices: bodyIdx.length,
    bodyColorBuffer,
    groundVertexBuffer,
    groundNormalBuffer,
    groundIndexBuffer,
    groundColorBuffer,
    cubemap,
    backgroundMode: 'grid',
    skyboxPipeline,
    skyboxVertexBuffer,
    skyboxIndexBuffer,
    skyboxInvViewProjBuffer,
    gridPipeline,
    cubemapSampler,
    groundPbrBuffer,
    bodyPbrBuffer,
    clothPipeline,
  };
}

/**
 * Replace the body mesh in the render context (e.g. when switching male/female mannequin).
 */
export function updateBodyMesh(ctx: RenderContext, bodyMesh: BodyMesh): void {
  ctx.bodyVertexBuffer.destroy();
  ctx.bodyNormalBuffer.destroy();
  ctx.bodyIndexBuffer.destroy();
  const bodyPos = bodyMesh.positions;
  const bodyNorm = bodyMesh.normals ?? bodyMesh.positions; // Fallback to positions if no normals
  const bodyIdx = bodyMesh.indices;
  ctx.bodyVertexBuffer = ctx.device.createBuffer({
    size: bodyPos.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  ctx.device.queue.writeBuffer(ctx.bodyVertexBuffer, 0, bodyPos);
  ctx.bodyNormalBuffer = ctx.device.createBuffer({
    size: bodyNorm.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  ctx.device.queue.writeBuffer(ctx.bodyNormalBuffer, 0, bodyNorm);
  ctx.bodyIndexBuffer = ctx.device.createBuffer({
    size: bodyIdx.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  ctx.device.queue.writeBuffer(ctx.bodyIndexBuffer, 0, bodyIdx);
  ctx.bodyNumIndices = bodyIdx.length;
}

/**
 * Update vertex buffer from simulation position buffer (copy on GPU).
 */
export function updateClothVertices(
  device: GPUDevice,
  vertexBuffer: GPUBuffer,
  positionBuffer: GPUBuffer,
  size: number
): void {
  const encoder = device.createCommandEncoder();
  encoder.copyBufferToBuffer(positionBuffer, 0, vertexBuffer, 0, size);
  device.queue.submit([encoder.finish()]);
}

/** Copy row-major 4x4 to column-major layout for WGSL (same matrix, different storage). */
function rowMajorToColumnMajor(out: Float32Array, m: Float32Array): void {
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      out[col * 4 + row] = m[row * 4 + col];
    }
  }
}

/** @deprecated Use rowMajorToColumnMajor; name was misleading (we only reorder layout). */
function transpose4x4(out: Float32Array, m: Float32Array): void {
  rowMajorToColumnMajor(out, m);
}

/** Invert 4x4 and output column-major for WGSL. WGSL has no inverse(), so we do it on CPU for skybox. */
function invert4x4ColMajor(out: Float32Array, mRowMajor: Float32Array): void {
  const cm = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) cm[c * 4 + r] = mRowMajor[r * 4 + c];
  const m = DOMMatrix.fromFloat32Array(cm);
  const inv = m.inverse();
  if (!inv) {
    for (let i = 0; i < 16; i++) out[i] = i % 5 === 0 ? 1 : 0;
    return;
  }
  // DOMMatrix is column-major: m11,m21,m31,m41 = first column → write as-is for WGSL
  out[0] = inv.m11; out[1] = inv.m21; out[2] = inv.m31; out[3] = inv.m41;
  out[4] = inv.m12; out[5] = inv.m22; out[6] = inv.m32; out[7] = inv.m42;
  out[8] = inv.m13; out[9] = inv.m23; out[10] = inv.m33; out[11] = inv.m43;
  out[12] = inv.m14; out[13] = inv.m24; out[14] = inv.m34; out[15] = inv.m44;
}

function ensureMainDepth(ctx: RenderContext): void {
  const tex = ctx.context.getCurrentTexture();
  const w = tex.width;
  const h = tex.height;
  if (w === 0 || h === 0) return;
  if (ctx.mainDepthTexture && ctx.mainDepthTexture.width === w && ctx.mainDepthTexture.height === h) return;
  ctx.mainDepthTexture?.destroy();
  ctx.mainDepthTexture = ctx.device.createTexture({
    size: [w, h, 1],
    format: 'depth32float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  ctx.mainDepthView = ctx.mainDepthTexture.createView();
}

/**
 * Main render pass: clear once, draw ground → body → skybox.
 */
export function drawMainPass(
  ctx: RenderContext,
  viewProj: Float32Array,
  cameraEye?: [number, number, number]
): void {
  ensureMainDepth(ctx);
  if (!ctx.mainDepthView) return;

  const viewProjColMajor = new Float32Array(16);
  rowMajorToColumnMajor(viewProjColMajor, viewProj);
  ctx.device.queue.writeBuffer(ctx.viewProjBuffer, 0, viewProjColMajor);

  const cx = cameraEye?.[0] ?? 0;
  const cy = cameraEye?.[1] ?? 0;
  const cz = cameraEye?.[2] ?? 3;
  const writePbr = (buf: GPUBuffer, r: number, m: number, a: number, refl: number) => {
    ctx.device.queue.writeBuffer(buf, 0, new Float32Array([r, m, a, refl, cx, cy, cz, 0]));
  };
  writePbr(ctx.groundPbrBuffer, 0.9, 0, 0.4, 0.1);
  writePbr(ctx.bodyPbrBuffer, 1, 0, 1, 0.5);

  const isGrid = ctx.backgroundMode === 'grid';
  const clearColor = isGrid
    ? { r: 0.45, g: 0.45, b: 0.45, a: 1 }   // gray sky for grid mode
    : { r: 0.1, g: 0.1, b: 0.15, a: 1 };      // dark blue for cubemap mode

  const encoder = ctx.device.createCommandEncoder();
  const view = ctx.context.getCurrentTexture().createView();
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view,
        clearValue: clearColor,
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
    depthStencilAttachment: {
      view: ctx.mainDepthView,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
      depthClearValue: 1,
    },
  });

  // Ground: 3D grid in grid mode, IBL-shaded plane in cubemap mode
  if (isGrid) {
    pass.setPipeline(ctx.gridPipeline);
    pass.setBindGroup(0, ctx.device.createBindGroup({
      layout: ctx.gridPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: ctx.viewProjBuffer } }],
    }));
    pass.draw(6, 1, 0, 0);
  } else {
    pass.setPipeline(ctx.bodyPipeline);
    pass.setBindGroup(0, ctx.device.createBindGroup({
      layout: ctx.bodyPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: ctx.viewProjBuffer } },
        { binding: 1, resource: { buffer: ctx.groundColorBuffer } },
      ],
    }));
    pass.setBindGroup(1, ctx.device.createBindGroup({
      layout: ctx.bodyPipeline.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: ctx.cubemap.view },
        { binding: 1, resource: ctx.cubemapSampler },
        { binding: 2, resource: { buffer: ctx.groundPbrBuffer } },
      ],
    }));
    pass.setVertexBuffer(0, ctx.groundVertexBuffer);
    pass.setVertexBuffer(1, ctx.groundNormalBuffer);
    pass.setIndexBuffer(ctx.groundIndexBuffer, 'uint32');
    pass.drawIndexed(6);
  }

  // Body (mannequin)
  pass.setPipeline(ctx.bodyPipeline);
  pass.setBindGroup(0, ctx.device.createBindGroup({
    layout: ctx.bodyPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: ctx.viewProjBuffer } },
      { binding: 1, resource: { buffer: ctx.bodyColorBuffer } },
    ],
  }));
  pass.setBindGroup(1, ctx.device.createBindGroup({
    layout: ctx.bodyPipeline.getBindGroupLayout(1),
    entries: [
      { binding: 0, resource: ctx.cubemap.view },
      { binding: 1, resource: ctx.cubemapSampler },
      { binding: 2, resource: { buffer: ctx.bodyPbrBuffer } },
    ],
  }));
  pass.setVertexBuffer(0, ctx.bodyVertexBuffer);
  pass.setVertexBuffer(1, ctx.bodyNormalBuffer);
  pass.setIndexBuffer(ctx.bodyIndexBuffer, 'uint32');
  pass.drawIndexed(ctx.bodyNumIndices);

  // Skybox background (cubemap mode only)
  if (!isGrid) {
    pass.setPipeline(ctx.skyboxPipeline);
    pass.setBindGroup(0, ctx.device.createBindGroup({
      layout: ctx.skyboxPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: ctx.viewProjBuffer } }],
    }));
    pass.setBindGroup(1, ctx.device.createBindGroup({
      layout: ctx.skyboxPipeline.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: ctx.cubemap.view },
        { binding: 1, resource: ctx.cubemapSampler },
      ],
    }));
    pass.setVertexBuffer(0, ctx.skyboxVertexBuffer);
    pass.setIndexBuffer(ctx.skyboxIndexBuffer, 'uint32');
    pass.drawIndexed(SKYBOX_INDICES.length);
  }

  pass.end();
  ctx.device.queue.submit([encoder.finish()]);
}

/**
 * Draw skybox only (separate pass). Prefer drawMainPass for normal rendering.
 */
export function drawSkybox(ctx: RenderContext, viewProj: Float32Array): void {
  ensureMainDepth(ctx);
  if (!ctx.mainDepthView) return;

  const viewProjColMajor = new Float32Array(16);
  rowMajorToColumnMajor(viewProjColMajor, viewProj);
  ctx.device.queue.writeBuffer(ctx.viewProjBuffer, 0, viewProjColMajor);

  const view = ctx.context.getCurrentTexture().createView();
  const encoder = ctx.device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view,
        clearValue: { r: 0.1, g: 0.1, b: 0.15, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
    depthStencilAttachment: {
      view: ctx.mainDepthView,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
      depthClearValue: 1,
    },
  });
  pass.setPipeline(ctx.skyboxPipeline);
  pass.setBindGroup(0, ctx.device.createBindGroup({
    layout: ctx.skyboxPipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: ctx.viewProjBuffer } }],
  }));
  pass.setBindGroup(1, ctx.device.createBindGroup({
    layout: ctx.skyboxPipeline.getBindGroupLayout(1),
    entries: [
      { binding: 0, resource: ctx.cubemap.view },
      { binding: 1, resource: ctx.cubemapSampler },
    ],
  }));
  pass.setVertexBuffer(0, ctx.skyboxVertexBuffer);
  pass.setIndexBuffer(ctx.skyboxIndexBuffer, 'uint32');
  pass.drawIndexed(SKYBOX_INDICES.length);
  pass.end();
  ctx.device.queue.submit([encoder.finish()]);
}

/**
 * Draw ground plane, then mannequin body. Call after drawSkybox, before drawCloth.
 */
export function drawBody(ctx: RenderContext, viewProj: Float32Array): void {
  const viewProjColMajor = new Float32Array(16);
  rowMajorToColumnMajor(viewProjColMajor, viewProj);
  ctx.device.queue.writeBuffer(ctx.viewProjBuffer, 0, viewProjColMajor);

  const isGrid = ctx.backgroundMode === 'grid';
  const clearColor = isGrid
    ? { r: 0.45, g: 0.45, b: 0.45, a: 1 }
    : { r: 0.1, g: 0.1, b: 0.15, a: 1 };

  ensureMainDepth(ctx);
  const view = ctx.context.getCurrentTexture().createView();
  const encoder = ctx.device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view,
        clearValue: clearColor,
        loadOp: ctx.cubemap && ctx.mainDepthView ? 'load' : 'clear',
        storeOp: 'store',
      },
    ],
    depthStencilAttachment: ctx.mainDepthView
      ? {
          view: ctx.mainDepthView,
          depthLoadOp: ctx.cubemap ? 'load' : 'clear',
          depthStoreOp: 'store',
          depthClearValue: 1,
        }
      : undefined,
  });

  // Ground: 3D grid in grid mode, IBL-shaded plane in cubemap mode
  if (isGrid) {
    pass.setPipeline(ctx.gridPipeline);
    pass.setBindGroup(0, ctx.device.createBindGroup({
      layout: ctx.gridPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: ctx.viewProjBuffer } }],
    }));
    pass.draw(6, 1, 0, 0);
  } else {
    pass.setPipeline(ctx.bodyPipeline);
    pass.setBindGroup(
      0,
      ctx.device.createBindGroup({
        layout: ctx.bodyPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: ctx.viewProjBuffer } },
          { binding: 1, resource: { buffer: ctx.groundColorBuffer } },
        ],
      })
    );
    pass.setBindGroup(1, ctx.device.createBindGroup({
      layout: ctx.bodyPipeline.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: ctx.cubemap.view },
        { binding: 1, resource: ctx.cubemapSampler },
        { binding: 2, resource: { buffer: ctx.groundPbrBuffer } },
      ],
    }));
    pass.setVertexBuffer(0, ctx.groundVertexBuffer);
    pass.setVertexBuffer(1, ctx.groundNormalBuffer);
    pass.setIndexBuffer(ctx.groundIndexBuffer, 'uint32');
    pass.drawIndexed(6);
  }

  // Body (mannequin)
  pass.setPipeline(ctx.bodyPipeline);
  pass.setBindGroup(
    0,
    ctx.device.createBindGroup({
      layout: ctx.bodyPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: ctx.viewProjBuffer } },
        { binding: 1, resource: { buffer: ctx.bodyColorBuffer } },
      ],
    })
  );
  pass.setBindGroup(1, ctx.device.createBindGroup({
    layout: ctx.bodyPipeline.getBindGroupLayout(1),
    entries: [
      { binding: 0, resource: ctx.cubemap.view },
      { binding: 1, resource: ctx.cubemapSampler },
      { binding: 2, resource: { buffer: ctx.bodyPbrBuffer } },
    ],
  }));
  pass.setVertexBuffer(0, ctx.bodyVertexBuffer);
  pass.setVertexBuffer(1, ctx.bodyNormalBuffer);
  pass.setIndexBuffer(ctx.bodyIndexBuffer, 'uint32');
  pass.drawIndexed(ctx.bodyNumIndices);
  pass.end();
  ctx.device.queue.submit([encoder.finish()]);
}

export async function updateCubemap(
  ctx: RenderContext,
  cubemapName: string
): Promise<void> {
  const basePath = `${CUBEMAP_BASE_URL}/${cubemapName}`;
  let newCubemap: CubemapResource;

  try {
    const loaded = await loadCubemap(ctx.device, basePath);
    newCubemap = loaded || createFallbackCubemap(ctx.device);
    console.log(`[Render] Cubemap updated to: ${cubemapName}`);
  } catch (e) {
    console.warn(`[Render] Failed to load cubemap ${cubemapName}, using fallback:`, e);
    newCubemap = createFallbackCubemap(ctx.device);
  }

  const oldCubemap = ctx.cubemap;
  ctx.cubemap = newCubemap;
  ctx.backgroundMode = 'cubemap';
  oldCubemap.texture.destroy();
}

/** Switch background to white + grid; uses white cubemap for IBL. */
export function setBackgroundGrid(ctx: RenderContext): void {
  if (ctx.backgroundMode === 'grid') return;
  const oldCubemap = ctx.cubemap;
  ctx.cubemap = createWhiteCubemap(ctx.device);
  ctx.backgroundMode = 'grid';
  oldCubemap.texture.destroy();
}

/**
 * Draw 3D cloth over the existing frame using loadOp:'load' so the body pass
 * is preserved.  Call AFTER drawMainPass().
 *
 * cloth.colorBuffer must contain vec4f(albedo, opacity).
 * cloth.pbrBuffer   must contain PBRParams with current camera position
 *                   (call cloth.updateCameraPos() before this).
 */
export function drawCloth3D(ctx: RenderContext, cloth: Cloth3DRenderData): void {
  ensureMainDepth(ctx);
  if (!ctx.mainDepthView) return;

  // viewProjBuffer is already up-to-date from drawMainPass — no re-write needed.
  const view = ctx.context.getCurrentTexture().createView();
  const encoder = ctx.device.createCommandEncoder({ label: 'cloth3d-render' });
  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view,
      loadOp:  'load',   // preserve the existing body render
      storeOp: 'store',
    }],
    depthStencilAttachment: {
      view:              ctx.mainDepthView,
      depthLoadOp:  'load',   // preserve body depth so cloth occludes correctly
      depthStoreOp: 'store',
      depthClearValue: 1,
    },
  });

  pass.setPipeline(ctx.clothPipeline);

  // Group 0: viewProj + cloth color + grid info (UV computation)
  pass.setBindGroup(0, ctx.device.createBindGroup({
    layout: ctx.clothPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: ctx.viewProjBuffer } },
      { binding: 1, resource: { buffer: cloth.colorBuffer } },
      { binding: 2, resource: { buffer: cloth.gridInfoBuffer } },
    ],
  }));

  // Group 1: cubemap + sampler + cloth PBR + albedo texture
  pass.setBindGroup(1, ctx.device.createBindGroup({
    layout: ctx.clothPipeline.getBindGroupLayout(1),
    entries: [
      { binding: 0, resource: ctx.cubemap.view },
      { binding: 1, resource: ctx.cubemapSampler },
      { binding: 2, resource: { buffer: cloth.pbrBuffer } },
      { binding: 3, resource: cloth.albedoTextureView },
      { binding: 4, resource: cloth.albedoSamplerObj },
    ],
  }));

  pass.setVertexBuffer(0, cloth.posBuffer);
  pass.setVertexBuffer(1, cloth.normalBuffer);
  pass.setIndexBuffer(cloth.indexBuffer, 'uint32');
  pass.drawIndexed(cloth.numIndices);
  pass.end();

  ctx.device.queue.submit([encoder.finish()]);
}

