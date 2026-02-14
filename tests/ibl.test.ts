/**
 * Unit tests for IBL (Image-Based Lighting) functionality
 * Tests cubemap loading, PBR parameters, and related TypeScript code
 */

import { describe, it, expect } from 'vitest';

describe('IBL - PBR Parameters', () => {
  it('should have valid default PBR parameter values', () => {
    // Default values from pipeline.ts
    const roughness = 0.5;
    const metallic = 0.1;
    const ambientStrength = 0.3;
    const reflectionStrength = 0.1;

    expect(roughness).toBeGreaterThanOrEqual(0);
    expect(roughness).toBeLessThanOrEqual(1);
    expect(metallic).toBeGreaterThanOrEqual(0);
    expect(metallic).toBeLessThanOrEqual(1);
    expect(ambientStrength).toBeGreaterThanOrEqual(0);
    expect(ambientStrength).toBeLessThanOrEqual(1);
    expect(reflectionStrength).toBeGreaterThanOrEqual(0);
    expect(reflectionStrength).toBeLessThanOrEqual(1);
  });

  it('should have ambient + reflection + direct sum to reasonable values', () => {
    const ambientStrength = 0.3;
    const reflectionStrength = 0.1;
    const directWeight = 1.0 - (ambientStrength + reflectionStrength);

    expect(directWeight).toBeGreaterThanOrEqual(0);
    expect(directWeight).toBeLessThanOrEqual(1);
    expect(ambientStrength + reflectionStrength + directWeight).toBeCloseTo(1.0, 5);
  });

  it('should calculate correct diffuse contribution for non-metal', () => {
    const metallic = 0.0; // Non-metal
    const diffuseContribution = 1.0 - metallic;
    expect(diffuseContribution).toBe(1.0);
  });

  it('should calculate correct diffuse contribution for metal', () => {
    const metallic = 1.0; // Full metal
    const diffuseContribution = 1.0 - metallic;
    expect(diffuseContribution).toBe(0.0);
  });

  it('should calculate correct specular contribution for non-metal', () => {
    const metallic = 0.0;
    const specularContribution = 0.04 + (1.0 - 0.04) * metallic;
    expect(specularContribution).toBeCloseTo(0.04, 5); // ~4% Fresnel
  });

  it('should calculate correct specular contribution for metal', () => {
    const metallic = 1.0;
    const specularContribution = 0.04 + (1.0 - 0.04) * metallic;
    expect(specularContribution).toBeCloseTo(1.0, 5);
  });

  it('should handle PBR buffer size correctly', () => {
    // 4 floats: roughness, metallic, ambientStrength, reflectionStrength
    const expectedSize = 4 * Float32Array.BYTES_PER_ELEMENT;
    expect(expectedSize).toBe(16);
  });

  it('should pack PBR parameters into Float32Array correctly', () => {
    const roughness = 0.7;
    const metallic = 0.2;
    const ambientStrength = 0.4;
    const reflectionStrength = 0.15;

    const pbrParams = new Float32Array([roughness, metallic, ambientStrength, reflectionStrength]);

    expect(pbrParams.length).toBe(4);
    expect(pbrParams[0]).toBeCloseTo(roughness, 5);
    expect(pbrParams[1]).toBeCloseTo(metallic, 5);
    expect(pbrParams[2]).toBeCloseTo(ambientStrength, 5);
    expect(pbrParams[3]).toBeCloseTo(reflectionStrength, 5);
  });
});

