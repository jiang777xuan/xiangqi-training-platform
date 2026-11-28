import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { localPorts } from './server/localConfig.ts'

export default defineConfig(({ mode }) => {
  const { apiPort, webPort } = localPorts({ ...loadEnv(mode, process.cwd(), 'XIANGQI_'), ...process.env })
  return {
    plugins: [react()],
    server: {
      port: webPort,
      strictPort: true,
      proxy: {
        '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false },
      },
    },
  }
})
