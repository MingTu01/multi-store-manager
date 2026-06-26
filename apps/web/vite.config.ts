import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { execSync } from 'child_process';

export default defineConfig({
  plugins: [
    {
      name: 'inject-build-hash',
      closeBundle() {
        try {
          execSync('node build-hash.cjs', { cwd: __dirname, stdio: 'inherit' });
        } catch (e) { console.warn('[build-hash] Failed:', e.message); }
      },
    },
    react(),
    tailwindcss(),
    // Cache-busting: inject timestamp into index.html
    {
      name: 'cache-bust',
      transformIndexHtml(html) {
        const hash = Date.now().toString(36);
        html = html.replace(
          /src="(\/assets\/index-[A-Za-z0-9_-]+\.js)"/g,
          'src="$1?v=' + hash + '"'
        );
        return html;
      }
    }
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/') || id.includes('node_modules/react-router')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3')) {
            return 'vendor-charts';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-icons';
          }
          if (id.includes('node_modules/zustand')) {
            return 'vendor-state';
          }
        },
      },
    },
    chunkSizeWarningLimit: 500,
    target: 'es2020',
    sourcemap: false,
    cssCodeSplit: true,
  },
});