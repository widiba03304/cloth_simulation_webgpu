/**
 * Shared types for simulation. Used by simulation, render, and UI.
 */

/** Particle: position (vec3) + previous position (Verlet) or velocity. Layout matches WGSL. */
export interface ParticleData {
  /** Current position, 3 floats per particle */
  position: Float32Array;
  /** Previous position (Verlet) or velocity */
  prevPosition: Float32Array;
  /** Mass per particle (optional; 1 if omitted) */
  mass?: Float32Array;
}

/** Cloth mesh: vertices and triangle indices. Constraint lists are separate. */
export interface ClothMesh {
  /** Vertex positions, 3 floats each (x, y, z) */
  positions: Float32Array;
  /** Triangle indices (3 per triangle) */
  indices: Uint32Array;
  /** Number of vertices */
  numVertices: number;
  /** Number of triangles */
  numTriangles: number;
}

/** Single constraint: two vertex indices and rest length. */
export interface Constraint {
  i: number;
  j: number;
  restLength: number;
}

/** All constraint lists for the cloth. */
export interface ClothConstraints {
  structural: Float32Array; // 3 floats per constraint: i, j, restLength
  shear: Float32Array;
  bend: Float32Array;
  numStructural: number;
  numShear: number;
  numBend: number;
}

/** Full cloth data: mesh + constraints. Used to init simulation and render. */
export interface ClothData {
  mesh: ClothMesh;
  constraints: ClothConstraints;
}

/** Simulation parameters (material presets map to these). */
export interface SimulationParams {
  gravity: [number, number, number];
  stiffness: number;      // structural
  shearStiffness: number;
  bendStiffness: number;
  damping: number;
  mass: number;
  dt: number;
  iterations: number;
}
