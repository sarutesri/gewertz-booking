import { Hono } from 'hono'
import { z } from 'zod'
import type { Availability, DayCell } from '../../shared/types'
import {
  fetchBooking,
  fetchBookings,
  fetchRates,
  fetchRooms,
  fetchSettings,
  findConflicts,
  toBookingSummary,
} from '../db'
import { requireAuth, type AppEnv } from '../middleware'
import { quoteRooms } from '../pricing'

/** Slips are stored in D1 (no-card free tier), so uploads stay well under the row-size limit. */
const MAX_SLIP_BYTES = 1_500_000
const SLIP_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}

const bangkokDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' })

const createPayload = z.object({
  activityDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startHour: z.number().int(),
  endHour: z.number().int(),
  roomIds: z.array(z.string()).min(1).max(5),
  userType: z.enum(['internal', 'joint', 'external']),
  attendees: z.number().int().min(1).max(500),
  purpose: z.string().trim().min(1).max(500),
})

export const bookingRoutes = new Hono<AppEnv>()

bookingRoutes.use('*', requireAuth)

bookingRoutes.get('/rooms', async (c) => {
  const [rooms, rates] = await Promise.all([fetchRooms(c.env.DB), fetchRates(c.env.DB)])
  return c.json({
    rooms,
    rates,
    openStart: Number(c.env.OPEN_START),
    openEnd: Number(c.env.OPEN_END),
  })
})

bookingRoutes.get('/settings', async (c) => c.json(await fetchSettings(c.env.DB)))

bookingRoutes.get('/availability', async (c) => {
  const date = c.req.query('date') ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ error: 'วันที่ไม่ถูกต้อง' }, 400)

  const viewer = c.get('user')
  const rooms = await fetchRooms(c.env.DB)
  const openStart = Number(c.env.OPEN_START)
  const openEnd = Number(c.env.OPEN_END)

  const conflicts = await findConflicts(c.env.DB, {
    date,
    startHour: openStart,
    endHour: openEnd,
    roomIds: rooms.map((room) => room.id),
    now: Date.now(),
    includePending: true,
  })

  const byCell: Record<string, (typeof conflicts)[number]> = {}
  for (const conflict of conflicts) byCell[`${conflict.roomId}:${conflict.hour}`] = conflict

  const cells: DayCell[] = []
  for (const room of rooms) {
    for (let hour = openStart; hour < openEnd; hour += 1) {
      const conflict = byCell[`${room.id}:${hour}`]
      if (!conflict) {
        cells.push({ roomId: room.id, hour, state: 'free' })
        continue
      }
      const visible = conflict.userId === viewer.id || viewer.role === 'admin'
      cells.push({
        roomId: room.id,
        hour,
        state: conflict.state,
        code: conflict.code,
        mine: conflict.userId === viewer.id,
        byName: visible ? conflict.byName : undefined,
      })
    }
  }

  const availability: Availability = { date, openStart, openEnd, rooms, cells }
  return c.json(availability)
})

bookingRoutes.get('/bookings/mine', async (c) => {
  const viewer = c.get('user')
  const rows = await fetchBookings(c.env.DB, { userId: viewer.id })
  return c.json(rows.map((row) => toBookingSummary(row, viewer.id)))
})

bookingRoutes.post('/bookings', async (c) => {
  const viewer = c.get('user')
  const parsed = createPayload.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'ข้อมูลการจองไม่ครบถ้วนหรือไม่ถูกต้อง' }, 400)
  const input = parsed.data

  if (input.activityDate < bangkokDate.format(new Date())) {
    return c.json({ error: 'ไม่สามารถจองย้อนหลังได้' }, 400)
  }

  const openStart = Number(c.env.OPEN_START)
  const openEnd = Number(c.env.OPEN_END)
  if (input.startHour < openStart || input.endHour > openEnd || input.startHour >= input.endHour) {
    return c.json({ error: `เวลาจองต้องอยู่ระหว่าง ${openStart}:00-${openEnd}:00 น.` }, 400)
  }

  const rooms = await fetchRooms(c.env.DB)
  const roomIds = [...new Set(input.roomIds)]
  const selected = roomIds.map((id) => rooms.find((room) => room.id === id))
  if (selected.some((room) => room === undefined)) {
    return c.json({ error: 'พบห้องที่ไม่ถูกต้อง' }, 400)
  }
  const chosen = selected.filter((room) => room !== undefined)
  const capacity = Math.min(...chosen.map((room) => room.capacityMax))
  if (input.attendees > capacity) {
    return c.json({ error: `จำนวนผู้เข้าใช้ต้องไม่เกิน ${capacity} คน` }, 400)
  }

  const conflicts = await findConflicts(c.env.DB, {
    date: input.activityDate,
    startHour: input.startHour,
    endHour: input.endHour,
    roomIds,
    now: Date.now(),
    includePending: true,
  })
  if (conflicts.length > 0) {
    return c.json(
      {
        error: 'ช่วงเวลานี้มีการจองไว้แล้ว กรุณาเลือกช่วงเวลาอื่น',
        conflicts,
      },
      409,
    )
  }

  const rates = await fetchRates(c.env.DB)
  const quote = quoteRooms({
    rooms: chosen,
    rates,
    userType: input.userType,
    startHour: input.startHour,
    endHour: input.endHour,
  })

  const now = Date.now()
  const id = crypto.randomUUID()
  const code = `GW-${id.slice(0, 6).toUpperCase()}`
  const status = quote.total > 0 ? 'pending_payment' : 'pending_review'
  const expiresAt = quote.total > 0 ? now + Number(c.env.PAYMENT_WINDOW_HOURS) * 3_600_000 : null

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO bookings (id, code, user_id, activity_date, start_hour, end_hour, user_type,
        attendees, purpose, status, amount, price_snapshot, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      code,
      viewer.id,
      input.activityDate,
      input.startHour,
      input.endHour,
      input.userType,
      input.attendees,
      input.purpose,
      status,
      quote.total,
      JSON.stringify(quote),
      expiresAt,
      now,
      now,
    ),
    ...roomIds.map((roomId) =>
      c.env.DB.prepare('INSERT INTO booking_rooms (booking_id, room_id) VALUES (?, ?)').bind(id, roomId),
    ),
  ])

  return c.json({ id, code, status, amount: quote.total, quote }, 201)
})

