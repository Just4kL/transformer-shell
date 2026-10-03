import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  // относительные пути — сборка открывается из file:// внутри Electron
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // IPv4 явно: на этой машине localhost резолвится в 127.0.0.1,
    // а дефолтный 'localhost' иногда садится только на ::1
    host: '127.0.0.1',
    port: 5273,
    strictPort: true,
    watch: {
      // dev-сервер не следит за артефактами сборки: иначе его вотчер
      // держит открытые хендлы в release/ и валит electron-builder
      // с EPERM на переименовании win-unpacked (бета.2, проверено логом)
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/dist-electron/**',
        '**/release/**',
        '**/temp/**',
        '**/temp_test/**',
      ],
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
})
