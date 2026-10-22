import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' keeps asset paths relative so the same build works on GitHub Pages (/chesscoach/) and Vercel (/).
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    allowedHosts: ['sb-6kff3fho55x5.vercel.run'],
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
