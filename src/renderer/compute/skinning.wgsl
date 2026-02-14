/**
 * GPU Linear Blend Skinning Compute Shader
 * Deforms mesh vertices based on skeleton joint transforms
 */

struct JointTransform {
  matrix: mat4x4<f32>,  // 4x4 transform matrix
}

// Input buffers
@group(0) @binding(0) var<storage, read> restPositions: array<f32>;     // Rest pose positions (N*3)
@group(0) @binding(1) var<storage, read> restNormals: array<f32>;       // Rest pose normals (N*3)
@group(0) @binding(2) var<storage, read> skinWeights: array<f32>;       // Skinning weights (N*24)
@group(0) @binding(3) var<storage, read> jointTransforms: array<JointTransform>;  // Joint transforms (24)

// Output buffers
@group(0) @binding(4) var<storage, read_write> deformedPositions: array<f32>;  // Output positions (N*3)
@group(0) @binding(5) var<storage, read_write> deformedNormals: array<f32>;    // Output normals (N*3)

// Uniforms
struct SkinningParams {
  numVertices: u32,
  numJoints: u32,
}
@group(0) @binding(6) var<uniform> params: SkinningParams;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let vertexIndex = global_id.x;

  // Early return if out of bounds
  if (vertexIndex >= params.numVertices) {
    return;
  }

  // Get rest pose position and normal
  let posIdx = vertexIndex * 3u;
  let restPos = vec3<f32>(
    restPositions[posIdx],
    restPositions[posIdx + 1u],
    restPositions[posIdx + 2u]
  );

  let restNorm = vec3<f32>(
    restNormals[posIdx],
    restNormals[posIdx + 1u],
    restNormals[posIdx + 2u]
  );

  // Linear Blend Skinning: Accumulate weighted transforms
  var finalPos = vec3<f32>(0.0, 0.0, 0.0);
  var finalNorm = vec3<f32>(0.0, 0.0, 0.0);

  // Get skinning weights for this vertex
  let weightIdx = vertexIndex * params.numJoints;

  for (var j = 0u; j < params.numJoints; j = j + 1u) {
    let weight = skinWeights[weightIdx + j];

    // Skip joints with negligible weight
    if (weight < 0.001) {
      continue;
    }

    // Get joint transform matrix
    let transform = jointTransforms[j].matrix;

    // Transform position and accumulate
    let transformedPos = (transform * vec4<f32>(restPos, 1.0)).xyz;
    finalPos = finalPos + weight * transformedPos;

    // Transform normal (use 3x3 part, no translation) and accumulate
    let transformedNorm = (transform * vec4<f32>(restNorm, 0.0)).xyz;
    finalNorm = finalNorm + weight * transformedNorm;
  }

  // Normalize the final normal
  finalNorm = normalize(finalNorm);

  // Write output
  deformedPositions[posIdx] = finalPos.x;
  deformedPositions[posIdx + 1u] = finalPos.y;
  deformedPositions[posIdx + 2u] = finalPos.z;

  deformedNormals[posIdx] = finalNorm.x;
  deformedNormals[posIdx + 1u] = finalNorm.y;
  deformedNormals[posIdx + 2u] = finalNorm.z;
}
