/**
 * Status bar: bottom bar showing FPS, particle count, substeps, and current mode.
 * Mirrors Blender's info bar.
 */
import type { AppMode } from '../app/state';

const MODE_DISPLAY: Record<AppMode, string> = {
  'simulate':     'Simulate',
  'pattern-edit': 'Edit Pattern',
  'pose':         'Pose',
};

export interface AppStatusBar {
  element: HTMLElement;
  update(fps: number, particles: number, subSteps: number, mode: AppMode): void;
}

export function createStatusBar(): AppStatusBar {
  const element = document.createElement('div');
  element.className = 'ws-statusbar';

  const fpsEl = document.createElement('span');
  fpsEl.className = 'ws-status-item';

  const sep1 = document.createElement('span');
  sep1.className = 'ws-status-item';
  sep1.textContent = '\u00B7';
  sep1.style.color = '#333';

  const particlesEl = document.createElement('span');
  particlesEl.className = 'ws-status-item';

  const sep2 = document.createElement('span');
  sep2.className = 'ws-status-item';
  sep2.textContent = '\u00B7';
  sep2.style.color = '#333';

  const subStepsEl = document.createElement('span');
  subStepsEl.className = 'ws-status-item';

  const sep3 = document.createElement('span');
  sep3.className = 'ws-status-item';
  sep3.textContent = '\u00B7';
  sep3.style.color = '#333';

  const modeEl = document.createElement('span');
  modeEl.className = 'ws-status-item';

  element.appendChild(fpsEl);
  element.appendChild(sep1);
  element.appendChild(particlesEl);
  element.appendChild(sep2);
  element.appendChild(subStepsEl);
  element.appendChild(sep3);
  element.appendChild(modeEl);

  return {
    element,
    update(fps, particles, subSteps, mode) {
      fpsEl.textContent = `FPS: ${fps}`;
      particlesEl.textContent = `${particles.toLocaleString()} particles`;
      subStepsEl.textContent = `${subSteps} substeps`;
      modeEl.textContent = MODE_DISPLAY[mode];
    },
  };
}
