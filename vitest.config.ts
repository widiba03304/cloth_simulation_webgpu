import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
  test: {
    // Default environment is Node.js for CPU tests
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 5000, // Kill tests that hang (e.g. infinite loops in IK solver)
    exclude: [
      '**/node_modules/**',
      '**/*.browser.test.ts',  // Browser/WebGPU tests: run with npm run test:gpu
    ],

    // Coverage (run with: npm run test:coverage)
    coverage: {
      provider: 'v8',
      include: ['src/renderer/**/*.ts'],
      exclude: [
        'src/renderer/**/*.wgsl',
        'src/renderer/main.ts',               // Electron entry, DOM+GPU
        'src/renderer/vite-env.d.ts',         // TypeScript declarations only
        'src/renderer/assets/types.ts',       // TypeScript types only (no runtime code)
        'src/renderer/scene/types.ts',        // TypeScript types only
      ],
      reporter: ['text', 'html'],
    },

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
