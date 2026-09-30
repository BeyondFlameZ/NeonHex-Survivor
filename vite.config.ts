import { defineConfig } from 'vite';

// base './' — чтобы сборка работала на GitHub Pages из подпапки репо
export default defineConfig({
  base: './',
  build: { target: 'es2022' },
});
