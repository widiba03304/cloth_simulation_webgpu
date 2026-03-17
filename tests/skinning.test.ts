import { describe, it, expect, vi } from 'vitest';
import { LinearBlendSkinning, createRestMesh } from '../src/renderer/ik/skinning';
import type { BodyMesh } from '../src/renderer/render/bodyMesh';
import type { SMPLPoseData } from '../src/renderer/render/smplPoseData';
import type { Skeleton } from '../src/renderer/ik/skeleton';

// Minimal pose data for testing (3 verts, 2 joints)
function makeMinimalPoseData(numVerts = 3, numJoints = 2): SMPLPoseData {
  const weights = new Float32Array(numVerts * numJoints);
  // Give each vertex full weight to joint 0
  for (let v = 0; v < numVerts; v++) {
    weights[v * numJoints + 0] = 1.0;
  }
  const kintree: [number[], number[]] = [
    [-1, 0],     // Row 0: parent IDs
    [0, 1],      // Row 1: joint IDs
  ];
  return {
    num_joints: numJoints,
    num_vertices: numVerts,
    v_template: new Float32Array(numVerts * 3),
    j_regressor: new Float32Array(numJoints * numVerts),
    joint_positions: new Float32Array(numJoints * 3),
    kintree_table: kintree as any,
    weights,
    joint_names: ['pelvis', 'spine1'],
  };
}

function makeMesh(verts: number[]): BodyMesh {
  return {
    positions: new Float32Array(verts),
    indices: new Uint32Array([0, 1, 2]),
    normals: new Float32Array(verts.length),
  };
}

// Minimal skeleton mock
function makeSkeletonMock(numJoints = 2) {
  const identity = new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
  const joints = Array.from({ length: numJoints }, (_, i) => ({
    id: i,
    name: `joint_${i}`,
    worldTransform: new Float32Array(identity),
    localRotation: new Float32Array([0, 0, 0, 1]),
    worldPosition: [0, 0, 0] as [number, number, number],
    parentId: i === 0 ? -1 : 0,
  }));
  return {
    getJoint: vi.fn((id: number) => joints[id]),
    numJoints,
  } as unknown as Skeleton;
}

