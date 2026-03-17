/**
 * 3D cloth simulation on the mannequin using WebGPU compute shaders.
 *
 * Algorithm: Verlet integration + graph-colored PBD distance constraints
 *            + capsule body collision + floor constraint.
 *
 * Positions and normals are stored as flat f32 arrays (stride 3) so the same
 * GPU buffers can be used as VERTEX buffers for rendering (arrayStride=12,
 * format='float32x3'), matching the body mesh pipeline layout.
 */

import simParamsHeader  from './cloth3d.simParams.wgsl?raw';
import integrateSrc     from './cloth3d.integrate.wgsl?raw';
import constraintSrc    from './cloth3d.constraint.wgsl?raw';
import normalSrc        from './cloth3d.normal.wgsl?raw';
import collideSrc       from './cloth3d.collide.wgsl?raw';
import shClearSrc       from './cloth3d.sh.clear.wgsl?raw';
import shCountSrc       from './cloth3d.sh.count.wgsl?raw';
import shPrefixSrc      from './cloth3d.sh.prefix.wgsl?raw';
import shScatterSrc     from './cloth3d.sh.scatter.wgsl?raw';
import shQuerySrc       from './cloth3d.sh.query.wgsl?raw';

// Pure CPU data-building functions (no GPU/WGSL deps) — importable in tests.
import {
  KIND_H, KIND_V, KIND_SHEAR, KIND_BEND, KIND_SEAM,
  SUB_STEPS,
  buildConstraints, buildInitialPositions, buildIndices,
  writeSimParams, writeCollideParams,
  type ConstraintGroup,
} from './cloth3d.builders';
export type { Cloth3DConfig, Cloth3DMaterialParams } from './cloth3d.builders';

import { buildBodySDF } from './cloth3d.sdf';

// ── Simulation constants (GPU-side only) ─────────────────────────────────────
const SIM_PARAMS_SIZE     = 96;  // bytes — 24 × f32/u32 (last 8 = XPBD alphaTilde fields)
const COLLIDE_PARAMS_SIZE = 48;  // bytes — 12 × f32/u32 (includes SDF bounds)
const CONSTRAINT_ITERS    = 4;   // PBD iterations per substep
const PBR_BUFFER_SIZE     = 32;  // bytes — 8 × f32

// ── Spatial-hash constants ────────────────────────────────────────────────────
// Grid covers [-0.5, -0.1, -0.5] to [0.54, 1.98, 0.54] at 4cm cell resolution.
const SH_CELL_SIZE  = 0.04;                         // metres
const SH_ORIGIN     = [-0.5, -0.1, -0.5] as const;  // world-space grid origin
const SH_GRID_W     = 26;                            // cells in X  (1.04 m)
const SH_GRID_H     = 52;                            // cells in Y  (2.08 m)
const SH_GRID_D     = 26;                            // cells in Z  (1.04 m)
const SH_NUM_CELLS  = SH_GRID_W * SH_GRID_H * SH_GRID_D; // 35 152
const SH_PARAMS_SIZE = 64;                           // bytes — 16 × 4

// Cloth3DConfig and Cloth3DMaterialParams are re-exported from cloth3d.builders.ts
import type { Cloth3DConfig, Cloth3DMaterialParams } from './cloth3d.builders';

/** Render-relevant GPU buffers exposed to the pipeline. */
export interface Cloth3DRenderData {
  posBuffer:         GPUBuffer;      // float32x3 per particle, used as vertex buffer
  normalBuffer:      GPUBuffer;      // float32x3 per particle, used as vertex buffer
  indexBuffer:       GPUBuffer;      // uint32 triangle indices
  numIndices:        number;
  colorBuffer:       GPUBuffer;      // vec4f: albedo.rgb + opacity
  pbrBuffer:         GPUBuffer;      // PBRParams: roughness, metallic, ambStr, reflStr, camXYZ, useTexture
  /** Uniform: cols(u32), rows(u32), 2×pad. Vertex shader computes UV from vertex_index using this. */
  gridInfoBuffer:    GPUBuffer;
  /** View of the albedo texture (default: 1×1 white). Replaced by setAlbedoTexture(). */
  albedoTextureView: GPUTextureView;
  /** Sampler for the albedo texture (linear filter). */
  albedoSamplerObj:  GPUSampler;
}

