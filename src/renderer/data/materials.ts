/**
 * Sample material cloth params and helpers.
 * Extracted from main.ts to keep orchestration thin.
 */
import type { Cloth3DMaterialParams } from '../sim/cloth3d/cloth3d';

export const SAMPLE_MATERIAL_CLOTH_PARAMS: Record<string, Cloth3DMaterialParams> = {
  cotton:  { density: 200, stretchWarp: 30,  stretchWeft: 30,  bendStiffness: 0.15, drape: 0.40, albedo: [0.95, 0.93, 0.88], roughness: 0.85, metallic: 0,    opacity: 1 },
  silk:    { density: 80,  stretchWarp: 70,  stretchWeft: 75,  bendStiffness: 0.08, drape: 0.80, albedo: [0.88, 0.85, 0.92], roughness: 0.15, metallic: 0.05, opacity: 1 },
  denim:   { density: 500, stretchWarp: 10,  stretchWeft: 15,  bendStiffness: 0.75, drape: 0.20, albedo: [0.25, 0.35, 0.55], roughness: 0.90, metallic: 0,    opacity: 1 },
  canvas:  { density: 550, stretchWarp: 5,   stretchWeft: 8,   bendStiffness: 0.90, drape: 0.10, albedo: [0.82, 0.78, 0.68], roughness: 0.95, metallic: 0,    opacity: 1 },
  chiffon: { density: 45,  stretchWarp: 85,  stretchWeft: 90,  bendStiffness: 0.03, drape: 0.95, albedo: [0.98, 0.96, 1.00], roughness: 0.12, metallic: 0,    opacity: 0.75 },
  wool:    { density: 300, stretchWarp: 20,  stretchWeft: 25,  bendStiffness: 0.55, drape: 0.35, albedo: [0.65, 0.55, 0.45], roughness: 0.95, metallic: 0,    opacity: 1 },
  linen:   { density: 280, stretchWarp: 15,  stretchWeft: 18,  bendStiffness: 0.50, drape: 0.30, albedo: [0.92, 0.88, 0.78], roughness: 0.90, metallic: 0,    opacity: 1 },
  velvet:  { density: 400, stretchWarp: 10,  stretchWeft: 12,  bendStiffness: 0.60, drape: 0.45, albedo: [0.35, 0.12, 0.28], roughness: 0.98, metallic: 0,    opacity: 1 },
  jersey:  { density: 180, stretchWarp: 60,  stretchWeft: 65,  bendStiffness: 0.15, drape: 0.65, albedo: [0.85, 0.85, 0.85], roughness: 0.80, metallic: 0,    opacity: 1 },
  leather:  { density: 900, stretchWarp: 3,   stretchWeft: 3,   bendStiffness: 0.95, drape: 0.05, albedo: [0.20, 0.15, 0.12], roughness: 0.40, metallic: 0.10, opacity: 1    },
  lace:     { density: 60,  stretchWarp: 40,  stretchWeft: 40,  bendStiffness: 0.05, drape: 0.90, albedo: [0.98, 0.98, 0.98], roughness: 0.20, metallic: 0,    opacity: 0.55 },
  organza:  { density: 55,  stretchWarp: 25,  stretchWeft: 30,  bendStiffness: 0.10, drape: 0.70, albedo: [0.95, 0.93, 0.90], roughness: 0.08, metallic: 0,    opacity: 0.70 },
  neoprene: { density: 700, stretchWarp: 30,  stretchWeft: 30,  bendStiffness: 0.80, drape: 0.15, albedo: [0.15, 0.15, 0.15], roughness: 0.70, metallic: 0,    opacity: 1    },
  tweed:    { density: 450, stretchWarp: 10,  stretchWeft: 12,  bendStiffness: 0.70, drape: 0.20, albedo: [0.60, 0.55, 0.45], roughness: 0.95, metallic: 0,    opacity: 1    },
};

const DEFAULT_CLOTH_MATERIAL: Cloth3DMaterialParams = SAMPLE_MATERIAL_CLOTH_PARAMS['cotton']!;

export function getClothMaterialParams(
  materialId: string,
  albedoOverride?: [number, number, number] | null,
): Cloth3DMaterialParams {
  const base = SAMPLE_MATERIAL_CLOTH_PARAMS[materialId] ?? DEFAULT_CLOTH_MATERIAL;
  if (albedoOverride) return { ...base, albedo: albedoOverride };
  return base;
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
