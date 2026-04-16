import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  base: '/health/',
  server: {
    port: 3031,
    allowedHosts: ['ultrassom.ai'],
    proxy: {
      '/health/api': {
        target: 'http://localhost:8011',
        rewrite: (path) => path.replace(/^\/health\/api/, ''),
      },
    },
  },
})
