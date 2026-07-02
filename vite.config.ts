import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // En producción el backend PHP vive bajo /api en el mismo origen (ver
    // backend/README.md) — este proxy solo replica eso en local, apuntando al
    // servidor embebido de PHP (`php -S localhost:8000 -t backend/public`).
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
  test: {
    environment: 'node',
  },
});
