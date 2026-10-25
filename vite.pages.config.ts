import { defineConfig } from 'vite';

/** Single browser bundle committed for the branch-based GitHub Pages site. */
export default defineConfig({
  base: '/Construction-slots/',
  build: {
    outDir: 'dist-pages',
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: 'src/main.ts',
      output: {
        format: 'es',
        inlineDynamicImports: true,
        entryFileNames: 'game.js',
      },
    },
  },
});
