/**
 * Centralized reactive app state store.
 * Lightweight pub/sub — no external dependencies.
 */
import type { Project } from '../ui/dashboard';

export type AppMode = 'simulate' | 'pattern-edit' | 'pose';

export interface AppState {
  mode: AppMode;
  project: Project | null;
  avatarIndex: number;
  patternId: string | null;
  materialId: string | null;
  simFrozen: boolean;
  turntable: boolean;
  ikEnabled: boolean;
  fps: number;
  particleCount: number;
  subSteps: number;
}

const DEFAULTS: AppState = {
  mode: 'simulate',
  project: null,
  avatarIndex: 0,
  patternId: null,
  materialId: null,
  simFrozen: true,
  turntable: false,
  ikEnabled: false,
  fps: 0,
  particleCount: 0,
  subSteps: 8,
};

export class AppStore {
  private _state: AppState = { ...DEFAULTS };
  private _listeners = new Set<(s: AppState) => void>();

  get(): AppState { return this._state; }

  set(partial: Partial<AppState>): void {
    this._state = { ...this._state, ...partial };
    for (const fn of this._listeners) fn(this._state);
  }

  subscribe(fn: (s: AppState) => void): () => void {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }
}

export const store = new AppStore();
