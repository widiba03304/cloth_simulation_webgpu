/**
 * Render pipeline: cloth from vertex buffer + index buffer. Consumes sim output.
 * Also draws a simple mannequin body behind the cloth. IBL only (no directional light).
 */

import clothVertWgsl from './cloth.vert.wgsl?raw';
import clothFragWgsl from './cloth.frag.wgsl?raw';
import bodyVertWgsl from './body.vert.wgsl?raw';
import bodyFragWgsl from './body.frag.wgsl?raw';
import skyboxVertWgsl from './skybox.vert.wgsl?raw';
import skyboxFragWgsl from './skybox.frag.wgsl?raw';
import { buildMannequinMesh, type BodyMesh } from './bodyMesh';
import { loadDefaultCubemap, loadCubemap, createFallbackCubemap, CUBEMAP_BASE_URL, type CubemapResource } from './cubemap';

const VIEW_PROJ_SIZE = 64; // mat4
const BODY_COLOR_SIZE = 16; // vec4

export interface RenderContext {
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  pipeline: GPURenderPipeline;
  viewProjBuffer: GPUBuffer;
  vertexBuffer: GPUBuffer;
  indexBuffer: GPUBuffer;
  numIndices: number;
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
  skyboxPipeline: GPURenderPipeline;
  skyboxVertexBuffer: GPUBuffer;
  skyboxIndexBuffer: GPUBuffer;
  skyboxInvViewProjBuffer: GPUBuffer;
  cubemapSampler: GPUSampler;
  pbrParamsBuffer: GPUBuffer;
  /** Main pass depth (created on first draw, resized when canvas size changes) */
  mainDepthTexture?: GPUTexture;
  mainDepthView?: GPUTextureView;
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
 * Create render context. Vertex buffer size = maxVertices * 12 (vec3).
 * bodyMesh: optional SMPL/mannequin mesh; if null/undefined, uses built-in cylinder+sphere.
 * Loads default cubemap from src/renderer/assets/samples/cubemaps/studio_1.
 */
export async function createRenderPipeline(
  device: GPUDevice,
  context: GPUCanvasContext,
  format: GPUTextureFormat,
  numVertices: number,
  indices: Uint32Array,
  bodyMesh?: BodyMesh | null
): Promise<RenderContext> {
  const viewProjBuffer = device.createBuffer({
    size: VIEW_PROJ_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const vertexBuffer = device.createBuffer({
    size: numVertices * 12,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  const indexBuffer = device.createBuffer({
    size: indices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(indexBuffer, 0, indices);

  const clothVertModule = device.createShaderModule({ code: clothVertWgsl, label: 'Cloth Vertex' });
  const clothFragModule = device.createShaderModule({ code: clothFragWgsl, label: 'Cloth Fragment' });

  // Log shader compilation errors if any
  clothVertModule.getCompilationInfo().then(info => {
    for (const m of info.messages) if (m.type === 'error') console.error(`[Cloth Vert] ${m.message} line ${m.lineNum}`);
  });
  clothFragModule.getCompilationInfo().then(info => {
    for (const m of info.messages) if (m.type === 'error') console.error(`[Cloth Frag] ${m.message} line ${m.lineNum}`);
  });

  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    label: 'Cloth Pipeline',
    vertex: {
      module: clothVertModule,
      entryPoint: 'main',
      buffers: [
        {
          arrayStride: 12,
          attributes: [{ format: 'float32x3', offset: 0, shaderLocation: 0 }],
        },
      ],
    },
    fragment: {
      module: clothFragModule,
      entryPoint: 'main',
      targets: [{ format }],
    },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: {
      format: 'depth32float',
      depthWriteEnabled: true,
      depthCompare: 'less-equal',
    },
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
    // From inside cube: cull none so inner faces always draw (winding can be either way).
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: {
      format: 'depth32float',
      depthWriteEnabled: false,
      depthCompare: 'less-equal',
    },
  });

  let cubemap: CubemapResource;
  try {
    const loaded = await loadDefaultCubemap(device);
    cubemap = loaded || createFallbackCubemap(device);
  } catch {
    // Use fallback gray cubemap if loading fails
    cubemap = createFallbackCubemap(device);
  }

  const cubemapSampler = device.createSampler({ minFilter: 'linear', magFilter: 'linear' });

  // PBR parameters buffer: roughness, metallic, ambientStrength, reflectionStrength, cameraPos(xyz), padding
  const pbrParamsBuffer = device.createBuffer({
    size: 32, // 8 floats (4 params + vec3 cameraPos + padding)
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const pbrParams = new Float32Array([0.5, 0.1, 0.3, 0.1, 0, 0, 3, 0]); // defaults + camera at (0,0,3)
  device.queue.writeBuffer(pbrParamsBuffer, 0, pbrParams);

  return {
    device,
    context,
    format,
    pipeline,
    viewProjBuffer,
    vertexBuffer,
    indexBuffer,
    numIndices: indices.length,
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
    skyboxPipeline,
    skyboxVertexBuffer,
    skyboxIndexBuffer,
    skyboxInvViewProjBuffer,
    cubemapSampler,
    pbrParamsBuffer,
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

/** PBR params passed each frame so roughness/metallic/etc. always match UI. */
export interface PBRState {
  roughness: number;
  metallic: number;
  ambientStrength: number;
  reflectionStrength: number;
}

/**
 * Single main render pass (standard): clear once, upload viewProj once, draw skybox → body → cloth.
 * viewProj is row-major from camera; we convert to column-major for WGSL.
 * Writes full PBR buffer (params + camera) each frame so UI sliders take effect immediately.
 */
export function drawMainPass(
  ctx: RenderContext,
  viewProj: Float32Array,
  positionBuffer: GPUBuffer,
  positionBufferSize: number,
  cameraEye?: [number, number, number],
  pbrState?: PBRState
): void {
  ensureMainDepth(ctx);
  if (!ctx.mainDepthView) return;

  const viewProjColMajor = new Float32Array(16);
  rowMajorToColumnMajor(viewProjColMajor, viewProj);
  ctx.device.queue.writeBuffer(ctx.viewProjBuffer, 0, viewProjColMajor);

  // Write full PBR buffer each frame (std140: 4 floats + vec3 camera + padding) so roughness/metallic/etc. always apply
  const roughness = pbrState?.roughness ?? 0.5;
  const metallic = pbrState?.metallic ?? 0.1;
  const ambientStrength = pbrState?.ambientStrength ?? 0.3;
  const reflectionStrength = pbrState?.reflectionStrength ?? 0.1;
  const cx = cameraEye?.[0] ?? 0;
  const cy = cameraEye?.[1] ?? 0;
  const cz = cameraEye?.[2] ?? 3;
  const pbrData = new Float32Array([roughness, metallic, ambientStrength, reflectionStrength, cx, cy, cz, 0]);
  ctx.device.queue.writeBuffer(ctx.pbrParamsBuffer, 0, pbrData);

  const encoder = ctx.device.createCommandEncoder();
  encoder.copyBufferToBuffer(positionBuffer, 0, ctx.vertexBuffer, 0, positionBufferSize);

  const view = ctx.context.getCurrentTexture().createView();
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
      { binding: 2, resource: { buffer: ctx.pbrParamsBuffer } },
    ],
  }));
  pass.setVertexBuffer(0, ctx.groundVertexBuffer);
  pass.setVertexBuffer(1, ctx.groundNormalBuffer);
  pass.setIndexBuffer(ctx.groundIndexBuffer, 'uint32');
  pass.drawIndexed(6);

  pass.setBindGroup(0, ctx.device.createBindGroup({
    layout: ctx.bodyPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: ctx.viewProjBuffer } },
      { binding: 1, resource: { buffer: ctx.bodyColorBuffer } },
    ],
  }));
  pass.setVertexBuffer(0, ctx.bodyVertexBuffer);
  pass.setVertexBuffer(1, ctx.bodyNormalBuffer);
  pass.setIndexBuffer(ctx.bodyIndexBuffer, 'uint32');
  pass.drawIndexed(ctx.bodyNumIndices);

  pass.setPipeline(ctx.pipeline);
  pass.setBindGroup(0, ctx.device.createBindGroup({
    layout: ctx.pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: ctx.viewProjBuffer } }],
  }));
  pass.setBindGroup(1, ctx.device.createBindGroup({
    layout: ctx.pipeline.getBindGroupLayout(1),
    entries: [
      { binding: 0, resource: ctx.cubemap.view },
      { binding: 1, resource: ctx.cubemapSampler },
      { binding: 2, resource: { buffer: ctx.pbrParamsBuffer } },
    ],
  }));
  pass.setVertexBuffer(0, ctx.vertexBuffer);
  pass.setIndexBuffer(ctx.indexBuffer, 'uint32');
  pass.drawIndexed(ctx.numIndices);

  // Skybox last: only passes depth test where nothing was drawn (depth still 1).
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

  ensureMainDepth(ctx);
  const view = ctx.context.getCurrentTexture().createView();
  const encoder = ctx.device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view,
        clearValue: { r: 0.1, g: 0.1, b: 0.15, a: 1 },
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
      { binding: 2, resource: { buffer: ctx.pbrParamsBuffer } },
    ],
  }));
  pass.setVertexBuffer(0, ctx.groundVertexBuffer);
  pass.setVertexBuffer(1, ctx.groundNormalBuffer);
  pass.setIndexBuffer(ctx.groundIndexBuffer, 'uint32');
  pass.drawIndexed(6);
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
  pass.setVertexBuffer(0, ctx.bodyVertexBuffer);
  pass.setVertexBuffer(1, ctx.bodyNormalBuffer);
  pass.setIndexBuffer(ctx.bodyIndexBuffer, 'uint32');
  pass.drawIndexed(ctx.bodyNumIndices);
  pass.end();
  ctx.device.queue.submit([encoder.finish()]);
}

