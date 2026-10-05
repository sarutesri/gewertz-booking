import type {
  BookingStatus,
  BookingSummary,
  Quote,
  RateCard,
  Room,
  Settings,
  UserType,
} from '../shared/types'

export interface UserRow {
  id: string
  email: string
  name: string
  role: 'user' | 'admin'
}

export interface BookingRow {
  id: string
  code: string
  userId: string
  bookerName: string
  bookerEmail: string
  activityDate: string
  startHour: number
  endHour: number
  userType: UserType
  attendees: number
  purpose: string
  status: BookingStatus
  amount: number
  priceSnapshot: string
  slipName: string | null
  hasSlip: number
  paymentNote: string | null
  paymentVerifiedAt: number | null
  reviewNote: string | null
  expiresAt: number | null
  createdAt: number
  roomsJson: string
}

export interface ConflictRow {
  roomId: string
  hour: number
  code: string
  byName: string
  userId: string
  state: 'approved' | 'held'
}

export interface UserListRow {
  id: string
  email: string
  name: string
  role: 'user' | 'admin'
  createdAt: number
}

const ROOMS_JSON = `(SELECT json_group_array(json(room)) FROM (
  SELECT json_object(
    'id', r.id,
    'name', r.name,
    'capacityMin', r.capacity_min,
    'capacityMax', r.capacity_max,
    'sortOrder', r.sort_order
  ) AS room
  FROM booking_rooms br
  JOIN rooms r ON r.id = br.room_id
  WHERE br.booking_id = b.id
  ORDER BY r.sort_order
)) AS roomsJson`

const BOOKING_SELECT = `SELECT b.id, b.code, b.user_id AS userId, u.name AS bookerName,
  u.email AS bookerEmail, b.activity_date AS activityDate, b.start_hour AS startHour,
  b.end_hour AS endHour, b.user_type AS userType, b.attendees, b.purpose, b.status,
  b.amount, b.price_snapshot AS priceSnapshot, p.file_name AS slipName,
  CASE WHEN p.booking_id IS NULL THEN 0 ELSE 1 END AS hasSlip,
  b.payment_note AS paymentNote, b.payment_verified_at AS paymentVerifiedAt,
  b.review_note AS reviewNote, b.expires_at AS expiresAt, b.created_at AS createdAt,
  ${ROOMS_JSON}
FROM bookings b
JOIN users u ON u.id = b.user_id
LEFT JOIN payment_slips p ON p.booking_id = b.id`

export function toBookingSummary(row: BookingRow, viewerId: string): BookingSummary {
  return {
    id: row.id,
    code: row.code,
    activityDate: row.activityDate,
    startHour: row.startHour,
    endHour: row.endHour,
    userType: row.userType,
    attendees: row.attendees,
    purpose: row.purpose,
    status: row.status,
    amount: row.amount,
    quote: JSON.parse(row.priceSnapshot) as Quote,
    hasSlip: row.hasSlip === 1,
    slipName: row.slipName,
    paymentNote: row.paymentNote,
    paymentVerifiedAt: row.paymentVerifiedAt,
    reviewNote: row.reviewNote,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    rooms: JSON.parse(row.roomsJson) as Room[],
    bookerName: row.bookerName,
    bookerEmail: row.bookerEmail,
    mine: row.userId === viewerId,
  }
}

export async function fetchBooking(db: D1Database, id: string): Promise<BookingRow | null> {
  return db
    .prepare(`${BOOKING_SELECT} WHERE b.id = ?`)
    .bind(id)
    .first<BookingRow>()
}

export async function fetchRooms(db: D1Database): Promise<Room[]> {
  const { results } = await db
    .prepare(
      `SELECT id, name, capacity_min AS capacityMin, capacity_max AS capacityMax,
        sort_order AS sortOrder FROM rooms ORDER BY sort_order`,
    )
    .all<Room>()
  return results
}

