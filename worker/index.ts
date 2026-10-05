import { Hono } from 'hono'
import type { AppEnv } from './middleware'
import { requireAuth } from './middleware'
import { adminRoutes } from './routes/admin'
import { authRoutes } from './routes/auth'
import { bookingRoutes } from './routes/bookings'

const app = new Hono<AppEnv>()

app.onError((error, c) => {
  console.error(error)
  return c.json({ error: 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง' }, 500)
})

app.get('/api/auth/me', requireAuth, (c) => c.json(c.get('user')))

app.route('/api/auth', authRoutes)
app.route('/api', bookingRoutes)
app.route('/api/admin', adminRoutes)

export default app