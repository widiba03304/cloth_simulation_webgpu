/**
 * Linear Blend Skinning (LBS) for SMPL mesh deformation.
 * Deforms vertices based on joint transforms weighted by skinning weights.
 */

import type { Skeleton, Mat4, Vec3 } from './skeleton';
import type { SMPLPoseData } from '../render/smplPoseData';
import type { BodyMesh } from '../render/bodyMesh';
import { calculateSmoothNormals } from '../render/bodyMesh';

/**
 * Sparse skinning weights for optimization.
 * Only stores non-zero weights to skip computation.
 */
interface SparseWeights {
  vertexId: number;
  jointId: number;
  weight: number;
}

/**
 * Linear Blend Skinning implementation for SMPL.
 */
export class LinearBlendSkinning {
  numVertices: number;
  numJoints: number;
  weights: Float32Array; // (numVertices × numJoints) row-major
  restPositions: Float32Array; // (numVertices × 3)
  restNormals: Float32Array; // (numVertices × 3)
  sparseWeights: SparseWeights[]; // Optimized non-zero weights

  // Temp buffers for deformation
  private deformedPositions: Float32Array;
  private deformedNormals: Float32Array;

  constructor(poseData: SMPLPoseData, restMesh: BodyMesh) {
    this.numVertices = poseData.num_vertices;
    this.numJoints = poseData.num_joints;
    this.weights = poseData.weights;
    this.restPositions = restMesh.positions;
    this.restNormals = restMesh.normals || new Float32Array(this.numVertices * 3);

    // Preallocate output buffers
    this.deformedPositions = new Float32Array(this.numVertices * 3);
    this.deformedNormals = new Float32Array(this.numVertices * 3);

    // Build sparse weight structure for optimization
    this.sparseWeights = this.buildSparseWeights();

    console.log(`LBS initialized: ${this.numVertices} vertices, ${this.numJoints} joints`);
    console.log(`  Sparse weights: ${this.sparseWeights.length} entries (${((this.sparseWeights.length / (this.numVertices * this.numJoints)) * 100).toFixed(1)}% non-zero)`);
  }

  /**
   * Build sparse weight representation (skip weights < threshold).
   */
  private buildSparseWeights(): SparseWeights[] {
    const threshold = 0.001; // Skip weights below this
    const sparse: SparseWeights[] = [];

    for (let v = 0; v < this.numVertices; v++) {
      for (let j = 0; j < this.numJoints; j++) {
        const weight = this.weights[v * this.numJoints + j];
        if (weight >= threshold) {
          sparse.push({ vertexId: v, jointId: j, weight });
        }
      }
    }

    return sparse;
  }

  /**
   * Deform mesh using Linear Blend Skinning.
   * Formula: v' = Σ(w[i,j] × T[j] × v[i])
   * @param skeleton - Skeleton with current joint transforms
   * @returns Deformed mesh
   */
  deformMesh(skeleton: Skeleton): BodyMesh {
    // Reset output buffers
    this.deformedPositions.fill(0);
    this.deformedNormals.fill(0);

    // Deform each vertex using sparse weights
    for (const { vertexId, jointId, weight } of this.sparseWeights) {
      const v = vertexId;
      const j = jointId;

      // Get rest position
      const vx = this.restPositions[v * 3];
      const vy = this.restPositions[v * 3 + 1];
      const vz = this.restPositions[v * 3 + 2];

      // Get joint transform
      const joint = skeleton.getJoint(j)!;
      const T = joint.worldTransform;

      // Transform vertex: T * v (4x4 COLUMN-MAJOR matrix × homogeneous point)
      const tx = T[0] * vx + T[4] * vy + T[8] * vz + T[12];
      const ty = T[1] * vx + T[5] * vy + T[9] * vz + T[13];
      const tz = T[2] * vx + T[6] * vy + T[10] * vz + T[14];

      // Accumulate weighted contribution
      this.deformedPositions[v * 3] += weight * tx;
      this.deformedPositions[v * 3 + 1] += weight * ty;
      this.deformedPositions[v * 3 + 2] += weight * tz;

      // Transform normal (use 3x3 rotation part, ignore translation)
      const nx = this.restNormals[v * 3];
      const ny = this.restNormals[v * 3 + 1];
      const nz = this.restNormals[v * 3 + 2];

      const tnx = T[0] * nx + T[4] * ny + T[8] * nz;
      const tny = T[1] * nx + T[5] * ny + T[9] * nz;
      const tnz = T[2] * nx + T[6] * ny + T[10] * nz;

      this.deformedNormals[v * 3] += weight * tnx;
      this.deformedNormals[v * 3 + 1] += weight * tny;
      this.deformedNormals[v * 3 + 2] += weight * tnz;
    }

    // Normalize normals
    for (let v = 0; v < this.numVertices; v++) {
      const nx = this.deformedNormals[v * 3];
      const ny = this.deformedNormals[v * 3 + 1];
      const nz = this.deformedNormals[v * 3 + 2];

      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (len > 0.0001) {
        this.deformedNormals[v * 3] = nx / len;
        this.deformedNormals[v * 3 + 1] = ny / len;
        this.deformedNormals[v * 3 + 2] = nz / len;
      } else {
        // Default to up vector if normal is zero
        this.deformedNormals[v * 3] = 0;
        this.deformedNormals[v * 3 + 1] = 1;
        this.deformedNormals[v * 3 + 2] = 0;
      }
    }

    // Return deformed mesh (reuse rest mesh indices)
    return {
      positions: this.deformedPositions,
      indices: new Uint32Array(0), // Will use original indices
      normals: this.deformedNormals,
    };
  }

  /**
   * Get skinning weights for a specific vertex.
   */
  getVertexWeights(vertexId: number): Float32Array {
    const weights = new Float32Array(this.numJoints);
    for (let j = 0; j < this.numJoints; j++) {
      weights[j] = this.weights[vertexId * this.numJoints + j];
    }
    return weights;
  }

  /**
   * Get vertices influenced by a specific joint.
   */
  getInfluencedVertices(jointId: number, threshold: number = 0.1): number[] {
    const vertices: number[] = [];
    for (let v = 0; v < this.numVertices; v++) {
      const weight = this.weights[v * this.numJoints + jointId];
      if (weight >= threshold) {
        vertices.push(v);
      }
    }
    return vertices;
  }
}

/**
 * Helper: Create rest mesh from SMPL template with shape blend shapes applied.
 * This should be called once when initializing the skinning system.
 */
export function createRestMesh(
  poseData: SMPLPoseData,
  shapePositions: Float32Array,
  indices: Uint32Array
): BodyMesh {
  // Calculate smooth normals for rest mesh
  const normals = calculateSmoothNormals(shapePositions, indices);

  return {
    positions: shapePositions,
    indices,
    normals,
  };
}
