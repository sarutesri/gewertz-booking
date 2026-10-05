import { useEffect, useMemo, useRef, useState } from 'react'
import type { BookingStatus, BookingSummary, Quote } from '../../shared/types'
import { STATUS_LABEL, USER_TYPE_LABEL } from '../../shared/types'
import { ApiError, cancelBooking, fetchSlipBlob, getMyBookings, uploadSlip } from '../lib/api'
import {
  baht,
  expiryText,
  fileSize,
  formatDate,
  formatDateTime,
  hourRange,
} from '../lib/format'

/** The worker rejects anything over 1.5MB; compress well below it before uploading. */
const MAX_SLIP_BYTES = 1.5 * 1024 * 1024
const MAX_IMAGE_EDGE = 1600
const JPEG_QUALITY = 0.75

/** Re-encode an oversized photo down to a ~1600px JPEG so the upload stays small. */
async function compressImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    )
    if (!blob || blob.size >= file.size) return file
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg' })
  } finally {
    bitmap.close()
  }
}

/** ApiError already carries the worker's Thai message; anything else gets a generic fallback. */
function errorMessage(err: unknown): string {
  if (err instanceof ApiError || err instanceof Error) return err.message
  return 'เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่อีกครั้ง'
}

const STATUS_STYLE: Record<BookingStatus, string> = {
  pending_payment: 'bg-amber-100 text-amber-900 ring-amber-400',
  approved: 'bg-emerald-100 text-emerald-900 ring-emerald-400',
  rejected: 'bg-rose-100 text-rose-900 ring-rose-400',
  cancelled: 'bg-slate-200 text-slate-800 ring-slate-400',
}

