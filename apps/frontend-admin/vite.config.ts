import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Solo dev: /api passa dal server Vite al backend sulla rete Docker, come fa nginx in
// produzione. Il browser resta sulla stessa origine: niente CORS, nessuna porta del backend
// da conoscere (BACKEND_PORT/ADMIN_PORT liberi nel .env).
const backend = process.env.VITE_BACKEND_URL || 'http://backend:8080'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: '0.0.0.0',
    watch: {
      usePolling: true,
    },
    proxy: {
      '/api': {
        target: backend,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
