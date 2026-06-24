import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { config } from './config.js'
import webhook from './routes/webhook.js'
import oauth from './routes/oauth.js'
import health from './routes/health.js'
import { startScheduler } from './services/scheduler.js'

const app = new Hono()

app.route('/webhook', webhook)
app.route('/oauth', oauth)
app.route('/health', health)

startScheduler()

serve({ fetch: app.fetch, port: config.PORT }, () => {
  console.log(`[nudj] server running on port ${config.PORT}`)
})
