import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base = '/' en dev ; en prod GitHub Pages sert sous /<repo>/ : surchargé par VITE_BASE au build.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? '/',
  build: { chunkSizeWarningLimit: 1500 },
})
