import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
import { mockLlmProxy } from './examples/mock-llm'

export default defineConfig(({ command }) => ({
  // Relative, so the build can be served from any path (GitHub Pages, a host app, the CLI).
  base: process.env.VITE_BASE ?? './',
  plugins: [vue(), ...(command === 'serve' ? [mockLlmProxy()] : [])],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
}))
