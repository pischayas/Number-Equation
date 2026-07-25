import{defineConfig}from'vite';import react from'@vitejs/plugin-react';
const REPO='Number-Equation';
export default defineConfig({plugins:[react()],base:process.env.NODE_ENV==='production'?`/${REPO}/`:'/',build:{outDir:'dist',rollupOptions:{output:{inlineDynamicImports:true,entryFileNames:'game.js',chunkFileNames:'game.js',assetFileNames:'game.[ext]'}}}});
