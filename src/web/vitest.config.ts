import { defineConfig } from 'vitest/config'; // ^0.34.0
import { mergeConfig } from 'vite'; // ^4.0.0
import viteConfig from './vite.config';

export default defineConfig((configEnv) => 
  mergeConfig(
    viteConfig,
    defineConfig({
      test: {
        // Enable global test utilities and mocks
        globals: true,
        
        // Use jsdom for DOM simulation
        environment: 'jsdom',
        
        // Test file patterns
        include: [
          'src/**/*.{test,spec}.{ts,tsx}',
          'src/**/__tests__/**/*.{ts,tsx}'
        ],
        
        // Exclude patterns
        exclude: [
          'node_modules',
          'dist',
          'build',
          'coverage',
          '**/*.d.ts'
        ],
        
        // Test setup files
        setupFiles: ['@/test/setup.ts'],
        
        // Coverage configuration
        coverage: {
          provider: 'v8',
          reporter: [
            'text',
            'json',
            'html',
            'lcov'
          ],
          exclude: [
            'node_modules',
            'dist',
            '**/*.d.ts',
            '**/*.test.{ts,tsx}',
            '**/*.spec.{ts,tsx}',
            '**/test/**',
            '**/__mocks__/**'
          ],
          thresholds: {
            lines: 80,
            functions: 80,
            branches: 75,
            statements: 80
          }
        },

        // Path aliases matching vite.config.ts
        alias: {
          '@': '/src',
          '@components': '/src/components',
          '@hooks': '/src/hooks',
          '@utils': '/src/utils'
        },

        // Dependencies handling
        deps: {
          // Inline specific dependencies for better testing
          inline: [
            '@shadcn/ui',
            '@radix-ui/**'
          ]
        },

        // Test execution configuration
        pool: 'forks',
        poolOptions: {
          threads: {
            singleThread: false,
            maxThreads: 4
          }
        },

        // Timeouts
        testTimeout: 10000,
        hookTimeout: 10000,

        // Test isolation
        isolate: true,

        // Environment variables available in tests
        env: {
          NODE_ENV: 'test',
          VITE_API_URL: 'http://localhost:8000'
        },

        // Browser-like globals
        environmentOptions: {
          jsdom: {
            resources: 'usable',
            runScripts: 'dangerously'
          }
        },

        // Snapshot settings
        snapshotFormat: {
          printBasicPrototype: false,
          escapeString: false
        },

        // Silent console during tests
        silent: true,

        // Watch mode configuration
        watch: {
          onRebuild(error) {
            if (!error) console.log('Tests rebuilt successfully');
          }
        }
      }
    })
  )
);