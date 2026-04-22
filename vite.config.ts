import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ['buffer', 'events', 'process', 'stream', 'string_decoder', 'util'],
      globals: {
        Buffer: true,
        process: true,
      },
    }),
    viteSingleFile(),
  ],
})
