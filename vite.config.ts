import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    // Compiled web assets are a build intermediate (electron-builder packages them
    // into the app, they're never a deliverable on their own) — keep them out of
    // the project root per STANDARDS.md §1.
    outDir: 'build/dist'
  },
  server: {
    port: 5173,
    strictPort: true
  }
});
