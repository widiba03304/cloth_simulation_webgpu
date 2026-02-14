/**
 * GPU-accelerated Linear Blend Skinning using WebGPU Compute Shaders
 */

import type { Skeleton } from '../ik/skeleton';
import type { SMPLPoseData } from '../render/smplPoseData';
import type { BodyMesh } from '../render/bodyMesh';
import skinningShader from './skinning.wgsl?raw';

/**
 * Multiply two 4x4 matrices: out = a * b (column-major).
 */
function mat4Multiply(out: Float32Array, a: Float32Array, b: Float32Array): Float32Array {
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

  const b00 = b[0], b01 = b[1], b02 = b[2], b03 = b[3];
  const b10 = b[4], b11 = b[5], b12 = b[6], b13 = b[7];
  const b20 = b[8], b21 = b[9], b22 = b[10], b23 = b[11];
  const b30 = b[12], b31 = b[13], b32 = b[14], b33 = b[15];

  out[0] = a00 * b00 + a10 * b01 + a20 * b02 + a30 * b03;
  out[1] = a01 * b00 + a11 * b01 + a21 * b02 + a31 * b03;
  out[2] = a02 * b00 + a12 * b01 + a22 * b02 + a32 * b03;
  out[3] = a03 * b00 + a13 * b01 + a23 * b02 + a33 * b03;

  out[4] = a00 * b10 + a10 * b11 + a20 * b12 + a30 * b13;
  out[5] = a01 * b10 + a11 * b11 + a21 * b12 + a31 * b13;
  out[6] = a02 * b10 + a12 * b11 + a22 * b12 + a32 * b13;
  out[7] = a03 * b10 + a13 * b11 + a23 * b12 + a33 * b13;

  out[8] = a00 * b20 + a10 * b21 + a20 * b22 + a30 * b23;
  out[9] = a01 * b20 + a11 * b21 + a21 * b22 + a31 * b23;
  out[10] = a02 * b20 + a12 * b21 + a22 * b22 + a32 * b23;
  out[11] = a03 * b20 + a13 * b21 + a23 * b22 + a33 * b23;

  out[12] = a00 * b30 + a10 * b31 + a20 * b32 + a30 * b33;
  out[13] = a01 * b30 + a11 * b31 + a21 * b32 + a31 * b33;
  out[14] = a02 * b30 + a12 * b31 + a22 * b32 + a32 * b33;
  out[15] = a03 * b30 + a13 * b31 + a23 * b32 + a33 * b33;

  return out;
}

export class GPUSkinning {
  private device: GPUDevice;
  private pipeline: GPUComputePipeline | null = null;
  private bindGroup: GPUBindGroup | null = null;

  // GPU Buffers
  private restPositionsBuffer: GPUBuffer;
  private restNormalsBuffer: GPUBuffer;
  private skinWeightsBuffer: GPUBuffer;
  private jointTransformsBuffer: GPUBuffer;
  private deformedPositionsBuffer: GPUBuffer;
  private deformedNormalsBuffer: GPUBuffer;
  private paramsBuffer: GPUBuffer;

  // Staging buffer for reading back results (if needed)
  private readbackPositionsBuffer: GPUBuffer | null = null;
  private readbackNormalsBuffer: GPUBuffer | null = null;

  private numVertices: number;
  private numJoints: number;

