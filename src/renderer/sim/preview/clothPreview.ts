/**
 * WebGPU cloth simulation preview for the material editor.
 * 60×45 grid, Verlet + PBD constraints (graph-colored), PBR-lite rendering, mouse drag.
 * All GPU arrays use flat f32 layout (matching skinning.wgsl pattern).
 */

import { requestGPUContext } from '../../webgpu/device';

/** Material params used by the 2D cloth preview (subset of MaterialData). */
export interface ClothPreviewMaterialParams {
  albedo: [number, number, number];
  roughness: number;
  metallic: number;
  sheen: number;
  sheenTint: number;
  subsurface: number;
  fuzziness: number;
  thickness?: number;
  opacity: number;
  texturePattern?: number;
  textureScale?: number;
  textureIntensity?: number;
  density: number;
  stretchWarp: number;
  stretchWeft: number;
  bendStiffness: number;
  drape: number;
}

import simParamsHeader from './clothPreview.simParams.wgsl?raw';
import renderParamsHeader from './clothPreview.renderParams.wgsl?raw';
import integrateSrc from './clothPreview.integrate.wgsl?raw';
import constraintSrc from './clothPreview.constraint.wgsl?raw';
import normalSrc from './clothPreview.normal.wgsl?raw';
import selfCollisionSrc from './clothPreview.selfCollision.wgsl?raw';
import applyDragSrc from './clothPreview.applyDrag.wgsl?raw';
import vertSrc from './clothPreview.vert.wgsl?raw';
import fragSrc from './clothPreview.frag.wgsl?raw';

// ── Constants ────────────────────────────────────────────────
const COLS = 60;
const ROWS = 45;
const NUM_PARTICLES = COLS * ROWS;
const SPACING = 8;
const FLOOR_Y = 580;
const CANVAS_W = 600;
const CANVAS_H = 600;
const CONSTRAINT_ITERS = 4;
const SUB_STEPS = 4;
const KIND_H = 0;
const KIND_V = 1;
const KIND_SHEAR = 2;
const KIND_BEND = 3;
const SIM_PARAMS_SIZE = 64;
const RENDER_PARAMS_SIZE = 64;
const WG_PARTICLES = Math.ceil(NUM_PARTICLES / 64);
const SELF_COLLISION_CELL_SIZE = 1.2 * SPACING;
const SELF_COLLISION_MAX_PER_CELL = 32;
const SELF_COLLISION_GRID_NUM_X = Math.ceil(CANVAS_W / SELF_COLLISION_CELL_SIZE) + 2;
const SELF_COLLISION_GRID_NUM_Y = Math.ceil((FLOOR_Y + 120) / SELF_COLLISION_CELL_SIZE) + 2;
const SELF_COLLISION_NUM_CELLS = SELF_COLLISION_GRID_NUM_X * SELF_COLLISION_GRID_NUM_Y;
const SELF_COLLISION_PARAMS_SIZE = 32;
const SELF_COLLISION_ITERS = 5;

export interface ClothPreview {
  updateMaterialParams(data: ClothPreviewMaterialParams): void;
  resetSimulation(): void;
  destroy(): void;
  canvas: HTMLCanvasElement;
}

// ── Shader error logging ─────────────────────────────────────
async function logShaderErrors(mod: GPUShaderModule, label: string): Promise<void> {
  const info = await mod.getCompilationInfo();
  for (const msg of info.messages) {
    const tag = `[clothPreview ${label}]`;
    if (msg.type === 'error') console.error(`${tag} line ${msg.lineNum}:${msg.linePos} – ${msg.message}`);
    else console.warn(`${tag} ${msg.type}: ${msg.message}`);
  }
}

// ── Data builders (pure, no GPU) ─────────────────────────────

interface ConstraintGroup { offset: number; count: number; wg: number; }

function buildInitialState(): { posData: Float32Array; pinnedData: Uint32Array } {
  const posData = new Float32Array(NUM_PARTICLES * 2);
  const pinnedData = new Uint32Array(NUM_PARTICLES);
  const startX = CANVAS_W / 2 - ((COLS - 1) * SPACING) / 2;
  const startY = 60;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const idx = r * COLS + c;
      posData[idx * 2] = startX + c * SPACING;
      posData[idx * 2 + 1] = startY + r * SPACING;
    }
  }
  pinnedData[0] = 1;
  pinnedData[COLS - 1] = 1;
  pinnedData[Math.floor(COLS / 2)] = 1;
  return { posData, pinnedData };
}