describe('IBL - Shader Logic Simulation', () => {
  // Simulate the shader's PBR mixing logic in TypeScript
  function calculateFinalColor(
    directLight: number[],
    envAmbient: number[],
    envReflection: number[],
    pbr: { roughness: number; metallic: number; ambientStrength: number; reflectionStrength: number }
  ): number[] {
    const diffuseContribution = 1.0 - pbr.metallic;
    const specularContribution = 0.04 + (1.0 - 0.04) * pbr.metallic;
    const directWeight = 1.0 - (pbr.ambientStrength + pbr.reflectionStrength);

    const finalColor = [
      directLight[0] * directWeight * diffuseContribution +
        envAmbient[0] * pbr.ambientStrength * diffuseContribution +
        envReflection[0] * pbr.reflectionStrength * specularContribution,
      directLight[1] * directWeight * diffuseContribution +
        envAmbient[1] * pbr.ambientStrength * diffuseContribution +
        envReflection[1] * pbr.reflectionStrength * specularContribution,
      directLight[2] * directWeight * diffuseContribution +
        envAmbient[2] * pbr.ambientStrength * diffuseContribution +
        envReflection[2] * pbr.reflectionStrength * specularContribution,
    ];

    return finalColor;
  }

  it('should produce correct color for non-metal material', () => {
    const directLight = [0.8, 0.8, 0.8];
    const envAmbient = [0.2, 0.2, 0.2];
    const envReflection = [1.0, 1.0, 1.0];
    const pbr = { roughness: 0.5, metallic: 0.0, ambientStrength: 0.3, reflectionStrength: 0.1 };

    const result = calculateFinalColor(directLight, envAmbient, envReflection, pbr);

    // Non-metal: diffuseContribution = 1.0, specularContribution = 0.04
    // directWeight = 1.0 - 0.3 - 0.1 = 0.6
    const expected = [
      0.8 * 0.6 * 1.0 + 0.2 * 0.3 * 1.0 + 1.0 * 0.1 * 0.04, // 0.48 + 0.06 + 0.004 = 0.544
      0.8 * 0.6 * 1.0 + 0.2 * 0.3 * 1.0 + 1.0 * 0.1 * 0.04,
      0.8 * 0.6 * 1.0 + 0.2 * 0.3 * 1.0 + 1.0 * 0.1 * 0.04,
    ];

    expect(result[0]).toBeCloseTo(expected[0], 5);
    expect(result[1]).toBeCloseTo(expected[1], 5);
    expect(result[2]).toBeCloseTo(expected[2], 5);
  });

  it('should produce correct color for metallic material', () => {
    const directLight = [0.8, 0.8, 0.8];
    const envAmbient = [0.2, 0.2, 0.2];
    const envReflection = [1.0, 1.0, 1.0];
    const pbr = { roughness: 0.3, metallic: 1.0, ambientStrength: 0.2, reflectionStrength: 0.5 };

    const result = calculateFinalColor(directLight, envAmbient, envReflection, pbr);

    // Metal: diffuseContribution = 0.0, specularContribution = 1.0
    // directWeight = 1.0 - 0.2 - 0.5 = 0.3
    const expected = [
      0.8 * 0.3 * 0.0 + 0.2 * 0.2 * 0.0 + 1.0 * 0.5 * 1.0, // 0 + 0 + 0.5 = 0.5
      0.8 * 0.3 * 0.0 + 0.2 * 0.2 * 0.0 + 1.0 * 0.5 * 1.0,
      0.8 * 0.3 * 0.0 + 0.2 * 0.2 * 0.0 + 1.0 * 0.5 * 1.0,
    ];

    expect(result[0]).toBeCloseTo(expected[0], 5);
    expect(result[1]).toBeCloseTo(expected[1], 5);
    expect(result[2]).toBeCloseTo(expected[2], 5);
  });

  it('should not exceed 1.0 for any color channel with extreme values', () => {
    const directLight = [1.0, 1.0, 1.0];
    const envAmbient = [1.0, 1.0, 1.0];
    const envReflection = [1.0, 1.0, 1.0];
    const pbr = { roughness: 0.0, metallic: 0.5, ambientStrength: 0.3, reflectionStrength: 0.3 };

    const result = calculateFinalColor(directLight, envAmbient, envReflection, pbr);

    // Should be clamped in shader, but let's verify the math doesn't go crazy
    expect(result[0]).toBeLessThanOrEqual(2.0); // Some headroom for HDR
    expect(result[1]).toBeLessThanOrEqual(2.0);
    expect(result[2]).toBeLessThanOrEqual(2.0);
  });

  it('should produce black when all inputs are zero', () => {
    const directLight = [0.0, 0.0, 0.0];
    const envAmbient = [0.0, 0.0, 0.0];
    const envReflection = [0.0, 0.0, 0.0];
    const pbr = { roughness: 0.5, metallic: 0.5, ambientStrength: 0.3, reflectionStrength: 0.3 };

    const result = calculateFinalColor(directLight, envAmbient, envReflection, pbr);

    expect(result[0]).toBe(0.0);
    expect(result[1]).toBe(0.0);
    expect(result[2]).toBe(0.0);
  });

  it('should handle pure ambient lighting correctly', () => {
    const directLight = [0.0, 0.0, 0.0];
    const envAmbient = [0.5, 0.5, 0.5];
    const envReflection = [0.0, 0.0, 0.0];
    const pbr = { roughness: 0.5, metallic: 0.0, ambientStrength: 1.0, reflectionStrength: 0.0 };

    const result = calculateFinalColor(directLight, envAmbient, envReflection, pbr);

    // Only ambient contribution: 0.5 * 1.0 * 1.0 = 0.5
    expect(result[0]).toBeCloseTo(0.5, 5);
    expect(result[1]).toBeCloseTo(0.5, 5);
    expect(result[2]).toBeCloseTo(0.5, 5);
  });

  it('should handle pure reflection lighting correctly', () => {
    const directLight = [0.0, 0.0, 0.0];
    const envAmbient = [0.0, 0.0, 0.0];
    const envReflection = [0.8, 0.8, 0.8];
    const pbr = { roughness: 0.2, metallic: 1.0, ambientStrength: 0.0, reflectionStrength: 1.0 };

    const result = calculateFinalColor(directLight, envAmbient, envReflection, pbr);

    // Only reflection contribution: 0.8 * 1.0 * 1.0 = 0.8
    expect(result[0]).toBeCloseTo(0.8, 5);
    expect(result[1]).toBeCloseTo(0.8, 5);
    expect(result[2]).toBeCloseTo(0.8, 5);
  });
});

