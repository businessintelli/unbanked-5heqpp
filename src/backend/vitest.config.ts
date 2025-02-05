import { defineConfig } from 'vitest/config';
import { coverage } from '@vitest/coverage-v8';
import { compilerOptions } from './tsconfig.json';

// Extract path aliases from tsconfig
const pathAliases = Object.entries(compilerOptions.paths).reduce((aliases, [alias, [path]]) => {
  // Convert path alias format from tsconfig to Vitest format
  const key = alias.replace('/*', '/');
  const value = path.replace('/*', '/');
  return { ...aliases, [key]: `${compilerOptions.baseUrl}/${value}` };
}, {});

export default defineConfig({
  test: {
    // Configure test environment
    environment: 'node',
    globals: true,

    // Test file patterns
    include: [
      'src/**/*.test.ts',
      'src/**/*.spec.ts',
      'src/functions/**/*.test.ts'
    ],
    exclude: [
      'node_modules',
      'dist',
      'build',
      '.supabase'
    ],

    // Coverage configuration with V8 provider
    coverage: {
      provider: 'v8',
      reporter: [
        'text',
        'json',
        'html',
        'lcov'
      ],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/types/**',
        'src/mocks/**'
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80
      }
    },

    // Module resolution and aliases
    resolve: {
      alias: pathAliases
    },

    // Extended timeout for Edge Function tests
    testTimeout: 10000,

    // Thread pool configuration for parallel testing
    pool: 'forks',
    maxThreads: 4,
    minThreads: 1,

    // Silent console output during tests
    silent: false,

    // Enable type checking in tests
    typecheck: {
      enabled: true,
      tsconfig: './tsconfig.json'
    }
  }
});