/**
 * Test Utilities
 * Helper functions for creating test data
 */

import type { SMPLPoseData } from '../src/renderer/render/smplPoseData';

export function createTestPoseData(
  numJoints: number,
  numVertices: number,
  jointPositions: Float32Array,
  jointHierarchy: Int32Array
): SMPLPoseData {
  // Create joint names
  const jointNames: string[] = [];
  for (let i = 0; i < numJoints; i++) {
    jointNames.push(`joint_${i}`);
  }

  // Create kintree_table from hierarchy
  const kintree = [
    Array.from({ length: numJoints }, (_, i) => i),  // Row 0: joint IDs
    Array.from(jointHierarchy)                        // Row 1: parent IDs
  ];

  // Create minimal required data
  return {
    num_joints: numJoints,
    num_vertices: numVertices,
    v_template: new Float32Array(numVertices * 3),
    j_regressor: new Float32Array(numJoints * numVertices),
    joint_positions: jointPositions,
    kintree_table: kintree,
    weights: new Float32Array(numVertices * numJoints),
    joint_names: jointNames
  };
}