/**
 * Draw cloth. Copies positions from sim, then draws. viewProj from camera (row-major); we pass column-major to WGSL.
 * Call after drawBody so cloth appears in front of the mannequin.
 */
export function drawCloth(
  ctx: RenderContext,
  viewProj: Float32Array,
  positionBuffer: GPUBuffer,
  positionBufferSize: number
): void {
  const viewProjColMajor = new Float32Array(16);
  rowMajorToColumnMajor(viewProjColMajor, viewProj);
  ctx.device.queue.writeBuffer(ctx.viewProjBuffer, 0, viewProjColMajor);

  const view = ctx.context.getCurrentTexture().createView();
  const encoder = ctx.device.createCommandEncoder();
  encoder.copyBufferToBuffer(positionBuffer, 0, ctx.vertexBuffer, 0, positionBufferSize);
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view,
        loadOp: 'load',
        storeOp: 'store',
      },
    ],
  });
  pass.setPipeline(ctx.pipeline);
  pass.setBindGroup(
    0,
    ctx.device.createBindGroup({
      layout: ctx.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: ctx.viewProjBuffer } }],
    })
  );
  pass.setBindGroup(
    1,
    ctx.device.createBindGroup({
      layout: ctx.pipeline.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: ctx.cubemap.view },
        { binding: 1, resource: ctx.cubemapSampler },
        { binding: 2, resource: { buffer: ctx.pbrParamsBuffer } },
      ],
    })
  );
  pass.setVertexBuffer(0, ctx.vertexBuffer);
  pass.setIndexBuffer(ctx.indexBuffer, 'uint32');
  pass.drawIndexed(ctx.numIndices);
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

  // Save old cubemap to destroy after swap
  const oldCubemap = ctx.cubemap;
  // Atomically swap to new cubemap
  ctx.cubemap = newCubemap;
  // Destroy old texture (now safe since new cubemap is assigned)
  oldCubemap.texture.destroy();
}

export function updatePBRParams(
  ctx: RenderContext,
  roughness: number,
  metallic: number,
  ambientStrength: number,
  reflectionStrength: number
): void {
  const pbrParams = new Float32Array([roughness, metallic, ambientStrength, reflectionStrength]);
  ctx.device.queue.writeBuffer(ctx.pbrParamsBuffer, 0, pbrParams);
}
