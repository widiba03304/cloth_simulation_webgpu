import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  loadSMPLPoseData,
  getPoseData,
  getJointName,
  getJointIndex,
  getParentJoint,
  getChildJoints,
  IK_JOINT_INDICES,
  getIKJointIndices,
  recomputeJointPositions,
} from '../src/renderer/render/smplPoseData';

function makeMockPoseData() {
  return {
    num_joints: 4,
    num_vertices: 3,
    v_template: new Float32Array([0,0,0, 1,0,0, 0,1,0]),
    j_regressor: new Float32Array(4 * 3).fill(0),
    joint_positions: new Float32Array([0,0,0, 0,1,0, 0,2,0, 0,3,0]),
    kintree_table: [[-1, 0, 1, 2], [0, 1, 2, 3]],
    weights: new Float32Array(3 * 4).fill(0.25),
    joint_names: ['pelvis', 'spine', 'chest', 'neck'],
  };
}

describe('getJointName', () => {
  it('returns the name for a valid index', () => {
    const pd = makeMockPoseData();
    expect(getJointName(pd, 0)).toBe('pelvis');
    expect(getJointName(pd, 2)).toBe('chest');
  });

  it('returns joint_N for an out-of-range index', () => {
    const pd = makeMockPoseData();
    expect(getJointName(pd, 99)).toBe('joint_99');
    expect(getJointName(pd, -1)).toBe('joint_-1');
  });
});

describe('getJointIndex', () => {
  it('returns index for existing name', () => {
    const pd = makeMockPoseData();
    expect(getJointIndex(pd, 'spine')).toBe(1);
  });

  it('returns -1 for unknown name', () => {
    const pd = makeMockPoseData();
    expect(getJointIndex(pd, 'unknown')).toBe(-1);
  });
});

describe('getParentJoint', () => {
  it('returns parent index from kintree_table', () => {
    const pd = makeMockPoseData();
    expect(getParentJoint(pd, 1)).toBe(0);
    expect(getParentJoint(pd, 2)).toBe(1);
  });

  it('returns -1 for out-of-range joint', () => {
    const pd = makeMockPoseData();
    expect(getParentJoint(pd, -1)).toBe(-1);
    expect(getParentJoint(pd, 99)).toBe(-1);
  });
});

describe('getChildJoints', () => {
  it('returns all child joint indices', () => {
    const pd = makeMockPoseData();
    const children = getChildJoints(pd, 0);
    expect(children).toContain(1);
  });

  it('returns empty array for leaf joint', () => {
    const pd = makeMockPoseData();
    const children = getChildJoints(pd, 3); // last joint, no children
    expect(children).toHaveLength(0);
  });
});

describe('IK_JOINT_INDICES', () => {
  it('has expected joint indices', () => {
    expect(IK_JOINT_INDICES.LEFT_WRIST).toBe(20);
    expect(IK_JOINT_INDICES.RIGHT_WRIST).toBe(21);
    expect(IK_JOINT_INDICES.LEFT_ANKLE).toBe(7);
    expect(IK_JOINT_INDICES.RIGHT_ANKLE).toBe(8);
    expect(IK_JOINT_INDICES.LEFT_ELBOW).toBe(18);
    expect(IK_JOINT_INDICES.RIGHT_ELBOW).toBe(19);
    expect(IK_JOINT_INDICES.LEFT_KNEE).toBe(4);
    expect(IK_JOINT_INDICES.RIGHT_KNEE).toBe(5);
  });
});

describe('getIKJointIndices', () => {
  it('returns all 8 IK joints', () => {
    const indices = getIKJointIndices();
    expect(indices).toHaveLength(8);
    expect(indices).toContain(20);
    expect(indices).toContain(7);
  });
});

describe('recomputeJointPositions', () => {
  it('returns array of correct length', () => {
    const pd = makeMockPoseData();
    // j_regressor: 4 joints × 3 vertices, all zeros → joints at origin
    const verts = new Float32Array([1,0,0, 0,1,0, 0,0,1]);
    const result = recomputeJointPositions(pd, verts);
    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(pd.num_joints * 3);
  });

  it('returns original joint_positions when vertex count is wrong', () => {
    const pd = makeMockPoseData();
    const verts = new Float32Array([1, 0, 0]); // only 1 vertex, expected 3×3=9 floats
    const result = recomputeJointPositions(pd, verts);
    expect(result).toBe(pd.joint_positions);
  });

  it('computes weighted sum correctly', () => {
    const pd = {
      ...makeMockPoseData(),
      num_joints: 1,
      num_vertices: 2,
      // j_regressor: 1 joint × 2 verts: [0.5, 0.5]
      j_regressor: new Float32Array([0.5, 0.5]),
      joint_positions: new Float32Array(3),
      weights: new Float32Array(2),
    };
    // verts: [2,0,0, 0,2,0]
    const verts = new Float32Array([2, 0, 0, 0, 2, 0]);
    const result = recomputeJointPositions(pd, verts);
    // joint[0] = 0.5*(2,0,0) + 0.5*(0,2,0) = (1,1,0)
    expect(result[0]).toBeCloseTo(1);
    expect(result[1]).toBeCloseTo(1);
    expect(result[2]).toBeCloseTo(0);
  });
});

