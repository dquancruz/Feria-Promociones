import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The browser always calls the API on its own origin (/api), in dev and preview too,
// so the session cookie stays first-party. Vite forwards those calls to the backend.
const apiProxy = {
  '/api': 'http://localhost:4000',
  '/health': 'http://localhost:4000',
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: apiProxy,
  },
  preview: {
    proxy: apiProxy,
  },
});
