import { Hono } from 'hono'
import { z } from 'zod'
import type { BookingStatus, Room } from '../../shared/types'
import {
  fetchBooking,
  fetchBookings,
  fetchRates,
  fetchUsers,
  findConflicts,
  toBookingSummary,
} from '../db'
import { requireAdmin, type AppEnv } from '../middleware'

const statusFilter = z.enum([
  'pending_payment',
  'approved',
  'rejected',
  'cancelled',
])

const ratePayload = z.object({
  roomId: z.string(),
  userType: z.enum(['internal', 'joint', 'external']),
  rateKind: z.enum(['day', 'evening']),
  pricePerHour: z.number().int().min(0).max(100_000),
})

export const adminRoutes = new Hono<AppEnv>()

adminRoutes.use('*', requireAdmin)

adminRoutes.get('/bookings', async (c) => {
  const raw = c.req.query('status')
  let statuses: BookingStatus[] | undefined
  if (raw) {
    const parsed = statusFilter.safeParse(raw)
    if (!parsed.success) return c.json({ error: 'สถานะไม่ถูกต้อง' }, 400)
    statuses = [parsed.data]
  }

  const rows = await fetchBookings(c.env.DB, statuses ? { statuses } : {})
  return c.json(rows.map((row) => toBookingSummary(row, c.get('user').id)))
})

adminRoutes.post('/bookings/:id/verify-payment', async (c) => {
  const booking = await fetchBooking(c.env.DB, c.req.param('id'))
  if (!booking) return c.json({ error: 'ไม่พบรายการจอง' }, 404)
  if (!booking.hasSlip) return c.json({ error: 'ยังไม่มีหลักฐานการชำระเงินของรายการนี้' }, 409)

  const now = Date.now()
  await c.env.DB.prepare(
    'UPDATE bookings SET payment_verified_at = ?, payment_verified_by = ?, updated_at = ? WHERE id = ?',
  )
    .bind(now, c.get('user').id, now, booking.id)
    .run()
  return c.json({ ok: true })
})

adminRoutes.post('/bookings/:id/approve', async (c) => {
  const booking = await fetchBooking(c.env.DB, c.req.param('id'))
  if (!booking) return c.json({ error: 'ไม่พบรายการจอง' }, 404)
  if (booking.status !== 'pending_payment') {
    return c.json({ error: 'รายการนี้ไม่อยู่ในสถานะที่รออนุมัติ' }, 409)
  }
  if (booking.amount > 0 && booking.paymentVerifiedAt === null) {
    return c.json({ error: 'ต้องตรวจสอบหลักฐานการชำระเงินก่อนอนุมัติ' }, 409)
  }

  const rooms = JSON.parse(booking.roomsJson) as Room[]
  const statements = rooms.flatMap((room) =>
    Array.from({ length: booking.endHour - booking.startHour }, (_, index) =>
      c.env.DB.prepare(
        'INSERT INTO booking_slots (room_id, activity_date, hour, booking_id) VALUES (?, ?, ?, ?)',
      ).bind(room.id, booking.activityDate, booking.startHour + index, booking.id),
    ),
  )

  try {
    await c.env.DB.batch(statements)
  } catch (error) {
    // The slot primary key is the real guard; this branch only reports which hours were
    // taken in the window between the admin's screen and this click.
    if (!String(error).includes('UNIQUE constraint failed: booking_slots')) throw error
    const conflicts = await findConflicts(c.env.DB, {
      date: booking.activityDate,
      startHour: booking.startHour,
      endHour: booking.endHour,
      roomIds: rooms.map((room) => room.id),
      now: Date.now(),
      includePending: false,
    })
    return c.json({ error: 'ช่วงเวลานี้ถูกอนุมัติไปแล้ว', conflicts }, 409)
  }

  const body = await c.req.json().catch(() => ({}))
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 300) : null
  const now = Date.now()
  await c.env.DB.prepare(
    `UPDATE bookings SET status = 'approved', reviewed_by = ?, reviewed_at = ?,
      review_note = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(c.get('user').id, now, note, now, booking.id)
    .run()

  return c.json({ ok: true })
})

adminRoutes.post('/bookings/:id/reject', async (c) => {
  const booking = await fetchBooking(c.env.DB, c.req.param('id'))
  if (!booking) return c.json({ error: 'ไม่พบรายการจอง' }, 404)
  if (booking.status === 'cancelled') return c.json({ error: 'รายการนี้ถูกยกเลิกแล้ว' }, 409)

  const body = await c.req.json().catch(() => ({}))
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 300) : null
  const now = Date.now()

  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE bookings SET status = 'rejected', reviewed_by = ?, reviewed_at = ?,
        review_note = ?, updated_at = ? WHERE id = ?`,
    ).bind(c.get('user').id, now, note, now, booking.id),
    c.env.DB.prepare('DELETE FROM booking_slots WHERE booking_id = ?').bind(booking.id),
  ])
  return c.json({ ok: true })
})

adminRoutes.get('/users', async (c) => c.json(await fetchUsers(c.env.DB)))

adminRoutes.post('/users/:id/role', async (c) => {
  const targetId = c.req.param('id')
  if (targetId === c.get('user').id) {
    return c.json({ error: 'เปลี่ยนสิทธิ์ของบัญชีตัวเองไม่ได้' }, 400)
  }
  const parsed = z
    .object({ role: z.enum(['user', 'admin']) })
    .safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'ข้อมูลไม่ถูกต้อง' }, 400)

  const result = await c.env.DB.prepare('UPDATE users SET role = ? WHERE id = ?')
    .bind(parsed.data.role, targetId)
    .run()
  if (!result.meta.changes) return c.json({ error: 'ไม่พบผู้ใช้' }, 404)
  return c.json({ ok: true })
})

adminRoutes.get('/rates', async (c) => c.json(await fetchRates(c.env.DB)))

adminRoutes.put('/rates', async (c) => {
  const parsed = ratePayload.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'ข้อมูลอัตราค่าใช้จ่ายไม่ถูกต้อง' }, 400)

  const { roomId, userType, rateKind, pricePerHour } = parsed.data
  const room = await c.env.DB.prepare('SELECT id FROM rooms WHERE id = ?')
    .bind(roomId)
    .first<{ id: string }>()
  if (!room) return c.json({ error: 'ไม่พบห้อง' }, 404)

  await c.env.DB.prepare(
    `INSERT INTO rate_cards (room_id, user_type, rate_kind, price_per_hour) VALUES (?, ?, ?, ?)
     ON CONFLICT (room_id, user_type, rate_kind) DO UPDATE SET price_per_hour = excluded.price_per_hour`,
  )
    .bind(roomId, userType, rateKind, pricePerHour)
    .run()
  return c.json({ ok: true })
})

adminRoutes.put('/settings', async (c) => {
  const parsed = z
    .object({ paymentInstructions: z.string().max(2000), contact: z.string().max(500) })
    .safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'ข้อมูลไม่ถูกต้อง' }, 400)

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO settings (key, value) VALUES ('payment_instructions', ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    ).bind(parsed.data.paymentInstructions),
    c.env.DB.prepare(
      `INSERT INTO settings (key, value) VALUES ('contact', ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    ).bind(parsed.data.contact),
  ])
  return c.json({ ok: true })
})