function buildConstraints(): { data: Uint8Array; total: number; groups: ConstraintGroup[] } {
  type C = { a: number; b: number; restLen: number; kind: number };
  const colorGroups: C[][] = [];
  const add = (idx: number, c: C) => {
    while (colorGroups.length <= idx) colorGroups.push([]);
    colorGroups[idx].push(c);
  };

  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS - 1; c++)
      add(c % 2, { a: r * COLS + c, b: r * COLS + c + 1, restLen: SPACING, kind: KIND_H });

  for (let r = 0; r < ROWS - 1; r++)
    for (let c = 0; c < COLS; c++)
      add(2 + (r % 2), { a: r * COLS + c, b: (r + 1) * COLS + c, restLen: SPACING, kind: KIND_V });

  for (let r = 0; r < ROWS - 1; r++)
    for (let c = 0; c < COLS - 1; c++) {
      const i = r * COLS + c;
      add(4 + (r % 2) * 2, { a: i, b: i + COLS + 1, restLen: SPACING * Math.SQRT2, kind: KIND_SHEAR });
      add(5 + (r % 2) * 2, { a: i + 1, b: i + COLS, restLen: SPACING * Math.SQRT2, kind: KIND_SHEAR });
    }

  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS - 2; c++)
      add(8 + (c % 2), { a: r * COLS + c, b: r * COLS + c + 2, restLen: SPACING * 2, kind: KIND_BEND });

  for (let r = 0; r < ROWS - 2; r++)
    for (let c = 0; c < COLS; c++)
      add(10 + (r % 2), { a: r * COLS + c, b: (r + 2) * COLS + c, restLen: SPACING * 2, kind: KIND_BEND });

  const all: C[] = [];
  const groups: ConstraintGroup[] = [];
  for (const g of colorGroups) {
    groups.push({ offset: all.length, count: g.length, wg: Math.ceil(g.length / 64) });
    for (const c of g) all.push(c);
  }

  const total = all.length;
  const buf = new ArrayBuffer(total * 16);
  const u32 = new Uint32Array(buf);
  const f32 = new Float32Array(buf);
  for (let i = 0; i < total; i++) {
    const c = all[i];
    u32[i * 4] = c.a;
    u32[i * 4 + 1] = c.b;
    f32[i * 4 + 2] = c.restLen;
    u32[i * 4 + 3] = c.kind;
  }
  return { data: new Uint8Array(buf), total, groups };
}

function buildIndices(): { indexData: Uint32Array; numIndices: number } {
  const indexData = new Uint32Array((COLS - 1) * (ROWS - 1) * 6);
  let idx = 0;
  for (let r = 0; r < ROWS - 1; r++)
    for (let c = 0; c < COLS - 1; c++) {
      const i0 = r * COLS + c;
      indexData[idx++] = i0; indexData[idx++] = i0 + 1; indexData[idx++] = i0 + COLS;
      indexData[idx++] = i0 + 1; indexData[idx++] = i0 + COLS + 1; indexData[idx++] = i0 + COLS;
    }
  return { indexData, numIndices: idx };
}

function buildUVs(): Float32Array {
  const uvData = new Float32Array(NUM_PARTICLES * 2);
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      uvData[i * 2] = c / (COLS - 1);
      uvData[i * 2 + 1] = r / (ROWS - 1);
    }
  return uvData;
}

// ── SimParams writer (reusable buffer) ───────────────────────

function createSimParamsWriter() {
  const buf = new ArrayBuffer(SIM_PARAMS_SIZE);
  const f = new Float32Array(buf);
  const i32 = new Int32Array(buf);
  const u32 = new Uint32Array(buf);

  return {
    buf,
    write(d: ClothPreviewMaterialParams, dragIdx: number, dragX: number, dragY: number, groupCount: number, groupOffset: number) {
      const dt = (1 / 60) / SUB_STEPS;
      f[0] = dt;
      f[1] = 9.8 * (0.3 + (d.density / 600) * 1.2);
      f[2] = 0.95 + d.drape * 0.03;
      f[3] = 1 - (d.stretchWeft / 100) * 0.7;
      f[4] = 1 - (d.stretchWarp / 100) * 0.7;
      f[5] = d.bendStiffness;
      i32[6] = dragIdx;
      f[7] = dragX;
      f[8] = dragY;
      u32[9] = NUM_PARTICLES;
      u32[10] = groupCount;
      u32[11] = COLS;
      f[12] = FLOOR_Y;
      u32[13] = groupOffset;
      f[14] = 0; f[15] = 0;
    },
  };
}

