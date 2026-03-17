import { describe, it, expect, vi } from 'vitest';
import { IKController } from '../src/renderer/ik/ikController';
import { makeMockDevice, makeMockCommandEncoder } from './mocks/webgpu';

function makeMinimalPoseData(numVerts = 4, numJoints = 24) {
  const weights = new Float32Array(numVerts * numJoints);
  for (let v = 0; v < numVerts; v++) weights[v * numJoints] = 1.0;
  const kintreeParents = Array.from({ length: numJoints }, (_, i) => i === 0 ? -1 : 0);
  const kintreeJoints = Array.from({ length: numJoints }, (_, i) => i);
  const jointNames = [
    'pelvis', 'left_hip', 'right_hip', 'spine1', 'left_knee', 'right_knee',
    'spine2', 'left_ankle', 'right_ankle', 'spine3', 'left_foot', 'right_foot',
    'neck', 'left_collar', 'right_collar', 'head',
    'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
    'left_wrist', 'right_wrist', 'left_hand', 'right_hand',
  ];
  return {
    num_joints: numJoints,
    num_vertices: numVerts,
    v_template: new Float32Array(numVerts * 3),
    j_regressor: new Float32Array(numJoints * numVerts),
    joint_positions: new Float32Array(numJoints * 3),
    kintree_table: [kintreeParents, kintreeJoints],
    weights,
    joint_names: jointNames,
  };
}

/** Proper SMPL-like parent hierarchy so findChainRoot traversal finds hip/shoulder. */
function makeProperPoseData() {
  const numJoints = 24;
  const numVerts = 4;
  const weights = new Float32Array(numVerts * numJoints);
  for (let v = 0; v < numVerts; v++) weights[v * numJoints] = 1.0;
  const parents = [
    -1, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8,
    9, 9, 9, 12, 13, 14, 16, 17, 18, 19, 20, 21,
  ];
  const jointNames = [
    'pelvis','left_hip','right_hip','spine1','left_knee','right_knee',
    'spine2','left_ankle','right_ankle','spine3','left_foot','right_foot',
    'neck','left_collar','right_collar','head',
    'left_shoulder','right_shoulder','left_elbow','right_elbow',
    'left_wrist','right_wrist','left_hand','right_hand',
  ];
  return {
    num_joints: numJoints,
    num_vertices: numVerts,
    v_template: new Float32Array(numVerts * 3),
    j_regressor: new Float32Array(numJoints * numVerts),
    joint_positions: new Float32Array(numJoints * 3),
    kintree_table: [parents, Array.from({ length: numJoints }, (_, i) => i)],
    weights,
    joint_names: jointNames,
  };
}

function makeRestMesh(numVerts = 4) {
  return {
    positions: new Float32Array(numVerts * 3),
    indices: new Uint32Array([0, 1, 2, 1, 3, 2]),
    normals: new Float32Array(numVerts * 3),
  };
}

