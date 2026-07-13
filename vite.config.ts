import build from '@hono/vite-build/bun'
import bunAdapter from '@hono/vite-dev-server/bun'
import tailwindcss from '@tailwindcss/vite'
import honox from 'honox/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // Polling keeps HMR reliable when the project is mounted from WSL,
    // Docker, a VM, or another filesystem without native watch events.
    watch: {
      usePolling: true,
      interval: 200,
    },
    hmr: {
      clientPort: 5173,
    },
  },
  plugins: [
    honox({
      devServer: { adapter: bunAdapter },
      client: { input: ['/app/style.css'] },
    }),
    tailwindcss(),
    build(),
  ],
})
