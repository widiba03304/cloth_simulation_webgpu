// Tests for scene/resolve.ts and the scene/index.ts barrel
import { describe, it, expect } from 'vitest';
// Import via barrel (covers scene/index.ts)
import { resolveSceneForEditor } from '../src/renderer/scene/index';

describe('resolveSceneForEditor', () => {
  it('uses default avatarIndex=0 for empty scene', () => {
    const result = resolveSceneForEditor({ id: 'x', name: 'test' });
    expect(result.avatarIndex).toBe(0);
    expect(result.patternId).toBeUndefined();
    expect(result.materialId).toBeUndefined();
  });

  it('uses avatarIndex when provided', () => {
    const result = resolveSceneForEditor({ id: 'x', name: 'test', avatarIndex: 1 });
    expect(result.avatarIndex).toBe(1);
  });

  it('parses numeric avatarId string', () => {
    const result = resolveSceneForEditor({ id: 'x', name: 'test', avatarId: '1' });
    expect(result.avatarIndex).toBe(1);
  });

  it('avatarId "0" maps to 0', () => {
    const result = resolveSceneForEditor({ id: 'x', name: 'test', avatarId: '0' });
    expect(result.avatarIndex).toBe(0);
  });

  it('ignores avatarId that is out of range (> 1)', () => {
    const result = resolveSceneForEditor({ id: 'x', name: 'test', avatarIndex: 0, avatarId: '5' });
    // parsed=5 > 1, so ignored → keeps avatarIndex=0
    expect(result.avatarIndex).toBe(0);
  });

  it('ignores avatarId that is out of range (< 0)', () => {
    const result = resolveSceneForEditor({ id: 'x', name: 'test', avatarIndex: 0, avatarId: '-1' });
    expect(result.avatarIndex).toBe(0);
  });

  it('ignores NaN avatarId', () => {
    const result = resolveSceneForEditor({ id: 'x', name: 'test', avatarIndex: 1, avatarId: 'abc' });
    // NaN parsed → ignored → keeps avatarIndex=1
    expect(result.avatarIndex).toBe(1);
  });

  it('avatarId overrides avatarIndex when valid', () => {
    const result = resolveSceneForEditor({ id: 'x', name: 'test', avatarIndex: 0, avatarId: '1' });
    expect(result.avatarIndex).toBe(1);
  });

  it('passes through patternId', () => {
    const result = resolveSceneForEditor({ id: 'x', name: 'test', patternId: 'tshirt' });
    expect(result.patternId).toBe('tshirt');
  });

  it('passes through materialId', () => {
    const result = resolveSceneForEditor({ id: 'x', name: 'test', materialId: 'cotton' });
    expect(result.materialId).toBe('cotton');
  });

  it('passes undefined patternId and materialId when missing', () => {
    const result = resolveSceneForEditor({ id: 'x', name: 'test' });
    expect(result.patternId).toBeUndefined();
    expect(result.materialId).toBeUndefined();
  });
});
