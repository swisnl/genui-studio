#!/usr/bin/env node

import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import open from 'open';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, '..');

async function startServer() {
  const server = await createServer({
    root,
    plugins: [vue()],
    server: {
      middlewareMode: false,
      open: false,
    },
  });

  await server.listen();

  const info = server.resolvedUrls;
  const url = info.local[0] || info.network[0];

  console.log('\n✨ GenUI Studio is running!\n');
  console.log(`📱 Open your browser at: ${url}\n`);

  // Try to open browser automatically
  try {
    await open(url);
  } catch {
    // Silently fail if can't open browser
  }
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
