import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  build: {
    outDir: 'dist/extension',
    emptyOutDir: true,
    lib: {
      entry: {
        background: 'src/extension/background.ts',
        content: 'src/extension/content.ts'
      },
      formats: ['es']
    },
    rollupOptions: {
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]'
      }
    },
    target: 'es2020',
    minify: false
  }
})