function StatusBadge({ status }: { status: BookingStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-4 py-1.5 text-base font-semibold ring-1 ${STATUS_STYLE[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  )
}

function QuoteBreakdown({ quote }: { quote: Quote }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
      <h3 className="mb-3 text-base font-semibold text-slate-900">รายละเอียดค่าใช้จ่าย</h3>
      <ul className="space-y-2 text-base">
        {quote.lines.map((line, i) => (
          <li
            key={`${line.roomId}-${line.rateKind}-${i}`}
            className="flex flex-wrap justify-between gap-x-3"
          >
            <span className="text-slate-700">
              {line.roomName}
              <span className="text-slate-600">
                {baht(line.pricePerHour)})
              </span>
            </span>
            <span className="tabular-nums text-slate-900">{baht(line.subtotal)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex justify-between border-t border-slate-200 pt-3 text-base font-semibold text-slate-900">
        <span>รวม</span>
        <span className="tabular-nums">{baht(quote.total)}</span>
      </div>
    </div>
  )
}

/** Re-renders every second so the remaining time stays live without a page reload. */
function ExpiryCountdown({ expiresAt }: { expiresAt: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const remaining = expiresAt - now
  if (remaining <= 0) {
    return (
      <p className="text-base font-medium text-rose-700">
        หมดเวลาชำระเงินแล้ว หากยังไม่ชำระ การจองนี้อาจถูกยกเลิกอัตโนมัติ
      </p>
    )
  }
  const tone = remaining < 3_600_000 ? 'text-amber-800' : 'text-slate-700'
  return (
    <p className={`text-base font-medium ${tone}`}>
      เหลือเวลาชำระเงิน{expiryText(expiresAt)}
    </p>
  )
}

function SlipViewer({ bookingId, fileName }: { bookingId: string; fileName: string | null }) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const isPdf = (fileName ?? '').toLowerCase().endsWith('.pdf')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    fetchSlipBlob(bookingId)
      .then((blob) => {
        if (!active) return
        const next = URL.createObjectURL(blob)
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = next
        setUrl(next)
      })
      .catch((err: unknown) => {
        if (active) setError(errorMessage(err))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [bookingId])

  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    },
    [],
  )

  if (loading) return <p className="py-8 text-center text-base text-slate-600">กำลังโหลดสลิป…</p>

  if (error) {
    return (
      <div className="rounded-xl bg-rose-50 p-4 text-base text-rose-800 ring-1 ring-rose-200">{error}</div>
    )
  }
  if (!url) return null

  return isPdf ? (
    <iframe
      title="สลิปการชำระเงิน"
      src={url}
      className="h-80 w-full rounded-xl bg-white ring-1 ring-slate-300"
    />
  ) : (
    <img
      src={url}
      alt="สลิปการชำระเงิน"
      className="max-h-80 w-full rounded-xl bg-white object-contain ring-1 ring-slate-300"
    />
  )
}

function SlipUploader({
  bookingId,
  onUploaded,
}: {
  bookingId: string
  onUploaded: (fileName: string) => void
}) {
  const [note, setNote] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function pick(raw: File) {
    setError(null)
    setInfo(null)
    const isImage = raw.type.startsWith('image/')
    if (!isImage && raw.type !== 'application/pdf') {
      setFile(null)
      setError('รองรับเฉพาะไฟล์รูปภาพ (JPG/PNG) หรือ PDF เท่านั้น')
      return
    }

    let prepared = raw
    if (isImage) {
      try {
        prepared = await compressImage(raw)
      } catch {
        setFile(null)
        setError('ไม่สามารถย่อรูปภาพได้ กรุณาเลือกไฟล์อื่นหรือแนบเป็น PDF')
        return
      }
      setInfo(
        prepared.size < raw.size
          ? `ย่อรูปแล้ว จาก ${fileSize(raw.size)} เหลือ ${fileSize(prepared.size)}`
          : `ไฟล์ต้นฉบับเล็กอยู่แล้ว (${fileSize(prepared.size)}) ไม่ต้องย่อ`,
      )
    }

    if (prepared.size > MAX_SLIP_BYTES) {
      setFile(null)
      setError(`ไฟล์ใหญ่เกินไป (${fileSize(prepared.size)}) ต้องไม่เกิน 1.5 เมกะไบต์`)
      return
    }
    setFile(prepared)
  }

  async function submit() {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const savedName = await uploadSlip(bookingId, file, note.trim())
      setFile(null)
      setNote('')
      if (inputRef.current) inputRef.current.value = ''
      // Re-read the list: the worker moves the booking on once the slip is attached.
      onUploaded(savedName)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex min-h-12 cursor-pointer items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-base font-medium text-slate-700 transition hover:bg-slate-100 focus-within:ring-2 focus-within:ring-brand-600 focus-within:ring-offset-2">
          เลือกไฟล์สลิป
          <input
            ref={inputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => {
              const raw = e.target.files?.[0]
              if (raw) void pick(raw)
            }}
          />
        </label>
        {file && (
          <span className="text-base text-slate-700">
            {file.name} · {fileSize(file.size)}
          </span>
        )}
      </div>

      {info && <p className="text-sm text-slate-600">{info}</p>}
      {error && <p className="text-sm text-rose-700">{error}</p>}

      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="หมายเหตุ (ถ้ามี)"
        className="w-full min-h-12 rounded-xl border border-slate-300 bg-white px-4 py-3 text-base focus:border-brand-600 focus:ring-2 focus:ring-brand-200 focus:outline-none"
      />
      <button
        type="button"
        disabled={!file || busy}
        onClick={() => void submit()}
        className="inline-flex min-h-12 items-center justify-center rounded-xl bg-brand-600 px-5 py-3 text-base font-medium text-white transition hover:bg-brand-700 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-brand-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {busy ? 'กำลังอัปโหลด…' : 'อัปโหลดสลิป'}
      </button>
    </div>
  )
}

function ConfirmCancelDialog({
  booking,
  busy,
  onConfirm,
  onClose,
}: {
  booking: BookingSummary
  busy: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">ยืนยันการยกเลิกการจอง</h2>
        <p className="mt-2 text-base text-slate-700">
          การจอง <span className="font-mono font-semibold">{booking.code}</span> (
          {booking.rooms.map((r) => r.name).join(', ')} · {formatDate(booking.activityDate)}{' '}
          {hourRange(booking.startHour, booking.endHour)}) จะถูกยกเลิกและย้อนกลับไม่ได้
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-base font-medium text-slate-700 transition hover:bg-slate-100 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-brand-600 focus-visible:ring-offset-2 disabled:opacity-50"
          >
            ไม่ยกเลิก
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-rose-700 px-5 py-3 text-base font-medium text-white transition hover:bg-rose-800 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-rose-700 focus-visible:ring-offset-2 disabled:opacity-50"
          >
            {busy ? 'กำลังดำเนินการ…' : 'ยืนยันยกเลิก'}
          </button>
        </div>
      </div>
    </div>
  )
}

function BookingCard({
  booking,
  onChanged,
}: {
  booking: BookingSummary
  onChanged: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showUploader, setShowUploader] = useState(false)
  const [slipName, setSlipName] = useState<string | null>(booking.slipName)
  const [slipKey, setSlipKey] = useState(0)

  useEffect(() => {
    setSlipName(booking.slipName)
  }, [booking.slipName])

  const canCancel =
    booking.status === 'pending_payment' || (booking.status === 'approved' && booking.amount === 0)
  const canPay = booking.status === 'pending_payment'
  const roomNames = useMemo(() => booking.rooms.map((r) => r.name).join(', '), [booking.rooms])
  const attendeesMax = useMemo(
    () => booking.rooms.reduce((min, r) => Math.min(min, r.capacityMax), Number.MAX_SAFE_INTEGER),
    [booking.rooms],
  )

  async function doCancel() {
    setBusy(true)
    setError(null)
    try {
      await cancelBooking(booking.id)
      setConfirming(false)
      onChanged()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-base font-semibold text-slate-900">{booking.code}</span>
            <StatusBadge status={booking.status} />
          </div>
          <h2 className="mt-2 text-lg font-semibold text-slate-900">{roomNames}</h2>
          <p className="mt-1 text-base text-slate-700">
            {formatDate(booking.activityDate)} · {hourRange(booking.startHour, booking.endHour)} (
            {booking.endHour - booking.startHour} ชั่วโมง)
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-slate-600">ยอดชำระ</p>
          <p className="text-3xl font-semibold tabular-nums text-slate-900">{baht(booking.amount)}</p>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-base sm:grid-cols-3">
        <div>
          <dt className="text-sm text-slate-600">ประเภทผู้ใช้</dt>
          <dd className="text-slate-900">{USER_TYPE_LABEL[booking.userType]}</dd>
        </div>
        <div>
          <dt className="text-sm text-slate-600">จำนวนผู้เข้าร่วม</dt>
          <dd className="text-slate-900">
            {booking.attendees} คน
            {attendeesMax !== Number.MAX_SAFE_INTEGER && (
              <span className="text-slate-600"> (สูงสุด {attendeesMax})</span>
            )}
          </dd>
        </div>
        {booking.paymentVerifiedAt != null && (
          <div>
            <dt className="text-sm text-slate-600">ตรวจสอบยอดแล้ว</dt>
            <dd className="text-slate-900">{formatDateTime(booking.paymentVerifiedAt)}</dd>
          </div>
        )}
      </dl>

      <div className="mt-5">
        <p className="text-sm text-slate-600">วัตถุประสงค์</p>
        <p className="mt-1 whitespace-pre-wrap text-base text-slate-900">{booking.purpose || '—'}</p>
      </div>

      {booking.reviewNote && (
        <p className="mt-4 rounded-xl bg-rose-50 p-4 text-base text-rose-800 ring-1 ring-rose-200">
          ความคิดเห็นจากแอดมิน: {booking.reviewNote}
        </p>
      )}
      {booking.paymentNote && (
        <p className="mt-4 rounded-xl bg-slate-50 p-4 text-base text-slate-700 ring-1 ring-slate-200">
          หมายเหตุการชำระเงิน: {booking.paymentNote}
        </p>
      )}

      {canPay && booking.expiresAt != null && (
        <div className="mt-4">
          <ExpiryCountdown expiresAt={booking.expiresAt} />
        </div>
      )}

      <div className="mt-5">
        <QuoteBreakdown quote={booking.quote} />
      </div>

      {error && (
        <p className="mt-4 rounded-xl bg-rose-50 p-4 text-base text-rose-800 ring-1 ring-rose-200">
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        {canPay && (
          <button
            type="button"
            onClick={() => setShowUploader((v) => !v)}
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-brand-600 px-5 py-3 text-base font-medium text-white transition hover:bg-brand-700 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-brand-600 focus-visible:ring-offset-2"
          >
            {showUploader ? 'ปิดการอัปโหลดสลิป' : slipName ? 'อัปโหลดสลิปใหม่' : 'อัปโหลดสลิป'}
          </button>
        )}
        {canCancel && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-rose-300 bg-white px-5 py-3 text-base font-medium text-rose-700 transition hover:bg-rose-50 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-rose-700 focus-visible:ring-offset-2"
          >
            ยกเลิกการจอง
          </button>
        )}
      </div>

      {showUploader && canPay && (
        <div className="mt-4">
          <SlipUploader
            bookingId={booking.id}
            onUploaded={(fileName) => {
              setSlipName(fileName)
              setSlipKey((n) => n + 1)
              setShowUploader(false)
              // Re-read the list so the status badge picks up the server's new state.
              onChanged()
            }}
          />
        </div>
      )}

      {slipName && (
        <div className="mt-5">
          <p className="mb-3 text-base font-medium text-slate-900">
            สลิปที่แนบไว้: <span className="font-normal text-slate-700">{slipName}</span>
          </p>
          <SlipViewer key={slipKey} bookingId={booking.id} fileName={slipName} />
        </div>
      )}

      {confirming && (
        <ConfirmCancelDialog
          booking={booking}
          busy={busy}
          onConfirm={() => void doCancel()}
          onClose={() => setConfirming(false)}
        />
      )}
    </article>
  )
}

export default function MyBookingsPage() {
  const [bookings, setBookings] = useState<BookingSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    // Only the first fetch blanks the page; later refreshes swap the list in place so
    // a slip upload or cancellation does not throw away the cards the user is reading.
    getMyBookings()
      .then((list) => {
        if (!active) return
        setBookings(list)
        setError(null)
      })
      .catch((err: unknown) => {
        if (active) setError(errorMessage(err))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [reloadKey])

  if (loading) {
    return <p className="py-12 text-center text-base text-slate-600">กำลังโหลดรายการการจอง…</p>
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-rose-50 p-6 text-center ring-1 ring-rose-200">
        <p className="text-base text-rose-800">{error}</p>
        <button
          type="button"
          onClick={() => setReloadKey((n) => n + 1)}
          className="mt-4 inline-flex min-h-12 items-center justify-center rounded-xl bg-rose-700 px-5 py-3 text-base font-medium text-white transition hover:bg-rose-800 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-rose-700 focus-visible:ring-offset-2"
        >
          ลองใหม่
        </button>
      </div>
    )
  }

  if (bookings.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">ยังไม่มีรายการจอง</h2>
        <p className="mt-2 text-base text-slate-700">
          เมื่อคุณจองห้องประชุม รายการทั้งหมดจะแสดงที่นี่ พร้อมสถานะ ยอดชำระ และปุ่มจัดการ
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">การจองของฉัน</h1>
      {bookings.map((b) => (
        <BookingCard key={b.id} booking={b} onChanged={() => setReloadKey((n) => n + 1)} />
      ))}
    </div>
  )
}
