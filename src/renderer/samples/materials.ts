/**
 * Bundled sample materials. Used by UI picker.
 */

import cotton from '../assets/samples/materials/cotton.json';
import silk from '../assets/samples/materials/silk.json';
import denim from '../assets/samples/materials/denim.json';
import canvas from '../assets/samples/materials/canvas.json';
import chiffon from '../assets/samples/materials/chiffon.json';

export interface SampleMaterial {
  id: string;
  presetKey: string;
  albedo: [number, number, number];
  roughness: number;
}

export const SAMPLE_MATERIALS: SampleMaterial[] = [
  cotton as SampleMaterial,
  silk as SampleMaterial,
  denim as SampleMaterial,
  canvas as SampleMaterial,
  chiffon as SampleMaterial,
];
