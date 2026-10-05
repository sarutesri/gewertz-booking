import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import type {
  BookingSummary,
  Me,
  RateKind,
  Room,
  Settings,
  UserType,
} from '../../shared/types'
import { STATUS_LABEL, USER_TYPE_LABEL } from '../../shared/types'
import type { AdminUser, ConflictInfo } from '../lib/api'
import {
  ApiError,
  adminBookings,
  adminRates,
  adminUsers,
  approveBooking,
  getMe,
  getRooms,
  getSettings,
  rejectBooking,
  saveRate,
  saveSettings,
  setUserRole,
  slipUrl,
  verifyPayment,
} from '../lib/api'
import {
  baht,
  expiryText,
  formatDate,
  formatDateTime,
  hourLabel,
  hourRange,
} from '../lib/format'

type Tab = 'requests' | 'rates' | 'settings' | 'users'

const TABS: { id: Tab; label: string }[] = [
  { id: 'requests', label: 'คำขอจอง' },
  { id: 'rates', label: 'ค่าใช้จ่าย' },
  { id: 'settings', label: 'ตั้งค่าระบบ' },
  { id: 'users', label: 'ผู้ใช้' },
]

const STATUS_FILTERS = [
  'pending_payment',
  'approved',
  'rejected',
  'cancelled',
] as const
type StatusFilter = (typeof STATUS_FILTERS)[number]

const USER_TYPES: UserType[] = ['internal', 'joint', 'external']
const RATE_KINDS: RateKind[] = ['day', 'evening']

const RATE_KIND_LABEL: Record<RateKind, string> = {
  day: 'ช่วงกลางวัน (ก่อน 16:00 น.)',
  evening: 'ช่วงเย็น (ตั้งแต่ 16:00 น.)',
}

const STATUS_BADGE: Record<string, string> = {
  pending_payment: 'bg-amber-100 text-amber-900 ring-amber-300',
  approved: 'bg-emerald-100 text-emerald-900 ring-emerald-300',
  rejected: 'bg-rose-100 text-rose-900 ring-rose-300',
  cancelled: 'bg-zinc-200 text-zinc-800 ring-zinc-300',
}

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return 'เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่อีกครั้ง'
}

/** The 409 approve response carries the hours already taken by someone else. */
function conflictDetail(
  conflicts: ConflictInfo[],
  roomName: (id: string) => string,
): string {
  return conflicts
    .map((row) =>
      [
        `ห้อง ${roomName(row.roomId)}`,
        hourLabel(row.hour),
        `รหัส ${row.code}`,
        row.byName ? `ผู้จอง ${row.byName}` : '',
        row.state === 'approved' ? 'อนุมัติแล้ว' : 'รอดำเนินการ',
      ]
        .filter(Boolean)
        .join(' · '),
    )
    .join('\n')
}

const btnPrimary =
  'inline-flex items-center justify-center rounded-lg bg-sky-700 px-3 py-2 text-sm font-medium text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50'
const btnGhost =
  'inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50'
const btnDanger =
  'inline-flex items-center justify-center rounded-lg bg-rose-700 px-3 py-2 text-sm font-medium text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-50'
const btnSuccess =
  'inline-flex items-center justify-center rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50'
const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-100 disabled:bg-slate-100'

function SectionError({ message }: { message: string }) {
  if (!message) return null
  return (
    <div
      role="alert"
      className="whitespace-pre-line rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900"
    >
      {message}
    </div>
  )
}

function SectionNotice({ message }: { message: string }) {
  if (!message) return null
  return (
    <div
      role="status"
      className="whitespace-pre-line rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
    >
      {message}
    </div>
  )
}

function Spinner() {
  return (
    <div className="flex items-center gap-2 py-10 text-sm text-slate-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
      กำลังโหลดข้อมูล…
    </div>
  )
}

/* ---------------------------------------------------------------- requests */

interface NoteAction {
  kind: 'approve' | 'reject'
  bookingId: string
  code: string
}

