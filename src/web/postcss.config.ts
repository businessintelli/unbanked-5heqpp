import type { Config } from 'postcss'; // ^8.4.0
import tailwindcss from 'tailwindcss'; // ^3.0.0
import autoprefixer from 'autoprefixer'; // ^10.4.0
import postcssPresetEnv from 'postcss-preset-env'; // ^8.0.0
import tailwindConfig from './tailwind.config';

const config: Config = {
  plugins: [
    // Tailwind CSS processing
    tailwindcss({
      config: './tailwind.config.ts'
    }),

    // Vendor prefix management
    autoprefixer({
      flexbox: 'no-2009',
      grid: 'autoplace',
      browsers: [
        '> 1%',
        'last 2 versions',
        'Firefox ESR',
        'not dead',
        'IE 11'
      ]
    }),

    // Modern CSS features and polyfills
    postcssPresetEnv({
      stage: 3,
      features: {
        'nesting-rules': true,
        'custom-properties': true,
        'custom-media-queries': true,
        'color-function': true,
        'focus-visible-pseudo-class': true,
        'focus-within-pseudo-class': true,
        'gap-properties': true,
        'logical-properties-and-values': true
      },
      autoprefixer: true,
      browsers: [
        '> 1%',
        'last 2 versions',
        'Firefox ESR',
        'not dead',
        'IE 11'
      ]
    })
  ]
};

export default config;