  constructor(
    device: GPUDevice,
    poseData: SMPLPoseData,
    restMesh: BodyMesh
  ) {
    this.device = device;
    this.numVertices = poseData.num_vertices;
    this.numJoints = poseData.num_joints;

    // Create buffers
    this.restPositionsBuffer = this.createBuffer(
      restMesh.positions,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      'Rest Positions'
    );

    this.restNormalsBuffer = this.createBuffer(
      restMesh.normals || new Float32Array(this.numVertices * 3),
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      'Rest Normals'
    );

    this.skinWeightsBuffer = this.createBuffer(
      poseData.weights,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      'Skin Weights'
    );

    // Joint transforms buffer (24 joints × 16 floats per 4x4 matrix)
    this.jointTransformsBuffer = device.createBuffer({
      label: 'Joint Transforms',
      size: this.numJoints * 16 * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    // Output buffers
    this.deformedPositionsBuffer = device.createBuffer({
      label: 'Deformed Positions',
      size: this.numVertices * 3 * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });

    this.deformedNormalsBuffer = device.createBuffer({
      label: 'Deformed Normals',
      size: this.numVertices * 3 * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });

    // Params buffer
    const paramsData = new Uint32Array([this.numVertices, this.numJoints]);
    this.paramsBuffer = this.createBuffer(
      paramsData,
      GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      'Skinning Params'
    );

    this.initializePipeline();

    console.log('GPU Skinning initialized');
    console.log(`  Vertices: ${this.numVertices}, Joints: ${this.numJoints}`);

    // Verify rest positions are valid
    const sampleVerts = [0, 1000, 3000, 6000];
    console.log('  Sample rest positions:');
    for (const v of sampleVerts) {
      if (v < this.numVertices) {
        const x = restMesh.positions[v * 3];
        const y = restMesh.positions[v * 3 + 1];
        const z = restMesh.positions[v * 3 + 2];
        console.log(`    Vertex ${v}: (${x.toFixed(3)}, ${y.toFixed(3)}, ${z.toFixed(3)})`);
      }
    }
  }

  private createBuffer(
    data: Float32Array | Uint32Array,
    usage: GPUBufferUsageFlags,
    label: string
  ): GPUBuffer {
    const buffer = this.device.createBuffer({
      label,
      size: data.byteLength,
      usage,
      mappedAtCreation: true,
    });

    const arrayType = data instanceof Float32Array ? Float32Array : Uint32Array;
    new arrayType(buffer.getMappedRange()).set(data);
    buffer.unmap();

    return buffer;
  }

  private initializePipeline(): void {
    // Create shader module
    const shaderModule = this.device.createShaderModule({
      label: 'Skinning Compute Shader',
      code: skinningShader,
    });

    // Create bind group layout
    const bindGroupLayout = this.device.createBindGroupLayout({
      label: 'Skinning Bind Group Layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },  // restPositions
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },  // restNormals
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },  // skinWeights
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },  // jointTransforms
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },            // deformedPositions
        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },            // deformedNormals
        { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },            // params
      ],
    });

    // Create pipeline
    this.pipeline = this.device.createComputePipeline({
      label: 'Skinning Compute Pipeline',
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayout],
      }),
      compute: {
        module: shaderModule,
        entryPoint: 'main',
      },
    });

    // Create bind group
    this.bindGroup = this.device.createBindGroup({
      label: 'Skinning Bind Group',
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.restPositionsBuffer } },
        { binding: 1, resource: { buffer: this.restNormalsBuffer } },
        { binding: 2, resource: { buffer: this.skinWeightsBuffer } },
        { binding: 3, resource: { buffer: this.jointTransformsBuffer } },
        { binding: 4, resource: { buffer: this.deformedPositionsBuffer } },
        { binding: 5, resource: { buffer: this.deformedNormalsBuffer } },
        { binding: 6, resource: { buffer: this.paramsBuffer } },
      ],
    });
  }

  /**
   * Compute skinning on GPU using current skeleton pose
   * Uses provided command encoder for proper synchronization with buffer copies
   */
  computeSkinning(skeleton: Skeleton, commandEncoder: GPUCommandEncoder): void {
    if (!this.pipeline || !this.bindGroup) {
      console.error('GPU skinning not initialized');
      return;
    }

    // Extract skinning matrices: currentPose * inverse(bindPose)
    const jointMatrices = new Float32Array(this.numJoints * 16);
    for (let i = 0; i < this.numJoints; i++) {
      const joint = skeleton.joints[i];

      // Skinning matrix = currentWorldTransform * inverseBindPose
      const skinningMatrix = mat4Multiply(
        new Float32Array(16),
        joint.worldTransform,
        joint.inverseBindPose
      );

      // Copy skinning matrix (column-major for WGSL)
      for (let j = 0; j < 16; j++) {
        jointMatrices[i * 16 + j] = skinningMatrix[j];
      }
    }

    // DETAILED LOGGING for joint 0 to verify test rotation
    const j0 = Array.from(jointMatrices.slice(0, 16)).map(v => v.toFixed(3));
    console.log('[GPUSkinning] ===== JOINT 0 (PELVIS) TRANSFORM =====');
    console.log('[GPUSkinning] Column 0 (right):', j0.slice(0, 4));
    console.log('[GPUSkinning] Column 1 (up):   ', j0.slice(4, 8));
    console.log('[GPUSkinning] Column 2 (fwd):  ', j0.slice(8, 12));
    console.log('[GPUSkinning] Column 3 (pos):  ', j0.slice(12, 16));
    console.log('[GPUSkinning] Quaternion:', skeleton.joints[0].localRotation.map(v => v.toFixed(3)));
    console.log('[GPUSkinning] World Position:', skeleton.joints[0].worldPosition.map(v => v.toFixed(3)));

    // Check if this is an identity matrix or has rotation
    const isIdentityRotation =
      Math.abs(parseFloat(j0[0]) - 1.0) < 0.01 &&
      Math.abs(parseFloat(j0[5]) - 1.0) < 0.01 &&
      Math.abs(parseFloat(j0[10]) - 1.0) < 0.01;
    console.log('[GPUSkinning] Joint 0 rotation status:', isIdentityRotation ? 'IDENTITY (no rotation)' : 'HAS ROTATION');
    console.log('[GPUSkinning] =====================================');

    // Upload joint transforms to GPU
    this.device.queue.writeBuffer(this.jointTransformsBuffer, 0, jointMatrices);
    console.log('[GPUSkinning] Uploaded', this.numJoints, 'joint transforms to GPU');

    // Compute pass (using provided command encoder)
    const passEncoder = commandEncoder.beginComputePass({
      label: 'Skinning Compute Pass',
    });

    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, this.bindGroup);

    // Dispatch workgroups (64 threads per workgroup)
    const workgroupSize = 64;
    const numWorkgroups = Math.ceil(this.numVertices / workgroupSize);
    console.log('[GPUSkinning] Dispatching', numWorkgroups, 'workgroups for', this.numVertices, 'vertices');
    passEncoder.dispatchWorkgroups(numWorkgroups);

    passEncoder.end();
    console.log('[GPUSkinning] Compute pass completed');
  }

  /**
   * Get deformed positions buffer (for rendering)
   */
  getDeformedPositionsBuffer(): GPUBuffer {
    return this.deformedPositionsBuffer;
  }

  /**
   * Get deformed normals buffer (for rendering)
   */
  getDeformedNormalsBuffer(): GPUBuffer {
    return this.deformedNormalsBuffer;
  }

  /**
   * Copy deformed mesh data to render buffers
   */
  copyToRenderBuffers(
    commandEncoder: GPUCommandEncoder,
    targetPositionsBuffer: GPUBuffer,
    targetNormalsBuffer: GPUBuffer
  ): void {
    const posSize = this.numVertices * 3 * Float32Array.BYTES_PER_ELEMENT;

    commandEncoder.copyBufferToBuffer(
      this.deformedPositionsBuffer,
      0,
      targetPositionsBuffer,
      0,
      posSize
    );

    commandEncoder.copyBufferToBuffer(
      this.deformedNormalsBuffer,
      0,
      targetNormalsBuffer,
      0,
      posSize
    );
  }

  /**
   * Clean up GPU resources
   */
  dispose(): void {
    this.restPositionsBuffer.destroy();
    this.restNormalsBuffer.destroy();
    this.skinWeightsBuffer.destroy();
    this.jointTransformsBuffer.destroy();
    this.deformedPositionsBuffer.destroy();
    this.deformedNormalsBuffer.destroy();
    this.paramsBuffer.destroy();

    if (this.readbackPositionsBuffer) this.readbackPositionsBuffer.destroy();
    if (this.readbackNormalsBuffer) this.readbackNormalsBuffer.destroy();
  }
}
