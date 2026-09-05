import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import commonjs from '@rollup/plugin-commonjs'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin(),
      // Allow Rollup to bundle local CJS engine/shared modules that are imported
      // via ESM 'import' statements from src/main/index.js.
      // Without this, Rollup cannot resolve named exports from module.exports = { ... }
      // CJS modules and the build would fail or leave them as runtime requires.
      commonjs({
        // Only transform local project files, not npm packages
        include: [
          /src\/engine\//,
          /src\/main\//,
          /src\/shared\//,
        ],
        transformMixedEsModules: true,
      }),
    ],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.js')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.js')
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        }
      }
    },
    plugins: [react()]
  }
})