bookingRoutes.post('/bookings/:id/cancel', async (c) => {
  const viewer = c.get('user')
  const booking = await fetchBooking(c.env.DB, c.req.param('id'))
  if (!booking) return c.json({ error: 'ไม่พบรายการจอง' }, 404)
  if (booking.userId !== viewer.id) return c.json({ error: 'ไม่มีสิทธิ์ดำเนินการ' }, 403)
  if (booking.status !== 'pending_payment' && booking.status !== 'pending_review') {
    return c.json({ error: 'ยกเลิกได้เฉพาะรายการที่ยังรอดำเนินการอยู่เท่านั้น' }, 409)
  }

  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE bookings SET status = 'cancelled', updated_at = ? WHERE id = ?").bind(
      Date.now(),
      booking.id,
    ),
    c.env.DB.prepare('DELETE FROM booking_slots WHERE booking_id = ?').bind(booking.id),
  ])
  return c.json({ ok: true })
})

bookingRoutes.post('/bookings/:id/slip', async (c) => {
  const viewer = c.get('user')
  const booking = await fetchBooking(c.env.DB, c.req.param('id'))
  if (!booking) return c.json({ error: 'ไม่พบรายการจอง' }, 404)
  if (booking.userId !== viewer.id) return c.json({ error: 'ไม่มีสิทธิ์ดำเนินการ' }, 403)
  if (booking.status !== 'pending_payment') {
    return c.json({ error: 'แนบหลักฐานได้เฉพาะรายการที่อยู่ระหว่างรอชำระเงิน' }, 409)
  }

  const form = await c.req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) return c.json({ error: 'กรุณาเลือกไฟล์หลักฐาน' }, 400)

  const extension = SLIP_EXTENSION[file.type]
  if (!extension) {
    return c.json({ error: 'รองรับเฉพาะไฟล์ JPG, PNG, WEBP และ PDF' }, 400)
  }
  if (file.size > MAX_SLIP_BYTES) {
    return c.json({ error: 'ไฟล์ใหญ่เกินไป กรุณาลดขนาดรูปก่อนอัปโหลด' }, 413)
  }

  const note = form.get('note')
  const now = Date.now()
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO payment_slips (booking_id, file_name, content_type, byte_size, data, uploaded_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(booking_id) DO UPDATE SET
         file_name = excluded.file_name,
         content_type = excluded.content_type,
         byte_size = excluded.byte_size,
         data = excluded.data,
         uploaded_at = excluded.uploaded_at`,
    ).bind(
      booking.id,
      `${file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60) || 'slip'}`,
      file.type,
      file.size,
      await file.arrayBuffer(),
      now,
    ),
    c.env.DB.prepare(
      "UPDATE bookings SET payment_note = ?, updated_at = ? WHERE id = ? AND payment_verified_at IS NULL",
    ).bind(typeof note === 'string' && note.trim() ? note.trim().slice(0, 300) : null, now, booking.id),
  ])

  return c.json({ ok: true, fileName: file.name })
})

bookingRoutes.get('/bookings/:id/slip', async (c) => {
  const viewer = c.get('user')
  const booking = await fetchBooking(c.env.DB, c.req.param('id'))
  if (!booking) return c.json({ error: 'ไม่พบรายการจอง' }, 404)
  if (booking.userId !== viewer.id && viewer.role !== 'admin') {
    return c.json({ error: 'ไม่มีสิทธิ์ดำเนินการ' }, 403)
  }

  const slip = await c.env.DB.prepare(
    'SELECT file_name AS fileName, content_type AS contentType, data FROM payment_slips WHERE booking_id = ?',
  )
    .bind(booking.id)
    .first<{ fileName: string; contentType: string; data: ArrayBuffer }>()
  if (!slip) return c.json({ error: 'ยังไม่มีหลักฐานการชำระเงิน' }, 404)

  return new Response(slip.data, {
    headers: {
      'content-type': slip.contentType,
      'content-disposition': `inline; filename="${slip.fileName}"`,
      'cache-control': 'private, no-store',
    },
  })
})