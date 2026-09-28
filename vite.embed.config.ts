import { defineConfig } from 'vite'

// Builds the dependency-free host client published as `@swis/genui-studio/embed`.
export default defineConfig({
  build: {
    outDir: 'dist-embed',
    emptyOutDir: true,
    lib: {
      entry: 'src/embed/client.ts',
      formats: ['es'],
      fileName: () => 'client.js',
    },
  },
})
