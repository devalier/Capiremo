import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// BASE_PATH lets the same build run at a sub-path (e.g. GitHub Pages: /capiremo/).
export default defineConfig(({ mode }) => ({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), ...(mode === 'https' ? [basicSsl()] : [])],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
}));
