import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import globals from 'globals';

// Vitest globals (no @vitest/eslint-plugin available — listed manually).
// AGENT: add new vitest APIs here if you get no-undef errors in test files.
const vitestGlobals = {
  describe: 'readonly',
  it: 'readonly',
  test: 'readonly',
  expect: 'readonly',
  beforeEach: 'readonly',
  afterEach: 'readonly',
  beforeAll: 'readonly',
  afterAll: 'readonly',
  vi: 'readonly',
  suite: 'readonly',
};

// ─── Golden Principles (Harness Engineering) ─────────────────────────────────
//
// AGENT REMEDIATION GUIDE:
//   no-console  → Remove console.log; use structured comments or no-op.
//                 console.warn / console.error are allowed (diagnostic use).
//                 To suppress a legacy violation: add /* eslint-disable no-console */
//                 at the top of the file and track in docs/exec-plans/tech-debt-tracker.md.
//
//   max-lines   → Split files exceeding 500 active lines. See ARCHITECTURE.md §File size limits.
//
// Rules intentionally OFF (tracked as tech debt, not errors):
//   no-explicit-any  → TD-010: ~345 pre-existing violations. Re-enable after cleanup.
//   no-unused-vars   → TD-002: ~58 pre-existing violations. Re-enable after cleanup.
//
// NOTE on no-undef: disabled for TypeScript files — TypeScript's own type checker handles
// undeclared identifiers more accurately. @typescript-eslint FAQ:
//   https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule
//
// Staged rollout: no-console enforced on sim/, scene/, webgpu/, assets/ today.
// Remaining domains (render/, ik/, ui/, input/, compute/) tracked as TD-003.
// ─────────────────────────────────────────────────────────────────────────────

export default [
  eslint.configs.recommended,

  // Electron main process (TypeScript + compiled JS loader)
  {
    files: ['electron/**/*.ts', 'electron/**/*.js'],
    languageOptions: {
      parser: tsparser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
      globals: { ...globals.node, ...globals.commonjs },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      ...tseslint.configs.recommended.rules,
      'no-undef': 'off',
      '@typescript-eslint/no-explicit-any': 'off',    // TD-010
      '@typescript-eslint/explicit-function-return-type': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',     // TD-002
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // Renderer source (TypeScript, browser + WebGPU environment)
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
      globals: globals.browser,
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      ...tseslint.configs.recommended.rules,
      // TypeScript handles undefined-variable checks; no-undef causes false positives
      // for DOM types, WebGPU interfaces, TypeScript generics, and string literal types.
      'no-undef': 'off',
      '@typescript-eslint/no-explicit-any': 'off',    // TD-010: re-enable after cleanup
      '@typescript-eslint/explicit-function-return-type': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',     // TD-002: re-enable after cleanup
    },
  },

  // Tests (browser + vitest globals)
  {
    files: ['tests/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
      globals: { ...globals.browser, ...vitestGlobals },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      ...tseslint.configs.recommended.rules,
      'no-undef': 'off',
      '@typescript-eslint/no-explicit-any': 'off',    // TD-010
      '@typescript-eslint/explicit-function-return-type': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',     // TD-002
    },
  },

  // Golden principle: no-console — enforced on clean domains (0 existing violations).
  // AGENT: console.log in these paths is a bug. Remove it or convert to a no-op.
  // console.warn/error are allowed for diagnostics.
  // Extend to render/, ik/, ui/, input/, compute/ after TD-003 cleanup.
  {
    files: [
      'src/renderer/sim/**/*.ts',
      'src/renderer/scene/**/*.ts',
      'src/renderer/webgpu/**/*.ts',
      'src/renderer/assets/**/*.ts',
    ],
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // AGENT: files over 500 active lines are hard to reason about. Split the file.
      // See ARCHITECTURE.md §File size limits for soft (400) and hard (600) limits.
      // Warn at hard limit (600). Soft limit (400) is documented in ARCHITECTURE.md
      // but not enforced by lint to avoid noise on currently-acceptable files.
      'max-lines': ['warn', { max: 600, skipBlankLines: true, skipComments: true }],
    },
  },
];
