import { defineConfig } from 'vite'; // ^4.0.0
import react from '@vitejs/plugin-react'; // ^4.0.0
import tsconfigPaths from 'vite-tsconfig-paths'; // ^4.0.0
import { content } from './tailwind.config';

export default defineConfig({
  plugins: [
    react({
      // Enhanced React plugin configuration with Fast Refresh
      fastRefresh: true,
      babel: {
        plugins: ['@babel/plugin-transform-runtime'],
        presets: [
          ['@babel/preset-env', {
            targets: '> 0.25%, not dead'
          }]
        ]
      }
    }),
    // TypeScript path resolution with strict checking
    tsconfigPaths({
      loose: false
    })
  ],

  build: {
    // Target ES2015 for broader browser compatibility
    target: 'es2015',
    outDir: 'dist',
    // Enable source maps for production debugging
    sourcemap: true,
    // Use esbuild for faster minification
    minify: 'esbuild',
    cssMinify: true,
    rollupOptions: {
      output: {
        // Manual chunk splitting for optimal loading
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          ui: ['@radix-ui', '@shadcn/ui'],
          utils: ['date-fns', 'zod', 'axios']
        }
      }
    },
    // Increase chunk size warning limit for larger bundles
    chunkSizeWarningLimit: 1000
  },

  server: {
    port: 3000,
    strictPort: true,
    // Enable host for network access
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
        ws: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    },
    // Enable CORS for development
    cors: true,
    hmr: {
      // Enable HMR overlay for better DX
      overlay: true
    }
  },

  resolve: {
    // Path aliases for cleaner imports
    alias: {
      '@': '/src',
      '@components': '/src/components',
      '@hooks': '/src/hooks',
      '@utils': '/src/utils',
      '@services': '/src/services',
      '@types': '/src/types'
    }
  },

  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/test/']
    },
    include: ['src/**/*.{test,spec}.{ts,tsx}']
  }
});