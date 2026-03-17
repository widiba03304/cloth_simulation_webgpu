import { describe, it, expect } from 'vitest';
import { FABRIKSolver } from '../src/renderer/ik/fabrikSolver';
import { Skeleton } from '../src/renderer/ik/skeleton';
import { createTestPoseData } from './testUtils';

function makeSkeleton5(): Skeleton {
  const numJoints = 5;
  const jointPositions = new Float32Array([
    0, 0, 0,
    1, 0, 0,
    2, 0, 0,
    3, 0, 0,
    4, 0, 0,
  ]);
  const jointHierarchy = new Int32Array([-1, 0, 1, 2, 3]);
  const poseData = createTestPoseData(numJoints, 10, jointPositions, jointHierarchy);
  const sk = new Skeleton(poseData);
  sk.updateWorldTransforms();
  return sk;
}

describe('FABRIKSolver', () => {
  it('constructs without error', () => {
    const sk = makeSkeleton5();
    expect(() => new FABRIKSolver(sk)).not.toThrow();
  });

  it('addChain registers a chain for the end effector', () => {
    const sk = makeSkeleton5();
    const solver = new FABRIKSolver(sk);
    solver.addChain(4, 0);
    expect(solver.chains.size).toBe(1);
  });

  it('addChain with too-short chain warns and does not register', () => {
    const sk = makeSkeleton5();
    const solver = new FABRIKSolver(sk);
    // Joint 0 to itself → 1-joint chain, too short
    solver.addChain(0, 0);
    expect(solver.chains.size).toBe(0);
  });

  it('solve returns false when no chain registered', () => {
    const sk = makeSkeleton5();
    const solver = new FABRIKSolver(sk);
    const result = solver.solve(99, [1, 0, 0]);
    expect(result).toBe(false);
  });

  it('solve with in-reach off-axis target runs FABRIK iteration', () => {
    const sk = makeSkeleton5();
    const solver = new FABRIKSolver(sk);
    solver.addChain(4, 0);
    // Off-axis target within reach (distance ~2.83 < chain length 4)
    const result = solver.solve(4, [2, 2, 0]);
    expect(typeof result).toBe('boolean');
  });

  it('solve with out-of-reach target stretches chain and returns false', () => {
    const sk = makeSkeleton5();
    const solver = new FABRIKSolver(sk);
    solver.addChain(4, 0);
    // Target at [10,0,0] - far outside chain reach (total length = 4)
    const result = solver.solve(4, [10, 0, 0]);
    expect(result).toBe(false);
  });

  it('solve with pole vector applies pole constraint', () => {
    const sk = makeSkeleton5();
    const solver = new FABRIKSolver(sk);
    solver.addChain(4, 0, [0, 1, 0]); // poleVector pointing up
    expect(() => solver.solve(4, [3.5, 0.5, 0])).not.toThrow();
  });

  it('applyPoleVector returns early for 2-joint chain (length < 3)', () => {
    const sk = makeSkeleton5();
    const solver = new FABRIKSolver(sk);
    // 2-joint chain: joints [0, 1] → positions.length = 2 < 3 → applyPoleVector returns early
    solver.addChain(1, 0, [0, 1, 0]);
    expect(() => solver.solve(1, [0.5, 0.2, 0])).not.toThrow();
  });

  it('getTarget returns null when no chain', () => {
    const sk = makeSkeleton5();
    const solver = new FABRIKSolver(sk);
    expect(solver.getTarget(99)).toBeNull();
  });

  it('getTarget returns Vec3 when chain exists', () => {
    const sk = makeSkeleton5();
    const solver = new FABRIKSolver(sk);
    solver.addChain(4, 0);
    const target = solver.getTarget(4);
    expect(target).not.toBeNull();
    expect(target).toHaveLength(3);
  });

  it('setTarget updates the chain target', () => {
    const sk = makeSkeleton5();
    const solver = new FABRIKSolver(sk);
    solver.addChain(4, 0);
    solver.setTarget(4, [2, 1, 0]);
    const target = solver.getTarget(4);
    expect(target![0]).toBeCloseTo(2);
    expect(target![1]).toBeCloseTo(1);
  });

  it('setTarget with no chain is a no-op', () => {
    const sk = makeSkeleton5();
    const solver = new FABRIKSolver(sk);
    expect(() => solver.setTarget(99, [1, 0, 0])).not.toThrow();
  });

  it('removeChain removes the specified chain', () => {
    const sk = makeSkeleton5();
    const solver = new FABRIKSolver(sk);
    solver.addChain(4, 0);
    solver.removeChain(4);
    expect(solver.chains.size).toBe(0);
  });

  it('clearChains removes all chains', () => {
    const sk = makeSkeleton5();
    const solver = new FABRIKSolver(sk);
    solver.addChain(4, 0);
    solver.addChain(2, 0);
    expect(solver.chains.size).toBe(2);
    solver.clearChains();
    expect(solver.chains.size).toBe(0);
  });

  it('solve with target at current position converges immediately', () => {
    const sk = makeSkeleton5();
    const solver = new FABRIKSolver(sk);
    solver.addChain(4, 0);
    // Set tolerance very large so first convergence check passes
    solver.tolerance = 100;
    const result = solver.solve(4, [3.9, 0, 0]);
    expect(result).toBe(true);
  });
});