function RequestsTab() {
  const [status, setStatus] = useState<StatusFilter | 'all'>('all')
  const [rows, setRows] = useState<BookingSummary[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState('')
  const [noteAction, setNoteAction] = useState<NoteAction | null>(null)
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState('')
  const [noteBusy, setNoteBusy] = useState(false)
  const [roomNames, setRoomNames] = useState<Record<string, string>>({})

  const roomName = useCallback(
    (id: string) => roomNames[id] ?? id,
    [roomNames],
  )

  useEffect(() => {
    let alive = true
    getRooms()
      .then((data) => {
        if (!alive) return
        setRoomNames(Object.fromEntries(data.rooms.map((room) => [room.id, room.name])))
      })
      .catch(() => {
        // Conflict text falls back to the raw room id when names are unavailable.
      })
    return () => {
      alive = false
    }
  }, [])

  const load = useCallback(async (filter: StatusFilter | 'all') => {
    setLoading(true)
    setError('')
    try {
      setRows(await adminBookings(filter === 'all' ? undefined : filter))
    } catch (caught) {
      setRows([])
      setError(messageOf(caught))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(status)
  }, [load, status])

  async function act(id: string, label: string, run: () => Promise<unknown>) {
    setBusyId(id)
    setError('')
    setNotice('')
    try {
      await run()
      setNotice(`${label}เรียบร้อยแล้ว`)
      await load(status)
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409 && caught.conflicts.length > 0) {
        setError(`${caught.message}\n${conflictDetail(caught.conflicts, roomName)}`)
      } else {
        setError(messageOf(caught))
      }
    } finally {
      setBusyId('')
    }
  }

  async function submitNote() {
    if (!noteAction) return
    setNoteBusy(true)
    setNoteError('')
    setError('')
    const trimmed = note.trim()
    try {
      if (noteAction.kind === 'approve') {
        await approveBooking(noteAction.bookingId, trimmed || undefined)
        setNotice(`อนุมัติรายการ ${noteAction.code} เรียบร้อยแล้ว`)
      } else {
        await rejectBooking(noteAction.bookingId, trimmed || undefined)
        setNotice(`ไม่อนุมัติรายการ ${noteAction.code} เรียบร้อยแล้ว`)
      }
      setNoteAction(null)
      setNote('')
      await load(status)
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409 && caught.conflicts.length > 0) {
        setNoteError(`${caught.message}\n${conflictDetail(caught.conflicts, roomName)}`)
      } else {
        setNoteError(messageOf(caught))
      }
    } finally {
      setNoteBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          <span>สถานะ</span>
          <select
            className={inputCls}
            value={status}
            onChange={(event) => setStatus(event.target.value as StatusFilter | 'all')}
          >
            <option value="all">ทั้งหมด</option>
            {STATUS_FILTERS.map((value) => (
              <option key={value} value={value}>
                {STATUS_LABEL[value]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={btnGhost}
          onClick={() => void load(status)}
          disabled={loading}
        >
          รีเฟรช
        </button>
      </div>

      <SectionError message={error} />
      <SectionNotice message={notice} />

      {loading && rows === null ? <Spinner /> : null}

      {rows !== null && rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
          ไม่มีรายการจองตามสถานะที่เลือก
        </p>
      ) : null}

      {rows !== null && rows.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => {
            const busy = busyId === row.id
            const verified = row.paymentVerifiedAt !== null
            const decidable = row.status === 'pending_payment'
            const rejectable = row.status !== 'cancelled' && row.status !== 'rejected'
            return (
              <li
                key={row.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-slate-900">
                    {row.code}
                  </span>
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${
                      STATUS_BADGE[row.status] ??
                      'bg-slate-100 text-slate-800 ring-slate-300'
                    }`}
                  >
                    {STATUS_LABEL[row.status]}
                  </span>
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${
                      verified
                        ? 'bg-emerald-50 text-emerald-800 ring-emerald-300'
                        : 'bg-slate-100 text-slate-700 ring-slate-300'
                    }`}
                  >
                    {verified ? 'ตรวจสอบการชำระเงินแล้ว' : 'ยังไม่ตรวจสอบการชำระเงิน'}
                  </span>
                </div>

                <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <dt className="text-xs text-slate-500">ผู้จอง</dt>
                    <dd className="font-medium text-slate-900">{row.bookerName ?? '—'}</dd>
                    <dd className="text-xs text-slate-500">{row.bookerEmail ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">ห้อง</dt>
                    <dd>{row.rooms.map((room) => room.name).join(', ')}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">วันและเวลา</dt>
                    <dd>
                      {formatDate(row.activityDate)} · {hourRange(row.startHour, row.endHour)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">ประเภทผู้ใช้</dt>
                    <dd>{USER_TYPE_LABEL[row.userType]}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">จำนวนผู้เข้าร่วม</dt>
                    <dd>{row.attendees} คน</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">ยอดชำระ</dt>
                    <dd className="font-semibold text-slate-900">{baht(row.amount)}</dd>
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <dt className="text-xs text-slate-500">วัตถุประสงค์</dt>
                    <dd className="whitespace-pre-line">{row.purpose || '—'}</dd>
                  </div>
                  {row.paymentNote ? (
                    <div className="sm:col-span-2 lg:col-span-3">
                      <dt className="text-xs text-slate-500">หมายเหตุจากผู้จอง</dt>
                      <dd className="whitespace-pre-line text-slate-700">
                        {row.paymentNote}
                      </dd>
                    </div>
                  ) : null}
                  {row.reviewNote ? (
                    <div className="sm:col-span-2 lg:col-span-3">
                      <dt className="text-xs text-slate-500">หมายเหตุของผู้ดูแลระบบ</dt>
                      <dd className="whitespace-pre-line text-slate-700">
                        {row.reviewNote}
                      </dd>
                    </div>
                  ) : null}
                  {row.status === 'pending_payment' ? (
                    <div className="sm:col-span-2 lg:col-span-3">
                      <dt className="text-xs text-slate-500">กำหนดเวลาส่งสลิป</dt>
                      <dd className="text-amber-800">
                        {formatDateTime(row.expiresAt ?? row.createdAt)} ·{' '}
                        {expiryText(row.expiresAt) || 'ไม่กำหนด'}
                      </dd>
                    </div>
                  ) : null}
                </dl>

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                  {row.hasSlip ? (
                    <button
                      type="button"
                      className={btnGhost}
                      onClick={() => window.open(slipUrl(row.id), '_blank', 'noopener,noreferrer')}
                    >
                      เปิดสลิป{row.slipName ? ` (${row.slipName})` : ''}
                    </button>
                  ) : (
                    <span className="text-xs text-slate-500">ยังไม่มีสลิปแนบ</span>
                  )}

                  <button
                    type="button"
                    className={btnGhost}
                    disabled={!row.hasSlip || verified || busy}
                    title={
                      !row.hasSlip
                        ? 'รายการนี้ยังไม่มีสลิป'
                        : verified
                          ? 'ตรวจสอบการชำระเงินแล้ว'
                          : undefined
                    }
                    onClick={() =>
                      void act(row.id, 'ตรวจสอบการชำระเงินรายการ ', () =>
                        verifyPayment(row.id),
                      )
                    }
                  >
                    ตรวจสอบการชำระเงิน
                  </button>

                  <button
                    type="button"
                    className={btnSuccess}
                    disabled={!decidable || busy}
                    onClick={() =>
                      void act(row.id, 'อนุมัติรายการ ', () => approveBooking(row.id))
                    }
                  >
                    อนุมัติ
                  </button>

                  <button
                    type="button"
                    className={btnDanger}
                    disabled={!rejectable || busy}
                    onClick={() => {
                      setNote('')
                      setNoteError('')
                      setNoteAction({ kind: 'reject', bookingId: row.id, code: row.code })
                    }}
                  >
                    ไม่อนุมัติ
                  </button>

                  <button
                    type="button"
                    className={btnGhost}
                    disabled={!decidable || busy}
                    onClick={() => {
                      setNote('')
                      setNoteError('')
                      setNoteAction({ kind: 'approve', bookingId: row.id, code: row.code })
                    }}
                  >
                    อนุมัติพร้อมหมายเหตุ
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}

      {noteAction ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">
              {noteAction.kind === 'approve' ? 'อนุมัติ' : 'ไม่อนุมัติ'}รายการ{' '}
              {noteAction.code}
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              {noteAction.kind === 'approve'
                ? 'กดยืนยันเพื่ออนุมัติรายการนี้ หากช่วงเวลาถูกจองไปแล้วระบบจะแจ้งความขัดแย้งให้ทราบ'
                : 'กดยืนยันเพื่อปฏิเสธรายการนี้ หากมีเหตุผล แนะนำให้ใส่หมายเหตุให้ผู้จองทราบ'}
            </p>
            <label className="mt-4 flex flex-col gap-1 text-sm text-slate-700">
              <span>หมายเหตุ (ไม่บังคับ)</span>
              <textarea
                className={`${inputCls} min-h-24`}
                value={note}
                maxLength={300}
                onChange={(event) => setNote(event.target.value)}
                placeholder="เช่น ไม่สามารถติดต่อผู้จองได้"
              />
            </label>
            <div className="mt-3">
              <SectionError message={noteError} />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className={btnGhost}
                onClick={() => setNoteAction(null)}
                disabled={noteBusy}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className={noteAction.kind === 'approve' ? btnSuccess : btnDanger}
                onClick={() => void submitNote()}
                disabled={noteBusy}
              >
                {noteBusy ? 'กำลังบันทึก…' : 'ยืนยัน'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------- rates */

const rateKey = (roomId: string, userType: UserType, rateKind: RateKind) =>
  `${roomId}|${userType}|${rateKind}`

function RatesTab() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [savingKey, setSavingKey] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([getRooms(), adminRates()])
      .then(([roomData, rates]) => {
        if (!alive) return
        const seeded: Record<string, string> = {}
        for (const rate of rates) {
          seeded[rateKey(rate.roomId, rate.userType, rate.rateKind)] = String(
            rate.pricePerHour,
          )
        }
        setRooms(roomData.rooms)
        setDrafts(seeded)
        setError('')
      })
      .catch((caught: unknown) => {
        if (alive) setError(messageOf(caught))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const sortedRooms = useMemo(
    () =>
      [...rooms].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      ),
    [rooms],
  )

  async function saveCell(roomId: string, userType: UserType, rateKind: RateKind) {
    const key = rateKey(roomId, userType, rateKind)
    const raw = (drafts[key] ?? '').trim()
    const price = Number(raw)
    if (raw === '' || !Number.isFinite(price) || price < 0) {
      setError('กรุณากรอกราคาต่อชั่วโมงเป็นตัวเลขที่ไม่ติดลบ')
      setNotice('')
      return
    }
    setSavingKey(key)
    setError('')
    setNotice('')
    try {
      await saveRate({ roomId, userType, rateKind, pricePerHour: price })
      setNotice(
        `บันทึกค่าใช้จ่ายห้อง ${
          rooms.find((room) => room.id === roomId)?.name ?? roomId
        } · ${RATE_KIND_LABEL[rateKind]} เรียบร้อยแล้ว`,
      )
    } catch (caught) {
      setError(messageOf(caught))
    } finally {
      setSavingKey('')
    }
  }

  if (loading) return <Spinner />

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-600">
        ตั้งราคาต่อชั่วโมงแยกตามห้อง ประเภทผู้ใช้ และช่วงเวลา บันทึกทีละช่อง
      </p>
      <SectionError message={error} />
      <SectionNotice message={notice} />

      {sortedRooms.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
          ไม่พบข้อมูลห้อง
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-3xl border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-700">
                <th scope="col" className="px-4 py-3 font-medium">
                  ห้อง
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  ประเภทผู้ใช้
                </th>
                {RATE_KINDS.map((kind) => (
                  <th key={kind} scope="col" className="px-4 py-3 font-medium">
                    {RATE_KIND_LABEL[kind]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRooms.flatMap((room) =>
                USER_TYPES.map((userType, index) => (
                  <tr
                    key={`${room.id}-${userType}`}
                    className={`border-b border-slate-100 last:border-b-0 ${
                      index % 2 === 1 ? 'bg-slate-50/60' : ''
                    }`}
                  >
                    <th
                      scope="row"
                      rowSpan={USER_TYPES.length}
                      className={`px-4 py-3 text-left font-medium text-slate-900 ${
                        index === 0 ? '' : 'border-t border-slate-100'
                      }`}
                    >
                      {room.name}
                      <span className="block text-xs font-normal text-slate-500">
                        {room.capacityMin}–{room.capacityMax} คน
                      </span>
                    </th>
                    <td
                      className={`px-4 py-3 text-slate-700 ${
                        index === 0 ? '' : 'border-t border-slate-100'
                      }`}
                    >
                      {USER_TYPE_LABEL[userType]}
                    </td>
                    {RATE_KINDS.map((kind) => {
                      const key = rateKey(room.id, userType, kind)
                      return (
                        <td
                          key={key}
                          className={`px-4 py-3 ${
                            index === 0 ? '' : 'border-t border-slate-100'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={0}
                              step="1"
                              inputMode="numeric"
                              aria-label={`${room.name} ${USER_TYPE_LABEL[userType]} ${RATE_KIND_LABEL[kind]}`}
                              className={`${inputCls} w-28`}
                              value={drafts[key] ?? ''}
                              onChange={(event) =>
                                setDrafts((prev) => ({
                                  ...prev,
                                  [key]: event.target.value,
                                }))
                              }
                            />
                            <button
                              type="button"
                              className={btnGhost}
                              disabled={savingKey === key}
                              onClick={() => void saveCell(room.id, userType, kind)}
                            >
                              {savingKey === key ? 'กำลังบันทึก…' : 'บันทึก'}
                            </button>
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- settings */

function SettingsTab() {
  const [form, setForm] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    getSettings()
      .then((data) => {
        if (!alive) return
        setForm(data)
        setError('')
      })
      .catch((caught: unknown) => {
        if (alive) setError(messageOf(caught))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  async function save() {
    if (!form) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await saveSettings({
        paymentInstructions: form.paymentInstructions,
        contact: form.contact,
      })
      setNotice('บันทึกการตั้งค่าเรียบร้อยแล้ว')
    } catch (caught) {
      setError(messageOf(caught))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Spinner />

  return (
    <div className="flex flex-col gap-4">
      <SectionError message={error} />
      <SectionNotice message={notice} />
      {form ? (
        <div className="flex max-w-3xl flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm text-slate-700">
            <span>วิธีการชำระเงิน (แสดงให้ผู้จองทุกคนเห็นก่อนแนบสลิป)</span>
            <textarea
              className={`${inputCls} min-h-40`}
              maxLength={2000}
              value={form.paymentInstructions}
              onChange={(event) =>
                setForm({ ...form, paymentInstructions: event.target.value })
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-700">
            <span>ช่องทางติดต่อ</span>
            <input
              className={inputCls}
              maxLength={500}
              value={form.contact}
              onChange={(event) => setForm({ ...form, contact: event.target.value })}
            />
          </label>
          <div>
            <button
              type="button"
              className={btnPrimary}
              onClick={() => void save()}
              disabled={saving}
            >
              {saving ? 'กำลังบันทึก…' : 'บันทึกการตั้งค่า'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------- users */

function UsersTab({ me }: { me: Me }) {
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setUsers(await adminUsers())
    } catch (caught) {
      setUsers([])
      setError(messageOf(caught))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function toggle(user: AdminUser) {
    const next = user.role === 'admin' ? 'user' : 'admin'
    setBusyId(user.id)
    setError('')
    setNotice('')
    try {
      await setUserRole(user.id, next)
      setNotice(
        next === 'admin'
          ? `ให้สิทธิ์ผู้ดูแลระบบแก่ ${user.name} แล้ว`
          : `ถอดสิทธิ์ผู้ดูแลระบบของ ${user.name} แล้ว`,
      )
      await load()
    } catch (caught) {
      setError(messageOf(caught))
    } finally {
      setBusyId('')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <p className="flex-1 text-sm text-slate-600">
          ผู้ดูแลระบบสามารถอนุมัติการจอง แก้ไขค่าใช้จ่าย และจัดการผู้ใช้ได้
        </p>
        <button
          type="button"
          className={btnGhost}
          onClick={() => void load()}
          disabled={loading}
        >
          รีเฟรช
        </button>
      </div>

      <SectionError message={error} />
      <SectionNotice message={notice} />

      {loading && users === null ? <Spinner /> : null}

      {users !== null && users.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
          ไม่พบผู้ใช้ในระบบ
        </p>
      ) : null}

      {users !== null && users.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-2xl border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-700">
                <th scope="col" className="px-4 py-3 font-medium">
                  ชื่อ
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  อีเมล
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  สิทธิ์
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  วันที่สมัคร
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  จัดการ
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isSelf = user.id === me.id
                return (
                  <tr
                    key={user.id}
                    className="border-b border-slate-100 last:border-b-0"
                  >
                    <th
                      scope="row"
                      className="px-4 py-3 text-left font-medium text-slate-900"
                    >
                      {user.name}
                      {isSelf ? (
                        <span className="ml-2 text-xs font-normal text-slate-500">
                          (บัญชีของคุณ)
                        </span>
                      ) : null}
                    </th>
                    <td className="px-4 py-3 text-slate-700">{user.email}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${
                          user.role === 'admin'
                            ? 'bg-sky-100 text-sky-900 ring-sky-300'
                            : 'bg-slate-100 text-slate-700 ring-slate-300'
                        }`}
                      >
                        {user.role === 'admin' ? 'ผู้ดูแลระบบ' : 'ผู้ใช้ทั่วไป'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {new Date(user.createdAt).toLocaleDateString('th-TH', {
                        dateStyle: 'medium',
                      })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        className={btnGhost}
                        disabled={isSelf || busyId === user.id}
                        title={isSelf ? 'เปลี่ยนสิทธิ์ของบัญชีตัวเองไม่ได้' : undefined}
                        onClick={() => void toggle(user)}
                      >
                        {user.role === 'admin' ? 'ถอดสิทธิ์ผู้ดูแล' : 'ให้สิทธิ์ผู้ดูแล'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------- page */

export default function AdminPage() {
  const [me, setMe] = useState<Me | null>(null)
  const [checking, setChecking] = useState(true)
  const [tab, setTab] = useState<Tab>('requests')

  useEffect(() => {
    let alive = true
    getMe()
      .then((user) => {
        if (alive) setMe(user)
      })
      .catch(() => {
        if (alive) setMe(null)
      })
      .finally(() => {
        if (alive) setChecking(false)
      })
    return () => {
      alive = false
    }
  }, [])

  if (checking) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner />
      </div>
    )
  }

  if (!me) return <Navigate to="/login" replace />
  if (me.role !== 'admin') return <Navigate to="/" replace />

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">หลังบ้านผู้ดูแลระบบ</h1>
          <p className="text-sm text-slate-600">
            ผู้ใช้ปัจจุบัน: {me.name} ({me.email})
          </p>
        </div>
      </header>

      <nav
        className="flex flex-wrap gap-1 border-b border-slate-200"
        aria-label="ส่วนของผู้ดูแลระบบ"
      >
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-current={tab === item.id ? 'page' : undefined}
            onClick={() => setTab(item.id)}
            className={`-mb-px rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition ${
              tab === item.id
                ? 'border-sky-700 text-sky-800'
                : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {tab === 'requests' ? <RequestsTab /> : null}
      {tab === 'rates' ? <RatesTab /> : null}
      {tab === 'settings' ? <SettingsTab /> : null}
      {tab === 'users' ? <UsersTab me={me} /> : null}
    </div>
  )
}