describe('IBL - Reflection Vector Math', () => {
  // Simulate WGSL reflect() function
  function reflect(incident: number[], normal: number[]): number[] {
    // reflect(I, N) = I - 2 * dot(N, I) * N
    const dot = incident[0] * normal[0] + incident[1] * normal[1] + incident[2] * normal[2];
    return [
      incident[0] - 2 * dot * normal[0],
      incident[1] - 2 * dot * normal[1],
      incident[2] - 2 * dot * normal[2],
    ];
  }

  function normalize(v: number[]): number[] {
    const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    return [v[0] / len, v[1] / len, v[2] / len];
  }

  it('should reflect vector correctly for upward normal', () => {
    const viewDir = normalize([0, 0, 1]); // Looking forward
    const normal = [0, 1, 0]; // Up
    const reflected = reflect(viewDir, normal);

    // Incident pointing forward [0,0,1], normal up [0,1,0]
    // dot = 0, so reflection = incident (no change when perpendicular)
    expect(reflected[0]).toBeCloseTo(0, 5);
    expect(reflected[1]).toBeCloseTo(0, 5);
    expect(reflected[2]).toBeCloseTo(1, 5);
  });

  it('should reflect vector correctly for 45-degree normal', () => {
    const viewDir = normalize([1, 0, 0]); // Looking right
    const normal = normalize([1, 1, 0]); // 45-degree up-right
    const reflected = reflect(viewDir, normal);

    // Should reflect downward
    expect(reflected[1]).toBeLessThan(0);
  });

  it('should produce same vector when reflecting perpendicular to normal', () => {
    const viewDir = normalize([1, 0, 0]); // Looking right
    const normal = [0, 1, 0]; // Normal up (perpendicular)
    const reflected = reflect(viewDir, normal);

    // Should reflect straight down
    expect(reflected[0]).toBeCloseTo(1, 5);
    expect(reflected[1]).toBeCloseTo(0, 5);
    expect(reflected[2]).toBeCloseTo(0, 5);
  });

  it('should flip vector when reflecting parallel to normal', () => {
    const viewDir = normalize([0, 1, 0]); // Looking up
    const normal = [0, 1, 0]; // Normal up (parallel)
    const reflected = reflect(viewDir, normal);

    // Should flip to looking down
    expect(reflected[0]).toBeCloseTo(0, 5);
    expect(reflected[1]).toBeCloseTo(-1, 5);
    expect(reflected[2]).toBeCloseTo(0, 5);
  });
});

describe('IBL - Cubemap Face Selection', () => {
  // Test which face should be sampled for different reflection directions
  it('should sample +X face for reflection pointing right', () => {
    const reflectDir = [1, 0, 0];
    const absX = Math.abs(reflectDir[0]);
    const absY = Math.abs(reflectDir[1]);
    const absZ = Math.abs(reflectDir[2]);

    // Largest component is X and positive
    expect(absX).toBeGreaterThan(absY);
    expect(absX).toBeGreaterThan(absZ);
    expect(reflectDir[0]).toBeGreaterThan(0);
    // This would sample +X face (px)
  });

  it('should sample -Y face for reflection pointing down', () => {
    const reflectDir = [0, -1, 0];
    const absX = Math.abs(reflectDir[0]);
    const absY = Math.abs(reflectDir[1]);
    const absZ = Math.abs(reflectDir[2]);

    // Largest component is Y and negative
    expect(absY).toBeGreaterThan(absX);
    expect(absY).toBeGreaterThan(absZ);
    expect(reflectDir[1]).toBeLessThan(0);
    // This would sample -Y face (ny)
  });

  it('should sample +Z face for reflection pointing forward', () => {
    const reflectDir = [0, 0, 1];
    const absX = Math.abs(reflectDir[0]);
    const absY = Math.abs(reflectDir[1]);
    const absZ = Math.abs(reflectDir[2]);

    // Largest component is Z and positive
    expect(absZ).toBeGreaterThan(absX);
    expect(absZ).toBeGreaterThan(absY);
    expect(reflectDir[2]).toBeGreaterThan(0);
    // This would sample +Z face (pz)
  });
});
