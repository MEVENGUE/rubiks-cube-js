import { defineConfig } from 'vite'

export default defineConfig({
  server: { port: 5173, host: true },
  preview: { port: 4173, host: true, allowedHosts: true },
  optimizeDeps: { include: ['cubejs/lib/cube.js'] },
  worker: { format: 'es' },
})
