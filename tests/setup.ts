/**
 * Global test setup: installs WebGPU mock, DOMMatrix, createImageBitmap, etc.
 * Runs in every test environment (node + jsdom).
 */
import { installWebGPUMock } from './mocks/webgpu';

// Install WebGPU mock globally (navigator.gpu, DOMMatrix, createImageBitmap)
installWebGPUMock();
