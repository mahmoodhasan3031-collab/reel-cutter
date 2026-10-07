import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import commonjs from '@rollup/plugin-commonjs'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  main: {
    define: {
      // Inject the backend API origin at build time so the packaged desktop
      // app can reach /api/license/* (STEP 76: the client no longer talks to
      // Supabase directly — no Supabase credential, not even the anon key, is
      // bundled into the client anymore).
      // REEL_CUTTER_API_URL overrides the default for local development.
      __API_BASE_URL__: JSON.stringify(
        process.env.REEL_CUTTER_API_URL || 'https://reel-cutter.onrender.com'
      ),
    },
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
