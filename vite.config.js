import { defineConfig, loadEnv } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Serves api/chat.js and api/change.js during `npm run dev`, mirroring the Vercel serverless functions in production.
function apiDevServer() {
  return {
    name: 'api-dev-server',
    configureServer(server) {
      for (const name of ['chat', 'change']) {
        server.middlewares.use(`/api/${name}`, async (req, res) => {
          const { default: handler } = await server.ssrLoadModule(`/api/${name}.js`)
          await handler(req, res)
        })
      }
    },
  }
}

export default defineConfig(({ mode }) => {
  // Make ANTHROPIC_API_KEY from .env.local available to the dev API only. It has no VITE_ prefix,
  // so Vite never puts it in the browser bundle.
  const env = loadEnv(mode, process.cwd(), '')
  if (env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY) process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY
  // The dev API checks the caller's Supabase session against the same (public) project URL and publishable key.
  for (const name of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY']) {
    // An explicitly empty value (the browser-only demo, e.g. the Playwright server) stays empty.
    if (env[name] && process.env[name] === undefined) process.env[name] = env[name]
  }

  return {
    plugins: [react(), tailwindcss(), apiDevServer()],
    test: {
      environment: 'node',
      // e2e/ holds the Playwright browser tests (npm run test:e2e).
      exclude: [...configDefaults.exclude, 'e2e/**'],
    },
  }
})
