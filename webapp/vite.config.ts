import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/* Multi-page build: each migrated page is a Vite HTML entry.
   Output lands in ../public so the existing Express server + git-push deploy
   serves it with ZERO server changes. emptyOutDir MUST stay false —
   legacy vanilla pages live in the same folder until they are migrated. */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../public',
    emptyOutDir: false,
    assetsDir: 'react',
    rollupOptions: { input: { index: 'index.html', shop: 'shop.html', product: 'product.html' } }
  }
});