export interface Cloth3DInstance extends Cloth3DRenderData {
  /** Run one simulation frame (SUB_STEPS × integrate+constraint+collide). */
  step(): void;
  /** Update camera position in pbrBuffer so cloth lighting is correct. */
  updateCameraPos(eye: [number, number, number]): void;
  /** Hot-swap material appearance and physics without recreating the mesh. */
  updateMaterialParams(params: Cloth3DMaterialParams): void;
  /**
   * Set wind force applied every integrate step.
   * @param dir      Unit vector in world space (e.g. [1,0,0] = +X / right).
   * @param strength Force magnitude in m/s² (0 = no wind; 20 ≈ strong wind).
   */
  setWind(dir: [number, number, number], strength: number): void;
  /**
   * Rebuild collision capsule endpoints from live SMPL skeleton joint positions.
   * Call every frame when IK is enabled so the cloth reacts to pose changes.
   * @param joints World-space positions of all SMPL joints (standard 24-joint order).
   */
  updateCapsulesFromJoints(joints: ReadonlyArray<readonly [number, number, number]>): void;
  /**
   * Change simulation quality at runtime.
   * @param substeps       Physics substeps per animation frame (2=Low, 4=Med, 8=High).
   * @param constraintIters PBD constraint iterations per substep (2–4 typical).
   */
  setQuality(substeps: number, constraintIters: number): void;
  /**
   * Read back current cloth positions + normals from GPU and emit an OBJ string.
   * Async because it waits for GPU buffer mapping.
   */
  exportMeshOBJ(): Promise<string>;
  /**
   * Replace the cloth albedo texture with an externally-created GPUTexture.
   * Enables texture modulation in the fragment shader (useTexture = 1).
   * The caller is responsible for destroying the old texture when done.
   */
  setAlbedoTexture(texture: GPUTexture, sampler: GPUSampler): void;
  /** Revert to the default 1×1 white texture (disables texture modulation). */
  clearAlbedoTexture(): void;
  /** Reset particles to initial positions (also resets draping progress). */
  reset(): void;
  destroy(): void;
  /** True while seam constraints are still tightening (flatPanel draping in progress). */
  readonly isDraping: boolean;
  /** 0 = draping just started, 1 = draping complete. Always 1 for non-flatPanel configs. */
  readonly drapingProgress: number;
}

// ── Param writers (GPU-dependent) ────────────────────────────────────────────

function writePBR(
  device: GPUDevice, pbrBuf: GPUBuffer,
  d: Cloth3DMaterialParams,
  eye: [number, number, number],
  useTexture = false,
): void {
  const roughness   = d.roughness;
  const metallic    = d.metallic;
  const ambStr      = 1.0;
  const reflStr     = Math.max(1 - roughness, 0.05) * (0.3 + metallic * 0.7);
  device.queue.writeBuffer(pbrBuf, 0,
    new Float32Array([roughness, metallic, ambStr, reflStr, eye[0], eye[1], eye[2], useTexture ? 1 : 0]));
}

function writeColor(device: GPUDevice, colorBuf: GPUBuffer, d: Cloth3DMaterialParams): void {
  device.queue.writeBuffer(colorBuf, 0,
    new Float32Array([d.albedo[0], d.albedo[1], d.albedo[2], d.opacity]));
}

// ── Shader error logging ──────────────────────────────────────────────────────

async function logShaderErrors(mod: GPUShaderModule, label: string): Promise<void> {
  const info = await mod.getCompilationInfo();
  let hasError = false;
  for (const msg of info.messages) {
    const tag = `[cloth3d ${label}]`;
    if (msg.type === 'error') { console.error(`${tag} line ${msg.lineNum}: ${msg.message}`); hasError = true; }
    else                        console.warn(`${tag} ${msg.type}: ${msg.message}`);
  }
  if (hasError) throw new Error(`[cloth3d] Shader "${label}" failed to compile — see errors above`);
}

// ══════════════════════════════════════════════════════════════════════════════
//  Factory
// ══════════════════════════════════════════════════════════════════════════════

