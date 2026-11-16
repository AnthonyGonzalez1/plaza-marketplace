import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

// The SPA always calls relative URLs (/api/v1/...). In development this proxy forwards them to
// the backend, so the browser sees a single origin and CORS is never needed.
const PROXIED_PATHS = ['/api', '/swagger-ui', '/v3/api-docs'];

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const target = env.VITE_API_PROXY_TARGET ?? 'http://localhost:8080';
  const proxy = Object.fromEntries(PROXIED_PATHS.map((path) => [path, { target }]));

  return {
    plugins: [react()],
    server: { proxy },
    preview: { proxy },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
    },
  };
});
