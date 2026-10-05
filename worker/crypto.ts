const encoder = new TextEncoder()
const PBKDF2_ITERATIONS = 100_000
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    256,
  )
  return new Uint8Array(bits)
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const derived = await pbkdf2(password, salt, PBKDF2_ITERATIONS)
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(derived)}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterations, salt, expected] = stored.split('$')
  if (scheme !== 'pbkdf2' || !iterations || !salt || !expected) return false
  const derived = await pbkdf2(password, fromBase64(salt), Number(iterations))
  return constantTimeEqual(toBase64(derived), expected)
}

async function hmacHex(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)))
  return toBase64Url(signature)
}

export async function createSessionToken(userId: string, secret: string): Promise<string> {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS
  const payload = `${userId}.${expiresAt}`
  return `${payload}.${await hmacHex(payload, secret)}`
}

export async function readSessionToken(
  token: string,
  secret: string,
): Promise<string | null> {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [userId, expiresAt, signature] = parts
  const payload = `${userId}.${expiresAt}`
  if (!constantTimeEqual(await hmacHex(payload, secret), signature)) return null
  if (Number(expiresAt) * 1000 < Date.now()) return null
  return userId
}

export const SESSION_COOKIE = 'gw_session'
export const SESSION_MAX_AGE_SECONDS = SESSION_TTL_SECONDS