export async function createCloth3D(
  device: GPUDevice,
  config: Cloth3DConfig,
  params: Cloth3DMaterialParams,
  bodyMesh?: { positions: Float32Array; indices: Uint32Array } | null,
): Promise<Cloth3DInstance | null> {
  const { rows, cols, spacing } = config;
  // Total particle count: two-panel mode has 2 × rows × cols particles.
  const N = rows * cols * (config.twoPanel ? 2 : 1);
  const WG = Math.ceil(N / 64);

  // ── CPU data ──────────────────────────────────────────────────────────────
  const constraints = buildConstraints(
    rows, cols, spacing,
    config.twoPanel, config.flatPanel, config.radius,
    config.activeMask,
  );
  const { indexData, numIndices } = buildIndices(rows, cols, config.twoPanel, config.activeMask);
  const { posData, pinnedData }   = buildInitialPositions(config);

  // Build SDF from body mesh for accurate body-shape collision
  const sdf = bodyMesh ? buildBodySDF(bodyMesh.positions, bodyMesh.indices) : null;

  // ── GPU buffers ───────────────────────────────────────────────────────────
  const mk = (size: number, usage: number) => device.createBuffer({ size, usage });
  const STORAGE_VERTEX = GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
  const STORAGE_RW     = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
  const STORAGE_R      = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
  const UNIFORM        = GPUBufferUsage.UNIFORM  | GPUBufferUsage.COPY_DST;
  const INDEX          = GPUBufferUsage.INDEX    | GPUBufferUsage.COPY_DST;

  const posBuffer      = mk(N * 3 * 4, STORAGE_VERTEX);
  const prevPosBuffer  = mk(N * 3 * 4, STORAGE_RW);
  const normalBuffer   = mk(N * 3 * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_SRC);
  const pinnedBuffer   = mk(N * 4,     STORAGE_R);
  const constraintBuf  = mk(constraints.total * 16, STORAGE_R);
  // XPBD: one f32 lambda per constraint, reset to 0 at start of each substep
  const lambdaBuf      = mk(Math.max(constraints.total * 4, 4), STORAGE_RW);
  const indexBuffer    = mk(indexData.byteLength, INDEX);

  // SDF body collision texture (r32float 3-D)
  const sdfTexture = (() => {
    if (sdf) {
      const tex = device.createTexture({
        size:      [sdf.gridW, sdf.gridH, sdf.gridD],
        format:    'r32float',
        dimension: '3d',
        usage:     GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });
      device.queue.writeTexture(
        { texture: tex },
        sdf.data,
        { bytesPerRow: sdf.gridW * 4, rowsPerImage: sdf.gridH },
        [sdf.gridW, sdf.gridH, sdf.gridD],
      );
      return tex;
    }
    // Fallback: 64×1×1 all-positive SDF → no body collision
    const tex = device.createTexture({
      size: [64, 1, 1], format: 'r32float', dimension: '3d',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    device.queue.writeTexture(
      { texture: tex },
      new Float32Array(64).fill(1.0),
      { bytesPerRow: 256, rowsPerImage: 1 },
      [64, 1, 1],
    );
    return tex;
  })();
  const colorBuffer    = mk(16,  UNIFORM);
  const pbrBuffer      = mk(PBR_BUFFER_SIZE, UNIFORM);

  // Grid info: {cols, rows, 0, 0} — vertex shader uses this to compute UV from vertex_index
  const gridInfoBuffer = mk(16, UNIFORM);
  device.queue.writeBuffer(gridInfoBuffer, 0, new Uint32Array([cols, rows, 0, 0]));

  // Default 1×1 white texture used when no albedo image is uploaded
  const defaultAlbedoTexture = device.createTexture({
    size: [1, 1, 1],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture(
    { texture: defaultAlbedoTexture },
    new Uint8Array([255, 255, 255, 255]),
    { bytesPerRow: 4 },
    [1, 1, 1],
  );
  const defaultAlbedoView = defaultAlbedoTexture.createView();
  const albedoSamplerObj  = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });

  // One simParams buffer for integration/normal; one per constraint color group
  const intParamsBuf = mk(SIM_PARAMS_SIZE, UNIFORM);
  const normParamsBuf = mk(SIM_PARAMS_SIZE, UNIFORM);
  const groupParamsBufs = constraints.groups.map(() => mk(SIM_PARAMS_SIZE, UNIFORM));

  const collideParamsBuf = mk(COLLIDE_PARAMS_SIZE, UNIFORM);

  // Spatial-hash buffers
  const shParamsBuf        = mk(SH_PARAMS_SIZE,    UNIFORM);
  const shCellCountBuf     = mk(SH_NUM_CELLS * 4,  STORAGE_RW);
  const shScatterSlotBuf   = mk(SH_NUM_CELLS * 4,  STORAGE_RW);
  const shParticleCellBuf  = mk(Math.max(N * 4, 4), STORAGE_RW);
  const shSortedBuf        = mk(Math.max(N * 4, 4), STORAGE_RW);

  // Write SHParams uniform (static — grid layout doesn't change)
  {
    const sh  = new Float32Array(SH_PARAMS_SIZE / 4);
    const shu = new Uint32Array(sh.buffer);
    shu[0] = N;             // numParticles
    shu[1] = SH_NUM_CELLS;  // numCells
    shu[2] = SH_GRID_W;     // gridW
    shu[3] = SH_GRID_H;     // gridH
    shu[4] = SH_GRID_D;     // gridD
    // shu[5..7] = pad (0)
    sh[8]  = SH_ORIGIN[0];  // originX
    sh[9]  = SH_ORIGIN[1];  // originY
    sh[10] = SH_ORIGIN[2];  // originZ
    sh[11] = SH_CELL_SIZE;  // cellSize
    sh[12] = 0.008;         // thickness (8 mm — 2× cloth offset)
    device.queue.writeBuffer(shParamsBuf, 0, sh);
  }

  // Upload static data
  device.queue.writeBuffer(posBuffer,     0, posData);
  device.queue.writeBuffer(prevPosBuffer, 0, posData);
  device.queue.writeBuffer(pinnedBuffer,  0, pinnedData);
  device.queue.writeBuffer(constraintBuf, 0, constraints.data);
  device.queue.writeBuffer(indexBuffer,   0, indexData);

  // Upload material-derived dynamic data
  const simF32 = new Float32Array(SIM_PARAMS_SIZE / 4);
  const simU32 = new Uint32Array(simF32.buffer);
  const colF32 = new Float32Array(COLLIDE_PARAMS_SIZE / 4);
  const colU32 = new Uint32Array(colF32.buffer);

  function uploadAllParams(d: Cloth3DMaterialParams, wind: [number, number, number] = [0, 0, 0], windStrength = 0): void {
    writeSimParams(simF32, simU32, d, N, 0, rows, cols, N, wind, windStrength);
    device.queue.writeBuffer(intParamsBuf, 0, simF32);
    device.queue.writeBuffer(normParamsBuf, 0, simF32);
    for (let gi = 0; gi < constraints.groups.length; gi++) {
      const g = constraints.groups[gi];
      if (g.count === 0) continue;
      writeSimParams(simF32, simU32, d, g.count, g.offset, rows, cols, N, wind, windStrength);
      device.queue.writeBuffer(groupParamsBufs[gi], 0, simF32);
    }
    writeCollideParams(colU32, colF32, N, sdf);
    device.queue.writeBuffer(collideParamsBuf, 0, colF32);
  }

  uploadAllParams(params);
  writeColor(device, colorBuffer, params);
  writePBR(device, pbrBuffer, params, [0, 1, 3]);

  // ── Shader modules ────────────────────────────────────────────────────────
  const mk_mod = (src: string) => device.createShaderModule({ code: src });
  const mods = {
    integrate:  mk_mod(simParamsHeader + integrateSrc),
    constraint: mk_mod(simParamsHeader + constraintSrc),
    normal:     mk_mod(simParamsHeader + normalSrc),
    collide:    mk_mod(collideSrc),
    shClear:    mk_mod(shClearSrc),
    shCount:    mk_mod(shCountSrc),
    shPrefix:   mk_mod(shPrefixSrc),
    shScatter:  mk_mod(shScatterSrc),
    shQuery:    mk_mod(shQuerySrc),
  };
  await Promise.all([
    logShaderErrors(mods.integrate,  'integrate'),
    logShaderErrors(mods.constraint, 'constraint'),
    logShaderErrors(mods.normal,     'normal'),
    logShaderErrors(mods.collide,    'collide'),
    logShaderErrors(mods.shClear,    'sh.clear'),
    logShaderErrors(mods.shCount,    'sh.count'),
    logShaderErrors(mods.shPrefix,   'sh.prefix'),
    logShaderErrors(mods.shScatter,  'sh.scatter'),
    logShaderErrors(mods.shQuery,    'sh.query'),
  ]);

  // ── Compute pipelines ─────────────────────────────────────────────────────
  device.pushErrorScope('validation');
  const integratePipeline  = device.createComputePipeline({ layout: 'auto', compute: { module: mods.integrate,  entryPoint: 'main' } });
  const constraintPipeline = device.createComputePipeline({ layout: 'auto', compute: { module: mods.constraint, entryPoint: 'main' } });
  const normalPipeline     = device.createComputePipeline({ layout: 'auto', compute: { module: mods.normal,     entryPoint: 'main' } });
  const collidePipeline    = device.createComputePipeline({ layout: 'auto', compute: { module: mods.collide,    entryPoint: 'main' } });
  const shClearPipeline    = device.createComputePipeline({ layout: 'auto', compute: { module: mods.shClear,    entryPoint: 'main' } });
  const shCountPipeline    = device.createComputePipeline({ layout: 'auto', compute: { module: mods.shCount,    entryPoint: 'main' } });
  const shPrefixPipeline   = device.createComputePipeline({ layout: 'auto', compute: { module: mods.shPrefix,   entryPoint: 'main' } });
  const shScatterPipeline  = device.createComputePipeline({ layout: 'auto', compute: { module: mods.shScatter,  entryPoint: 'main' } });
  const shQueryPipeline    = device.createComputePipeline({ layout: 'auto', compute: { module: mods.shQuery,    entryPoint: 'main' } });
  { const e = await device.popErrorScope(); if (e) throw new Error(`[cloth3d] Pipeline creation failed: ${e.message}`); }

  // ── Bind groups ───────────────────────────────────────────────────────────
  device.pushErrorScope('validation');
  const integrateBG = device.createBindGroup({
    layout: integratePipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: posBuffer } },
      { binding: 1, resource: { buffer: prevPosBuffer } },
      { binding: 2, resource: { buffer: pinnedBuffer } },
      { binding: 3, resource: { buffer: intParamsBuf } },
    ],
  });

  const constraintBGs = groupParamsBufs.map(paramsBuf =>
    device.createBindGroup({
      layout: constraintPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: posBuffer } },
        { binding: 1, resource: { buffer: pinnedBuffer } },
        { binding: 2, resource: { buffer: constraintBuf } },
        { binding: 3, resource: { buffer: paramsBuf } },
        { binding: 4, resource: { buffer: lambdaBuf } },
      ],
    })
  );

  const normalBG = device.createBindGroup({
    layout: normalPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: posBuffer } },
      { binding: 1, resource: { buffer: normalBuffer } },
      { binding: 2, resource: { buffer: normParamsBuf } },
    ],
  });

  const collideBG = device.createBindGroup({
    layout: collidePipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: posBuffer } },
      { binding: 1, resource: { buffer: pinnedBuffer } },
      { binding: 2, resource: sdfTexture.createView({ dimension: '3d' }) },
      { binding: 3, resource: { buffer: collideParamsBuf } },
    ],
  });

  // Spatial-hash bind groups (one per pass)
  const shClearBG = device.createBindGroup({
    layout: shClearPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: shCellCountBuf } },
      { binding: 1, resource: { buffer: shParamsBuf } },
    ],
  });
  const shCountBG = device.createBindGroup({
    layout: shCountPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: posBuffer } },
      { binding: 1, resource: { buffer: shCellCountBuf } },
      { binding: 2, resource: { buffer: shParticleCellBuf } },
      { binding: 3, resource: { buffer: shParamsBuf } },
    ],
  });
  const shPrefixBG = device.createBindGroup({
    layout: shPrefixPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: shCellCountBuf } },
      { binding: 1, resource: { buffer: shScatterSlotBuf } },
      { binding: 2, resource: { buffer: shParamsBuf } },
    ],
  });
  const shScatterBG = device.createBindGroup({
    layout: shScatterPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: shParticleCellBuf } },
      { binding: 1, resource: { buffer: shScatterSlotBuf } },
      { binding: 2, resource: { buffer: shSortedBuf } },
      { binding: 3, resource: { buffer: shParamsBuf } },
    ],
  });
  const shQueryBG = device.createBindGroup({
    layout: shQueryPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: posBuffer } },
      { binding: 1, resource: { buffer: pinnedBuffer } },
      { binding: 3, resource: { buffer: shParamsBuf } },
      { binding: 4, resource: { buffer: shCellCountBuf } },
      { binding: 5, resource: { buffer: shScatterSlotBuf } },
      { binding: 6, resource: { buffer: shSortedBuf } },
    ],
  });
  { const e = await device.popErrorScope(); if (e) throw new Error(`[cloth3d] Bind group creation failed: ${e.message}`); }

  // ── Initialize normals from initial positions (before first step) ──────────
  {
    const enc = device.createCommandEncoder();
    const normPass = enc.beginComputePass();
    normPass.setPipeline(normalPipeline);
    normPass.setBindGroup(0, normalBG);
    normPass.dispatchWorkgroups(WG);
    normPass.end();
    device.queue.submit([enc.finish()]);
  }

  // ── Mutable state ─────────────────────────────────────────────────────────
  let currentParams = { ...params };
  let currentEye: [number, number, number] = [0, 1, 3];
  let currentWind: [number, number, number] = [0, 0, 0];
  let currentWindStrength = 0;
  let subSteps = SUB_STEPS;
  let constraintIters = CONSTRAINT_ITERS;
  let currentUseTexture  = false;
  let currentAlbedoView: GPUTextureView  = defaultAlbedoView;
  let currentAlbedoSampler: GPUSampler   = albedoSamplerObj;

  // ── Progressive seam tightening state (flatPanel mode) ───────────────────
  const initialSeamRestLen = constraints.initialSeamRestLen;
  let   seamRestLen        = initialSeamRestLen;
  // Seam constraint groups are always 12 and 13 for twoPanel.
  const g12 = constraints.groups[12];
  const g13 = constraints.groups[13];
  const seamF32 = initialSeamRestLen > 0 ? new Float32Array(constraints.data.buffer) : null;

  function progressSeams(): void {
    if (!seamF32 || seamRestLen <= 0) return;
    seamRestLen = seamRestLen * 0.975 < 0.001 ? 0 : seamRestLen * 0.975;
    // Update restLen (byte offset 8 per constraint → f32 index offset 2)
    for (const g of [g12, g13]) {
      if (!g) continue;
      for (let k = 0; k < g.count; k++) seamF32[(g.offset + k) * 4 + 2] = seamRestLen;
    }
    // Write only the seam range to GPU
    if (g12 && g13) {
      const startByte = g12.offset * 16;
      const endByte   = (g13.offset + g13.count) * 16;
      device.queue.writeBuffer(constraintBuf, startByte, constraints.data, startByte, endByte - startByte);
    }
  }

  function resetSeams(): void {
    seamRestLen = initialSeamRestLen;
    if (!seamF32 || initialSeamRestLen <= 0) return;
    for (const g of [g12, g13]) {
      if (!g) continue;
      for (let k = 0; k < g.count; k++) seamF32[(g.offset + k) * 4 + 2] = initialSeamRestLen;
    }
    if (g12 && g13) {
      const startByte = g12.offset * 16;
      const endByte   = (g13.offset + g13.count) * 16;
      device.queue.writeBuffer(constraintBuf, startByte, constraints.data, startByte, endByte - startByte);
    }
  }

  // ── Helper: run one physics frame inside the given encoder ────────────────
  function encodeStep(enc: GPUCommandEncoder): void {
    for (let s = 0; s < subSteps; s++) {
      // XPBD: reset lambda accumulators to 0 at start of each substep
      enc.clearBuffer(lambdaBuf, 0, lambdaBuf.size);

      // Integrate
      const intPass = enc.beginComputePass();
      intPass.setPipeline(integratePipeline);
      intPass.setBindGroup(0, integrateBG);
      intPass.dispatchWorkgroups(WG);
      intPass.end();

      // PBD constraints (graph-colored, multiple iterations)
      for (let it = 0; it < constraintIters; it++) {
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

      // Body SDF + floor collision
      const colPass = enc.beginComputePass();
      colPass.setPipeline(collidePipeline);
      colPass.setBindGroup(0, collideBG);
      colPass.dispatchWorkgroups(WG);
      colPass.end();

      // Spatial-hash self-collision (5 passes)
      const wgCells = Math.ceil(SH_NUM_CELLS / 64);

      // Pass 0: clear cell counts
      const shClearPass = enc.beginComputePass();
      shClearPass.setPipeline(shClearPipeline);
      shClearPass.setBindGroup(0, shClearBG);
      shClearPass.dispatchWorkgroups(wgCells);
      shClearPass.end();

      // Pass 1: count particles per cell
      const shCountPass = enc.beginComputePass();
      shCountPass.setPipeline(shCountPipeline);
      shCountPass.setBindGroup(0, shCountBG);
      shCountPass.dispatchWorkgroups(WG);
      shCountPass.end();

      // Pass 2: exclusive prefix sum → cellStart
      const shPrefixPass = enc.beginComputePass();
      shPrefixPass.setPipeline(shPrefixPipeline);
      shPrefixPass.setBindGroup(0, shPrefixBG);
      shPrefixPass.dispatchWorkgroups(1);
      shPrefixPass.end();

      // Pass 3: scatter particles into sorted order
      const shScatterPass = enc.beginComputePass();
      shScatterPass.setPipeline(shScatterPipeline);
      shScatterPass.setBindGroup(0, shScatterBG);
      shScatterPass.dispatchWorkgroups(WG);
      shScatterPass.end();

      // Pass 4: query 3×3×3 neighbourhood and push apart overlapping particles
      const shQueryPass = enc.beginComputePass();
      shQueryPass.setPipeline(shQueryPipeline);
      shQueryPass.setBindGroup(0, shQueryBG);
      shQueryPass.dispatchWorkgroups(WG);
      shQueryPass.end();
    }

    // Recompute normals once per frame (after all substeps)
    const normPass = enc.beginComputePass();
    normPass.setPipeline(normalPipeline);
    normPass.setBindGroup(0, normalBG);
    normPass.dispatchWorkgroups(WG);
    normPass.end();
  }

  // ── All GPU buffers for cleanup ───────────────────────────────────────────
  const allBuffers: GPUBuffer[] = [
    posBuffer, prevPosBuffer, normalBuffer, pinnedBuffer,
    constraintBuf, lambdaBuf, indexBuffer,
    colorBuffer, pbrBuffer, gridInfoBuffer,
    intParamsBuf, normParamsBuf, collideParamsBuf,
    shParamsBuf, shCellCountBuf,
    shScatterSlotBuf, shParticleCellBuf, shSortedBuf,
    ...groupParamsBufs,
  ];

  // ── Public instance ───────────────────────────────────────────────────────
  return {
    posBuffer,
    normalBuffer,
    indexBuffer,
    numIndices,
    colorBuffer,
    pbrBuffer,
    gridInfoBuffer,
    get albedoTextureView() { return currentAlbedoView; },
    get albedoSamplerObj()  { return currentAlbedoSampler; },

    step(): void {
      progressSeams();
      const enc = device.createCommandEncoder({ label: 'cloth3d-step' });
      encodeStep(enc);
      device.queue.submit([enc.finish()]);
    },

    updateCameraPos(eye: [number, number, number]): void {
      currentEye = eye;
      writePBR(device, pbrBuffer, currentParams, eye, currentUseTexture);
    },

    updateMaterialParams(p: Cloth3DMaterialParams): void {
      currentParams = { ...p };
      uploadAllParams(p, currentWind, currentWindStrength);
      writeColor(device, colorBuffer, p);
      writePBR(device, pbrBuffer, p, currentEye, currentUseTexture);
    },

    setWind(dir: [number, number, number], strength: number): void {
      currentWind = [...dir] as [number, number, number];
      currentWindStrength = strength;
      // Only intParamsBuf needs wind (integrate shader); update it directly for speed
      writeSimParams(simF32, simU32, currentParams, N, 0, rows, cols, N, currentWind, currentWindStrength);
      device.queue.writeBuffer(intParamsBuf, 0, simF32);
    },

    updateCapsulesFromJoints(_joints: ReadonlyArray<readonly [number, number, number]>): void {
      // Capsule collision replaced by SMPL mesh SDF — no-op kept for API compatibility.
    },

    setQuality(substeps: number, iters: number): void {
      subSteps       = Math.max(1, substeps);
      constraintIters = Math.max(1, iters);
    },

    setAlbedoTexture(texture: GPUTexture, sampler: GPUSampler): void {
      currentAlbedoView    = texture.createView();
      currentAlbedoSampler = sampler;
      currentUseTexture    = true;
      writePBR(device, pbrBuffer, currentParams, currentEye, true);
    },

    clearAlbedoTexture(): void {
      currentAlbedoView    = defaultAlbedoView;
      currentAlbedoSampler = albedoSamplerObj;
      currentUseTexture    = false;
      writePBR(device, pbrBuffer, currentParams, currentEye, false);
    },

    async exportMeshOBJ(): Promise<string> {
      const byteSize = N * 3 * 4;
      const posStagingBuf = device.createBuffer({
        size: byteSize,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });
      const normStagingBuf = device.createBuffer({
        size: byteSize,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });
      const enc = device.createCommandEncoder({ label: 'cloth3d-export-obj' });
      enc.copyBufferToBuffer(posBuffer,    0, posStagingBuf,  0, byteSize);
      enc.copyBufferToBuffer(normalBuffer, 0, normStagingBuf, 0, byteSize);
      device.queue.submit([enc.finish()]);

      await posStagingBuf.mapAsync(GPUMapMode.READ);
      await normStagingBuf.mapAsync(GPUMapMode.READ);
      const pos  = new Float32Array(posStagingBuf.getMappedRange());
      const norm = new Float32Array(normStagingBuf.getMappedRange());

      const lines: string[] = [
        '# Cloth mesh — Cloth Simulation WebGPU',
        `# Vertices: ${N}  Triangles: ${numIndices / 3}`,
        '',
      ];
      for (let i = 0; i < N; i++) {
        lines.push(`v ${pos[i*3].toFixed(5)} ${pos[i*3+1].toFixed(5)} ${pos[i*3+2].toFixed(5)}`);
      }
      lines.push('');
      for (let i = 0; i < N; i++) {
        lines.push(`vn ${norm[i*3].toFixed(5)} ${norm[i*3+1].toFixed(5)} ${norm[i*3+2].toFixed(5)}`);
      }
      lines.push('');
      for (let i = 0; i < numIndices; i += 3) {
        const a = indexData[i]     + 1;
        const b = indexData[i + 1] + 1;
        const c = indexData[i + 2] + 1;
        lines.push(`f ${a}//${a} ${b}//${b} ${c}//${c}`);
      }

      posStagingBuf.unmap();
      normStagingBuf.unmap();
      posStagingBuf.destroy();
      normStagingBuf.destroy();
      return lines.join('\n');
    },

    reset(): void {
      const { posData: newPos } = buildInitialPositions(config);
      device.queue.writeBuffer(posBuffer,     0, newPos);
      device.queue.writeBuffer(prevPosBuffer, 0, newPos);
      resetSeams();
    },

    get isDraping(): boolean { return seamRestLen > 0; },
    get drapingProgress(): number {
      if (initialSeamRestLen <= 0) return 1;
      return 1 - seamRestLen / initialSeamRestLen;
    },

    destroy(): void {
      for (const b of allBuffers) b.destroy();
      defaultAlbedoTexture.destroy();
      sdfTexture.destroy();
    },
  };
}
