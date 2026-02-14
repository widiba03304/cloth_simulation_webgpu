/**
 * SMPL pose data loader for inverse kinematics (IK).
 * Loads skeletal data: joint positions, skinning weights, kinematic tree.
 */

export interface SMPLPoseData {
  num_joints: number;           // 24 joints in SMPL
  num_vertices: number;         // 6890 vertices
  v_template: Float32Array;     // (6890, 3) template mesh vertices
  j_regressor: Float32Array;    // (24, 6890) matrix to compute joints from vertices
  joint_positions: Float32Array; // (24, 3) rest pose joint positions
  kintree_table: number[][];    // (2, 24) parent-child relationships
  weights: Float32Array;         // (6890, 24) skinning weights
  posedirs?: Float32Array;       // (6890, 3, 207) pose blend shapes (optional)
  num_pose_params?: number;      // 207 pose parameters (if posedirs present)
  joint_names: string[];         // 24 joint names
}

let malePoseData: SMPLPoseData | null = null;
let femalePoseData: SMPLPoseData | null = null;

const SMPL_MALE_POSE_URL = new URL('../assets/samples/avatars/smpl_male_pose.json', import.meta.url).href;
const SMPL_FEMALE_POSE_URL = new URL('../assets/samples/avatars/smpl_female_pose.json', import.meta.url).href;

/**
 * Load SMPL pose data for both genders from JSON files.
 */
export async function loadSMPLPoseData(): Promise<{ male: SMPLPoseData | null; female: SMPLPoseData | null }> {
  const [male, female] = await Promise.all([
    loadOnePoseData(SMPL_MALE_POSE_URL),
    loadOnePoseData(SMPL_FEMALE_POSE_URL),
  ]);

  malePoseData = male;
  femalePoseData = female;

  return { male, female };
}

/**
 * Get cached pose data for specific gender.
 */
export function getPoseData(gender: 'male' | 'female'): SMPLPoseData | null {
  return gender === 'male' ? malePoseData : femalePoseData;
}

/**
 * Load a single SMPL pose data JSON file.
 */
async function loadOnePoseData(url: string): Promise<SMPLPoseData | null> {
  try {
    console.log(`Loading SMPL pose data from ${url}...`);
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`Failed to load SMPL pose data: ${res.statusText}`);
      return null;
    }

    const json = await res.json();

    // Validate structure
    if (!json.num_joints || !json.joint_positions || !json.kintree_table || !json.weights || !json.v_template || !json.j_regressor) {
      console.error('Invalid SMPL pose data: missing required fields');
      return null;
    }

    // Convert arrays to typed arrays for performance
    const poseData: SMPLPoseData = {
      num_joints: json.num_joints,
      num_vertices: json.num_vertices,
      v_template: new Float32Array(json.v_template),
      j_regressor: new Float32Array(json.j_regressor),
      joint_positions: new Float32Array(json.joint_positions),
      kintree_table: json.kintree_table, // Keep as regular array for easy indexing
      weights: new Float32Array(json.weights),
      joint_names: json.joint_names,
    };

    // Optional pose blend shapes
    if (json.posedirs && json.num_pose_params) {
      poseData.posedirs = new Float32Array(json.posedirs);
      poseData.num_pose_params = json.num_pose_params;
      console.log(`  Loaded pose blend shapes: ${json.num_pose_params} parameters`);
    }

    console.log(`  Loaded SMPL pose data: ${poseData.num_joints} joints, ${poseData.num_vertices} vertices`);
    console.log(`  Skinning weights: ${poseData.weights.length} floats (${poseData.num_vertices} × ${poseData.num_joints})`);

    // Validate array sizes
    const expectedJointPositions = poseData.num_joints * 3;
    const expectedWeights = poseData.num_vertices * poseData.num_joints;

    if (poseData.joint_positions.length !== expectedJointPositions) {
      console.error(`Invalid joint_positions size: expected ${expectedJointPositions}, got ${poseData.joint_positions.length}`);
      return null;
    }

    if (poseData.weights.length !== expectedWeights) {
      console.error(`Invalid weights size: expected ${expectedWeights}, got ${poseData.weights.length}`);
      return null;
    }

    return poseData;
  } catch (error) {
    console.error('Error loading SMPL pose data:', error);
    return null;
  }
}

