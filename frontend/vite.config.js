import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, '')
  // Default: the backend running on this machine. `npm run dev:live` sets
  // VITE_API_TARGET to the production API so the local UI shows real data.
  const apiTarget = env.VITE_API_TARGET || 'http://localhost:4010'

  return {
    plugins: [react()],
    base: '/serve-monitor/',
    server: {
      port: 5180,
      proxy: {
        '/serve-monitor/api': {
          target: apiTarget,
          changeOrigin: true,
          secure: true
        }
      }
    }
  }
})
