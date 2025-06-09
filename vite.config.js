import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src', // onde está seu index.html
  build: {
    outDir: '../dist',     // saída que o Vercel irá usar
    emptyOutDir: true,     // limpa antes de construir
  },
  server: {
    port: 3000,
  }
});