/**
 * Get joint name by index.
 */
export function getJointName(poseData: SMPLPoseData, jointIndex: number): string {
  if (jointIndex < 0 || jointIndex >= poseData.joint_names.length) {
    return `joint_${jointIndex}`;
  }
  return poseData.joint_names[jointIndex];
}

/**
 * Get joint index by name.
 */
export function getJointIndex(poseData: SMPLPoseData, jointName: string): number {
  return poseData.joint_names.indexOf(jointName);
}

/**
 * Get parent joint index for a given joint.
 */
export function getParentJoint(poseData: SMPLPoseData, jointIndex: number): number {
  if (jointIndex < 0 || jointIndex >= poseData.num_joints) {
    return -1;
  }
  return poseData.kintree_table[0][jointIndex];
}

/**
 * Get all child joints for a given joint.
 */
export function getChildJoints(poseData: SMPLPoseData, jointIndex: number): number[] {
  const children: number[] = [];
  const parentIds = poseData.kintree_table[0];

  for (let i = 0; i < poseData.num_joints; i++) {
    if (parentIds[i] === jointIndex) {
      children.push(i);
    }
  }

  return children;
}

/**
 * IK-controllable joint indices (wrists, ankles, elbows, knees).
 */
export const IK_JOINT_INDICES = {
  LEFT_KNEE: 4,
  RIGHT_KNEE: 5,
  LEFT_ANKLE: 7,
  RIGHT_ANKLE: 8,
  LEFT_ELBOW: 18,
  RIGHT_ELBOW: 19,
  LEFT_WRIST: 20,
  RIGHT_WRIST: 21,
} as const;

/**
 * Get all IK-controllable joint indices as array.
 */
export function getIKJointIndices(): number[] {
  return Object.values(IK_JOINT_INDICES);
}

/**
 * Recompute joint positions from mesh vertices using J_regressor.
 * Used when body shape changes (after applying blend shapes).
 * Formula: joint_positions = J_regressor @ vertices
 *
 * @param poseData - SMPL pose data with J_regressor matrix
 * @param vertices - Mesh vertex positions (6890 × 3) as Float32Array
 * @returns New joint positions (24 × 3) as Float32Array
 */
export function recomputeJointPositions(
  poseData: SMPLPoseData,
  vertices: Float32Array
): Float32Array {
  const numJoints = poseData.num_joints;  // 24
  const numVertices = poseData.num_vertices;  // 6890

  // Validate input
  if (vertices.length !== numVertices * 3) {
    console.error(`Invalid vertices size: expected ${numVertices * 3}, got ${vertices.length}`);
    return poseData.joint_positions;
  }

  // Initialize output
  const jointPositions = new Float32Array(numJoints * 3);

  // Matrix multiply: J_regressor (24 × 6890) @ vertices (6890 × 3) → joints (24 × 3)
  for (let j = 0; j < numJoints; j++) {
    let x = 0, y = 0, z = 0;

    // For each vertex, accumulate weighted contribution
    for (let v = 0; v < numVertices; v++) {
      const weight = poseData.j_regressor[j * numVertices + v];

      // Skip zero weights for efficiency
      if (Math.abs(weight) < 0.0001) continue;

      x += weight * vertices[v * 3];
      y += weight * vertices[v * 3 + 1];
      z += weight * vertices[v * 3 + 2];
    }

    jointPositions[j * 3] = x;
    jointPositions[j * 3 + 1] = y;
    jointPositions[j * 3 + 2] = z;
  }

  return jointPositions;
}
