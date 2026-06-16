import { defineConfig } from 'vite';

// Static-hosting friendly config.
// `base: './'` makes the production build work from any sub-path (e.g. GitHub Pages),
// which keeps deployment to plain static hosting trivial — no server, no rewrites.
export default defineConfig({
  base: './',
  server: {
    host: true,
    open: false,
  },
  build: {
    target: 'es2020',
    sourcemap: true,
    chunkSizeWarningLimit: 1500,
  },
});
