import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Relative base so the build works from any path (GitHub Pages, a file server, or a desktop wrapper).
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
})
