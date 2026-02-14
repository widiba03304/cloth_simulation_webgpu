/**
 * Bundled sample patterns. Used by UI picker.
 */

import tshirt from '../assets/samples/patterns/tshirt.json';
import skirt from '../assets/samples/patterns/skirt.json';
import scarf from '../assets/samples/patterns/scarf.json';
import tank from '../assets/samples/patterns/tank.json';
import hood from '../assets/samples/patterns/hood.json';

export interface SamplePattern {
  id: string;
  name: string;
  grid: { rows: number; cols: number; spacing: number };
  pinned: 'topRow' | 'none';
}

export const SAMPLE_PATTERNS: SamplePattern[] = [
  tshirt as SamplePattern,
  skirt as SamplePattern,
  scarf as SamplePattern,
  tank as SamplePattern,
  hood as SamplePattern,
];
