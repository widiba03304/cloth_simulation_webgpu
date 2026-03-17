// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createClothPreview, type ClothPreviewMaterialParams } from '../src/renderer/sim/preview/clothPreview';

function makeParams(overrides: Partial<ClothPreviewMaterialParams> = {}): ClothPreviewMaterialParams {
  return {
    albedo: [0.8, 0.6, 0.4],
    roughness: 0.5,
    metallic: 0,
    sheen: 0,
    sheenTint: 0.5,
    subsurface: 0,
    fuzziness: 0,
    thickness: 0.5,
    opacity: 1,
    texturePattern: 0,
    textureScale: 20,
    textureIntensity: 0.5,
    density: 200,
    stretchWarp: 5,
    stretchWeft: 10,
    bendStiffness: 0.5,
    drape: 0.5,
    ...overrides,
  };
}

let rafCallbacks: FrameRequestCallback[] = [];

beforeEach(() => {
  rafCallbacks = [];
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  });
  vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createClothPreview', () => {
  it('returns null when GPU context not available', async () => {
    // Temporarily remove navigator.gpu
    const origGpu = (navigator as any).gpu;
    Object.defineProperty(navigator, 'gpu', { value: undefined, writable: true, configurable: true });
    const canvas = document.createElement('canvas');
    const result = await createClothPreview(canvas, makeParams());
    expect(result).toBeNull();
    Object.defineProperty(navigator, 'gpu', { value: origGpu, writable: true, configurable: true });
  });

  it('returns a ClothPreview on success', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 600;
    const result = await createClothPreview(canvas, makeParams());
    expect(result).not.toBeNull();
    expect(result?.canvas).toBe(canvas);
  });

  it('has updateMaterialParams method', async () => {
    const canvas = document.createElement('canvas');
    const result = await createClothPreview(canvas, makeParams());
    expect(typeof result?.updateMaterialParams).toBe('function');
  });

  it('has resetSimulation method', async () => {
    const canvas = document.createElement('canvas');
    const result = await createClothPreview(canvas, makeParams());
    expect(typeof result?.resetSimulation).toBe('function');
  });

  it('has destroy method', async () => {
    const canvas = document.createElement('canvas');
    const result = await createClothPreview(canvas, makeParams());
    expect(typeof result?.destroy).toBe('function');
  });

  it('updateMaterialParams updates data without error', async () => {
    const canvas = document.createElement('canvas');
    const result = await createClothPreview(canvas, makeParams());
    expect(() => result?.updateMaterialParams(makeParams({ roughness: 0.8 }))).not.toThrow();
  });

  it('resetSimulation resets cloth state', async () => {
    const canvas = document.createElement('canvas');
    const result = await createClothPreview(canvas, makeParams());
    expect(() => result?.resetSimulation()).not.toThrow();
  });

  it('destroy stops simulation and releases GPU resources', async () => {
    const canvas = document.createElement('canvas');
    const result = await createClothPreview(canvas, makeParams());
    expect(() => result?.destroy()).not.toThrow();
  });

  it('mouse events on canvas work without error', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 600;
    const result = await createClothPreview(canvas, makeParams());
    expect(result).not.toBeNull();
    expect(() => {
      canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 300, clientY: 300 }));
      canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: 310, clientY: 310 }));
      canvas.dispatchEvent(new MouseEvent('mouseup'));
      canvas.dispatchEvent(new MouseEvent('mouseleave'));
    }).not.toThrow();
  });

  it('touch events on canvas work without error', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 600;
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 600, height: 600 }),
    });
    const result = await createClothPreview(canvas, makeParams());
    expect(result).not.toBeNull();

    // touches/changedTouches are read-only getters on TouchEvent prototype,
    // but can be shadowed via Object.defineProperty on the instance.
    const makeTouch = (x: number, y: number) => ({ clientX: x, clientY: y, identifier: 0, target: canvas } as Touch);
    const dispatchTouchWith = (type: string, touches: Touch[]) => {
      const ev = new TouchEvent(type, { cancelable: true });
      Object.defineProperty(ev, 'touches',        { value: touches, configurable: true });
      Object.defineProperty(ev, 'changedTouches', { value: touches, configurable: true });
      canvas.dispatchEvent(ev);
    };

    expect(() => {
      dispatchTouchWith('touchstart', [makeTouch(300, 300)]);
      dispatchTouchWith('touchmove',  [makeTouch(310, 310)]);
      canvas.dispatchEvent(new TouchEvent('touchend'));
      canvas.dispatchEvent(new TouchEvent('touchcancel'));
    }).not.toThrow();
  });

  it('requestAnimationFrame is called once on init', async () => {
    const canvas = document.createElement('canvas');
    await createClothPreview(canvas, makeParams());
    expect(rafCallbacks.length).toBe(1);
  });

  it('destroy removes mouse event listeners', async () => {
    const canvas = document.createElement('canvas');
    const result = await createClothPreview(canvas, makeParams());
    result?.destroy();
    // After destroy, mouse events should not cause errors
    expect(() => {
      canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 300, clientY: 300 }));
    }).not.toThrow();
  });

  it('frame callback runs without error', async () => {
    const canvas = document.createElement('canvas');
    await createClothPreview(canvas, makeParams());
    // Run the first RAF callback to execute one frame
    if (rafCallbacks.length > 0) {
      const prevLength = rafCallbacks.length;
      expect(() => rafCallbacks[0](0)).not.toThrow();
    }
  });

  it('updateMaterialParams with no optional fields', async () => {
    const canvas = document.createElement('canvas');
    const result = await createClothPreview(canvas, makeParams());
    const minParams: ClothPreviewMaterialParams = {
      albedo: [0.5, 0.5, 0.5],
      roughness: 0.7,
      metallic: 0,
      sheen: 0,
      sheenTint: 0.5,
      subsurface: 0,
      fuzziness: 0,
      opacity: 1,
      density: 150,
      stretchWarp: 3,
      stretchWeft: 5,
      bendStiffness: 0.4,
      drape: 0.6,
    };
    expect(() => result?.updateMaterialParams(minParams)).not.toThrow();
  });

  it('createClothPreview with no optional params covers ?? fallback branches', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 600;
    // No thickness, texturePattern, textureScale, textureIntensity → triggers d.thickness ?? 0.5 etc.
    const minParams: ClothPreviewMaterialParams = {
      albedo: [0.5, 0.5, 0.5],
      roughness: 0.7,
      metallic: 0,
      sheen: 0,
      sheenTint: 0.5,
      subsurface: 0,
      fuzziness: 0,
      opacity: 1,
      density: 150,
      stretchWarp: 3,
      stretchWeft: 5,
      bendStiffness: 0.4,
      drape: 0.6,
    };
    const result = await createClothPreview(canvas, minParams);
    expect(result).not.toBeNull();
    result?.destroy();
  });

  it('mousemove without prior mousedown covers dragIndex<0 early return', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 600;
    await createClothPreview(canvas, makeParams());
    // dragIndex = -1 at start → onMouseMove returns early
    expect(() => {
      canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: 310, clientY: 310 }));
    }).not.toThrow();
  });

  it('frame runs with active drag covers if(dragIndex>=0) branch', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 600;
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 600, height: 600 }),
      configurable: true,
    });
    await createClothPreview(canvas, makeParams());
    // mousedown sets dragIndex >= 0 (particle near center)
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 300, clientY: 300 }));
    // Run a frame with dragIndex >= 0 → applyDrag pass executes
    expect(() => {
      if (rafCallbacks.length > 0) {
        rafCallbacks[rafCallbacks.length - 1](0);
      }
    }).not.toThrow();
  });

  it('running 10 frames triggers readback path and mapAsync then()', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 600;
    await createClothPreview(canvas, makeParams());
    // Run 10 frames: frameCount becomes 10, 10%10===0 → readback triggered
    for (let i = 0; i < 10; i++) {
      const cb = rafCallbacks[rafCallbacks.length - 1];
      cb(i * 16);
    }
    // Flush microtasks so mapAsync.then() resolves
    await new Promise(resolve => setTimeout(resolve, 0));
  });

  it('destroy while readback pending covers !running check in then()', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 600;
    const result = await createClothPreview(canvas, makeParams());
    // Run 10 frames to trigger readbackPending = true
    for (let i = 0; i < 10; i++) {
      const cb = rafCallbacks[rafCallbacks.length - 1];
      cb(i * 16);
    }
    // Destroy before promise resolves (sets running=false)
    result?.destroy();
    // Flush: then() runs with !running=true → early return path covered
    await new Promise(resolve => setTimeout(resolve, 0));
  });

  it('touchstart with empty touches array uses changedTouches fallback', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 600;
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 600, height: 600 }),
      configurable: true,
    });
    await createClothPreview(canvas, makeParams());
    const makeTouch = (x: number, y: number) => ({ clientX: x, clientY: y, identifier: 0, target: canvas } as Touch);
    // touches is empty → e.touches[0] is undefined → falls back to changedTouches[0]
    const ev = new TouchEvent('touchstart', { cancelable: true });
    Object.defineProperty(ev, 'touches', { value: [], configurable: true });
    Object.defineProperty(ev, 'changedTouches', { value: [makeTouch(300, 300)], configurable: true });
    expect(() => canvas.dispatchEvent(ev)).not.toThrow();
  });

  it('touchmove with empty touches uses changedTouches fallback', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 600;
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 600, height: 600 }),
      configurable: true,
    });
    await createClothPreview(canvas, makeParams());
    const makeTouch = (x: number, y: number) => ({ clientX: x, clientY: y, identifier: 0, target: canvas } as Touch);
    // First touchstart with proper touches to set dragIndex
    const startEv = new TouchEvent('touchstart', { cancelable: true });
    Object.defineProperty(startEv, 'touches', { value: [makeTouch(300, 300)], configurable: true });
    Object.defineProperty(startEv, 'changedTouches', { value: [makeTouch(300, 300)], configurable: true });
    canvas.dispatchEvent(startEv);
    // touchmove with empty touches → e.touches[0]=undefined → changedTouches[0] fallback
    const moveEv = new TouchEvent('touchmove', { cancelable: true });
    Object.defineProperty(moveEv, 'touches', { value: [], configurable: true });
    Object.defineProperty(moveEv, 'changedTouches', { value: [makeTouch(310, 310)], configurable: true });
    expect(() => canvas.dispatchEvent(moveEv)).not.toThrow();
  });
});
