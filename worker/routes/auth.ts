import { Hono } from 'hono'
import type { Context } from 'hono'
import { deleteCookie, setCookie } from 'hono/cookie'
import { z } from 'zod'
import {
  createSessionToken,
  hashPassword,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  verifyPassword,
} from '../crypto'
import { isAdminEmail } from '../env'
import type { UserRow } from '../db'
import type { AppEnv } from '../middleware'
const credentials = z.object({
  email: z.email().max(200),
  password: z.string().min(8).max(200),
  name: z.string().trim().min(1).max(120).optional(),
})

async function establishSession(c: Context<AppEnv>, userId: string) {
  const token = await createSessionToken(userId, c.env.SESSION_SECRET)
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: new URL(c.req.url).protocol === 'https:',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
}

export const authRoutes = new Hono<AppEnv>()

authRoutes.post('/register', async (c) => {
  if (!c.env.SESSION_SECRET) return c.json({ error: 'เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า SESSION_SECRET' }, 500)

  const parsed = credentials.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีเมลและรหัสผ่าน' }, 400)
  const name = parsed.data.name?.trim()
  if (!name) return c.json({ error: 'กรุณากรอกชื่อ-นามสกุล' }, 400)

  const email = parsed.data.email.trim().toLowerCase()
  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?')
    .bind(email)
    .first<{ id: string }>()
  if (existing) return c.json({ error: 'อีเมลนี้มีบัญชีอยู่แล้ว' }, 409)

  const id = crypto.randomUUID()
  const role = isAdminEmail(c.env, email) ? 'admin' : 'user'
  await c.env.DB.prepare(
    'INSERT INTO users (id, email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(id, email, name, await hashPassword(parsed.data.password), role, Date.now())
    .run()

  await establishSession(c, id)
  return c.json({ id, email, name, role })
})

authRoutes.post('/login', async (c) => {
  if (!c.env.SESSION_SECRET) return c.json({ error: 'เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า SESSION_SECRET' }, 500)

  const parsed = credentials.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'กรุณากรอกอีเมลและรหัสผ่าน' }, 400)

  const email = parsed.data.email.trim().toLowerCase()
  const row = await c.env.DB.prepare(
    'SELECT id, email, name, role, password_hash AS passwordHash FROM users WHERE email = ?',
  )
    .bind(email)
    .first<UserRow & { passwordHash: string }>()
  if (!row || !(await verifyPassword(parsed.data.password, row.passwordHash))) {
    return c.json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' }, 401)
  }

  const role = isAdminEmail(c.env, row.email) && row.role !== 'admin' ? 'admin' : row.role
  if (role !== row.role) {
    await c.env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(row.id).run()
  }

  await establishSession(c, row.id)
  return c.json({ id: row.id, email: row.email, name: row.name, role })
})

authRoutes.post('/logout', (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
  return c.json({ ok: true })
})