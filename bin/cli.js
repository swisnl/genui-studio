#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, '..');

const viteProcess = spawn('npx', ['vite'], {
  cwd: root,
  stdio: 'inherit',
});

viteProcess.on('error', (err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});

viteProcess.on('exit', (code) => {
  process.exit(code);
});
