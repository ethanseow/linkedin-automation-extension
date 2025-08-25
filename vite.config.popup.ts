import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/popup/',
  plugins: [react()],
  build: {
    outDir: 'dist/popup',
    emptyOutDir: true,
    rollupOptions: {
      input: './src/index.html',
    }
  }
})