import { describe, it, expect, vi } from 'vitest';
import { GPUSkinning } from '../src/renderer/compute/gpuSkinning';
import { makeMockDevice, makeMockCommandEncoder } from './mocks/webgpu';

function makeMinimalPoseData(numVerts = 4, numJoints = 2) {
  const weights = new Float32Array(numVerts * numJoints);
  for (let v = 0; v < numVerts; v++) weights[v * numJoints] = 1.0;
  return {
    num_joints: numJoints,
    num_vertices: numVerts,
    v_template: new Float32Array(numVerts * 3),
    j_regressor: new Float32Array(numJoints * numVerts),
    joint_positions: new Float32Array(numJoints * 3),
    kintree_table: [[-1, 0], [0, 1]],
    weights,
    joint_names: ['pelvis', 'spine1'],
  };
}

function makeRestMesh(numVerts = 4) {
  return {
    positions: new Float32Array(numVerts * 3),
    indices: new Uint32Array([0, 1, 2, 1, 3, 2]),
    normals: new Float32Array(numVerts * 3),
  };
}

function makeSkeletonMock(numJoints = 2) {
  const identity = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
  const joints = Array.from({ length: numJoints }, (_, i) => ({
    id: i, name: `joint_${i}`,
    worldTransform: new Float32Array(identity),
    inverseBindPose: new Float32Array(identity), // required by computeSkinning
    localRotation: new Float32Array([0,0,0,1]),
    worldPosition: [0,0,0],
    parentId: i === 0 ? -1 : 0,
  }));
  return {
    getJoint: vi.fn((id) => joints[id]),
    numJoints,
    joints,
  };
}

describe('GPUSkinning', () => {
  it('constructs without error', () => {
    const device = makeMockDevice();
    const pd = makeMinimalPoseData();
    const mesh = makeRestMesh();
    expect(() => new GPUSkinning(device, pd as any, mesh as any)).not.toThrow();
  });

  it('creates GPU buffers during construction', () => {
    const device = makeMockDevice();
    const pd = makeMinimalPoseData();
    const mesh = makeRestMesh();
    new GPUSkinning(device, pd as any, mesh as any);
    expect(device.createBuffer).toHaveBeenCalled();
    expect(device.createShaderModule).toHaveBeenCalled();
    expect(device.createComputePipeline).toHaveBeenCalled();
  });

  it('getDeformedPositionsBuffer returns a GPUBuffer', () => {
    const device = makeMockDevice();
    const gpu = new GPUSkinning(device, makeMinimalPoseData() as any, makeRestMesh() as any);
    const buf = gpu.getDeformedPositionsBuffer();
    expect(buf).toBeDefined();
  });

  it('getDeformedNormalsBuffer returns a GPUBuffer', () => {
    const device = makeMockDevice();
    const gpu = new GPUSkinning(device, makeMinimalPoseData() as any, makeRestMesh() as any);
    const buf = gpu.getDeformedNormalsBuffer();
    expect(buf).toBeDefined();
  });

  it('computeSkinning runs without error', () => {
    const device = makeMockDevice();
    const gpu = new GPUSkinning(device, makeMinimalPoseData() as any, makeRestMesh() as any);
    const encoder = makeMockCommandEncoder();
    const skel = makeSkeletonMock();
    expect(() => gpu.computeSkinning(skel as any, encoder as unknown as GPUCommandEncoder)).not.toThrow();
    expect(device.queue.writeBuffer).toHaveBeenCalled();
    expect(encoder.beginComputePass).toHaveBeenCalled();
  });

  it('copyToRenderBuffers runs without error', () => {
    const device = makeMockDevice();
    const gpu = new GPUSkinning(device, makeMinimalPoseData() as any, makeRestMesh() as any);
    const encoder = makeMockCommandEncoder();
    const dstPos = device.createBuffer({ size: 64, usage: GPUBufferUsage.COPY_DST });
    const dstNorm = device.createBuffer({ size: 64, usage: GPUBufferUsage.COPY_DST });
    expect(() => gpu.copyToRenderBuffers(encoder as unknown as GPUCommandEncoder, dstPos, dstNorm)).not.toThrow();
    expect(encoder.copyBufferToBuffer).toHaveBeenCalled();
  });

  it('dispose runs without error', () => {
    const device = makeMockDevice();
    const gpu = new GPUSkinning(device, makeMinimalPoseData() as any, makeRestMesh() as any);
    expect(() => gpu.dispose()).not.toThrow();
  });

  it('computeSkinning returns early when pipeline is null (lines 216-217)', () => {
    const device = makeMockDevice();
    const gpu = new GPUSkinning(device, makeMinimalPoseData() as any, makeRestMesh() as any);
    (gpu as any).pipeline = null;
    const encoder = makeMockCommandEncoder();
    const skel = makeSkeletonMock();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => gpu.computeSkinning(skel as any, encoder as unknown as GPUCommandEncoder)).not.toThrow();
    spy.mockRestore();
  });
});
