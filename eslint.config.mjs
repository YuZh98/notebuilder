// Flat ESLint config. The src/app/*.js layers are concatenated into one shared closure at build time,
// so cross-file `no-undef` / unused-vars are expected and disabled. We still enforce the security
// invariant (no eval) and catch real mistakes.
import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    files: ['src/app/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { window: 'readonly', document: 'readonly', localStorage: 'readonly', navigator: 'readonly',
        location: 'readonly', atob: 'readonly', btoa: 'readonly', URL: 'readonly', Blob: 'readonly',
        FileReader: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', requestAnimationFrame: 'readonly',
        getSelection: 'readonly', CSS: 'readonly', DragEvent: 'readonly', MouseEvent: 'readonly',
        PointerEvent: 'readonly', Event: 'readonly', HTMLAnchorElement: 'readonly', KATEX_CSS: 'readonly', KATEX_JS: 'readonly' },
    },
    rules: {
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-undef': 'off',         // shared closure across concatenated layers
      'no-unused-vars': 'off',   // helpers are used across files
      'no-empty': 'off',
      'no-cond-assign': 'off',
      'no-control-regex': 'off',
    },
  },
];