describe('getPoseData', () => {
  it('returns null before loading', async () => {
    // Use vi.resetModules to get a fresh module state
    vi.resetModules();
    const mod = await import('../src/renderer/render/smplPoseData');
    expect(mod.getPoseData('male')).toBeNull();
    expect(mod.getPoseData('female')).toBeNull();
  });
});

describe('loadSMPLPoseData', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns null for both when fetch fails', async () => {
    (global as any).fetch = vi.fn(async () => ({ ok: false, statusText: 'Not Found' }));
    const mod = await import('../src/renderer/render/smplPoseData');
    const result = await mod.loadSMPLPoseData();
    expect(result.male).toBeNull();
    expect(result.female).toBeNull();
  });

  it('returns null when json is missing required fields', async () => {
    (global as any).fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ num_joints: 24 }), // missing other fields
    }));
    const mod = await import('../src/renderer/render/smplPoseData');
    const result = await mod.loadSMPLPoseData();
    expect(result.male).toBeNull();
  });

  it('returns null when joint_positions size is wrong', async () => {
    const validJson = {
      num_joints: 2,
      num_vertices: 2,
      v_template: [0,0,0, 1,0,0],
      j_regressor: [0.5, 0.5, 0.5, 0.5],
      joint_positions: [0, 0, 0], // wrong: should be 2×3=6
      kintree_table: [[0,0],[0,1]],
      weights: [0.5, 0.5, 0.5, 0.5],
      joint_names: ['a', 'b'],
    };
    (global as any).fetch = vi.fn(async () => ({ ok: true, json: async () => validJson }));
    const mod = await import('../src/renderer/render/smplPoseData');
    const result = await mod.loadSMPLPoseData();
    expect(result.male).toBeNull();
  });

  it('loads valid data and caches it', async () => {
    const validJson = {
      num_joints: 2,
      num_vertices: 2,
      v_template: [0,0,0, 1,0,0],
      j_regressor: [0.5, 0.5, 0.5, 0.5],
      joint_positions: [0,0,0, 0,1,0], // 2×3=6 floats
      kintree_table: [[0,0],[0,1]],
      weights: [0.5, 0.5, 0.5, 0.5], // 2×2=4 floats
      joint_names: ['a', 'b'],
    };
    (global as any).fetch = vi.fn(async () => ({ ok: true, json: async () => validJson }));
    const mod = await import('../src/renderer/render/smplPoseData');
    const result = await mod.loadSMPLPoseData();
    expect(result.male).not.toBeNull();
    expect(result.male?.num_joints).toBe(2);
    // Check cached
    expect(mod.getPoseData('male')).not.toBeNull();
  });

  it('loads data with optional posedirs', async () => {
    const validJson = {
      num_joints: 2,
      num_vertices: 2,
      v_template: [0,0,0, 1,0,0],
      j_regressor: [0.5, 0.5, 0.5, 0.5],
      joint_positions: [0,0,0, 0,1,0],
      kintree_table: [[0,0],[0,1]],
      weights: [0.5, 0.5, 0.5, 0.5],
      joint_names: ['a', 'b'],
      posedirs: new Array(2 * 3 * 3).fill(0),
      num_pose_params: 3,
    };
    (global as any).fetch = vi.fn(async () => ({ ok: true, json: async () => validJson }));
    const mod = await import('../src/renderer/render/smplPoseData');
    const result = await mod.loadSMPLPoseData();
    expect(result.male?.posedirs).toBeDefined();
    expect(result.male?.num_pose_params).toBe(3);
  });

  it('returns null when fetch throws', async () => {
    (global as any).fetch = vi.fn(async () => { throw new Error('network error'); });
    const mod = await import('../src/renderer/render/smplPoseData');
    const result = await mod.loadSMPLPoseData();
    expect(result.male).toBeNull();
  });

  it('returns null when weights size is wrong (covers lines 99-100)', async () => {
    const validJson = {
      num_joints: 2,
      num_vertices: 2,
      v_template: [0,0,0, 1,0,0],
      j_regressor: [0.5, 0.5, 0.5, 0.5],
      joint_positions: [0,0,0, 0,1,0], // correct: 2×3=6 floats
      kintree_table: [[0,0],[0,1]],
      weights: [0.5, 0.5], // wrong: should be num_vertices×num_joints=4, only 2
      joint_names: ['a', 'b'],
    };
    (global as any).fetch = vi.fn(async () => ({ ok: true, json: async () => validJson }));
    const mod = await import('../src/renderer/render/smplPoseData');
    const result = await mod.loadSMPLPoseData();
    expect(result.male).toBeNull();
  });
});
