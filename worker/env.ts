export interface Env {
  DB: D1Database
  ASSETS: Fetcher
  SESSION_SECRET: string
  ADMIN_EMAILS: string
  OPEN_START: string
  OPEN_END: string
  PAYMENT_WINDOW_HOURS: string
}

export interface SessionUser {
  id: string
  email: string
  name: string
  role: 'user' | 'admin'
}

export function isAdminEmail(env: Env, email: string): boolean {
  return env.ADMIN_EMAILS
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase())
}