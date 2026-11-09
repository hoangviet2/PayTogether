import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  // API_URL / API_TOKEN come from web/.env.local and stay in the dev server; they never reach the browser bundle.
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true, // Log in with PayPal returns to this exact address (the Return URL), so never drift to 5174+
      fs: { allow: ['..'] }, // serve ../shared (plain TS shared with the mobile app and Backend)
      proxy: {
        '/api': {
          target: env.API_URL || 'http://localhost:8787', // local Backend, or the Render URL
          changeOrigin: true,
          headers: env.API_TOKEN ? { 'x-access-token': env.API_TOKEN } : {},
        },
      },
    },
  }
})