describe('LinearBlendSkinning', () => {
  it('constructs without error', () => {
    const pd = makeMinimalPoseData();
    const mesh = makeMesh([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    expect(() => new LinearBlendSkinning(pd, mesh)).not.toThrow();
  });

  it('uses zero normals when mesh has none', () => {
    const pd = makeMinimalPoseData();
    const mesh: BodyMesh = {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2]),
    };
    expect(() => new LinearBlendSkinning(pd, mesh)).not.toThrow();
  });

  it('deformMesh with identity transforms returns rest positions', () => {
    const pd = makeMinimalPoseData();
    const restPos = [0, 0, 0, 1, 0, 0, 0, 1, 0];
    const mesh = makeMesh(restPos);
    const lbs = new LinearBlendSkinning(pd, mesh);
    const skeleton = makeSkeletonMock();
    const result = lbs.deformMesh(skeleton);
    expect(result.positions).toHaveLength(9);
    for (let i = 0; i < 9; i++) {
      expect(result.positions[i]).toBeCloseTo(restPos[i]!);
    }
  });

  it('deformMesh returns normals', () => {
    const pd = makeMinimalPoseData();
    const mesh = makeMesh([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const lbs = new LinearBlendSkinning(pd, mesh);
    const result = lbs.deformMesh(makeSkeletonMock());
    expect(result.normals).toBeDefined();
    expect(result.normals!.length).toBe(9);
  });

  it('normalizes zero normals to Y-up', () => {
    const pd = makeMinimalPoseData();
    // Mesh with zero normals
    const mesh: BodyMesh = {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2]),
      normals: new Float32Array(9), // all zeros
    };
    const lbs = new LinearBlendSkinning(pd, mesh);
    const result = lbs.deformMesh(makeSkeletonMock());
    // All-zero normals should become (0, 1, 0)
    for (let v = 0; v < 3; v++) {
      expect(result.normals![v * 3 + 0]).toBeCloseTo(0);
      expect(result.normals![v * 3 + 1]).toBeCloseTo(1);
      expect(result.normals![v * 3 + 2]).toBeCloseTo(0);
    }
  });

  it('getVertexWeights returns per-joint weights for a vertex', () => {
    const pd = makeMinimalPoseData(3, 2);
    const mesh = makeMesh([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const lbs = new LinearBlendSkinning(pd, mesh);
    const w = lbs.getVertexWeights(0);
    expect(w.length).toBe(2);
    expect(w[0]).toBeCloseTo(1.0);
    expect(w[1]).toBeCloseTo(0.0);
  });

  it('getInfluencedVertices returns vertices above threshold', () => {
    const pd = makeMinimalPoseData(3, 2);
    const mesh = makeMesh([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const lbs = new LinearBlendSkinning(pd, mesh);
    const influenced = lbs.getInfluencedVertices(0, 0.5);
    expect(influenced.length).toBe(3); // all verts influenced by joint 0
    const none = lbs.getInfluencedVertices(1, 0.5);
    expect(none.length).toBe(0);
  });

  it('getInfluencedVertices uses default threshold=0.1', () => {
    const pd = makeMinimalPoseData(3, 2);
    const mesh = makeMesh([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const lbs = new LinearBlendSkinning(pd, mesh);
    const influenced = lbs.getInfluencedVertices(0);
    expect(influenced.length).toBe(3);
  });

  it('sparse weights skip values below 0.001', () => {
    const pd = makeMinimalPoseData(2, 2);
    // Set very small weight for joint 1
    pd.weights[1] = 0.0005;
    const mesh = makeMesh([0, 0, 0, 1, 0, 0]);
    const lbs = new LinearBlendSkinning(pd, mesh);
    // v0/j1 weight < threshold should be excluded from sparse list
    const v0j1 = lbs.sparseWeights.find(sw => sw.vertexId === 0 && sw.jointId === 1);
    expect(v0j1).toBeUndefined();
  });

  it('deformMesh with translation transform moves vertices', () => {
    const pd = makeMinimalPoseData(1, 1);
    const mesh = makeMesh([0, 0, 0]);
    const lbs = new LinearBlendSkinning(pd, mesh);
    const skel = makeSkeletonMock(1);
    // Set joint 0 world transform to translate by (5, 0, 0)
    const T = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      5, 0, 0, 1,  // column-major translation
    ]);
    (skel.getJoint(0) as any).worldTransform = T;
    const result = lbs.deformMesh(skel);
    expect(result.positions[0]).toBeCloseTo(5);
  });

  it('deformMesh normalizes non-zero normals (covers len > 0.0001 true branch, lines 130-132)', () => {
    const pd = makeMinimalPoseData();
    // Provide non-zero normals: [0,1,0], [0,0,1], [1,0,0]
    const mesh: BodyMesh = {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2]),
      normals: new Float32Array([0, 1, 0, 0, 0, 1, 1, 0, 0]),
    };
    const lbs = new LinearBlendSkinning(pd, mesh);
    const result = lbs.deformMesh(makeSkeletonMock());
    // Each deformed normal should be unit length (len normalized from non-zero)
    for (let v = 0; v < 3; v++) {
      const nx = result.normals![v * 3];
      const ny = result.normals![v * 3 + 1];
      const nz = result.normals![v * 3 + 2];
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      expect(len).toBeCloseTo(1.0);
    }
  });
});

describe('createRestMesh', () => {
  it('creates mesh with positions, indices, and normals', () => {
    const pd = makeMinimalPoseData();
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const indices = new Uint32Array([0, 1, 2]);
    const mesh = createRestMesh(pd, positions, indices);
    expect(mesh.positions).toBe(positions);
    expect(mesh.indices).toBe(indices);
    expect(mesh.normals).toBeDefined();
    expect(mesh.normals!.length).toBe(9);
  });
});