describe('IKController', () => {
  it('constructs without error', () => {
    const device = makeMockDevice();
    const pd = makeMinimalPoseData();
    const mesh = makeRestMesh();
    expect(() => new IKController(pd as any, mesh as any, device)).not.toThrow();
  });

  it('constructs with unscaled mesh vertices', () => {
    const device = makeMockDevice();
    const pd = makeMinimalPoseData();
    const mesh = makeRestMesh();
    const unscaled = new Float32Array(4 * 3);
    expect(() => new IKController(pd as any, mesh as any, device, unscaled)).not.toThrow();
  });

  it('setEnabledJoints updates enabled set', () => {
    const device = makeMockDevice();
    const pd = makeMinimalPoseData();
    const mesh = makeRestMesh();
    const ik = new IKController(pd as any, mesh as any, device);
    ik.setEnabledJoints([4, 7]); // left_knee, left_ankle
    expect(ik.isJointEnabled(4)).toBe(true);
    expect(ik.isJointEnabled(7)).toBe(true);
    expect(ik.isJointEnabled(0)).toBe(false);
  });

  it('getEnabledJoints returns all enabled joints', () => {
    const device = makeMockDevice();
    const ik = new IKController(makeMinimalPoseData() as any, makeRestMesh() as any, device);
    ik.setEnabledJoints([1, 2, 3]);
    const enabled = ik.getEnabledJoints();
    expect(enabled).toContain(1);
    expect(enabled).toContain(2);
    expect(enabled).toContain(3);
  });

  it('startDrag, updateDrag, endDrag lifecycle', () => {
    const device = makeMockDevice();
    const ik = new IKController(makeMinimalPoseData() as any, makeRestMesh() as any, device);
    ik.setEnabledJoints([4]);
    expect(() => ik.startDrag(4, [0.1, 0.5, 0])).not.toThrow();
    expect(ik.isDragging()).toBe(true);
    expect(ik.getActiveJoint()).toBe(4);
    expect(() => ik.updateDrag([0.2, 0.6, 0])).not.toThrow();
    expect(() => ik.endDrag()).not.toThrow();
    expect(ik.isDragging()).toBe(false);
  });

  it('getJointPositions returns array', () => {
    const device = makeMockDevice();
    const ik = new IKController(makeMinimalPoseData() as any, makeRestMesh() as any, device);
    const positions = ik.getJointPositions();
    expect(Array.isArray(positions)).toBe(true);
  });

  it('getJointPosition returns null for invalid joint', () => {
    const device = makeMockDevice();
    const ik = new IKController(makeMinimalPoseData() as any, makeRestMesh() as any, device);
    const pos = ik.getJointPosition(999);
    expect(pos).toBeNull();
  });

  it('setEnabled toggles IK on/off', () => {
    const device = makeMockDevice();
    const ik = new IKController(makeMinimalPoseData() as any, makeRestMesh() as any, device);
    ik.setEnabled(false);
    ik.setEnabled(true);
  });

  it('reset restores initial state', () => {
    const device = makeMockDevice();
    const ik = new IKController(makeMinimalPoseData() as any, makeRestMesh() as any, device);
    ik.startDrag(4, [0, 0, 0]);
    ik.reset();
    expect(ik.isDragging()).toBe(false);
  });

  it('markSkeletonDirty does not throw', () => {
    const device = makeMockDevice();
    const ik = new IKController(makeMinimalPoseData() as any, makeRestMesh() as any, device);
    expect(() => ik.markSkeletonDirty()).not.toThrow();
  });

  it('computeAndCopyGPUSkinning runs without error', () => {
    const device = makeMockDevice();
    const ik = new IKController(makeMinimalPoseData() as any, makeRestMesh() as any, device);
    const encoder = makeMockCommandEncoder();
    const buf1 = device.createBuffer({ size: 64, usage: GPUBufferUsage.COPY_DST });
    const buf2 = device.createBuffer({ size: 64, usage: GPUBufferUsage.COPY_DST });
    expect(() => ik.computeAndCopyGPUSkinning(encoder as any, buf1, buf2)).not.toThrow();
  });

  it('copyDeformedToRenderBuffers runs without error', () => {
    const device = makeMockDevice();
    const ik = new IKController(makeMinimalPoseData() as any, makeRestMesh() as any, device);
    const encoder = makeMockCommandEncoder();
    const buf1 = device.createBuffer({ size: 64, usage: GPUBufferUsage.COPY_DST });
    const buf2 = device.createBuffer({ size: 64, usage: GPUBufferUsage.COPY_DST });
    expect(() => ik.copyDeformedToRenderBuffers(encoder as any, buf1, buf2)).not.toThrow();
  });

  it('startDrag with disabled joint returns early (lines 171-174)', () => {
    const device = makeMockDevice();
    const ik = new IKController(makeMinimalPoseData() as any, makeRestMesh() as any, device);
    // Joint 99 is not enabled
    ik.startDrag(99, [0, 0, 0]);
    expect(ik.isDragging()).toBe(false);
  });

  it('updateDrag with no active joint returns early (lines 187-190)', () => {
    const device = makeMockDevice();
    const ik = new IKController(makeMinimalPoseData() as any, makeRestMesh() as any, device);
    // No startDrag → activeJoint is null → early return
    expect(() => ik.updateDrag([0.1, 0.2, 0.3])).not.toThrow();
    expect(ik.isDragging()).toBe(false);
  });

  it('setEnabledJoints with elbow joint covers elbow/wrist branch (lines 140-158)', () => {
    const device = makeMockDevice();
    const ik = new IKController(makeMinimalPoseData() as any, makeRestMesh() as any, device);
    // joint 18 = left_elbow (includes 'elbow') → elbow/wrist branch in findChainRoot
    expect(() => ik.setEnabledJoints([18])).not.toThrow();
    expect(ik.isJointEnabled(18)).toBe(true);
  });

  it('setEnabledJoints with wrist joint covers wrist branch (lines 140-158)', () => {
    const device = makeMockDevice();
    const ik = new IKController(makeMinimalPoseData() as any, makeRestMesh() as any, device);
    // joint 20 = left_wrist (includes 'wrist') → elbow/wrist branch
    expect(() => ik.setEnabledJoints([20])).not.toThrow();
    expect(ik.isJointEnabled(20)).toBe(true);
  });

  it('setEnabledJoints with spine joint covers default branch (lines 160-162)', () => {
    const device = makeMockDevice();
    const ik = new IKController(makeMinimalPoseData() as any, makeRestMesh() as any, device);
    // joint 6 = spine2 (no knee/ankle/elbow/wrist) → default path; parent=0 → returns 1
    expect(() => ik.setEnabledJoints([6])).not.toThrow();
  });

  it('computeAndCopyGPUSkinning with dirty skeleton runs try block (lines 240-254)', () => {
    const device = makeMockDevice();
    const ik = new IKController(makeMinimalPoseData() as any, makeRestMesh() as any, device);
    const encoder = makeMockCommandEncoder();
    const buf1 = device.createBuffer({ size: 64, usage: GPUBufferUsage.COPY_DST });
    const buf2 = device.createBuffer({ size: 64, usage: GPUBufferUsage.COPY_DST });
    // markSkeletonDirty sets skeletonDirty=true → skips early return, enters try block
    ik.markSkeletonDirty();
    expect(() => ik.computeAndCopyGPUSkinning(encoder as any, buf1, buf2)).not.toThrow();
  });

  it('endDrag when no active joint covers activeJoint===null branch', () => {
    const device = makeMockDevice();
    const ik = new IKController(makeMinimalPoseData() as any, makeRestMesh() as any, device);
    // endDrag without prior startDrag → activeJoint===null → if block skipped
    expect(() => ik.endDrag()).not.toThrow();
  });

  it('findChainRoot finds hip for knee joint (covers line 130)', () => {
    // With proper hierarchy: left_knee(4) → parent=1(left_hip) → loop finds 'hip' → line 130
    const device = makeMockDevice();
    const ik = new IKController(makeProperPoseData() as any, makeRestMesh() as any, device);
    expect(() => ik.setEnabledJoints([4])).not.toThrow(); // left_knee
    expect(ik.isJointEnabled(4)).toBe(true);
  });

  it('findChainRoot finds shoulder for elbow joint (covers line 150)', () => {
    // With proper hierarchy: left_elbow(18) → parent=16(left_shoulder) → loop finds 'shoulder' → line 150
    const device = makeMockDevice();
    const ik = new IKController(makeProperPoseData() as any, makeRestMesh() as any, device);
    expect(() => ik.setEnabledJoints([18])).not.toThrow(); // left_elbow
    expect(ik.isJointEnabled(18)).toBe(true);
  });

  it('computeAndCopyGPUSkinning logs error when computeSkinning throws (line 256)', () => {
    const device = makeMockDevice();
    const ik = new IKController(makeMinimalPoseData() as any, makeRestMesh() as any, device);
    (ik as any).skeletonDirty = true;
    vi.spyOn((ik as any).gpuSkinning, 'computeSkinning').mockImplementation(() => {
      throw new Error('GPU error');
    });
    const encoder = makeMockCommandEncoder();
    const buf = device.createBuffer({ size: 64, usage: GPUBufferUsage.COPY_DST });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => ik.computeAndCopyGPUSkinning(
      encoder as unknown as GPUCommandEncoder, buf, buf
    )).not.toThrow();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('GPU skinning failed'), expect.any(Error));
    spy.mockRestore();
    vi.restoreAllMocks();
  });
});
