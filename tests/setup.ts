/**
 * Test setup for GPU Skinning tests
 * Initializes WebGPU environment for testing
 */

// Mock WebGPU if not available (for CI/CD environments)
if (typeof navigator === 'undefined') {
  (global as any).navigator = {
    gpu: undefined,
  };
}

// You can add additional setup here
