import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// เปลี่ยน 'number-equation' เป็นชื่อ repo ของคุณใน GitHub
const REPO_NAME = 'number-equation'

export default defineConfig({
  plugins: [react()],
  base: process.env.NODE_ENV === 'production' ? `/${REPO_NAME}/` : '/',
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        entryFileNames: 'game.js',
        chunkFileNames: 'game.js',
        assetFileNames: 'game.[ext]',
      }
    }
  }
})
