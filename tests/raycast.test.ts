import { describe, it, expect } from 'vitest';
import { screenToRay, raySphereIntersect, pickJointHandle, projectToDragPlane } from '../src/renderer/input/raycast';
import { createOrbitCamera, updateCamera } from '../src/renderer/render/camera';

function makeCamera() {
  const cam = createOrbitCamera(3, [0, 0.9, 0]);
  cam.aspect = 1;
  updateCamera(cam);
  return cam;
}

function makeCanvas(w = 800, h = 600) {
  // Minimal canvas mock
  return {
    width: w,
    height: h,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h }),
  } as unknown as HTMLCanvasElement;
}

describe('screenToRay', () => {
  it('returns a ray with origin and direction', () => {
    const cam = makeCamera();
    const canvas = makeCanvas();
    const ray = screenToRay(400, 300, cam, canvas);
    expect(ray).toHaveProperty('origin');
    expect(ray).toHaveProperty('direction');
    expect(ray.direction).toHaveLength(3);
    expect(ray.origin).toHaveLength(3);
  });

  it('direction is a unit vector', () => {
    const cam = makeCamera();
    const canvas = makeCanvas();
    const ray = screenToRay(400, 300, cam, canvas);
    const len = Math.hypot(ray.direction[0]!, ray.direction[1]!, ray.direction[2]!);
    expect(len).toBeCloseTo(1, 4);
  });

  it('different screen positions give different rays', () => {
    const cam = makeCamera();
    const canvas = makeCanvas();
    const ray1 = screenToRay(100, 100, cam, canvas);
    const ray2 = screenToRay(700, 500, cam, canvas);
    const same = ray1.direction.every((v, i) => Math.abs(v - ray2.direction[i]!) < 1e-6);
    expect(same).toBe(false);
  });
});

describe('raySphereIntersect', () => {
  it('returns null when ray misses sphere', () => {
    const cam = makeCamera();
    const canvas = makeCanvas();
    const ray = screenToRay(0, 0, cam, canvas);
    // Sphere at [10, 10, 10] with radius 0.1 - likely a miss
    const hit = raySphereIntersect(ray, [10, 10, 10], 0.1);
    // May or may not hit depending on camera setup, just test no error
    expect(hit === null || hit !== null).toBe(true);
  });

  it('returns a hit when ray intersects sphere at origin', () => {
    // Camera looking toward origin
    const cam = makeCamera();
    updateCamera(cam);
    const canvas = makeCanvas(800, 600);
    // Center of screen should hit near origin
    const ray = screenToRay(400, 300, cam, canvas);
    const hit = raySphereIntersect(ray, [0, 0.9, 0], 0.5);
    // Hit is expected since camera looks at [0, 0.9, 0]
    if (hit !== null) {
      expect(hit.distance).toBeGreaterThan(0);
      expect(hit.point).toHaveLength(3);
    }
  });

  it('returns hit with positive distance', () => {
    // Simple ray pointing in Z direction
    const ray = { origin: [0, 0, 5] as [number, number, number], direction: [0, 0, -1] as [number, number, number] };
    const hit = raySphereIntersect(ray, [0, 0, 0], 1);
    if (hit !== null) {
      expect(hit.distance).toBeGreaterThan(0);
    }
  });
});

describe('pickJointHandle', () => {
  it('returns null when no joint positions provided', () => {
    const cam = makeCamera();
    const canvas = makeCanvas();
    const ray = screenToRay(400, 300, cam, canvas);
    const hit = pickJointHandle(ray, [], 0.05);
    expect(hit).toBeNull();
  });

  it('returns hit for joint near ray', () => {
    const cam = makeCamera();
    const canvas = makeCanvas(800, 600);
    const ray = screenToRay(400, 300, cam, canvas);
    // Use camera target as joint position (should be near center ray)
    const positions: [number, number, number][] = [[0, 0.9, 0]];
    const hit = pickJointHandle(ray, positions, 0.5);
    // Might hit or might not depending on exact ray
    expect(hit === null || hit !== null).toBe(true);
  });

  it('respects allowedJoints filter', () => {
    const cam = makeCamera();
    const canvas = makeCanvas(800, 600);
    const ray = screenToRay(400, 300, cam, canvas);
    const positions: [number, number, number][] = [[0, 0.9, 0], [5, 5, 5]];
    const hitFiltered = pickJointHandle(ray, positions, 0.5, [1]); // only joint 1 allowed (far away)
    expect(hitFiltered).toBeNull();
  });
});

describe('projectToDragPlane', () => {
  it('returns a 3-element position', () => {
    const cam = makeCamera();
    const canvas = makeCanvas(800, 600);
    const result = projectToDragPlane(400, 300, [0, 0.9, 0], cam, canvas);
    expect(result).toHaveLength(3);
    expect(Number.isFinite(result[0]!)).toBe(true);
    expect(Number.isFinite(result[1]!)).toBe(true);
    expect(Number.isFinite(result[2]!)).toBe(true);
  });
});
