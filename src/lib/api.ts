import type {
  Availability,
  BookingStatus,
  BookingSummary,
  CellState,
  Me,
  Quote,
  RateCard,
  RateKind,
  Room,
  Settings,
  UserType,
} from '../../shared/types'

/** A busy cell reported alongside a 409, matching the worker's conflict rows. */
export interface ConflictInfo {
  roomId: string
  hour: number
  code: string
  byName: string
  userId: string
  state: CellState
}

export interface AdminUser {
  id: string
  email: string
  name: string
  role: 'user' | 'admin'
  createdAt: number
}

export interface RoomsResponse {
  rooms: Room[]
  rates: RateCard[]
  openStart: number
  openEnd: number
}

export interface CreateBookingInput {
  activityDate: string
  startHour: number
  endHour: number
  roomIds: string[]
  userType: UserType
  attendees: number
  purpose: string
}

export interface CreateBookingResult {
  id: string
  code: string
  status: BookingStatus
  amount: number
  quote: Quote
}

export interface RateInput {
  roomId: string
  userType: UserType
  rateKind: RateKind
  pricePerHour: number
}

export interface SettingsInput {
  paymentInstructions: string
  contact: string
}

/** Every failed call carries the worker's Thai `error` text plus the HTTP status. */
export class ApiError extends Error {
  readonly status: number
  readonly conflicts: ConflictInfo[]

  constructor(status: number, message: string, conflicts: ConflictInfo[] = []) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.conflicts = conflicts
  }
}

const OFFLINE_TEXT = 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง'

const STATUS_TEXT: Record<number, string> = {
  401: 'กรุณาเข้าสู่ระบบก่อนใช้งาน',
  403: 'คุณไม่มีสิทธิ์ดำเนินการนี้',
  404: 'ไม่พบข้อมูลที่ต้องการ',
}

function fallbackText(status: number): string {
  return STATUS_TEXT[status] ?? `เกิดข้อผิดพลาดจากเซิร์ฟเวอร์ (รหัส ${status}) กรุณาลองใหม่อีกครั้ง`
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, { credentials: 'include', ...init })
  } catch {
    throw new ApiError(0, OFFLINE_TEXT)
  }

  const text = await response.text()
  let payload: unknown = null
  if (text.length > 0) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = null
    }
  }

  if (!response.ok) {
    const body = (payload ?? {}) as { error?: unknown; conflicts?: unknown }
    const message =
      typeof body.error === 'string' && body.error.trim().length > 0 ? body.error : fallbackText(response.status)
    const conflicts = Array.isArray(body.conflicts) ? (body.conflicts as ConflictInfo[]) : []
    throw new ApiError(response.status, message, conflicts)
  }

  return payload as T
}

function json(method: string, body: unknown): RequestInit {
  return { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
}

/* ---------------------------------- auth --------------------------------- */

export function getMe(): Promise<Me> {
  return request<Me>('/api/auth/me')
}

export function login(email: string, password: string): Promise<Me> {
  return request<Me>('/api/auth/login', json('POST', { email, password }))
}

export function register(name: string, email: string, password: string): Promise<Me> {
  return request<Me>('/api/auth/register', json('POST', { name, email, password }))
}

export async function logout(): Promise<void> {
  await request<{ ok: true }>('/api/auth/logout', { method: 'POST' })
}

/* -------------------------- rooms, rates, settings ------------------------ */

export function getRooms(): Promise<RoomsResponse> {
  return request<RoomsResponse>('/api/rooms')
}

export function getAvailability(date: string): Promise<Availability> {
  return request<Availability>(`/api/availability?date=${encodeURIComponent(date)}`)
}

export function getSettings(): Promise<Settings> {
  return request<Settings>('/api/settings')
}

/* -------------------------------- bookings ------------------------------- */

export function getMyBookings(): Promise<BookingSummary[]> {
  return request<BookingSummary[]>('/api/bookings/mine')
}

export function createBooking(input: CreateBookingInput): Promise<CreateBookingResult> {
  return request<CreateBookingResult>('/api/bookings', json('POST', input))
}

export async function cancelBooking(id: string): Promise<void> {
  await request<{ ok: true }>(`/api/bookings/${encodeURIComponent(id)}/cancel`, { method: 'POST' })
}

export async function uploadSlip(id: string, file: File, note?: string): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  if (note && note.trim().length > 0) form.append('note', note.trim())
  const result = await request<{ ok: true; fileName: string }>(
    `/api/bookings/${encodeURIComponent(id)}/slip`,
    { method: 'POST', body: form },
  )
  return result.fileName
}

/** Direct URL for an <img>/<iframe> src — the session cookie rides along automatically. */
export function slipUrl(id: string): string {
  return `/api/bookings/${encodeURIComponent(id)}/slip`
}

export async function fetchSlipBlob(id: string): Promise<Blob> {
  const response = await fetch(slipUrl(id), { credentials: 'include' })
  if (!response.ok) throw new ApiError(response.status, await errorText(response))
  return response.blob()
}

async function errorText(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown }
    if (typeof body.error === 'string' && body.error.trim().length > 0) return body.error
  } catch {
    /* the worker always answers with JSON, but never let a parse error mask the status */
  }
  return fallbackText(response.status)
}

/* ---------------------------------- admin -------------------------------- */

export function adminBookings(status?: BookingStatus): Promise<BookingSummary[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : ''
  return request<BookingSummary[]>(`/api/admin/bookings${query}`)
}

export async function verifyPayment(id: string): Promise<void> {
  await request<{ ok: true }>(`/api/admin/bookings/${encodeURIComponent(id)}/verify-payment`, {
    method: 'POST',
  })
}

/** Propagates ApiError (409 + `conflicts`) so the caller can explain a lost race. */
export async function approveBooking(id: string, note?: string): Promise<void> {
  await request<{ ok: true }>(`/api/admin/bookings/${encodeURIComponent(id)}/approve`, json('POST', { note }))
}

export async function rejectBooking(id: string, note?: string): Promise<void> {
  await request<{ ok: true }>(`/api/admin/bookings/${encodeURIComponent(id)}/reject`, json('POST', { note }))
}

export function adminUsers(): Promise<AdminUser[]> {
  return request<AdminUser[]>('/api/admin/users')
}

export async function setUserRole(id: string, role: 'user' | 'admin'): Promise<void> {
  await request<{ ok: true }>(`/api/admin/users/${encodeURIComponent(id)}/role`, json('POST', { role }))
}

export function adminRates(): Promise<RateCard[]> {
  return request<RateCard[]>('/api/admin/rates')
}

export async function saveRate(input: RateInput): Promise<void> {
  await request<{ ok: true }>('/api/admin/rates', json('PUT', input))
}

export async function saveSettings(input: SettingsInput): Promise<void> {
  await request<{ ok: true }>('/api/admin/settings', json('PUT', input))
}