export async function fetchRates(db: D1Database): Promise<RateCard[]> {
  const { results } = await db
    .prepare(
      `SELECT room_id AS roomId, user_type AS userType, rate_kind AS rateKind,
        price_per_hour AS pricePerHour FROM rate_cards`,
    )
    .all<RateCard>()
  return results
}

export async function fetchSettings(db: D1Database): Promise<Settings> {
  const { results } = await db
    .prepare('SELECT key, value FROM settings')
    .all<{ key: string; value: string }>()
  const values: Record<string, string> = Object.fromEntries(results.map((row) => [row.key, row.value]))
  return {
    paymentInstructions: values.payment_instructions ?? '',
    contact: values.contact ?? '',
  }
}

export async function findConflicts(
  db: D1Database,
  options: {
    date: string
    startHour: number
    endHour: number
    roomIds: string[]
    now: number
    includePending: boolean
  },
): Promise<ConflictRow[]> {
  const { date, startHour, endHour, roomIds, now, includePending } = options
  const placeholders = roomIds.map(() => '?').join(',')
  const conflicts: ConflictRow[] = []

  const approved = await db
    .prepare(
      `SELECT s.room_id AS roomId, s.hour, b.code, u.name AS byName, b.user_id AS userId
       FROM booking_slots s
       JOIN bookings b ON b.id = s.booking_id
       JOIN users u ON u.id = b.user_id
       WHERE s.activity_date = ? AND s.hour >= ? AND s.hour < ?
         AND s.room_id IN (${placeholders})`,
    )
    .bind(date, startHour, endHour, ...roomIds)
    .all<Omit<ConflictRow, 'state'>>()
  conflicts.push(...approved.results.map((row) => ({ ...row, state: 'approved' as const })))

  if (includePending) {
    const held = await db
      .prepare(
        `SELECT br.room_id AS roomId, b.start_hour AS startHour, b.end_hour AS endHour,
           b.code, u.name AS byName, b.user_id AS userId
         FROM bookings b
         JOIN booking_rooms br ON br.booking_id = b.id
         JOIN users u ON u.id = b.user_id
         WHERE b.activity_date = ? AND b.status = 'pending_payment'
           AND (b.expires_at IS NULL OR b.expires_at > ?)
           AND b.start_hour < ? AND b.end_hour > ?
           AND br.room_id IN (${placeholders})`,
      )
      .bind(date, now, endHour, startHour, ...roomIds)
      .all<{
        roomId: string
        startHour: number
        endHour: number
        code: string
        byName: string
        userId: string
      }>()
    for (const row of held.results) {
      const from = Math.max(row.startHour, startHour)
      const to = Math.min(row.endHour, endHour)
      for (let hour = from; hour < to; hour += 1) {
        conflicts.push({
          roomId: row.roomId,
          hour,
          code: row.code,
          byName: row.byName,
          userId: row.userId,
          state: 'held',
        })
      }
    }
  }
  return conflicts
}

export async function fetchBookings(
  db: D1Database,
  filter: { userId?: string; statuses?: BookingStatus[] } = {},
): Promise<BookingRow[]> {
  const clauses: string[] = []
  const bindings: string[] = []
  if (filter.userId) {
    clauses.push('b.user_id = ?')
    bindings.push(filter.userId)
  }
  if (filter.statuses && filter.statuses.length > 0) {
    clauses.push(`b.status IN (${filter.statuses.map(() => '?').join(',')})`)
    bindings.push(...filter.statuses)
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
  const { results } = await db
    .prepare(`${BOOKING_SELECT} ${where} ORDER BY b.created_at DESC`)
    .bind(...bindings)
    .all<BookingRow>()
  return results
}

export async function fetchUsers(db: D1Database): Promise<UserListRow[]> {
  const { results } = await db
    .prepare('SELECT id, email, name, role, created_at AS createdAt FROM users ORDER BY created_at DESC')
    .all<UserListRow>()
  return results
}