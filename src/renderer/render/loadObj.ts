/**
 * OBJ parser: extracts positions, normals (if available), and triangle faces.
 * Used for loading SMPL-exported mesh (e.g. from smpl/smpl_webuser/hello_world).
 */

export interface ObjMesh {
  positions: Float32Array;
  indices: Uint32Array;
  normals?: Float32Array;
}

export function parseObj(objText: string): ObjMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const faceIndices: number[] = [];
  const faceNormalIndices: number[] = [];

  const lines = objText.split(/\r?\n/);
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) continue;

    if (parts[0] === 'v' && parts.length >= 4) {
      // Vertex position
      positions.push(
        parseFloat(parts[1]!) || 0,
        parseFloat(parts[2]!) || 0,
        parseFloat(parts[3]!) || 0
      );
    } else if (parts[0] === 'vn' && parts.length >= 4) {
      // Vertex normal
      normals.push(
        parseFloat(parts[1]!) || 0,
        parseFloat(parts[2]!) || 0,
        parseFloat(parts[3]!) || 0
      );
    } else if (parts[0] === 'f' && parts.length >= 4) {
      // Face (can be v, v/vt, or v/vt/vn format)
      const n = parts.length - 1;

      const getIndices = (i: number): { v: number; vn: number } => {
        const faceData = parts[1 + i]!.split('/');
        const vIdx = parseInt(faceData[0] ?? '0', 10);
        const vnIdx = faceData[2] ? parseInt(faceData[2], 10) : 0;
        return {
          v: vIdx > 0 ? vIdx - 1 : 0,
          vn: vnIdx > 0 ? vnIdx - 1 : -1,
        };
      };

      if (n === 3) {
        // Triangle
        const v0 = getIndices(0);
        const v1 = getIndices(1);
        const v2 = getIndices(2);
        faceIndices.push(v0.v, v1.v, v2.v);
        faceNormalIndices.push(v0.vn, v1.vn, v2.vn);
      } else if (n === 4) {
        // Quad -> split into two triangles
        const v0 = getIndices(0);
        const v1 = getIndices(1);
        const v2 = getIndices(2);
        const v3 = getIndices(3);
        faceIndices.push(v0.v, v1.v, v2.v, v0.v, v2.v, v3.v);
        faceNormalIndices.push(v0.vn, v1.vn, v2.vn, v0.vn, v2.vn, v3.vn);
      }
    }
  }

  // If OBJ has normals, reindex them to match vertices
  let vertexNormals: Float32Array | undefined;
  if (normals.length > 0 && faceNormalIndices.every(i => i >= 0)) {
    // Create vertex-indexed normals from face normal indices
    const numVertices = positions.length / 3;
    vertexNormals = new Float32Array(numVertices * 3);
    const normalCounts = new Uint32Array(numVertices);

    for (let i = 0; i < faceIndices.length; i++) {
      const vIdx = faceIndices[i]!;
      const nIdx = faceNormalIndices[i]!;

      if (nIdx >= 0 && nIdx * 3 + 2 < normals.length) {
        vertexNormals[vIdx * 3] += normals[nIdx * 3]!;
        vertexNormals[vIdx * 3 + 1] += normals[nIdx * 3 + 1]!;
        vertexNormals[vIdx * 3 + 2] += normals[nIdx * 3 + 2]!;
        normalCounts[vIdx]++;
      }
    }

    // Average normals
    for (let i = 0; i < numVertices; i++) {
      const count = normalCounts[i];
      if (count > 0) {
        const len = Math.sqrt(
          vertexNormals[i * 3]! ** 2 +
          vertexNormals[i * 3 + 1]! ** 2 +
          vertexNormals[i * 3 + 2]! ** 2
        );
        if (len > 0.0001) {
          vertexNormals[i * 3] /= len;
          vertexNormals[i * 3 + 1] /= len;
          vertexNormals[i * 3 + 2] /= len;
        }
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(faceIndices),
    normals: vertexNormals,
  };
}
