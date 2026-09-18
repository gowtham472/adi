import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Without VITE_API_URL the dashboard calls /api, which the dev server proxies to the local
// API server started with `npm run dev:api`.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    fs: { allow: ['..'] },
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
