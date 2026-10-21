import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Serves api/chat.js during `npm run dev`, mirroring the Vercel serverless function in production.
function apiDevServer() {
  return {
    name: 'api-dev-server',
    configureServer(server) {
      server.middlewares.use('/api/chat', async (req, res) => {
        const { default: handler } = await server.ssrLoadModule('/api/chat.js')
        await handler(req, res)
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // Make ANTHROPIC_API_KEY from .env.local available to the dev API only. It has no VITE_ prefix,
  // so Vite never puts it in the browser bundle.
  const env = loadEnv(mode, process.cwd(), '')
  if (env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY) process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY

  return {
    plugins: [react(), tailwindcss(), apiDevServer()],
    test: {
      environment: 'node',
    },
  }
})
