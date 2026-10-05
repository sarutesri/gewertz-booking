import type { Context, Next } from 'hono'
import { getCookie } from 'hono/cookie'
import type { Hono } from 'hono'
import type { Env, SessionUser } from './env'
import { isAdminEmail } from './env'
import { readSessionToken, SESSION_COOKIE } from './crypto'
import type { UserRow } from './db'

export interface AppEnv {
  Bindings: Env
  Variables: { user: SessionUser }
}

export type App = Hono<AppEnv>

async function resolveUser(c: Context<AppEnv>): Promise<SessionUser | Response> {
  const token = getCookie(c, SESSION_COOKIE)
  if (!token) return c.json({ error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' }, 401)

  const userId = await readSessionToken(token, c.env.SESSION_SECRET)
  if (!userId) return c.json({ error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' }, 401)

  const row = await c.env.DB.prepare('SELECT id, email, name, role FROM users WHERE id = ?')
    .bind(userId)
    .first<UserRow>()
  if (!row) return c.json({ error: 'ไม่พบข้อมูลผู้ใช้' }, 401)

  let role = row.role
  if (isAdminEmail(c.env, row.email) && role !== 'admin') {
    await c.env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(row.id).run()
    role = 'admin'
  }

  return { id: row.id, email: row.email, name: row.name, role }
}

export async function requireAuth(c: Context<AppEnv>, next: Next): Promise<Response | void> {
  const user = await resolveUser(c)
  if (user instanceof Response) return user
  c.set('user', user)
  await next()
}

export async function requireAdmin(c: Context<AppEnv>, next: Next): Promise<Response | void> {
  const user = await resolveUser(c)
  if (user instanceof Response) return user
  if (user.role !== 'admin') return c.json({ error: 'ต้องเป็นผู้ดูแลระบบ' }, 403)
  c.set('user', user)
  await next()
}