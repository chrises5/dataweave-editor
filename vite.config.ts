import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve('src/renderer/src')
    }
  },
  plugins: [react()]
})
