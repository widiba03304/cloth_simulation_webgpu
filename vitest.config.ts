import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
  test: {
    // Default environment is Node.js for CPU tests
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts'],

    // Browser mode configuration for WebGPU tests
    // Disabled by default - only runs with .browser.test.ts files via npm run test:gpu
    browser: {
      enabled: false, // Disabled by default, run with: npm run test:gpu
      provider: playwright(),
      headless: false, // WebGPU requires headed mode
      screenshotOnFailure: true,
      instances: [
        {
          browser: 'chromium',
          launch: {
            args: [
              '--enable-unsafe-webgpu', // Enable WebGPU
              '--use-angle=metal',       // Use Metal backend on macOS
              '--enable-features=Vulkan',
            ],
          },
        }
      ],
    },
  },
});
