import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    // 127.0.0.1, not "localhost": Google reCAPTCHA keys refuse the name localhost, and on Windows "localhost" can
    // resolve to IPv6 only, which left http://127.0.0.1:5173 unreachable.
    host: '127.0.0.1',
    proxy: {
      '/api': process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:8000',
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
})