// ── RenderParams writer (reusable buffer) ────────────────────

function createRenderParamsWriter() {
  const buf = new ArrayBuffer(RENDER_PARAMS_SIZE);
  const f = new Float32Array(buf);
  const u32 = new Uint32Array(buf);

  return {
    buf,
    write(d: ClothPreviewMaterialParams) {
      f[0] = CANVAS_W;       f[1] = CANVAS_H;
      f[2] = d.albedo[0];    f[3] = d.albedo[1];
      f[4] = d.albedo[2];    f[5] = d.roughness;
      f[6] = d.metallic;     f[7] = d.sheen;
      f[8] = d.sheenTint;    f[9] = d.subsurface;
      f[10] = d.opacity;     f[11] = d.fuzziness;
      u32[12] = d.texturePattern ?? 0;
      f[13] = d.textureScale ?? 20;
      f[14] = d.textureIntensity ?? 0.5;
      f[15] = 0;
    },
  };
}

// ══════════════════════════════════════════════════════════════
//  Main entry
// ══════════════════════════════════════════════════════════════

export async function createClothPreview(
  canvas: HTMLCanvasElement,
  data: ClothPreviewMaterialParams,
): Promise<ClothPreview | null> {
  const gpu = await requestGPUContext(canvas);
  if (!gpu) return null;
  const { device, context, format } = gpu;

  // ── CPU data ───────────────────────────────────────────────
  const constraints = buildConstraints();
  const { indexData, numIndices } = buildIndices();
  const { posData, pinnedData } = buildInitialState();

  // ── GPU buffers ────────────────────────────────────────────
  const posBuffer = device.createBuffer({ size: NUM_PARTICLES * 2 * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC });
  device.queue.writeBuffer(posBuffer, 0, posData);

  const prevPosBuffer = device.createBuffer({ size: NUM_PARTICLES * 2 * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(prevPosBuffer, 0, posData);

  const normalBuffer = device.createBuffer({ size: NUM_PARTICLES * 3 * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX });

  const uvBuffer = device.createBuffer({ size: NUM_PARTICLES * 2 * 4, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(uvBuffer, 0, buildUVs());

  const pinnedBuffer = device.createBuffer({ size: NUM_PARTICLES * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(pinnedBuffer, 0, pinnedData);

  const constraintBuffer = device.createBuffer({ size: constraints.total * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(constraintBuffer, 0, constraints.data);

  const indexBuffer = device.createBuffer({ size: indexData.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(indexBuffer, 0, indexData);

  const readbackBuffer = device.createBuffer({ size: NUM_PARTICLES * 2 * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });

  // ── Self collision: spatial hash grid ──────────────────────
  const gridCountBuffer = device.createBuffer({
    size: SELF_COLLISION_NUM_CELLS * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const gridDataBuffer = device.createBuffer({
    size: SELF_COLLISION_NUM_CELLS * SELF_COLLISION_MAX_PER_CELL * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const selfCollisionParamsBuffer = device.createBuffer({
    size: SELF_COLLISION_PARAMS_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const posCopyBuffer = device.createBuffer({
    size: NUM_PARTICLES * 2 * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  });

  // ── Per-group simParams buffers (pre-baked, avoids per-frame writeBuffer interleaving) ──
  const integrateParamsBuffer = device.createBuffer({ size: SIM_PARAMS_SIZE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const groupParamsBuffers = constraints.groups.map(() =>
    device.createBuffer({ size: SIM_PARAMS_SIZE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
  );
  const renderParamsBuffer = device.createBuffer({ size: RENDER_PARAMS_SIZE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

  // ── Shader modules ─────────────────────────────────────────
  const modules = {
    integrate: device.createShaderModule({ code: simParamsHeader + integrateSrc }),
    constraint: device.createShaderModule({ code: simParamsHeader + constraintSrc }),
    normal: device.createShaderModule({ code: simParamsHeader + normalSrc }),
    selfCollision: device.createShaderModule({ code: selfCollisionSrc }),
    applyDrag: device.createShaderModule({ code: simParamsHeader + applyDragSrc }),
    vert: device.createShaderModule({ code: renderParamsHeader + vertSrc }),
    frag: device.createShaderModule({ code: renderParamsHeader + fragSrc }),
  };
  await Promise.all(Object.entries(modules).map(([k, m]) => logShaderErrors(m, k)));

  // ── Compute pipelines ──────────────────────────────────────
  const integratePipeline = device.createComputePipeline({ layout: 'auto', compute: { module: modules.integrate, entryPoint: 'main' } });
  const constraintPipeline = device.createComputePipeline({ layout: 'auto', compute: { module: modules.constraint, entryPoint: 'main' } });
  const normalPipeline = device.createComputePipeline({ layout: 'auto', compute: { module: modules.normal, entryPoint: 'main' } });
  const applyDragPipeline = device.createComputePipeline({ layout: 'auto', compute: { module: modules.applyDrag, entryPoint: 'main' } });
  const [clearGridPipeline, scatterPipeline, resolvePipeline] = await Promise.all([
    device.createComputePipelineAsync({ layout: 'auto', compute: { module: modules.selfCollision, entryPoint: 'clearGrid' } }),
    device.createComputePipelineAsync({ layout: 'auto', compute: { module: modules.selfCollision, entryPoint: 'scatter' } }),
    device.createComputePipelineAsync({ layout: 'auto', compute: { module: modules.selfCollision, entryPoint: 'resolve' } }),
  ]);

  // ── Bind groups ────────────────────────────────────────────
  const integrateBG = device.createBindGroup({
    layout: integratePipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: posBuffer } },
      { binding: 1, resource: { buffer: prevPosBuffer } },
      { binding: 2, resource: { buffer: pinnedBuffer } },
      { binding: 3, resource: { buffer: integrateParamsBuffer } },
    ],
  });
  const applyDragBG = device.createBindGroup({
    layout: applyDragPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: posBuffer } },
      { binding: 1, resource: { buffer: prevPosBuffer } },
      { binding: 2, resource: { buffer: integrateParamsBuffer } },
    ],
  });

  const constraintBGs = groupParamsBuffers.map(paramsBuf =>
    device.createBindGroup({
      layout: constraintPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: posBuffer } },
        { binding: 1, resource: { buffer: pinnedBuffer } },
        { binding: 2, resource: { buffer: constraintBuffer } },
        { binding: 3, resource: { buffer: paramsBuf } },
      ],
    })
  );

  const normalBG = device.createBindGroup({
    layout: normalPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: posBuffer } },
      { binding: 1, resource: { buffer: normalBuffer } },
      { binding: 2, resource: { buffer: integrateParamsBuffer } },
    ],
  });

  const clearGridBG = device.createBindGroup({
    layout: clearGridPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: gridCountBuffer } },
      { binding: 1, resource: { buffer: selfCollisionParamsBuffer } },
    ],
  });
  const scatterBG = device.createBindGroup({
    layout: scatterPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: gridCountBuffer } },
      { binding: 1, resource: { buffer: gridDataBuffer } },
      { binding: 2, resource: { buffer: posBuffer } },
      { binding: 3, resource: { buffer: selfCollisionParamsBuffer } },
    ],
  });
  const resolveBG_readCopy_writePos = device.createBindGroup({
    layout: resolvePipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: gridCountBuffer } },
      { binding: 1, resource: { buffer: gridDataBuffer } },
      { binding: 2, resource: { buffer: posCopyBuffer } },
      { binding: 3, resource: { buffer: posBuffer } },
      { binding: 4, resource: { buffer: pinnedBuffer } },
      { binding: 5, resource: { buffer: selfCollisionParamsBuffer } },
    ],
  });
  const resolveBG_readPos_writeCopy = device.createBindGroup({
    layout: resolvePipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: gridCountBuffer } },
      { binding: 1, resource: { buffer: gridDataBuffer } },
      { binding: 2, resource: { buffer: posBuffer } },
      { binding: 3, resource: { buffer: posCopyBuffer } },
      { binding: 4, resource: { buffer: pinnedBuffer } },
      { binding: 5, resource: { buffer: selfCollisionParamsBuffer } },
    ],
  });

  // ── Render pipeline + bind group ───────────────────────────
  const renderPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: modules.vert,
      entryPoint: 'main',
      buffers: [
        { arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' as GPUVertexFormat }] },
        { arrayStride: 12, attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x3' as GPUVertexFormat }] },
        { arrayStride: 8, attributes: [{ shaderLocation: 2, offset: 0, format: 'float32x2' as GPUVertexFormat }] },
      ],
    },
    fragment: {
      module: modules.frag,
      entryPoint: 'main',
      targets: [{
        format,
        blend: {
          color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        },
      }],
    },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
  });

  const renderBG = device.createBindGroup({
    layout: renderPipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: renderParamsBuffer } }],
  });

  // ── Mutable state ──────────────────────────────────────────
  let running = true;
  let dragIndex = -1;
  let dragTargetX = 0;
  let dragTargetY = 0;
  let cpuPositions = new Float32Array(posData);
  let readbackPending = false;
  let frameCount = 0;

  const simWriter = createSimParamsWriter();
  const renderWriter = createRenderParamsWriter();

  function uploadAllSimParams(d: ClothPreviewMaterialParams): void {
    simWriter.write(d, dragIndex, dragTargetX, dragTargetY, constraints.total, 0);
    device.queue.writeBuffer(integrateParamsBuffer, 0, simWriter.buf);

    for (let i = 0; i < constraints.groups.length; i++) {
      const g = constraints.groups[i];
      if (g.count === 0) continue;
      simWriter.write(d, dragIndex, dragTargetX, dragTargetY, g.count, g.offset);
      device.queue.writeBuffer(groupParamsBuffers[i], 0, simWriter.buf);
    }

    const thickness = d.thickness ?? 0.5;
    const rawRadius = SPACING * (0.2 + thickness * 0.4);
    const collisionRadius = Math.min(rawRadius, SPACING * 0.45);
    const scParams = new ArrayBuffer(SELF_COLLISION_PARAMS_SIZE);
    const scF32 = new Float32Array(scParams);
    const scU32 = new Uint32Array(scParams);
    scF32[0] = collisionRadius;
    scF32[1] = SELF_COLLISION_CELL_SIZE;
    scU32[2] = SELF_COLLISION_GRID_NUM_X;
    scU32[3] = SELF_COLLISION_GRID_NUM_Y;
    scU32[4] = NUM_PARTICLES;
    device.queue.writeBuffer(selfCollisionParamsBuffer, 0, scParams);
  }

  function uploadRenderParams(d: ClothPreviewMaterialParams): void {
    renderWriter.write(d);
    device.queue.writeBuffer(renderParamsBuffer, 0, renderWriter.buf);
  }

  function frame(): void {
    if (!running) return;

    uploadAllSimParams(data);
    uploadRenderParams(data);

    const enc = device.createCommandEncoder();

    if (dragIndex >= 0) {
      const dragPass = enc.beginComputePass();
      dragPass.setPipeline(applyDragPipeline);
      dragPass.setBindGroup(0, applyDragBG);
      dragPass.dispatchWorkgroups(1);
      dragPass.end();
    }

    for (let s = 0; s < SUB_STEPS; s++) {
      const intPass = enc.beginComputePass();
      intPass.setPipeline(integratePipeline);
      intPass.setBindGroup(0, integrateBG);
      intPass.dispatchWorkgroups(WG_PARTICLES);
      intPass.end();

      for (let it = 0; it < CONSTRAINT_ITERS; it++) {
        for (let gi = 0; gi < constraints.groups.length; gi++) {
          const g = constraints.groups[gi];
          if (g.count === 0) continue;
          const cPass = enc.beginComputePass();
          cPass.setPipeline(constraintPipeline);
          cPass.setBindGroup(0, constraintBGs[gi]);
          cPass.dispatchWorkgroups(g.wg);
          cPass.end();
        }
      }

      const clearPass = enc.beginComputePass();
      clearPass.setPipeline(clearGridPipeline);
      clearPass.setBindGroup(0, clearGridBG);
      clearPass.dispatchWorkgroups(Math.ceil(SELF_COLLISION_NUM_CELLS / 64));
      clearPass.end();

      const scatterPass = enc.beginComputePass();
      scatterPass.setPipeline(scatterPipeline);
      scatterPass.setBindGroup(0, scatterBG);
      scatterPass.dispatchWorkgroups(WG_PARTICLES);
      scatterPass.end();

      enc.copyBufferToBuffer(posBuffer, 0, posCopyBuffer, 0, NUM_PARTICLES * 2 * 4);

      for (let it = 0; it < SELF_COLLISION_ITERS; it++) {
        const resolvePass = enc.beginComputePass();
        resolvePass.setPipeline(resolvePipeline);
        resolvePass.setBindGroup(0, it % 2 === 0 ? resolveBG_readCopy_writePos : resolveBG_readPos_writeCopy);
        resolvePass.dispatchWorkgroups(WG_PARTICLES);
        resolvePass.end();
      }

      if (SELF_COLLISION_ITERS % 2 === 0) {
        enc.copyBufferToBuffer(posCopyBuffer, 0, posBuffer, 0, NUM_PARTICLES * 2 * 4);
      }
    }

    const nPass = enc.beginComputePass();
    nPass.setPipeline(normalPipeline);
    nPass.setBindGroup(0, normalBG);
    nPass.dispatchWorkgroups(WG_PARTICLES);
    nPass.end();

    frameCount++;
    if (frameCount % 10 === 0 && !readbackPending) {
      readbackPending = true;
      enc.copyBufferToBuffer(posBuffer, 0, readbackBuffer, 0, NUM_PARTICLES * 2 * 4);
    }

    const renderPass = enc.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        clearValue: { r: 0.102, g: 0.102, b: 0.102, a: 1.0 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });
    renderPass.setPipeline(renderPipeline);
    renderPass.setBindGroup(0, renderBG);
    renderPass.setVertexBuffer(0, posBuffer);
    renderPass.setVertexBuffer(1, normalBuffer);
    renderPass.setVertexBuffer(2, uvBuffer);
    renderPass.setIndexBuffer(indexBuffer, 'uint32');
    renderPass.drawIndexed(numIndices);
    renderPass.end();

    device.queue.submit([enc.finish()]);

    if (readbackPending) {
      readbackBuffer.mapAsync(GPUMapMode.READ).then(() => {
        if (!running) { readbackPending = false; return; }
        cpuPositions.set(new Float32Array(readbackBuffer.getMappedRange()));
        readbackBuffer.unmap();
        readbackPending = false;
      }).catch(() => { readbackPending = false; });
    }

    requestAnimationFrame(frame);
  }

  function getCanvasCoords(e: MouseEvent): [number, number] {
    const rect = canvas.getBoundingClientRect();
    return [
      (e.clientX - rect.left) * (canvas.width / rect.width),
      (e.clientY - rect.top) * (canvas.height / rect.height),
    ];
  }

  function findNearestParticle(mx: number, my: number): number {
    let bestIdx = -1;
    let bestDist = 900;
    for (let i = 0; i < NUM_PARTICLES; i++) {
      const dx = cpuPositions[i * 2] - mx;
      const dy = cpuPositions[i * 2 + 1] - my;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDist) { bestDist = d2; bestIdx = i; }
    }
    return bestIdx;
  }

  const onMouseDown = (e: MouseEvent) => {
    const [mx, my] = getCanvasCoords(e);
    dragIndex = findNearestParticle(mx, my);
    if (dragIndex >= 0) { dragTargetX = mx; dragTargetY = my; }
  };
  const onMouseMove = (e: MouseEvent) => {
    if (dragIndex < 0) return;
    const [mx, my] = getCanvasCoords(e);
    dragTargetX = mx; dragTargetY = my;
  };
  const onMouseUp = () => { dragIndex = -1; };

  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('mouseleave', onMouseUp);

  const touchToMouse = (e: TouchEvent): MouseEvent => {
    const touch = e.touches[0] ?? e.changedTouches[0];
    return { clientX: touch.clientX, clientY: touch.clientY } as MouseEvent;
  };
  const onTouchStart = (e: TouchEvent) => { e.preventDefault(); onMouseDown(touchToMouse(e)); };
  const onTouchMove = (e: TouchEvent) => { e.preventDefault(); onMouseMove(touchToMouse(e)); };
  const onTouchEnd = () => { onMouseUp(); };
  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd);
  canvas.addEventListener('touchcancel', onTouchEnd);

  uploadAllSimParams(data);
  uploadRenderParams(data);
  requestAnimationFrame(frame);

  const allBuffers = [
    posBuffer, prevPosBuffer, normalBuffer, uvBuffer, pinnedBuffer,
    constraintBuffer, indexBuffer, readbackBuffer,
    gridCountBuffer, gridDataBuffer, selfCollisionParamsBuffer, posCopyBuffer,
    integrateParamsBuffer, renderParamsBuffer, ...groupParamsBuffers,
  ];

  return {
    canvas,
    updateMaterialParams(d: ClothPreviewMaterialParams) { Object.assign(data, d); },
    resetSimulation() {
      const { posData: newPos } = buildInitialState();
      device.queue.writeBuffer(posBuffer, 0, newPos);
      device.queue.writeBuffer(prevPosBuffer, 0, newPos);
      cpuPositions = new Float32Array(newPos);
      dragIndex = -1;
    },
    destroy() {
      running = false;
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('mouseleave', onMouseUp);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('touchcancel', onTouchEnd);
      for (const b of allBuffers) b.destroy();
      device.destroy();
    },
  };
}
